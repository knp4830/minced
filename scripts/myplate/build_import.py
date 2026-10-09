#!/usr/bin/env python3
"""Stage 3 of the MyPlate import: parse every ingredient line, emit import SQL.

    python3 scripts/myplate/build_import.py

Reads  scripts/myplate/artifacts/recipes.json   (from extract.py)
Writes scripts/myplate/artifacts/import.sql     (apply with scripts/myplate/import.sh)

WHY THE SQL DOES THE DECIDING
-----------------------------
This script parses, but it does not judge. Whether a recipe may be imported
depends on resolve_ingredient() and resolve_unit(), which live in Postgres --
so the payload goes to the database as JSON and the accept/reject decision is
made there, in the same transaction as the insert. A gate evaluated anywhere
else is a gate that can disagree with the database it is protecting.

The payload is embedded as a dollar-quoted string, so no value ever needs SQL
escaping -- the one class of bug that turns an importer into an injection hole.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ART = Path("scripts/myplate/artifacts")
RECIPES = ART / "recipes.json"
OUT = ART / "import.sql"
PARSER = ["bash", "scripts/parser/run.sh"]


def expand_lines(ingredients: list[dict]) -> list[dict]:
    """One row per INGREDIENT, not per line.

    "salt and pepper to taste" is one line and two ingredients, and
    recipe_ingredients stores one ingredient per row. M1.5.2 flagged these and
    M1.5.3 first rejected the whole recipe over them -- which turned out to be
    the single largest cause of rejection, mostly over pantry staples that do
    not even affect matching. The parser already hands us both names, so the
    honest fix is to split rather than to discard a good recipe.

    The QUANTITY is dropped when a line splits. "1 cup carrots and celery" gives
    no way to know how the cup divides, and inventing a split would be exactly
    the confident wrongness this pipeline exists to prevent. NULL quantity is
    the schema's "to taste", which is what these lines nearly always are.
    """
    out: list[dict] = []
    for ing in ingredients:
        parsed = ing["parsed"]
        names = parsed["names"] or [None]
        multi = len(names) > 1
        for name in names:
            out.append(
                {
                    "raw": ing["line"],
                    "name": name,
                    "quantity": None if multi else parsed["quantity"],
                    "unit": None if multi else parsed["unit"],
                    "prep_note": parsed["prep_note"],
                    "confidence": parsed["confidence"],
                    "split_from_multi": multi,
                }
            )
    return out


def parse_all(lines: list[str]) -> list[dict]:
    """One parser invocation for every line in the catalog -- the model loads once."""
    proc = subprocess.run(
        PARSER, input=json.dumps(lines), capture_output=True, text=True
    )
    if proc.returncode != 0:
        sys.exit(f"parser failed:\n{proc.stderr[-2000:]}")
    return json.loads(proc.stdout)


def main() -> int:
    if not RECIPES.is_file():
        sys.exit(f"missing {RECIPES}. Run scripts/myplate/extract.py first.")

    recipes = json.loads(RECIPES.read_text())

    # Flatten every ingredient line in the catalog into one list, remembering
    # where each came from, so the parser runs once rather than per recipe.
    flat: list[str] = []
    index: list[tuple[int, int]] = []
    for ri, rec in enumerate(recipes):
        for li, ing in enumerate(rec.get("ingredients") or []):
            flat.append(ing["line"])
            index.append((ri, li))

    print(f"parsing {len(flat)} ingredient lines from {len(recipes)} recipes...", file=sys.stderr)
    parsed = parse_all(flat)

    for (ri, li), p in zip(index, parsed):
        rec = recipes[ri]
        ing = rec["ingredients"][li]
        names = p.get("names") or []
        ing["parsed"] = {
            "names": [n["text"] for n in names],
            "quantity": p.get("quantity"),
            "unit": p.get("unit"),
            # The page's own <span class="notes"> wins over the model's guess:
            # USDA already separated it, so it is data rather than inference.
            "prep_note": ing.get("prep_note") or p.get("prep"),
            "confidence": p.get("confidence"),
        }

    payload = [
        {
            "slug": r["slug"],
            "title": r["title"],
            "description": r.get("description"),
            "servings": r.get("servings"),
            "prep_time_min": r.get("prep_time_min"),
            "cook_time_min": r.get("cook_time_min"),
            "total_time_min": r.get("total_time_min"),
            "image_url": r.get("image_url"),
            "notes": r.get("notes"),
            "nutrition": r.get("nutrition") or {},
            "source_name": r["source_name"],
            "source_url": r["source_url"],
            "source_license": r["source_license"],
            "steps": r.get("steps") or [],
            "lines": expand_lines(r.get("ingredients") or []),
        }
        for r in recipes
    ]

    doc = json.dumps(payload, ensure_ascii=False)
    if "$minced$" in doc:  # would break the dollar quoting
        sys.exit("payload contains the dollar-quote tag; pick another tag")

    ART.mkdir(parents=True, exist_ok=True)
    OUT.write_text(SQL_TEMPLATE.replace("__PAYLOAD__", doc), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1_000_000:.1f} MB)", file=sys.stderr)
    return 0


SQL_TEMPLATE = r"""-- GENERATED by scripts/myplate/build_import.py -- do not edit.
--
-- USDA MyPlate Kitchen import (M1.5.3). Public domain, US federal government
-- work, taken from the Internet Archive's capture of myplate.gov.
--
-- IDEMPOTENT AND RESUMABLE: recipes upsert by slug and their children are
-- deleted and rebuilt, so re-running converges rather than duplicating.

\set ON_ERROR_STOP on
begin;

create temp table _payload (doc jsonb) on commit drop;
insert into _payload values ($minced$__PAYLOAD__$minced$::jsonb);

-- ---------------------------------------------------------------------------
-- Expand the payload
-- ---------------------------------------------------------------------------
create temp table _r on commit drop as
select
  r->>'slug'                                as slug,
  r->>'title'                               as title,
  nullif(r->>'description','')              as description,
  (r->>'servings')::int                     as servings,
  (r->>'prep_time_min')::int                as prep_time_min,
  (r->>'cook_time_min')::int                as cook_time_min,
  (r->>'total_time_min')::int               as total_time_min,
  nullif(r->>'image_url','')                as image_url,
  nullif(r->>'notes','')                    as notes,
  (r#>>'{nutrition,calories}')::numeric     as calories,
  (r#>>'{nutrition,protein_g}')::numeric    as protein_g,
  (r#>>'{nutrition,carbs_g}')::numeric      as carbs_g,
  (r#>>'{nutrition,fat_g}')::numeric        as fat_g,
  (r#>>'{nutrition,sodium_mg}')::numeric    as sodium_mg,
  (r#>>'{nutrition,fiber_g}')::numeric      as fiber_g,
  r->>'source_name'                         as source_name,
  r->>'source_url'                          as source_url,
  r->>'source_license'                      as source_license,
  r->'steps'                                as steps,
  jsonb_array_length(coalesce(r->'lines','[]'::jsonb)) as line_count
from _payload p, jsonb_array_elements(p.doc) r;

create temp table _l on commit drop as
select
  row_number() over ()                 as line_id,
  r->>'slug'                           as slug,
  (ord - 1)::int                       as sort_order,
  l->>'raw'                            as raw_line,
  nullif(l->>'name','')                as raw_name,
  (l->>'quantity')::numeric            as quantity,
  nullif(l->>'unit','')                as raw_unit,
  nullif(l->>'prep_note','')           as prep_note
from _payload p,
     jsonb_array_elements(p.doc) r,
     jsonb_array_elements(coalesce(r->'lines','[]'::jsonb)) with ordinality t(l, ord);

-- ---------------------------------------------------------------------------
-- Resolve. This is the whole reason the payload comes to the database.
-- ---------------------------------------------------------------------------
create temp table _res on commit drop as
select
  l.line_id, l.slug, l.sort_order, l.raw_line, l.raw_name,
  l.quantity, l.raw_unit, l.prep_note,
  ri.ingredient_id, ri.match_kind, ri.confidence,
  ru.unit_id, ru.unit_name
from _l l
left join lateral resolve_ingredient(l.raw_name) ri on true
left join lateral resolve_unit(l.raw_unit)       ru on true;

-- ---------------------------------------------------------------------------
-- The gate. CLAUDE.md: a recipe with unresolved ingredients is REJECTED at
-- import, not warned about. Rejections are per RECIPE, never per line -- half a
-- recipe is not a recipe.
-- ---------------------------------------------------------------------------
create temp table _reject on commit drop as
select r.slug, string_agg(distinct reason, '; ' order by reason) as reasons
from _r r
cross join lateral (
  select unnest(array_remove(array[
    case when r.servings is null              then 'no servings'            end,
    case when coalesce(r.title,'') = ''       then 'no title'               end,
    case when r.line_count = 0                then 'no ingredients'         end,
    case when jsonb_array_length(coalesce(r.steps,'[]'::jsonb)) = 0
                                              then 'no directions'          end,
    case when exists (select 1 from _res x where x.slug = r.slug and x.ingredient_id is null)
                                              then 'unresolved ingredient'  end,
    -- A line naming two ingredients is SPLIT into two rows upstream rather
    -- than rejected; see expand_lines() in build_import.py.
    case when exists (select 1 from _res x where x.slug = r.slug and x.raw_name is null)
                                              then 'unparseable line'       end
  ], null)) as reason
) t
group by r.slug;

create temp table _accept on commit drop as
select r.slug from _r r
where not exists (select 1 from _reject j where j.slug = r.slug);

-- ---------------------------------------------------------------------------
-- Import the accepted recipes
-- ---------------------------------------------------------------------------
insert into recipes (
  slug, title, description, status, servings,
  prep_time_min, cook_time_min,
  calories, protein_g, carbs_g, fat_g, sodium_mg, fiber_g,
  image_url, notes, source_name, source_url, source_license
)
select
  r.slug, r.title, r.description, 'published', r.servings,
  -- total_time_min is a GENERATED column (prep + cook); the database computes
  -- it. Writing it is an error, and USDA's own totalTime is untrustworthy
  -- anyway -- it emits "PT20S" on a recipe that cooks for 20 minutes.
  r.prep_time_min, r.cook_time_min,
  r.calories, r.protein_g, r.carbs_g, r.fat_g, r.sodium_mg, r.fiber_g,
  r.image_url, r.notes, r.source_name, r.source_url, r.source_license
from _r r
join _accept a on a.slug = r.slug
on conflict (slug) do update set
  title = excluded.title, description = excluded.description,
  status = excluded.status, servings = excluded.servings,
  prep_time_min = excluded.prep_time_min, cook_time_min = excluded.cook_time_min,
  calories = excluded.calories, protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
  sodium_mg = excluded.sodium_mg, fiber_g = excluded.fiber_g,
  image_url = excluded.image_url, notes = excluded.notes,
  source_name = excluded.source_name, source_url = excluded.source_url,
  source_license = excluded.source_license;

-- Children are rebuilt rather than merged: an ingredient REMOVED upstream has
-- to disappear here too, and an upsert alone would leave it behind forever.
delete from recipe_ingredients ri
using recipes rc join _accept a on a.slug = rc.slug
where ri.recipe_id = rc.id;

delete from recipe_steps rs
using recipes rc join _accept a on a.slug = rc.slug
where rs.recipe_id = rc.id;

insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, prep_note, sort_order)
select
  rc.id,
  x.ingredient_id,
  -- A quantity whose unit we could not resolve is dropped along with the unit:
  -- "1" of an unknown measure is not information, it is a wrong number waiting
  -- to be believed. NULL quantity is the schema's "to taste", which is exactly
  -- what a pinch is. A line with NO unit at all keeps its count ("2 eggs").
  case when x.raw_unit is not null and x.unit_id is null then null else x.quantity end,
  x.unit_id,
  x.prep_note,
  x.sort_order
from _res x
join _accept a on a.slug = x.slug
join recipes rc on rc.slug = x.slug;

insert into recipe_steps (recipe_id, sort_order, instruction)
select rc.id, (ord - 1)::int, step
from _r r
join _accept a on a.slug = r.slug
join recipes rc on rc.slug = r.slug,
     lateral jsonb_array_elements_text(r.steps) with ordinality t(step, ord);

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== IMPORT SUMMARY ==='
select
  (select count(*) from _r)                      as recipes_in_payload,
  (select count(*) from _accept)                 as imported,
  (select count(*) from _reject)                 as rejected,
  (select count(*) from _res)                    as ingredient_lines,
  (select count(*) from _res where ingredient_id is null) as unresolved_lines;

\echo ''
\echo '=== REJECTIONS BY REASON ==='
select reasons, count(*) as recipes
from _reject group by reasons order by count(*) desc;

\echo ''
\echo '=== TOP UNRESOLVED INGREDIENT NAMES (add these aliases next) ==='
select raw_name, count(*) as occurrences, count(distinct slug) as recipes
from _res where ingredient_id is null
group by raw_name order by count(*) desc, raw_name limit 40;

\echo ''
\echo '=== UNKNOWN UNITS (quantity dropped for these lines) ==='
select raw_unit, count(*) as occurrences
from _res where raw_unit is not null and unit_id is null
group by raw_unit order by count(*) desc;

-- The manual-fix queue, written client-side so it survives the transaction.
\copy (select slug, reasons from _reject order by slug) to 'scripts/myplate/artifacts/rejected-recipes.csv' with csv header
\copy (select raw_name, count(*) as occurrences, count(distinct slug) as recipes from _res where ingredient_id is null group by raw_name order by count(*) desc, raw_name) to 'scripts/myplate/artifacts/unresolved-ingredients.csv' with csv header

commit;
"""


if __name__ == "__main__":
    raise SystemExit(main())
