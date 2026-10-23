#!/usr/bin/env python3
"""Wave 14 builder: recipes.json (NHS or rescued MyPlate) -> an idempotent seed SQL.

    python -I scripts/myplate/w14_build.py <recipes.json> <out.sql> "<label>"

The database decides (same rule as build_import.py). Differences from the old
MyPlate importer, because wave 14 prefers an honest gap to a wrong recipe:
  * status is 'in_review' (the owner approves in /admin/review);
  * a recipe is REJECTED (not imported, listed in the printed report) when any line
    is unresolved, resolves only by a weak fuzzy match (confidence < 0.9), has a
    unit we cannot resolve, or has no usable name; the quantity of a line is never
    silently dropped because of an unknown unit;
  * duplicates of an existing recipe are rejected: same title, a very similar
    title, or (nearly) the same set of canonical ingredients;
  * allergens, diets and nutrition are computed by the database functions.
Run it dry (the printed report) by replacing the final `commit;` with `rollback;`.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

PY = Path("scripts/parser/.venv/Scripts/python.exe")
if not PY.exists():
    PY = Path("scripts/parser/.venv/bin/python")
PARSER = [str(PY), "scripts/parser/parse_ingredients.py"]


def parse_all(lines: list[str]) -> list[dict]:
    p = subprocess.run(PARSER, input=json.dumps(lines), capture_output=True, text=True, encoding="utf-8",
                       env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"})
    if p.returncode != 0:
        sys.exit("parser failed:\n" + p.stderr[-2000:])
    return json.loads(p.stdout)


def main() -> int:
    src, out, label = sys.argv[1], sys.argv[2], sys.argv[3]
    recipes = json.loads(Path(src).read_text(encoding="utf-8"))
    if len(sys.argv) > 4:  # optional reviewed line-rewrite rules (same contract as scripts/nhs/rules.py)
        import importlib.util
        spec = importlib.util.spec_from_file_location("w14_line_rules", sys.argv[4])
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for r in recipes:
            kept = []
            for ing in r.get("ingredients") or []:
                line, note = mod.normalise(ing["line"])
                if line:
                    ing["orig"] = ing["line"]
                    ing["line"] = line
                    ing["prep_note"] = ", ".join(x for x in (ing.get("prep_note"), note) if x) or None
                    kept.append(ing)
            r["ingredients"] = kept
        for r in recipes:  # the scraped notes carry a Drupal class-name prefix; keep only the text
            if r.get("notes"):
                import re as _re
                r["notes"] = _re.sub(r"^field--[^>]*>\s*", "", r["notes"]).strip() or None
                # scraped page furniture ("Source: USDA ... Show Full Display ... Nutrients Amount") is not a note
                if r["notes"] and _re.search(r"Show Full Display|Nutrients Amount|^Source: USDA", r["notes"]):
                    r["notes"] = None
    flat, idx = [], []
    for ri, r in enumerate(recipes):
        for li, ing in enumerate(r.get("ingredients") or []):
            flat.append(ing["line"])
            idx.append((ri, li))
    print(f"parsing {len(flat)} lines from {len(recipes)} recipes", file=sys.stderr)
    parsed = parse_all(flat)
    for (ri, li), p in zip(idx, parsed):
        r = recipes[ri]["ingredients"][li]
        r["parsed"] = {
            "names": [n["text"] for n in (p.get("names") or [])],
            "quantity": p.get("quantity"),
            "unit": p.get("unit"),
            "prep_note": ", ".join(x for x in (r.get("prep_note"), p.get("prep")) if x) or None,
        }

    payload = []
    for r in recipes:
        lines = []
        for ing in r.get("ingredients") or []:
            pr = ing["parsed"]
            names = pr["names"] or [None]
            multi = len(names) > 1
            optional = "optional" in ing["line"].lower()
            note = pr["prep_note"]
            if optional and not (note and "optional" in note.lower()):
                note = (note + ", optional") if note else "optional"
            low = ing["line"].lower()
            # "A or B" (or "cheese, mozzarella"): the first name carries the FULL amount and the others go into its
            # prep_note. They stay in the payload as is_alt rows so the resolution gate still checks them, but are
            # never inserted (the matcher has no either/or: a second row would be a second required ingredient).
            # Only an "A and B" line with no amount ("salt and pepper") keeps one row per name; nothing is lost there.
            keep_all = multi and pr["quantity"] is None and " and " in low and " or " not in low
            if multi and not keep_all:
                alts = [a for a in names[1:] if a]
                phrase = ("or " if " or " in low else "") + ", ".join(alts)
                note = ", ".join(x for x in (note, phrase) if x)
            for i, nm in enumerate(names):
                lines.append({
                    "raw": ing["line"], "name": nm,
                    "quantity": pr["quantity"] if (i == 0 or keep_all) else None,
                    "unit": pr["unit"] if (i == 0 or keep_all) else None,
                    "prep_note": note if (i == 0 or keep_all) else None, "is_optional": optional,
                    "is_alt": bool(multi and not keep_all and i > 0),
                })
        payload.append({
            "slug": r["slug"], "title": r["title"], "servings": r.get("servings"),
            "prep_time_min": r.get("prep_time_min"), "cook_time_min": r.get("cook_time_min"),
            "notes": r.get("notes"), "nutrition": r.get("nutrition") or {},
            "source_name": r["source_name"], "source_url": r["source_url"],
            "source_license": r["source_license"], "steps": r.get("steps") or [], "lines": lines,
        })
    doc = json.dumps(payload, ensure_ascii=False)
    assert "$minced$" not in doc
    sql = TEMPLATE.replace("__LABEL__", label).replace("__COUNT__", str(len(payload))).replace("__PAYLOAD__", doc)
    Path(out).write_text(sql, encoding="utf-8")
    print(f"wrote {out}", file=sys.stderr)
    return 0


TEMPLATE = r"""-- GENERATED by scripts/myplate/w14_build.py -- do not edit.
-- Wave 14: __LABEL__ (__COUNT__ candidate recipes). Lands as status 'in_review'; nothing is public until
-- approved in /admin/review. PREREQUISITES: all migrations and the wave 10c/12 seeds.
-- NEW SLUGS ONLY. A recipe is rejected (and printed below) rather than imported broken; see w14_build.py.
-- Allergens, diets and nutrition are computed by the database functions at the end, never typed.
begin;
set local jit = off;

create temp table _payload (doc jsonb) on commit drop;
insert into _payload values ($minced$__PAYLOAD__$minced$::jsonb);

create temp table _r on commit drop as
select r->>'slug' as slug, r->>'title' as title, (r->>'servings')::int as servings,
  (r->>'prep_time_min')::int as prep_time_min, (r->>'cook_time_min')::int as cook_time_min,
  nullif(r->>'notes','') as notes,
  (r#>>'{nutrition,calories}')::numeric as calories, (r#>>'{nutrition,protein_g}')::numeric as protein_g,
  (r#>>'{nutrition,carbs_g}')::numeric as carbs_g, (r#>>'{nutrition,fat_g}')::numeric as fat_g,
  (r#>>'{nutrition,sodium_mg}')::numeric as sodium_mg, (r#>>'{nutrition,fiber_g}')::numeric as fiber_g,
  r->>'source_name' as source_name, r->>'source_url' as source_url, r->>'source_license' as source_license,
  r->'steps' as steps, jsonb_array_length(r->'lines') as line_count
from _payload p, jsonb_array_elements(p.doc) r;

create temp table _l on commit drop as
select r->>'slug' as slug, (ord - 1)::int as sort_order, l->>'raw' as raw_line, nullif(l->>'name','') as raw_name,
  (l->>'quantity')::numeric as quantity, nullif(l->>'unit','') as raw_unit, nullif(l->>'prep_note','') as prep_note,
  coalesce((l->>'is_optional')::boolean, false) as is_optional, coalesce((l->>'is_alt')::boolean, false) as is_alt
from _payload p, jsonb_array_elements(p.doc) r, jsonb_array_elements(r->'lines') with ordinality t(l, ord);

create temp table _res0 on commit drop as
select l.*, ri.ingredient_id, ri.canonical_name, ri.match_kind::text as match_kind, ri.confidence, ru.unit_id
from _l l
left join lateral resolve_ingredient(l.raw_name) ri on true
left join lateral resolve_unit(l.raw_unit) ru on true;

-- A modifier-stripped match (match_kind 'fuzzy', confidence 0.9) is accepted ONLY when every word that was dropped is
-- either harmless (fresh, ripe, skinless, fillet, cubes, sizes...) or a qualifier kept in prep_note, where the
-- nutrition rules read it (low sodium, fat free, frozen, dried...). A dropped colour, cut or any other word rejects
-- the recipe ("yellow pepper" must never become black pepper).
create temp table _res on commit drop as
select x.*,
       (x.match_kind = 'fuzzy' and x.confidence >= 0.89 and cardinality(d.added) = 0
        and d.removed <@ array['fresh','ripe','skinless','boneless','fillet','fillets','cubes','chunks','pieces','kernels','large','small',
                               'medium','baby','whole','of','and','a','an','the',
                               'frozen','dried','canned','low-sodium','reduced-sodium','fat-free','non-fat','nonfat','low-fat','reduced-fat',
                               'lean','extra-lean','unsweetened','unsalted','part-skim','skim','whole-grain','whole-wheat','no-salt-added'])
         as strip_ok,
       d.removed
from _res0 x
left join lateral (
  select array(select t from unnest(string_to_array(regexp_replace(lower(x.raw_name), '[,()]', ' ', 'g'), ' ')) t
               where t <> '' and regexp_replace(t, '(es|s)$', '') not in
                 (select regexp_replace(u, '(es|s)$', '') from unnest(string_to_array(regexp_replace(lower(x.canonical_name), '[,()]', ' ', 'g'), ' ')) u)) as removed,
         array(select u from unnest(string_to_array(regexp_replace(lower(x.canonical_name), '[,()]', ' ', 'g'), ' ')) u
               where u <> '' and regexp_replace(u, '(es|s)$', '') not in
                 (select regexp_replace(t, '(es|s)$', '') from unnest(string_to_array(regexp_replace(lower(x.raw_name), '[,()]', ' ', 'g'), ' ')) t)) as added
) d on x.canonical_name is not null;

create temp table _why on commit drop as
select slug, reason from (
  select r.slug, 'no servings' as reason from _r r where servings is null
  union all select slug, 'no ingredients' from _r where line_count = 0
  union all select slug, 'no directions' from _r where jsonb_array_length(coalesce(steps,'[]')) = 0
  union all select r.slug, 'slug already exists' from _r r where exists (select 1 from recipes x where x.slug = r.slug)
  union all select slug, format('unresolved ingredient: "%s"', coalesce(raw_name, raw_line)) from _res where ingredient_id is null
  union all select slug, format('weak match: "%s" -> "%s" (%s)', raw_name, canonical_name, round(confidence::numeric, 2))
    from _res where ingredient_id is not null and match_kind = 'fuzzy' and not strip_ok
  union all select slug, format('unknown unit "%s" in "%s"', raw_unit, raw_line) from _res where raw_unit is not null and unit_id is null
    and raw_unit !~* '^(large |small |good )?(pinch|pinches|dash|dashes)$'
  union all select r.slug, format('title already exists: %s', x.slug) from _r r join recipes x on lower(x.title) = lower(r.title)
) q;

-- near-duplicates: very similar title, or >= 80% of the canonical ingredient set shared with an existing recipe
insert into _why
select r.slug, format('near-duplicate title of %s ("%s", similarity %s)', x.slug, x.title, round(similarity(lower(r.title), lower(x.title))::numeric, 2))
from _r r join recipes x on similarity(lower(r.title), lower(x.title)) >= 0.75 and x.slug <> r.slug;

create temp table _sig on commit drop as
select slug, array_agg(distinct ingredient_id order by ingredient_id) as ids from _res where ingredient_id is not null group by slug;
create temp table _xsig on commit drop as
select recipe_id, array_agg(distinct ingredient_id order by ingredient_id) as ids from recipe_ingredients group by recipe_id;
insert into _why
select s.slug, format('ingredient set %s%% shared with %s', round(100.0 * cardinality(ARRAY(select unnest(s.ids) intersect select unnest(x.ids)))
         / cardinality(ARRAY(select unnest(s.ids) union select unnest(x.ids)))), rc.slug)
from _sig s join _xsig x on cardinality(s.ids) >= 4
join recipes rc on rc.id = x.recipe_id
where cardinality(ARRAY(select unnest(s.ids) intersect select unnest(x.ids)))::numeric
    / cardinality(ARRAY(select unnest(s.ids) union select unnest(x.ids))) >= 0.8;

create temp table _new on commit drop as
select slug from _r r where not exists (select 1 from _why w where w.slug = r.slug);

insert into recipes (slug, title, status, prep_time_min, cook_time_min, servings, calories, protein_g, carbs_g, fat_g,
                     sodium_mg, fiber_g, notes, source_name, source_url, source_license)
select r.slug, r.title, 'in_review', r.prep_time_min, r.cook_time_min, r.servings, r.calories, r.protein_g, r.carbs_g,
       r.fat_g, r.sodium_mg, r.fiber_g, r.notes, r.source_name, r.source_url, r.source_license
from _r r join _new n using (slug);

insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, prep_note, is_optional, sort_order)
-- a pinch / dash is 'to taste': NULL quantity and unit (the schema's meaning), never an invented amount
select rc.id, x.ingredient_id,
       case when x.raw_unit ~* '(pinch|dash)' then null else x.quantity end,
       case when x.raw_unit ~* '(pinch|dash)' then null else x.unit_id end,
       nullif(concat_ws(', ', x.prep_note, (select string_agg(replace(q, '-', ' '), ', ') from unnest(x.removed) q
                where x.strip_ok and q in ('frozen','dried','canned','low-sodium','reduced-sodium','fat-free','non-fat','nonfat','low-fat','reduced-fat','lean','extra-lean','unsweetened','unsalted','part-skim','skim','whole-grain','whole-wheat','no-salt-added'))), ''),
       x.is_optional, x.sort_order
from _res x join _new n using (slug) join recipes rc on rc.slug = x.slug
where not x.is_alt;

insert into recipe_steps (recipe_id, sort_order, instruction)
select rc.id, (ord - 1)::int, t
from _r r join _new n using (slug) join recipes rc on rc.slug = r.slug,
     lateral jsonb_array_elements_text(r.steps) with ordinality s(t, ord);

do $refresh$
declare r record;
begin
  for r in select rc.id from recipes rc join _new n on n.slug = rc.slug loop
    perform refresh_recipe_allergens(r.id);
    perform refresh_recipe_diets(r.id);
    perform refresh_recipe_nutrients(r.id);
  end loop;
end
$refresh$;

\echo '=== SUMMARY ==='
select (select count(*) from _r) as candidates, (select count(*) from _new) as inserted,
       (select count(distinct slug) from _why) as rejected;
\echo '=== REJECTED (slug | reason) ==='
select slug, reason from _why order by slug, reason;
\echo '=== NON-EXACT RESOLUTIONS in inserted recipes (audit) ==='
select x.slug, x.raw_name, x.canonical_name, x.match_kind, round(x.confidence::numeric, 2) as conf, x.removed
from _res x join _new n using (slug) where x.match_kind <> 'exact' order by 1, 2;

commit;
"""

if __name__ == "__main__":
    raise SystemExit(main())
