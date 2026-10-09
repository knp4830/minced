#!/usr/bin/env python3
"""Build the original-recipe seed from the hand-written recipe files.

    python3 scripts/content/build_original.py

Reads   scripts/content/recipes/*.txt     (recipes in Minced's own words)
        scripts/content/sources/*.tsv     (verification URLs, review only)
Writes  supabase/seed-original-recipes.sql
        docs/content/RECIPE-REVIEW.md

WHY THE DATABASE DOES THE DECIDING
----------------------------------
Same principle as scripts/myplate/build_import.py: this script parses text, but
whether a recipe may ship is decided inside Postgres by resolve_ingredient() and
resolve_unit(), in the same transaction as the insert. A gate evaluated anywhere
else can disagree with the database it protects.

Two rules are STRICTER than the USDA importer, because these recipes are
hand-written and have no excuse for a guess:

  * an ingredient must resolve by exact name or curated alias -- a trigram
    "fuzzy" match is a guess, and a hand-written recipe should never need one;
  * any failure aborts the whole file. Recipes with an unresolvable ingredient
    are fixed, not skipped.

The verification URLs are deliberately NOT written to the database: source_url
stays NULL. Facts (which ingredients, which technique) are not copyrightable,
and the wording here is original, so there is nothing to attribute -- the URLs
exist so a human can audit that each dish is real and traditional.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
RECIPE_DIR = ROOT / "scripts" / "content" / "recipes"
SOURCE_DIR = ROOT / "scripts" / "content" / "sources"
OUT_SQL = ROOT / "supabase" / "seed-original-recipes.sql"
OUT_REVIEW = ROOT / "docs" / "content" / "RECIPE-REVIEW.md"

SOURCE_NAME = "Minced original"
SOURCE_LICENSE = "Original work authored for Minced. Ingredient lists are facts; all wording is original."


def parse_recipes() -> list[dict]:
    recipes: list[dict] = []
    cur: dict | None = None
    for path in sorted(RECIPE_DIR.glob("*.txt")):
        for ln, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.rstrip()
            where = f"{path.name}:{ln}"
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if line.startswith("@"):
                parts = [p.strip() for p in line[1:].split("|")]
                if len(parts) != 9:
                    sys.exit(f"{where}: header needs 9 fields, got {len(parts)}: {line}")
                slug, title, cuisine, prep, cook, servings, spice, cookware, note = parts
                cur = {
                    "slug": slug,
                    "title": title,
                    "cuisine": cuisine,
                    "prep_time_min": int(prep),
                    "cook_time_min": int(cook),
                    "servings": int(servings),
                    "spice_level": int(spice),
                    "cookware": [c.strip() for c in cookware.split(",") if c.strip()],
                    "notes": note,
                    "ingredients": [],
                    "steps": [],
                    "file": path.name,
                }
                recipes.append(cur)
            elif line.startswith("-"):
                if cur is None:
                    sys.exit(f"{where}: ingredient before any recipe header")
                optional = line.startswith("-?")
                body = line[2:] if optional else line[1:]
                cols = [c.strip() for c in body.split("|")]
                if len(cols) != 4:
                    sys.exit(f"{where}: ingredient needs 4 columns (qty|unit|name|prep): {line}")
                qty, unit, name, prep = cols
                cur["ingredients"].append(
                    {
                        "sort_order": len(cur["ingredients"]) + 1,
                        "quantity": float(qty) if qty else None,
                        "unit": unit or None,
                        "name": name,
                        "prep_note": prep or None,
                        "is_optional": optional,
                    }
                )
            elif re.match(r"^\d+\.\s", line):
                if cur is None:
                    sys.exit(f"{where}: step before any recipe header")
                n, text = line.split(".", 1)
                if int(n) != len(cur["steps"]) + 1:
                    sys.exit(f"{where}: step numbered {n}, expected {len(cur['steps']) + 1}")
                cur["steps"].append(text.strip())
            else:
                sys.exit(f"{where}: unrecognised line: {line}")
    return recipes


def parse_sources() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for path in sorted(SOURCE_DIR.glob("*.tsv")):
        for raw in path.read_text(encoding="utf-8").splitlines():
            if not raw.strip():
                continue
            slug, *urls = raw.split("\t")
            out[slug] = [u.strip() for u in urls if u.strip()]
    return out


def validate(recipes: list[dict], sources: dict[str, list[str]]) -> None:
    errors: list[str] = []
    slugs = [r["slug"] for r in recipes]
    titles = [r["title"].lower() for r in recipes]
    for dup in {s for s in slugs if slugs.count(s) > 1}:
        errors.append(f"duplicate slug {dup}")
    for dup in {t for t in titles if titles.count(t) > 1}:
        errors.append(f"duplicate title {dup}")
    for r in recipes:
        s = r["slug"]
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", s):
            errors.append(f"{s}: bad slug")
        if not (0 <= r["spice_level"] <= 4):
            errors.append(f"{s}: spice_level out of range")
        if r["servings"] <= 0:
            errors.append(f"{s}: servings must be positive")
        if len(r["steps"]) < 3:
            errors.append(f"{s}: fewer than 3 steps")
        if len(r["ingredients"]) < 3:
            errors.append(f"{s}: fewer than 3 ingredients")
        if s not in sources or len(sources[s]) < 2:
            errors.append(f"{s}: needs at least 2 verification URLs")
        elif len(set(re.sub(r"^https?://(www\.)?", "", u).split("/")[0] for u in sources[s])) < 2:
            errors.append(f"{s}: verification URLs must be from 2 independent domains")
    for s in sources:
        if s not in slugs:
            errors.append(f"sources.tsv has {s} but no recipe has that slug")
    if errors:
        sys.exit("validation failed:\n  " + "\n  ".join(errors))


def sql_text(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def write_sql(recipes: list[dict]) -> None:
    payload = [
        {
            k: r[k]
            for k in (
                "slug",
                "title",
                "cuisine",
                "prep_time_min",
                "cook_time_min",
                "servings",
                "spice_level",
                "cookware",
                "notes",
                "ingredients",
                "steps",
            )
        }
        for r in recipes
    ]
    doc = json.dumps(payload, ensure_ascii=False, indent=None)
    if "$minced$" in doc:
        sys.exit("payload contains the dollar-quote tag; pick another tag")
    sql = SQL_TEMPLATE
    sql = sql.replace("__COUNT__", str(len(recipes)))
    sql = sql.replace("__SOURCE_NAME__", sql_text(SOURCE_NAME))
    sql = sql.replace("__SOURCE_LICENSE__", sql_text(SOURCE_LICENSE))
    sql = sql.replace("__PAYLOAD__", doc)
    OUT_SQL.write_text(sql, encoding="utf-8", newline="\n")
    print(f"wrote {OUT_SQL.relative_to(ROOT)} ({OUT_SQL.stat().st_size / 1000:.0f} KB, {len(recipes)} recipes)")


def write_review(recipes: list[dict], sources: dict[str, list[str]]) -> None:
    OUT_REVIEW.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Recipe review -- original recipes",
        "",
        "> GENERATED by `scripts/content/build_original.py` from `scripts/content/recipes/*.txt` and",
        "> `scripts/content/sources/*.tsv`. Edit those, not this file.",
        "",
        "Every recipe below was written in Minced's own words from culinary knowledge. The two",
        "URLs per dish are **verification only**: they are how a human confirms the dish is real and",
        "traditional and that its ingredient list and method are standard. They are not copied from",
        "and not stored in the database (`source_url` is NULL). Each pair is from two independent",
        "domains. Where a listed page is a print view (`wprm_print`) it is the same recipe page.",
        "",
        "What to check when reviewing: the dish exists as described, the ingredients are what a cook",
        "of that tradition would use, and no sentence reads like a source's wording.",
        "",
        "## How each dish was verified, and the limits of that",
        "",
        "For every dish a web search ('authentic <dish> recipe') was run and the ingredient lists and",
        "techniques that independent sites agreed on were used to confirm the dish is real and the",
        "ingredient list is standard. The two URLs listed are the best independent pages from those",
        "results. **The pages were not each opened and read end to end** -- the agreement was read from",
        "search summaries across 8-10 results per dish. Treat the URLs as the audit trail, not as proof",
        "that every quantity was cross-checked. Quantities, times, steps, spice levels and servings are",
        "Minced's own and should get a cook's eye before launch.",
        "",
        "Known soft spots:",
        "",
        "- **Spice level (0-4) and servings** are estimates written by the author, not sourced.",
        "- **Tinga de Pollo, Sopa de Tortilla**: sources describe regional variants (Puebla piloncillo,",
        "  pasilla vs chipotle). The recipe is a defensible common version, not the only one.",
        "- **Kung Pao Chicken**: sources split between Sichuan style (this recipe) and American-restaurant style.",
        "- **Doro Wat, Ropa Vieja, Harira**: search results gave the shape of the dish and its defining",
        "  steps; the specific timings are the author's.",
        "- **Avgolemono, Tomato and Egg Stir-Fry**: a first search surfaced only a cluster of pages from one",
        "  commercial spice site, which was discarded; the listed pages are the replacements.",
        "- **Sinigang, Kerala Fish Curry**: authentic versions use ingredients that are hard",
        "  to find (taro, kudampuli); the recipe uses the common purchasable substitute",
        "  (tamarind paste, snapper) rather than the rarest form.",
        "- Ingredient resolution maps `ancho chile` to `poblano pepper` (an existing alias: ancho is the dried",
        "  poblano). Tacos al Pastor therefore matches a pantry that holds fresh poblano. See the report notes.",
        "",
        f"**{len(recipes)} recipes.**",
        "",
        "| # | Title | Cuisine | Time | Serves | Spice | Verification sources |",
        "|---|-------|---------|------|--------|-------|----------------------|",
    ]
    for i, r in enumerate(sorted(recipes, key=lambda x: (x["cuisine"], x["title"])), 1):
        urls = " <br> ".join(f"[{j + 1}]({u})" for j, u in enumerate(sources[r["slug"]]))
        total = r["prep_time_min"] + r["cook_time_min"]
        lines.append(
            f"| {i} | {r['title']} | {r['cuisine']} | {total} min | {r['servings']} | {r['spice_level']} | {urls} |"
        )
    lines.append("")
    OUT_REVIEW.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"wrote {OUT_REVIEW.relative_to(ROOT)}")


SQL_TEMPLATE = r"""-- GENERATED by scripts/content/build_original.py -- do not edit.
--
-- __COUNT__ original recipes (source_name = 'Minced original'), written in
-- Minced's own words. See docs/content/RECIPE-REVIEW.md.
--
-- PREREQUISITES, applied in this order (scripts/content/apply.sh does it):
--   supabase/seed-ingredients.sql   vocabulary the recipes resolve against
--   supabase/seed-allergens.sql     ingredient -> allergen, which the allergen
--                                   triggers and the diet tags below depend on
--   supabase/seed-cuisines.sql      the cuisine rows the recipes point at
--
-- IDEMPOTENT: recipes upsert by slug; a recipe whose content has not changed is
-- not touched at all (no updated_at churn, no child rebuild). Re-running a clean
-- database is a no-op.
--
-- STRICT: any problem aborts the whole file -- unresolved or fuzzy ingredient,
-- unknown unit, cuisine or cookware, a slug owned by some other source, a title
-- that already exists under another slug, missing allergen data. Nothing ships
-- half-done.
--
-- Nutrition is left NULL on purpose: the nutrition pipeline fills it in later.

begin;

-- ---------------------------------------------------------------------------
-- Cookware vocabulary this file needs
-- ---------------------------------------------------------------------------
insert into cookware (name, slug) values
  ('Wok',          'wok'),
  ('Blender',      'blender'),
  ('Baking dish',  'baking-dish')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Payload
-- ---------------------------------------------------------------------------
create temp table _payload (doc jsonb) on commit drop;
insert into _payload values ($minced$__PAYLOAD__$minced$::jsonb);

create temp table _r on commit drop as
select
  r->>'slug'                        as slug,
  r->>'title'                       as title,
  r->>'cuisine'                     as cuisine,
  (r->>'prep_time_min')::int        as prep_time_min,
  (r->>'cook_time_min')::int        as cook_time_min,
  (r->>'servings')::int             as servings,
  (r->>'spice_level')::smallint     as spice_level,
  nullif(r->>'notes','')            as notes,
  r->'cookware'                     as cookware,
  r->'steps'                        as steps
from _payload p, jsonb_array_elements(p.doc) r;

create temp table _l on commit drop as
select
  r->>'slug'                          as slug,
  (l->>'sort_order')::int             as sort_order,
  l->>'name'                          as raw_name,
  (l->>'quantity')::numeric           as quantity,
  nullif(l->>'unit','')               as raw_unit,
  nullif(l->>'prep_note','')          as prep_note,
  (l->>'is_optional')::boolean        as is_optional
from _payload p,
     jsonb_array_elements(p.doc) r,
     jsonb_array_elements(r->'ingredients') l;

-- ---------------------------------------------------------------------------
-- Resolve, strictly
-- ---------------------------------------------------------------------------
create temp table _res on commit drop as
select l.*, ri.ingredient_id, ri.canonical_name, ri.match_kind, ru.unit_id
from _l l
left join lateral resolve_ingredient(l.raw_name) ri on true
left join lateral resolve_unit(l.raw_unit)       ru on true;

do $gate$
declare
  bad text;
begin
  select string_agg(distinct format('%s: "%s"', slug, raw_name), E'\n  ')
    into bad from _res where ingredient_id is null;
  if bad is not null then
    raise exception E'UNRESOLVED ingredients (fix the recipe or add the ingredient to seed-ingredients.sql):\n  %', bad;
  end if;

  select string_agg(distinct format('%s: "%s" resolved by %s to "%s"', slug, raw_name, match_kind, canonical_name), E'\n  ')
    into bad from _res where match_kind not in ('exact','alias');
  if bad is not null then
    raise exception E'FUZZY ingredient matches are not allowed for hand-written recipes (use the canonical name or add an alias):\n  %', bad;
  end if;

  select string_agg(distinct format('%s: unit "%s"', slug, raw_unit), E'\n  ')
    into bad from _res where raw_unit is not null and unit_id is null;
  if bad is not null then
    raise exception E'UNKNOWN units:\n  %', bad;
  end if;

  select string_agg(distinct format('%s: "%s"', r.slug, r.cuisine), E'\n  ')
    into bad from _r r left join cuisines c on c.name = r.cuisine where c.id is null;
  if bad is not null then
    raise exception E'UNKNOWN cuisines (apply supabase/seed-cuisines.sql first):\n  %', bad;
  end if;

  select string_agg(distinct format('%s: "%s"', r.slug, cw), E'\n  ')
    into bad
  from _r r, jsonb_array_elements_text(r.cookware) cw
  left join cookware k on k.name = cw
  where k.id is null;
  if bad is not null then
    raise exception E'UNKNOWN cookware:\n  %', bad;
  end if;

  -- A slug already taken by some other source is a collision, not an update.
  select string_agg(r.slug, ', ') into bad
  from _r r join recipes x on x.slug = r.slug
  where x.source_name is distinct from __SOURCE_NAME__;
  if bad is not null then
    raise exception 'slug already used by a different source: %', bad;
  end if;

  -- Dedupe: the same title under a different slug is the same dish twice.
  select string_agg(format('%s ~ %s', r.slug, x.slug), ', ') into bad
  from _r r join recipes x on lower(x.title) = lower(r.title) and x.slug <> r.slug;
  if bad is not null then
    raise exception 'title already exists under another slug: %', bad;
  end if;

  -- Diet tags and allergens come from seed-allergens.sql. Without it every
  -- recipe would look gluten-free and allergen-free, which is the worst failure
  -- this data can have. Check a few sentinels that must be present.
  if (select count(*) from ingredient_allergens ia
        join ingredients i on i.id = ia.ingredient_id
        join allergens a on a.id = ia.allergen_id
       where (i.canonical_name, a.name) in
         (('soy sauce','Gluten'), ('fish sauce','Fish'), ('shrimp','Shellfish'),
          ('peanuts','Nuts'), ('butter','Dairy'), ('mayonnaise','Egg'),
          ('tahini','Sesame'), ('firm tofu','Soy'))) < 8 then
    raise exception 'allergen data missing: apply supabase/seed-allergens.sql before this file';
  end if;
end
$gate$;

-- ---------------------------------------------------------------------------
-- Diet derivation. Allergens say what is IN an ingredient; these lists say
-- which ingredients are animal-derived. Both are needed: "chicken" has no
-- allergen but is not vegetarian.
-- ---------------------------------------------------------------------------
create temp table _meat on commit drop as
select i.id as ingredient_id
from ingredients i
where (i.aisle_category = 'Protein'
       and i.canonical_name not in (
         -- eggs, plant proteins and seafood are not meat
         'egg','egg whites','egg substitute','firm tofu','silken tofu','tempeh','seitan','edamame',
         'salmon','canned tuna','catfish','cod','halibut','pollock','sardines','snapper','tilapia',
         'trout','tuna steak','walleye','smoked salmon','anchovies','shrimp','crab','lobster','clams',
         'mussels','scallops','squid','imitation crab','dried shrimp','fish cakes'))
   or i.canonical_name in (
         'chicken broth','chicken bouillon','beef broth','beef bouillon','cream of chicken soup',
         'liver pate','japanese curry roux','lard');

do $meatcheck$
declare
  missed text;
begin
  -- Guard against the silent failure: a meat ingredient added to the vocabulary
  -- but not classified above would be tagged vegetarian.
  select string_agg(distinct i.canonical_name::text, ', ') into missed
  from _res x
  join ingredients i on i.id = x.ingredient_id
  where i.canonical_name::text ~* '(chicken|beef|pork|lamb|bacon|ham\M|turkey|sausage|prosciutto|pancetta|steak|brisket|veal|duck|goat)'
    and i.canonical_name::text !~* '(cheese|egg)'
    and not exists (select 1 from _meat m where m.ingredient_id = i.id);
  if missed is not null then
    raise exception 'meat-like ingredients not classified as meat (fix _meat in the generator): %', missed;
  end if;
end
$meatcheck$;

create temp table _derived_diets on commit drop as
with facts as (
  select
    r.slug,
    bool_or(m.ingredient_id is not null)                                            as has_meat,
    bool_or(a.name in ('Fish','Shellfish'))                                          as has_fish,
    bool_or(a.name in ('Dairy','Egg') or i.canonical_name = 'honey')                 as has_animal_other,
    bool_or(a.name = 'Gluten')                                                       as has_gluten
  from _r r
  join _res x on x.slug = r.slug
  join ingredients i on i.id = x.ingredient_id
  left join _meat m on m.ingredient_id = i.id
  left join ingredient_allergens ia on ia.ingredient_id = i.id
  left join allergens a on a.id = ia.allergen_id
  group by r.slug
)
select slug, d.diet
from facts f
cross join lateral (values
  ('Vegan',       not coalesce(f.has_meat,false) and not coalesce(f.has_fish,false) and not coalesce(f.has_animal_other,false)),
  ('Vegetarian',  not coalesce(f.has_meat,false) and not coalesce(f.has_fish,false)),
  ('Pescatarian', not coalesce(f.has_meat,false) and coalesce(f.has_fish,false)),
  ('Gluten-free', not coalesce(f.has_gluten,false))
) d(diet, ok)
where d.ok;

-- ---------------------------------------------------------------------------
-- Which recipes actually changed? Anything unchanged is left strictly alone.
-- ---------------------------------------------------------------------------
create temp table _fp on commit drop as
select
  r.slug,
  md5(concat_ws('#',
    r.title, c.id, r.prep_time_min, r.cook_time_min, r.servings, r.spice_level, coalesce(r.notes,''),
    (select string_agg(concat_ws('|', x.ingredient_id, coalesce(x.quantity::text,''), coalesce(x.unit_id::text,''),
                                 coalesce(x.prep_note,''), x.is_optional, x.sort_order), ';' order by x.sort_order)
       from _res x where x.slug = r.slug),
    (select string_agg(s.t, ';' order by s.n) from jsonb_array_elements_text(r.steps) with ordinality s(t, n)),
    (select string_agg(k.id::text, ',' order by k.id)
       from jsonb_array_elements_text(r.cookware) cw join cookware k on k.name = cw)
  )) as fp
from _r r join cuisines c on c.name = r.cuisine;

create temp table _live_fp on commit drop as
select
  rc.slug,
  md5(concat_ws('#',
    rc.title, rc.cuisine_id, rc.prep_time_min, rc.cook_time_min, rc.servings, rc.spice_level, coalesce(rc.notes,''),
    (select string_agg(concat_ws('|', ri.ingredient_id, coalesce(ri.quantity::text,''), coalesce(ri.unit_id::text,''),
                                 coalesce(ri.prep_note,''), ri.is_optional, ri.sort_order), ';' order by ri.sort_order)
       from recipe_ingredients ri where ri.recipe_id = rc.id),
    (select string_agg(st.instruction, ';' order by st.sort_order) from recipe_steps st where st.recipe_id = rc.id),
    (select string_agg(rk.cookware_id::text, ',' order by rk.cookware_id) from recipe_cookware rk where rk.recipe_id = rc.id)
  )) as fp
from recipes rc
where rc.source_name = __SOURCE_NAME__;

create temp table _changed on commit drop as
select f.slug
from _fp f left join _live_fp l on l.slug = f.slug
where l.fp is distinct from f.fp;

-- ---------------------------------------------------------------------------
-- Write
-- ---------------------------------------------------------------------------
insert into recipes (
  slug, title, cuisine_id, status, prep_time_min, cook_time_min, servings, spice_level,
  notes, source_name, source_license
)
select
  r.slug, r.title, c.id, 'published', r.prep_time_min, r.cook_time_min, r.servings, r.spice_level,
  r.notes, __SOURCE_NAME__, __SOURCE_LICENSE__
from _r r
join cuisines c on c.name = r.cuisine
join _changed ch on ch.slug = r.slug
on conflict (slug) do update set
  title = excluded.title, cuisine_id = excluded.cuisine_id, status = excluded.status,
  prep_time_min = excluded.prep_time_min, cook_time_min = excluded.cook_time_min,
  servings = excluded.servings, spice_level = excluded.spice_level, notes = excluded.notes,
  source_name = excluded.source_name, source_license = excluded.source_license;

-- Children of changed recipes are rebuilt: a line removed from the source has
-- to disappear here too, and an upsert alone would leave it behind.
delete from recipe_ingredients ri using recipes rc join _changed ch on ch.slug = rc.slug where ri.recipe_id = rc.id;
delete from recipe_steps       rs using recipes rc join _changed ch on ch.slug = rc.slug where rs.recipe_id = rc.id;
delete from recipe_cookware    rk using recipes rc join _changed ch on ch.slug = rc.slug where rk.recipe_id = rc.id;

insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, prep_note, is_optional, sort_order)
select rc.id, x.ingredient_id, x.quantity, x.unit_id, x.prep_note, x.is_optional, x.sort_order
from _res x
join _changed ch on ch.slug = x.slug
join recipes rc on rc.slug = x.slug;

insert into recipe_steps (recipe_id, sort_order, instruction)
select rc.id, s.n::int, s.t
from _r r
join _changed ch on ch.slug = r.slug
join recipes rc on rc.slug = r.slug,
     lateral jsonb_array_elements_text(r.steps) with ordinality s(t, n);

insert into recipe_cookware (recipe_id, cookware_id)
select rc.id, k.id
from _r r
join _changed ch on ch.slug = r.slug
join recipes rc on rc.slug = r.slug,
     lateral jsonb_array_elements_text(r.cookware) cw
join cookware k on k.name = cw;

-- Diet tags: converge on the derived set. The deletes and the conflict-skipping
-- insert touch nothing when the tags are already right.
delete from recipe_diets rd
using recipes rc, diets d
where rd.recipe_id = rc.id and rd.diet_id = d.id
  and rc.slug in (select slug from _r)
  and not exists (select 1 from _derived_diets dd where dd.slug = rc.slug and dd.diet = d.name);

insert into recipe_diets (recipe_id, diet_id)
select rc.id, d.id
from _derived_diets dd
join recipes rc on rc.slug = dd.slug
join diets   d  on d.name  = dd.diet
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
select
  (select count(*) from _r)                                              as in_payload,
  (select count(*) from _changed)                                        as written_this_run,
  (select count(*) from recipes where source_name = __SOURCE_NAME__)     as original_recipes_total,
  (select count(*) from recipes where status = 'published')              as published_total;

commit;
"""


def main() -> int:
    recipes = parse_recipes()
    sources = parse_sources()
    validate(recipes, sources)
    write_sql(recipes)
    write_review(recipes, sources)
    return 0


if __name__ == "__main__":
    sys.exit(main())
