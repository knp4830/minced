#!/usr/bin/env python3
"""
Clean amount phrases out of recipe_ingredients.prep_note.

WHY: USDA recipe text keeps amounts in the note ("unsalted butter, 1 full stick + 2
tablespoons") while the structured columns hold the amount that scales ("2 1/2 tsp").
Scale the servings and the note stays put, so the page contradicts itself.

RULES (applied per comma-separated segment of the note):
  1. A segment that STARTS with an amount phrase (number + a volume/weight/stick unit,
     optionally "about", optionally "+ another amount") loses that phrase:
       "1/4 cup, chopped, optional" -> "chopped, optional"
       "about 4 cups sliced"        -> "sliced"
       "1/2 cup + 1 teaspoon"       -> (note removed)
  2. KEPT, because they are package sizes and do not scale with servings:
       "15 ounce can", "12 oz. bag", "13.5 oz each", "14.5-ounce can", and any amount
       on a line whose unit is `can` ("14.5 ounces" beside "1 can diced tomatoes").
  3. KEPT for the app to scale at display time: "or 1/2 teaspoon garlic powder"
     (an alternative with its own amount) and "2 large" (size counts).
  4. PROMOTE: when the line has NO structured quantity and no unit, and the note starts
     with a single amount in a unit the database knows ("14 ounces" on firm tofu), the
     amount moves into quantity/unit_id (otherwise the page says "to taste" for tofu).
  Segments that are not amounts ("cut into 1/2 inch pieces", "90% lean") are untouched.

IDEMPOTENT: re-running on cleaned data changes nothing, and every UPDATE is guarded by
`AND prep_note IS NOT DISTINCT FROM <old>` so it never overwrites a note edited since.

USAGE (stdin CSV from psql, stdout SQL; a CSV of every change goes to --csv):
  psql "$URL" --csv -t -c "select ri.id, coalesce(ri.quantity::text,''),
      coalesce(u.name,''), i.canonical_name, ri.prep_note from recipe_ingredients ri
      join ingredients i on i.id=ri.ingredient_id left join units u on u.id=ri.unit_id
      where ri.prep_note is not null order by ri.id" > in.csv
  python3 -I scripts/cleanup/clean_prep_notes.py --csv changes.csv < in.csv > clean.sql
  psql "$URL" -v ON_ERROR_STOP=1 -f clean.sql
"""
import argparse
import csv
import re
import sys

NUM = r"(?:\d+(?:\.\d+)?(?:\s+\d+/\d+)?|\d+/\d+|[½¼¾⅓⅔⅛])"
UNIT = (
    r"(?:teaspoons?|tsps?\.?|tablespoons?|tbsps?\.?|cups?|quarts?|pints?|"
    r"(?:full\s+)?sticks?|pounds?|lbs?\.?|ounces?|oz\.?|grams?|milliliters?|ml)"
)
SINGLE = rf"{NUM}(?:\s+to\s+{NUM})?\s*{UNIT}\b"
AMOUNT = rf"(?:about\s+|approximately\s+|around\s+)?{SINGLE}(?:\s*(?:\+|and)\s*{SINGLE})*"
CONTAINER = r"(?:-?\s*(?:can|cans|package|packages|pkg|jar|jars|bag|bags|bottle|bottles|box|boxes|carton|container|pouch|each)\b)"
LEAD = re.compile(rf"^\s*({AMOUNT})\.?(?!\s*{CONTAINER})\s*(.*)$", re.I)
FIRST = re.compile(rf"^\s*(?:about\s+|approximately\s+|around\s+)?({NUM})\s*({UNIT})\b", re.I)

# How the database names the units we can promote into.
PROMOTE = {
    "teaspoon": "tsp", "teaspoons": "tsp", "tsp": "tsp", "tsps": "tsp",
    "tablespoon": "tbsp", "tablespoons": "tbsp", "tbsp": "tbsp", "tbsps": "tbsp",
    "cup": "cup", "cups": "cup", "quart": "qt", "quarts": "qt", "pint": "pt", "pints": "pt",
    "pound": "lb", "pounds": "lb", "lb": "lb", "lbs": "lb",
    "ounce": "oz", "ounces": "oz", "oz": "oz", "gram": "g", "grams": "g",
}
CONTAINER_UNITS = {"can"}
UNICODE = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125}


def to_number(text):
    text = text.strip()
    if text in UNICODE:
        return UNICODE[text]
    total = 0.0
    for part in text.split():
        m = re.fullmatch(r"(\d+)/(\d+)", part)
        total += int(m.group(1)) / int(m.group(2)) if m else float(part)
    return total


def clean_note(note, qty, unit):
    """Returns (new_note_or_None, promote_or_None, removed_text)."""
    segments = [s.strip() for s in re.split(r",\s*", note) if s.strip()]
    out, promote, dropped = [], None, []
    amount_lives_in_note = qty == "" and unit == ""
    for seg in segments:
        m = LEAD.match(seg)
        if not m or unit in CONTAINER_UNITS:
            out.append(seg)
            continue
        amount, rest = m.group(1), m.group(2)
        rest = re.sub(r"^(?:of|-|–)\s+", "", rest).strip()
        if amount_lives_in_note:
            # The note is the only place this amount exists: move it, or leave the note alone.
            first = FIRST.match(amount)
            unit_name = first and PROMOTE.get(first.group(2).lower().rstrip("."))
            single = "+" not in amount and " and " not in amount.lower() and not re.search(r"to", amount)
            if promote is None and unit_name and single:
                promote = (to_number(first.group(1)), unit_name)
            else:
                out.append(seg)
                continue
        dropped.append(amount)
        if rest:
            out.append(rest)
    new = ", ".join(out) if out else None
    return new, promote, "; ".join(dropped)


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="where to write the review list of every change")
    args = ap.parse_args()
    # Windows consoles default to cp1252; the data has fraction characters.
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")

    changes = []
    for parts in csv.reader(sys.stdin):
        if len(parts) < 5:
            continue
        rid, qty, unit, ingredient, note = parts[:5]
        if not note.strip():
            continue
        new, promote, dropped = clean_note(note, qty, unit)
        if new == note:
            continue
        changes.append((rid, ingredient, qty, unit, note, new, promote, dropped))

    with open(args.csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["recipe_ingredient_id", "ingredient", "quantity", "unit", "old_prep_note", "new_prep_note", "promoted_to", "removed"])
        for rid, ing, qty, unit, old, new, promote, dropped in changes:
            w.writerow([rid, ing, qty, unit, old, new or "", f"{promote[0]:g} {promote[1]}" if promote else "", dropped])

    print("-- Generated by scripts/cleanup/clean_prep_notes.py. Idempotent: each update is guarded on the old note.")
    print("begin;")
    for rid, ing, qty, unit, old, new, promote, dropped in changes:
        sets = [f"prep_note = {sql_str(new) if new else 'NULL'}"]
        if promote:
            sets.append(f"quantity = {promote[0]:g}")
            sets.append(f"unit_id = (select id from units where name = {sql_str(promote[1])})")
        print(
            f"update recipe_ingredients set {', '.join(sets)} "
            f"where id = {int(rid)} and prep_note is not distinct from {sql_str(old)};"
        )
    print("commit;")
    print(f"changed {len(changes)} rows", file=sys.stderr)


if __name__ == "__main__":
    main()
