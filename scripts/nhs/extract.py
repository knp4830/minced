#!/usr/bin/env python3
"""NHS Healthier Families pages -> recipes.json in the same shape as myplate/extract.py.

    python -I scripts/nhs/extract.py > scripts/nhs/artifacts/recipes.json

Licence (checked 2026-10-22): https://www.nhs.uk/our-policies/terms-and-conditions/
cl. 3.3-3.4 release NHS website content under the Open Government Licence v3.0,
commercial use included. cl. 3.5 EXCLUDES logos, images and third-party items, so
we take text only (ingredients, method, servings, times) and never an image URL.
cl. 3.6b: adapted content is credited with
  "Contains public sector information licensed under the Open Government Licence v3.0."
and must NOT be attributed to the NHS website as its author. The recipe page here
is therefore only *linked* as the place the facts came from.

Method steps keep the NHS wording (the licence allows reuse); the page's
"Information:" tips are dropped (Minced shows no headnotes).
"""
from __future__ import annotations

import html as H
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from rules import normalise  # noqa: E402

CACHE = Path("scripts/nhs/cache")
BASE = "https://www.nhs.uk/healthier-families/recipes/"
LICENSE = "Contains public sector information licensed under the Open Government Licence v3.0."


def clean(s: str) -> str:
    s = H.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def iso_minutes(v: str | None) -> int | None:
    if not v:
        return None
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?", v)
    if not m or not (m.group(1) or m.group(2)):
        return None
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


def num(v: str | None) -> float | None:
    m = re.search(r"(\d+(?:\.\d+)?)", v or "")
    return float(m.group(1)) if m else None


def node(src: str) -> dict:
    for m in re.finditer(r'<script[^>]*ld\+json[^>]*>(.*?)</script>', src, re.S):
        try:
            d = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(d, dict) and d.get("@type") == "Recipe":
            return d
    return {}


# Serving suggestions that contradict a diet tag the database computes from the ingredients. The tag is right
# (the recipe's ingredients are gluten-free), so the sentence goes, not the badge. Reviewed one by one.
STEP_CUTS = {"easy-carrot-soup": [" Enjoy with a slice of wholemeal bread."]}


def one(path: Path) -> dict | None:
    src = path.read_text(encoding="utf-8", errors="strict")
    n = node(src)
    if not n:
        return None
    # Method: the <ol> inside bh-recipe-instructions__method; only the first <p> of each <li>.
    ol = re.search(r'bh-recipe-instructions__method.*?<ol>(.*?)</ol>', src, re.S)
    steps = []
    if ol:
        for li in re.findall(r"<li>(.*?)</li>", ol.group(1), re.S):
            li = re.sub(r'<div class="nhsuk-inset-text">.*?</div>', " ", li, flags=re.S)
            t = clean(li)
            if t:
                steps.append(t)
    for cut in STEP_CUTS.get(path.stem, []):
        steps = [x.replace(cut, "") for x in steps]
    ings = []
    for x in n.get("recipeIngredient", []):
        orig = clean(x)
        line, note = normalise(orig)
        if line:
            ings.append({"line": line, "prep_note": note, "orig": orig})
    nut = n.get("nutrition") or {}
    return {
        "slug": path.stem,
        "title": re.sub(r"\s+recipe$", "", clean(n.get("name", "")), flags=re.I),
        "description": None,
        "servings": int(num(n.get("recipeYield")) or 0) or None,
        "prep_time_min": iso_minutes(n.get("prepTime")),
        "cook_time_min": iso_minutes(n.get("cookTime")),
        "image_url": None,
        "notes": None,
        "nutrition": {
            "calories": num(nut.get("calories")),
            "protein_g": num(nut.get("proteinContent")),
            "carbs_g": num(nut.get("carbohydrateContent")),
            "fat_g": num(nut.get("fatContent")),
            "sodium_mg": None,
            "fiber_g": None,
        },
        "ingredients": ings,
        "steps": steps,
        "source_name": "Better Health: Healthier Families recipes",
        "source_url": BASE + path.stem + "/",
        "source_license": LICENSE,
        "diet_hint": n.get("suitableForDiet"),
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    out = []
    only = set(sys.argv[1:])
    for p in sorted(CACHE.glob("*.html")):
        if p.name.startswith("_") or (only and p.stem not in only):
            continue
        r = one(p)
        if r:
            out.append(r)
        else:
            print(f"! no Recipe JSON-LD: {p.name}", file=sys.stderr)
    json.dump(out, sys.stdout, indent=1, ensure_ascii=False)
    print(f"extracted {len(out)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
