#!/usr/bin/env python3
"""Parse raw recipe ingredient lines into structured fields (M1.5.2).

    echo '["2 cloves garlic, minced"]' | scripts/parser/run.sh

Reads a JSON array of raw ingredient lines on stdin, writes a JSON array of
parsed objects on stdout, one per input line, in the same order.

WHY THIS IS A SCRIPT AND NOT A SERVICE
--------------------------------------
This runs at IMPORT time -- once per recipe, ever, on a developer machine. The
live product never calls it. What the live product calls is resolve_ingredient()
in Postgres (M1.5.1), which needs no Python at all. A hosted parser would be a
server kept warm for a job that runs a handful of times in the project's life.

The contract is deliberately a FILE contract -- JSON in, JSON out, over stdio.
If this ever does need to run somewhere else (a Vercel Python function, a
container), only the transport changes; the importer keeps reading the same
objects.

WHY A MODEL AND NOT A REGEX
---------------------------
"1 (14.5 ounce) can diced tomatoes, undrained" has no delimiter telling you where
the amount stops and the name starts. The same word changes role by context:
"cream" is a name in "1 cup cream" and a preparation in "cream the butter".

ingredient-parser-nlp solves this as SEQUENCE LABELLING: the model walks the
sentence token by token and assigns each token a tag (QTY, UNIT, NAME, PREP,
COMMENT), choosing the highest-probability tag SEQUENCE rather than scoring each
word alone. That is why it knows the second "1" in "cut into 1-inch pieces" is
part of a preparation, not a quantity -- the tokens around it make that sequence
far more likely. A regex has no notion of "likely"; it either matches or does
not, and every new phrasing is another branch to write.

It also means every field arrives WITH A CONFIDENCE, which is what makes a
review queue possible at all.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import sys
from fractions import Fraction
from typing import Any

try:
    from ingredient_parser import parse_ingredient
except ImportError:  # pragma: no cover - environment problem, not a data problem
    sys.exit(
        "ingredient-parser-nlp is not installed.\n"
        "Set it up with:  bash scripts/parser/setup.sh"
    )

# Below this, a line goes to the review queue instead of straight into the
# database. 0.90 is deliberately strict: the cost of reviewing a good line is a
# few seconds, the cost of importing a wrong one is a recipe that quietly lies.
DEFAULT_MIN_CONFIDENCE = 0.90


def _number(value: Any) -> float | None:
    """Fractions to floats. The parser returns Fraction(29, 2) for "14.5"."""
    if value is None:
        return None
    if isinstance(value, Fraction):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _text(field: Any) -> str | None:
    return field.text if field is not None else None


def parse_line(raw: str, min_confidence: float) -> dict[str, Any]:
    """Parse one line. Never raises -- a bad line must not kill a 1,000-recipe run."""
    result: dict[str, Any] = {
        "raw": raw,
        "names": [],
        "quantity": None,
        "quantity_max": None,
        "is_range": False,
        "unit": None,
        "prep": None,
        "comment": None,
        "confidence": 0.0,
        "needs_review": True,
        "review_reasons": [],
        "usda": None,
    }

    # Short-circuit blanks. The library raises a bare IndexError on empty input,
    # and "index 0 is out of bounds for axis 0" tells whoever reads the review
    # queue nothing about what is wrong with their data.
    if not raw.strip():
        result["review_reasons"] = ["blank line"]
        return result

    try:
        parsed = parse_ingredient(raw, foundation_foods=True)
    except Exception as exc:  # noqa: BLE001 - deliberately broad; see docstring
        result["review_reasons"] = [f"parser error: {type(exc).__name__}: {exc}"]
        return result

    confidences: list[float] = []

    result["names"] = [
        {"text": n.text, "confidence": round(float(n.confidence), 6)} for n in parsed.name
    ]
    confidences.extend(float(n.confidence) for n in parsed.name)

    # A line can carry several amounts: "1 (14.5 ounce) can" is 1 can AND 14.5
    # ounces. The FIRST is the one a cook acts on ("one can"), so it becomes the
    # quantity; the rest are kept verbatim for the importer to look at.
    if parsed.amount:
        primary = parsed.amount[0]
        result["quantity"] = _number(primary.quantity)
        result["quantity_max"] = _number(primary.quantity_max)
        result["is_range"] = bool(getattr(primary, "RANGE", False))
        unit = primary.unit
        result["unit"] = str(unit) if unit is not None and str(unit) != "" else None
        confidences.append(float(primary.confidence))
        if len(parsed.amount) > 1:
            result["other_amounts"] = [
                {
                    "quantity": _number(a.quantity),
                    "unit": str(a.unit) if a.unit is not None else None,
                    "text": a.text,
                }
                for a in parsed.amount[1:]
            ]

    result["prep"] = _text(parsed.preparation)
    if parsed.preparation is not None:
        confidences.append(float(parsed.preparation.confidence))

    result["comment"] = _text(parsed.comment)

    # USDA FoodData Central linkage, when the model recognises the food. Emitted
    # but NOT consumed: writing ingredients.fdc_id is M1.5.4's job, and doing it
    # here would be building a milestone we have not started.
    if parsed.foundation_foods:
        ff = parsed.foundation_foods[0]
        result["usda"] = {
            "fdc_id": ff.fdc_id,
            "name": ff.text,
            "category": ff.category,
            "confidence": round(float(ff.confidence), 6),
        }

    # The weakest field decides the line. A sentence is only as trustworthy as
    # its least certain part -- averaging would let a confident quantity hide a
    # coin-flip on the ingredient name, which is the field that actually matters.
    result["confidence"] = round(min(confidences), 6) if confidences else 0.0

    reasons: list[str] = []
    if not parsed.name:
        reasons.append("no ingredient name found")
    if len(parsed.name) > 1:
        # One raw line, several ingredients ("salt and pepper"). recipe_ingredients
        # stores one ingredient per row, so a human decides how to split it.
        reasons.append(f"{len(parsed.name)} names in one line")
    if result["confidence"] < min_confidence:
        reasons.append(f"confidence {result['confidence']:.3f} below {min_confidence:.2f}")

    result["review_reasons"] = reasons
    result["needs_review"] = bool(reasons)
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--min-confidence",
        type=float,
        default=DEFAULT_MIN_CONFIDENCE,
        help=f"below this a line is flagged for review (default {DEFAULT_MIN_CONFIDENCE})",
    )
    ap.add_argument("--pretty", action="store_true", help="indent the output JSON")
    args = ap.parse_args()

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"stdin is not valid JSON: {exc}", file=sys.stderr)
        return 2

    if not isinstance(payload, list) or not all(isinstance(x, str) for x in payload):
        print("expected a JSON array of strings", file=sys.stderr)
        return 2

    # ingredient-parser-nlp prints notices like "Warning: parsing empty text"
    # to STDOUT, which would sit in the middle of the JSON array and make the
    # output unparseable -- silently, and only for the inputs that trigger it.
    # Everything the library says goes to stderr; only our JSON reaches stdout.
    out = sys.stdout
    with contextlib.redirect_stdout(sys.stderr):
        parsed = [parse_line(line, args.min_confidence) for line in payload]

    json.dump(parsed, out, indent=2 if args.pretty else None, ensure_ascii=False)
    out.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
