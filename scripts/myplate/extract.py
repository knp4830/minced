#!/usr/bin/env python3
"""Stage 2 of the MyPlate import: cached HTML -> normalised recipe JSON (M1.5.3).

    python3 scripts/myplate/extract.py > scripts/myplate/artifacts/recipes.json

Reads every file in scripts/myplate/cache/ and emits one JSON object per recipe.
Stdlib only -- no BeautifulSoup, no new dependency.

TWO SOURCES PER PAGE, because neither is complete on its own:

  schema.org JSON-LD  ->  title, description, servings, times, NUTRITION, image
  the HTML itself     ->  ingredients and directions

USDA's JSON-LD block omits recipeIngredient and recipeInstructions entirely, so
a JSON-LD-only importer would silently produce recipes with no ingredients --
which is exactly the kind of quiet wrongness this project keeps guarding against.

The HTML is Drupal output with stable field classes
(`field--name-field-mp-ingredients`, `field--name-field-instructions`), and
prep notes arrive already separated in their own `<span class="notes">`:

    <li class="field__item"> 2 garlic cloves <span class="notes">(minced)</span> </li>

That maps straight onto recipe_ingredients.prep_note, which CLAUDE.md requires to
be the ONLY free text on the row.
"""

from __future__ import annotations

import html as H
import json
import re
import sys
from pathlib import Path

CACHE = Path("scripts/myplate/cache")
SOURCE_BASE = "https://www.myplate.gov/recipes/"


def unescape_clean(s: str) -> str:
    s = H.unescape(s)
    s = s.replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def strip_tags(s: str) -> str:
    return unescape_clean(re.sub(r"<[^>]+>", " ", s))


def json_ld(src: str) -> dict:
    """The Recipe node from the page's JSON-LD, or {}."""
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', src, re.S | re.I
    ):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        nodes = data.get("@graph", data) if isinstance(data, dict) else data
        if isinstance(nodes, dict):
            nodes = [nodes]
        for node in nodes:
            if isinstance(node, dict) and node.get("@type") == "Recipe":
                return node
    return {}


def first_number(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", str(text))
    return float(m.group(1)) if m else None


def minutes(value: str | None) -> int | None:
    """"20 minutes" -> 20. "1 hour 10 minutes" -> 70.

    ISO durations are deliberately NOT trusted: USDA emits totalTime "PT20S" on a
    recipe whose cookTime is "20 minutes". Twenty seconds is wrong, and a wrong
    number that parses cleanly is worse than a missing one.
    """
    if not value:
        return None
    text = str(value).lower()
    if text.startswith("pt"):
        return None
    total = 0
    for amount, unit in re.findall(r"(\d+(?:\.\d+)?)\s*(hour|hr|minute|min)", text):
        total += float(amount) * (60 if unit.startswith(("hour", "hr")) else 1)
    if total:
        return int(round(total))
    bare = first_number(text)
    return int(bare) if bare else None


def block_after(src: str, marker: str, closing: str = "</div>") -> str:
    """Rough slice of the markup following a Drupal field class."""
    i = src.find(marker)
    if i < 0:
        return ""
    end = src.find('<div class="field field--name-field-', i + len(marker))
    if end < 0:
        end = src.find('<div class="clearfix text-formatted field', i + len(marker))
    return src[i : end if end > 0 else i + 12000]


def ingredients(src: str) -> list[dict]:
    seg = block_after(src, "field--name-field-mp-ingredients")
    out: list[dict] = []
    for li in re.findall(r'<li class="field__item">(.*?)</li>', seg, re.S):
        note_match = re.search(r'<span class="notes">(.*?)</span>', li, re.S)
        note = strip_tags(note_match.group(1)) if note_match else None
        if note:
            note = note.strip("()").strip() or None
        line = strip_tags(re.sub(r'<span class="notes">.*?</span>', " ", li, flags=re.S))
        if line:
            out.append({"line": line, "prep_note": note})
    return out


def directions(src: str) -> list[str]:
    seg = block_after(src, "field--name-field-instructions")
    ol = re.search(r"<ol>(.*?)</ol>", seg, re.S)
    if ol:
        steps = [strip_tags(x) for x in re.findall(r"<li>(.*?)</li>", ol.group(1), re.S)]
    else:
        # A few recipes use paragraphs instead of an ordered list.
        body = re.search(r'<div class="field__item">(.*?)$', seg, re.S)
        steps = [strip_tags(p) for p in re.findall(r"<p>(.*?)</p>", body.group(1), re.S)] if body else []
    return [s for s in steps if s]


def notes(src: str) -> str | None:
    seg = block_after(src, "field--name-field-notes")
    text = strip_tags(re.sub(r"<h2>.*?</h2>", " ", seg, flags=re.S)) if seg else ""
    return text or None


def nutrition(node: dict) -> dict:
    n = node.get("nutrition") or {}
    return {
        "calories": first_number(n.get("calories")),
        "protein_g": first_number(n.get("proteinContent")),
        "carbs_g": first_number(n.get("carbohydrateContent")),
        "fat_g": first_number(n.get("fatContent")),
        "sodium_mg": first_number(n.get("sodiumContent")),
        "fiber_g": first_number(n.get("fiberContent")),
        "serving_size": n.get("servingSize"),
    }


def extract(path: Path) -> dict | None:
    src = path.read_text(encoding="utf-8", errors="replace")
    node = json_ld(src)
    slug = path.stem

    title = unescape_clean(node.get("name") or "")
    if not title:
        m = re.search(r"<title>(.*?)(?:\s*\|\s*MyPlate)?</title>", src, re.S | re.I)
        title = unescape_clean(m.group(1)) if m else ""

    ings = ingredients(src)
    steps = directions(src)

    # servings is NOT NULL in the schema, so a recipe without one cannot be
    # imported. Recorded as a rejection reason rather than defaulted to a guess.
    servings = first_number(node.get("recipeYield"))

    image = node.get("image")
    if isinstance(image, dict):
        image = image.get("url")
    if isinstance(image, list):
        image = image[0] if image else None
    if isinstance(image, str) and "web.archive.org" in image:
        image = re.sub(r"^https?://web\.archive\.org/web/[^/]+/", "", image)

    return {
        "slug": slug,
        "title": title,
        "description": unescape_clean(node.get("description") or "") or None,
        "servings": int(servings) if servings else None,
        "cook_time_min": minutes(node.get("cookTime")),
        "prep_time_min": minutes(node.get("prepTime")),
        "total_time_min": minutes(node.get("totalTime")) or minutes(node.get("cookTime")),
        "image_url": image if isinstance(image, str) else None,
        "notes": notes(src),
        "nutrition": nutrition(node),
        "ingredients": ings,
        "steps": steps,
        "source_name": "USDA MyPlate Kitchen",
        "source_url": SOURCE_BASE + slug,
        "source_license": "Public domain (US federal government work)",
    }


def main() -> int:
    if not CACHE.is_dir():
        print(f"no cache at {CACHE}. Run scripts/myplate/fetch.sh first.", file=sys.stderr)
        return 1

    recipes = []
    for path in sorted(CACHE.glob("*.html")):
        try:
            rec = extract(path)
        except Exception as exc:  # noqa: BLE001 - one bad page must not stop the run
            print(f"  ! {path.stem}: {type(exc).__name__}: {exc}", file=sys.stderr)
            continue
        if rec:
            recipes.append(rec)

    json.dump(recipes, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    print(f"extracted {len(recipes)} recipes", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
