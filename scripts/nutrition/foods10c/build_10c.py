"""Build supabase/seed-nutrition-10c-foods.sql (wave 10c: mappings, brands, national sources).

    python -I scripts/nutrition/national/load_national.py   # once: downloads CoFID + CNF into national/cache (gitignored)
    python -I scripts/nutrition/foods10c/build_10c.py       # reads the three source files below, fetches what it needs from FDC

Sources of truth (edit these, never the generated SQL):
    decisions.psv        set_default / unmap / drop_link / add_food, one decision per line with a reason
    national_links.psv   which CoFID / CNF food is the default for which ingredient
    ml_branded_ids.txt   every branded food sold by volume: its per-100 ml values are re-fetched and converted to per 100 g with
                         the density of the ingredient it is linked to, IN SQL, so a cup of the ingredient and its food always agree

Everything the SQL does is idempotent. Order: after seed-nutrition-zzzz-recipe-audit.sql (see scripts/nutrition/LIVE-STEPS.md).
FDC responses are cached in scripts/nutrition/cache/foods10c.json (CC0, committed) so a rebuild needs no key.
"""
import csv
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
NUT = os.path.join(HERE, "..")
sys.path.insert(0, NUT)
sys.path.insert(0, os.path.join(HERE, "..", "..", "world-ingredients"))
sys.path.insert(0, os.path.join(HERE, "..", "national"))
import fetch_branded as fb  # noqa: E402
from fdc import load_api_key  # noqa: E402
from quality import sane_nutrients  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "..", "supabase", "seed-nutrition-10c-foods.sql")
CACHE = os.path.join(NUT, "cache", "foods10c.json")
NAT_CACHE = os.path.join(HERE, "..", "national", "cache", "national-foods.json")
# FDC nutrient ids we store (nutrients.fdc_nutrient_id); identical to corrections/add_foods.py
KEEP = {1008, 1003, 1005, 1004, 1079, 2000, 1235, 1257, 1258, 1292, 1293, 1253, 1093, 1092, 1087, 1089, 1090, 1095, 1091, 1103, 1098,
        1101, 1106, 1162, 1114, 1109, 1185, 1165, 1166, 1167, 1175, 1190, 1178, 1170, 1180, 1110}
# true-zero or "unreported by design" ingredients: a 0 on the label is the truth here
ZERO_OK = ["salt", "kosher salt", "sea salt", "water", "baking soda", "stevia", "sucralose", "erythritol", "kala namak", "rock salt",
           "white vinegar", "rice vinegar", "apple cider vinegar", "red wine vinegar", "sherry vinegar", "coffee", "black tea",
           "green tea", "tabasco sauce", "hot sauce", "food coloring", "liquid smoke", "monk fruit sweetener", "rose water",
           "orange blossom water", "smoked salt", "truffle salt", "fleur de sel", "oolong tea", "rooibos"]


def lit(v):
    return "null" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"


def iso(d):
    if not d:
        return None
    if "/" in d:
        m, day, y = d.split("/")
        return "%04d-%02d-%02d" % (int(y), int(m), int(day))
    return d[:10]


def psv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="|"))


class Fetcher:
    def __init__(self):
        self.cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
        self.key = None
        self.dirty = False

    def get(self, fdc_id):
        k = str(fdc_id)
        if k not in self.cache:
            if self.key is None:
                self.key = load_api_key()
                if not self.key:
                    raise SystemExit("USDA_FDC_API_KEY not found and %s is missing food %s" % (CACHE, fdc_id))
            d = fb.get("/food/%d" % fdc_id, {}, self.key)
            nut = {}
            for fn in d.get("foodNutrients", []):
                n = fn.get("nutrient") or {}
                if n.get("id") in KEEP and fn.get("amount") is not None:
                    nut[str(int(n["id"]))] = float(fn["amount"])
            lab = (d.get("labelNutrients") or {}).get("calories", {}).get("value")
            self.cache[k] = {"description": d.get("description"), "dataType": d.get("dataType"), "brandOwner": d.get("brandOwner"),
                             "brandName": d.get("brandName"), "servingSize": d.get("servingSize"),
                             "servingSizeUnit": (d.get("servingSizeUnit") or "g"), "household": d.get("householdServingFullText"),
                             "published": iso(d.get("publishedDate") or d.get("modifiedDate")), "labelKcal": lab, "nutrients": nut}
            self.dirty = True
            time.sleep(0.7)
            if len(self.cache) % 20 == 0:
                self.save()
        return self.cache[k]

    def save(self):
        if self.dirty:
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            with open(CACHE, "w", encoding="utf-8", newline="\n") as f:
                json.dump(self.cache, f, indent=0, sort_keys=True, ensure_ascii=False)
                f.write("\n")
            self.dirty = False


def nut_json(m):
    return "'" + json.dumps({str(k): round(v, 4) for k, v in sorted(m.items())}).replace("'", "''") + "'::jsonb"


def main():
    dec = psv(os.path.join(HERE, "decisions.psv"))
    nat = psv(os.path.join(HERE, "national_links.psv"))
    ml_ids = [int(x) for x in open(os.path.join(HERE, "ml_branded_ids.txt"), encoding="utf-8").read().split()]
    fx = Fetcher()

    # ---- 1. replacement foods from FoodData Central ----
    new_ids = sorted({int(d["fdc_id"]) for d in dec if d["action"] == "add_food"})
    new_foods, new_nuts = [], []
    for i in new_ids:
        d = fx.get(i)
        m = sane_nutrients({int(k): v for k, v in d["nutrients"].items()})
        unit = (d["servingSizeUnit"] or "g").lower().replace("grm", "g").replace("mlt", "ml")
        if unit == "ml":
            raise SystemExit("add_food %d is sold by volume: convert it through ml_branded_ids.txt instead" % i)
        new_foods.append("(%d, %s, 'branded', %s, %s, %s, %s, %s, %s)" % (
            i, lit(d["description"]), lit(d["brandOwner"]), lit(d["brandName"]), d["servingSize"] or "null", lit(unit),
            lit(d["household"]), lit(d["published"])))
        new_nuts.append("(%d, %s)" % (i, nut_json(m)))

    # ---- 2. national foods (only the ones that are linked) ----
    natfoods = {(f["src"], f["code"]): f for f in json.load(open(NAT_CACHE, encoding="utf-8"))}
    nat_rows, nat_nuts, nat_links = [], [], []
    for r in nat:
        f = natfoods.get((r["source"], r["code"]))
        if not f:
            raise SystemExit("national food not found: %s %s" % (r["source"], r["code"]))
        nat_rows.append("(%d, %s, %s, %s)" % (f["fdc_id"], lit(f["name"] + (" [" + f["desc"] + "]" if f["desc"] and f["src"] == "cnf" and len(f["desc"]) < 60 else "")),
                                              lit(r["source"]), lit(r["code"])))
        nat_nuts.append("(%d, %s)" % (f["fdc_id"], nut_json(f["nut"])))
        nat_links.append("(%s, %s, %d)" % (lit(r["ingredient"]), lit(r["form"]), f["fdc_id"]))

    # ---- 3. link actions ----
    acts = []
    for d in dec:
        if d["action"] in ("set_default", "unmap", "drop_link"):
            acts.append("(%s, %s, %s, %s, %s)" % (lit(d["action"]), lit(d["ingredient"]), lit(d["form"] or "*"),
                                                    d["fdc_id"] or "null", lit(d["reason"])))

    # ---- 4. volume-sold branded foods ----
    ml_vals, skipped = [], []
    for i in ml_ids:
        d = fx.get(i)
        ss, lab, k = d["servingSize"], d["labelKcal"], d["nutrients"].get("1008")
        if ss and lab is not None and k is not None and abs(k - lab / ss * 100) > max(3.0, 0.04 * k):
            skipped.append((i, d["description"], k, round(lab / ss * 100, 1)))
            continue  # per-100 value is not per 100 ml: leave the stored value alone
        m = sane_nutrients({int(a): b for a, b in d["nutrients"].items()})
        for nid, v in sorted(m.items()):
            ml_vals.append("(%d, %d, %s)" % (i, nid, repr(round(v, 4))))
    fx.save()

    zero_ok = ", ".join(lit(z) for z in ZERO_OK)
    sql = []
    w = sql.append
    w("""-- Wave 10c (mappings, brands, national sources). Generated by scripts/nutrition/foods10c/build_10c.py. IDEMPOTENT.
-- Run AFTER migration 20261018110000_national_food_sources.sql and after seed-nutrition-zzzz-recipe-audit.sql, BEFORE
-- refresh_all_recipe_nutrients() (with jit off) and ANALYZE.
--
-- Sources of truth (edit these, not this file): scripts/nutrition/foods10c/decisions.psv, national_links.psv, ml_branded_ids.txt.
-- Review sheets: scripts/nutrition/review/10c-*.csv.
--
-- Licences of the two national tables (static attribution lives on /about and under the label, see national/LICENCES.md):
--   UK CoFID 2021: Contains public sector information licensed under the Open Government Licence v3.0.
--   Canada CNF 2026: Contains information licensed under the Open Government Licence - Canada.
begin;
""")
    # 1
    if new_foods:
        w("-- 1. replacement foods (FoodData Central, CC0)")
        w("insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving, publication_date)\nvalues\n  "
          + ",\n  ".join(new_foods) + "\non conflict (fdc_id) do nothing;")
        w("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\nselect v.fdc_id, n.id, e.value::numeric\nfrom (values\n  "
          + ",\n  ".join(new_nuts) + "\n) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e\njoin nutrients n on n.fdc_nutrient_id = e.key::int\non conflict (fdc_id, nutrient_id) do nothing;")
    # 2
    w("""
-- 2. national foods: only the ones an ingredient links to. fdc_id is a synthetic key (see the migration), source_code the publisher's code.
insert into usda_foods (fdc_id, description, data_type, source_code)
values
  """ + ",\n  ".join(nat_rows) + """
on conflict (fdc_id) do nothing;
-- keys are our nutrient keys (nutrients.key), per 100 g; an absent key is "not reported"
insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)
select v.fdc_id, n.id, e.value::numeric
from (values
  """ + ",\n  ".join(nat_nuts) + """
) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e
join nutrients n on n.key = e.key
on conflict (fdc_id, nutrient_id) do nothing;
""")
    # 3
    w("""-- 3. link actions
create temp table _a (action text, ingredient text, form text, fdc_id integer, reason text) on commit drop;
insert into _a values
  """ + ",\n  ".join(acts) + """;
-- unmap: the ingredient keeps existing, it just has no nutrition (and no household weights: a weight without a food means nothing)
delete from ingredient_portions p using _a a, ingredients i
 where a.action = 'unmap' and i.canonical_name = a.ingredient and p.ingredient_id = i.id;
delete from ingredient_foods f using _a a, ingredients i
 where a.action = 'unmap' and i.canonical_name = a.ingredient and f.ingredient_id = i.id and (a.form = '*' or f.form = a.form);
-- drop_link: a wrong food for this ingredient (any form when form is '*')
delete from ingredient_foods f using _a a, ingredients i
 where a.action = 'drop_link' and i.canonical_name = a.ingredient and f.ingredient_id = i.id
   and (a.form = '*' or f.form = a.form) and f.fdc_id = a.fdc_id;
-- set_default: link when missing, demote the current default of that form, promote this one
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, a.form, a.fdc_id, false
from _a a join ingredients i on i.canonical_name = a.ingredient
where a.action = 'set_default' and exists (select 1 from usda_foods u where u.fdc_id = a.fdc_id)
on conflict (ingredient_id, form, fdc_id) do nothing;
update ingredient_foods f set is_default = false
from _a a join ingredients i on i.canonical_name = a.ingredient
where a.action = 'set_default' and f.ingredient_id = i.id and f.form = a.form and f.fdc_id <> a.fdc_id and f.is_default
  and exists (select 1 from ingredient_foods g where g.ingredient_id = i.id and g.form = a.form and g.fdc_id = a.fdc_id);
update ingredient_foods f set is_default = true
from _a a join ingredients i on i.canonical_name = a.ingredient
where a.action = 'set_default' and f.ingredient_id = i.id and f.form = a.form and f.fdc_id = a.fdc_id and not f.is_default;

-- national links: same promotion, for the foods of section 2
create temp table _n (ingredient text, form text, fdc_id integer) on commit drop;
insert into _n values
  """ + ",\n  ".join(nat_links) + """;
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, n.form, n.fdc_id, false from _n n join ingredients i on i.canonical_name = n.ingredient
on conflict (ingredient_id, form, fdc_id) do nothing;
update ingredient_foods f set is_default = false
from _n n join ingredients i on i.canonical_name = n.ingredient
where f.ingredient_id = i.id and f.form = n.form and f.fdc_id <> n.fdc_id and f.is_default;
update ingredient_foods f set is_default = true
from _n n join ingredients i on i.canonical_name = n.ingredient
where f.ingredient_id = i.id and f.form = n.form and f.fdc_id = n.fdc_id and not f.is_default;
""")
    # 4
    w("""-- 4. foods sold by volume: FDC's per-100 value is per 100 ML. Re-fetched values are divided by the density of the ingredient the
-- food is linked to (ingredients.density_g_per_ml: the same number every cup and tablespoon of that ingredient uses), so a cup
-- of the ingredient and its food can never disagree. Where an ingredient has no density the food is treated as water-like (1.0).""")
    if ml_vals:
        w("create temp table _ml (fdc_id integer, nid integer, per100ml numeric) on commit drop;\ninsert into _ml values\n  " + ",\n  ".join(ml_vals) + ";")
        w("""create temp table _ml_d on commit drop as
select m.fdc_id,
       coalesce((select i.density_g_per_ml from ingredient_foods f join ingredients i on i.id = f.ingredient_id
                  where f.fdc_id = m.fdc_id and i.density_g_per_ml is not null order by f.is_default desc, i.id limit 1), 1.0) as d
from (select distinct fdc_id from _ml) m
where exists (select 1 from usda_foods u where u.fdc_id = m.fdc_id);
delete from usda_food_nutrients x using _ml_d d where x.fdc_id = d.fdc_id;
insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)
select m.fdc_id, n.id, round((m.per100ml / d.d)::numeric, 4)
from _ml m join _ml_d d using (fdc_id) join nutrients n on n.fdc_nutrient_id = m.nid
on conflict (fdc_id, nutrient_id) do update set amount_per_100g = excluded.amount_per_100g;""")
    # 5 rules
    w("""
-- 5. plausibility gates for branded and national foods (FDC's own SR and Foundation values are kept as published).
-- 5a. a label that rounds a tiny serving to zero is not a true zero. For a branded food with a serving of 8 g or less whose energy is
--     0, the zero energy, macronutrient and fat/sugar rows are removed (absent = "not reported"); sodium etc. stay. Exempt: foods that
--     really are zero (salt, water, vinegars, sweeteners, plain tea and coffee, hot sauce, extracts).
create temp table _lz on commit drop as
select u.fdc_id from usda_foods u
 where u.data_type = 'branded' and u.serving_size <= 8 and lower(coalesce(u.serving_size_unit, 'g')) in ('g', 'grm', 'ml', 'mlt')
   and exists (select 1 from usda_food_nutrients k where k.fdc_id = u.fdc_id and k.nutrient_id = 1 and k.amount_per_100g = 0)
   and not exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id
                    where f.fdc_id = u.fdc_id and i.canonical_name::text in (""" + zero_ok + """));
delete from usda_food_nutrients x using _lz z
 where x.fdc_id = z.fdc_id and x.amount_per_100g = 0 and x.nutrient_id in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);

-- 5b. the three energy-yielding macronutrients cannot add up to more than 100 g in 100 g (5 g allowed for label rounding).
create temp table _bad_macro on commit drop as
select x.fdc_id from usda_food_nutrients x join usda_foods u on u.fdc_id = x.fdc_id
 where u.data_type in ('branded', 'cofid', 'cnf') and x.nutrient_id in (2, 3, 7)
 group by x.fdc_id having sum(x.amount_per_100g) > 105;
delete from usda_food_nutrients x using _bad_macro b where x.fdc_id = b.fdc_id and x.nutrient_id in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);

-- 5b2. label rounding on oils and fats: 14 g of fat in a 15 ml spoon divides to 101 g of fat per 100 g, and 9 kcal per g of pure fat is
--      900. A macronutrient up to 112 g, or energy up to 1,010 kcal, is label rounding and is clamped to the physical limit; more is deleted below.
update usda_food_nutrients x set amount_per_100g = 100
  from usda_foods u
 where u.fdc_id = x.fdc_id and u.data_type in ('branded', 'cofid', 'cnf') and x.nutrient_id in (2, 3, 4, 5, 7, 8, 9, 10, 11)
   and x.amount_per_100g > 100 and x.amount_per_100g <= 112;
update usda_food_nutrients x set amount_per_100g = 900
  from usda_foods u
 where u.fdc_id = x.fdc_id and u.data_type in ('branded', 'cofid', 'cnf') and x.nutrient_id = 1 and x.amount_per_100g > 900 and x.amount_per_100g <= 1010;

-- 5c. one nutrient above what the food can physically hold (mass fraction of the pure salt or compound; the highest natural or
--     fortified foods are far below). Deleted, never clamped.
delete from usda_food_nutrients x using usda_foods u, nutrients n
 where u.fdc_id = x.fdc_id and n.id = x.nutrient_id and u.data_type in ('branded', 'cofid', 'cnf')
   and ( (n.key = 'sodium_mg'         and x.amount_per_100g > 39400)  -- pure salt
      or (n.key = 'potassium_mg'      and x.amount_per_100g > 52500)  -- potassium chloride
      or (n.key = 'calcium_mg'        and x.amount_per_100g > 40000)  -- calcium carbonate
      or (n.key = 'magnesium_mg'      and x.amount_per_100g > 2500)   -- kelp is about 800
      or (n.key = 'phosphorus_mg'     and x.amount_per_100g > 12000)  -- baking powder is about 10,000
      or (n.key = 'iron_mg'           and x.amount_per_100g > 200)    -- dried thyme 124
      or (n.key = 'zinc_mg'           and x.amount_per_100g > 200)
      or (n.key = 'copper_mg'         and x.amount_per_100g > 20)     -- beef liver 15
      or (n.key = 'manganese_mg'      and x.amount_per_100g > 300)
      or (n.key = 'selenium_mcg'      and x.amount_per_100g > 6000)   -- brazil nuts 1,900
      or (n.key = 'vitamin_a_mcg_rae' and x.amount_per_100g > 40000)  -- cod liver oil about 30,000
      or (n.key = 'vitamin_c_mg'      and x.amount_per_100g > 10000)
      or (n.key = 'vitamin_d_mcg'     and x.amount_per_100g > 300)    -- cod liver oil 250
      or (n.key = 'vitamin_e_mg'      and x.amount_per_100g > 300)    -- wheat germ oil 150
      or (n.key = 'vitamin_k_mcg'     and x.amount_per_100g > 3000)   -- dried basil 1,700
      or (n.key = 'thiamin_mg'        and x.amount_per_100g > 100)    -- fortified nutritional yeast 79
      or (n.key = 'riboflavin_mg'     and x.amount_per_100g > 100)
      or (n.key = 'niacin_mg'         and x.amount_per_100g > 400)    -- fortified nutritional yeast 307
      or (n.key = 'vitamin_b6_mg'     and x.amount_per_100g > 50)
      or (n.key = 'folate_mcg_dfe'    and x.amount_per_100g > 5000)
      or (n.key = 'pantothenic_mg'    and x.amount_per_100g > 100)
      or (n.key = 'choline_mg'        and x.amount_per_100g > 3000)
      or (n.key = 'cholesterol_mg'    and x.amount_per_100g > 3500)
      or (n.key in ('protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugars_g') and x.amount_per_100g > 100.5)
      or (n.key = 'energy_kcal'       and x.amount_per_100g > 902) );
-- a sub-nutrient cannot exceed its parent (5 percent + 0.5 g of label rounding), same rule as the corrections seed, for new foods
delete from usda_food_nutrients s using usda_food_nutrients p, usda_foods u
 where u.fdc_id = s.fdc_id and u.data_type in ('branded', 'cofid', 'cnf') and p.fdc_id = s.fdc_id
   and ((s.nutrient_id = 5 and p.nutrient_id = 3) or (s.nutrient_id = 4 and p.nutrient_id = 3)
     or (s.nutrient_id in (8, 9, 10, 11) and p.nutrient_id = 7))
   and s.amount_per_100g > p.amount_per_100g * 1.05 + 0.5;

-- 5d. branded foods no ingredient links to and no recipe line uses are dead weight
delete from usda_foods u
 where u.data_type = 'branded'
   and not exists (select 1 from ingredient_foods f where f.fdc_id = u.fdc_id)
   and not exists (select 1 from recipe_ingredients r where r.fdc_id = u.fdc_id);

-- 5e. repair defaults: every (ingredient, form) that still has foods but lost its default gets one (generic first, then a branded
--     one with a usable serving, then the energy closest to the median of what remains)
with grp as (
  select ingredient_id, form from ingredient_foods group by ingredient_id, form having not bool_or(is_default)
), med as (
  select g.ingredient_id, g.form, percentile_cont(0.5) within group (order by coalesce(k.amount_per_100g, 0)) m
  from grp g join ingredient_foods f on f.ingredient_id = g.ingredient_id and f.form = g.form
  left join usda_food_nutrients k on k.fdc_id = f.fdc_id and k.nutrient_id = 1
  group by g.ingredient_id, g.form
), ranked as (
  select f.ingredient_id, f.form, f.fdc_id,
         row_number() over (partition by f.ingredient_id, f.form
                            order by (u.data_type = 'branded'), (coalesce(u.serving_size, 0) < 2.5),
                                     abs(coalesce(k.amount_per_100g, 0) - md.m), f.fdc_id) rn
  from ingredient_foods f
  join grp g on g.ingredient_id = f.ingredient_id and g.form = f.form
  join med md on md.ingredient_id = f.ingredient_id and md.form = f.form
  join usda_foods u on u.fdc_id = f.fdc_id
  left join usda_food_nutrients k on k.fdc_id = f.fdc_id and k.nutrient_id = 1
)
update ingredient_foods f set is_default = true
 from ranked r
 where r.rn = 1 and f.ingredient_id = r.ingredient_id and f.form = r.form and f.fdc_id = r.fdc_id;

@@PROXIES@@

-- 8. branded foods whose barcode-prefix owner is not the brand. brand_name is what the app shows; the owner is only searched.
--    A food whose description starts with the owner's name ("LEE KUM KEE, CHILI BEAN SAUCE") gets that prefix as its brand; the rest
--    show no brand rather than a stranger's (jalfrezi sauce was shown as a tackle company).
update usda_foods u set brand_name = trim(split_part(u.description, ',', 1))
 where u.data_type = 'branded' and u.brand_name is null and u.brand_owner is not null and u.description like '%,%'
   and lower(regexp_replace(split_part(trim(regexp_replace(u.brand_owner, '[^A-Za-z0-9'' ]', ' ', 'g')), ' ', 1), '[^A-Za-z0-9]', '', 'g')) <> ''
   and lower(regexp_replace(split_part(trim(regexp_replace(u.brand_owner, '[^A-Za-z0-9'' ]', ' ', 'g')), ' ', 1), '[^A-Za-z0-9]', '', 'g'))
     = lower(regexp_replace(split_part(trim(regexp_replace(split_part(u.description, ',', 1), '[^A-Za-z0-9'' ]', ' ', 'g')), ' ', 1), '[^A-Za-z0-9]', '', 'g'));

-- 9. a default whose label energy disagrees with its own macronutrients by more than 20 percent and 15 kcal is a rounding artefact of a tiny
--    serving (wasabi powder 353 vs 235 kcal from macros, aji amarillo 50 vs 29). Which of the two is right is unknowable, so the energy and
--    macronutrient rows are removed (absent = "not reported", a gap on the label) and the micronutrients stay. Non-caloric foods are exempt.
create temp table _incons on commit drop as
select d.fdc_id from (
  select distinct f.fdc_id,
         (select amount_per_100g from usda_food_nutrients where fdc_id = f.fdc_id and nutrient_id = 1) as kcal,
         (select 4 * coalesce(sum(amount_per_100g) filter (where nutrient_id in (2, 3)), 0) + 9 * coalesce(sum(amount_per_100g) filter (where nutrient_id = 7), 0)
            from usda_food_nutrients where fdc_id = f.fdc_id) as fm,
         exists (select 1 from usda_food_nutrients where fdc_id = f.fdc_id and nutrient_id in (2, 3, 7)) as hasm
    from ingredient_foods f join usda_foods u on u.fdc_id = f.fdc_id
   where f.is_default and u.data_type = 'branded') d
 where d.kcal is not null and d.kcal >= 10 and d.hasm and abs(d.kcal - d.fm) > 15 and abs(d.kcal - d.fm) > 0.20 * greatest(d.kcal, d.fm);
delete from usda_food_nutrients x using _incons c where x.fdc_id = c.fdc_id and x.nutrient_id in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);

-- 10. single implausible micronutrients on defaults (drop_nutrients.psv): deleted, never clamped
create temp table _dn (fdc_id integer, k text) on commit drop;
insert into _dn values
  @@DROPNUT@@;
delete from usda_food_nutrients x using _dn d, nutrients n where n.key = d.k and x.fdc_id = d.fdc_id and x.nutrient_id = n.id;

-- 11. aliases. "cream" means heavy cream in a US recipe (it fuzzy-matched sour cream); "low-fat milk" is 1 percent (USDA lowfat); apple
--     cider is the non-alcoholic juice; hard cider is its own ingredient with no food record (a gap on the label, not apple juice).
insert into ingredient_aliases (ingredient_id, alias)
select i.id, a.alias from (values ('cream', 'heavy cream'), ('apple cider', 'cider'), ('sweet cider', 'cider')) a(alias, canon)
join ingredients i on i.canonical_name = a.canon
on conflict (alias) do nothing;
update ingredient_aliases set ingredient_id = (select id from ingredients where canonical_name = '1% milk') where alias = 'low-fat milk';
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple, filter_group)
values ('hard cider', 'hard-cider', 'Other', false, 'pantry') on conflict (canonical_name) do nothing;
update ingredient_aliases set ingredient_id = (select id from ingredients where canonical_name = 'hard cider')
 where alias in ('hard cider', 'apple cider alcoholic');

-- 12. harusame keeps the household weights of the bean thread vermicelli it now shares a food with
insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select t.id, p.form, p.unit_id, p.grams_per_unit, p.source, 'wave 10c: weight of cellophane noodles (same starch noodle)'
from ingredients t join ingredients s on s.canonical_name = 'cellophane noodles'
join ingredient_portions p on p.ingredient_id = s.id
where t.canonical_name = 'harusame'
  and not exists (select 1 from ingredient_portions e where e.ingredient_id = t.id and e.form = p.form and coalesce(e.unit_id, 0) = coalesce(p.unit_id, 0));

@@FORMS@@
commit;
""")
    proxies = psv(os.path.join(HERE, "proxies.psv"))
    px_sql = ["-- 7. declared stand-ins (proxies.psv, built by build_proxies.py from the source files): the label says so (nutrition_assumptions).",
              "create temp table _px (ingredient text, form text) on commit drop;", "insert into _px values",
              ",\n  ".join("(%s, %s)" % (lit(r["ingredient"]), lit(r["form"] or "default")) for r in proxies) + ";",
              "update ingredient_foods set is_proxy = false where is_proxy;",
              "update ingredient_foods f set is_proxy = true from _px p join ingredients i on i.canonical_name = p.ingredient",
              " where f.ingredient_id = i.id and f.form = p.form and f.is_default;"]
    dn = psv(os.path.join(HERE, "drop_nutrients.psv"))
    sql[-1] = sql[-1].replace("@@PROXIES@@", "\n".join(px_sql)).replace(
        "@@DROPNUT@@", ",\n  ".join("(%d, %s)" % (int(r["fdc_id"]), lit(r["nutrient_key"])) for r in dn))
    forms = list(csv.DictReader(open(os.path.join(HERE, "forms.tsv"), encoding="utf-8", newline=""), delimiter="\t"))
    fb_sql = ["-- 6. forms named in the recipe line's prep note. The ingredient stays one (bare milk is 2 percent, bare ground beef is 80/20);",
              "--    the prep note picks the form: fat level (milk, ground beef, cheddar) and sodium (no salt added / low sodium canned goods).",
              "--    Source: scripts/nutrition/foods10c/forms.tsv. A form without household weights is a gap for every cup, so weights are",
              "--    copied from the form named in portions_from (same food family, same density).",
              "create temp table _forms (ingredient text, form text, fdc_id integer, pat text, pfrom text, note text) on commit drop;",
              "insert into _forms values"]
    fb_sql.append(",\n  ".join("(%s, %s, %s, %s, %s, %s)" % (lit(r["ingredient"]), lit(r["form"]), r["fdc_id"] or "null", lit(r["prep_pattern"]),
                                                          lit(r["portions_from"]), lit(r["note"])) for r in forms) + ";")
    fb_sql.append("""insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, v.form, v.fdc_id, true from _forms v join ingredients i on i.canonical_name = v.ingredient
where v.fdc_id is not null and exists (select 1 from usda_foods u where u.fdc_id = v.fdc_id)
  and not exists (select 1 from ingredient_foods e where e.ingredient_id = i.id and e.form = v.form and e.is_default)
on conflict (ingredient_id, form, fdc_id) do nothing;
insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select t.id, v.form, p.unit_id, p.grams_per_unit, p.source, 'wave 10c: weight of ' || v.pfrom || ' (same food family: ' || v.note || ')'
from _forms v
join ingredients t on t.canonical_name = v.ingredient
join ingredients s on s.canonical_name = split_part(v.pfrom, '/', 1)
join ingredient_portions p on p.ingredient_id = s.id and p.form = split_part(v.pfrom, '/', 2)
where v.pfrom <> '' and v.fdc_id is not null and exists (select 1 from ingredient_foods e where e.ingredient_id = t.id and e.form = v.form)
  and not exists (select 1 from ingredient_portions e where e.ingredient_id = t.id and e.form = v.form and coalesce(e.unit_id, 0) = coalesce(p.unit_id, 0));
insert into prep_rules (kind, pattern, ingredient_id, form, enabled, note)
select 'form', v.pat, i.id, v.form, true, 'wave 10c: ' || v.note
from _forms v join ingredients i on i.canonical_name = v.ingredient
where exists (select 1 from ingredient_foods e where e.ingredient_id = i.id and e.form = v.form)
  and not exists (select 1 from prep_rules p where p.kind = 'form' and p.ingredient_id = i.id and p.form = v.form and p.pattern = v.pat);
""")
    sql[-1] = sql[-1].replace("@@FORMS@@", "\n".join(fb_sql))
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(sql))
    print("wrote", os.path.relpath(OUT), "| new FDC foods", len(new_foods), "| national foods", len(nat_rows), "| actions", len(acts),
          "| volume foods", len(ml_ids) - len(skipped), "(skipped %d)" % len(skipped), "| ml rows", len(ml_vals))
    for s in skipped:
        print("  ml skipped (per-100 is not per 100 ml):", s)


if __name__ == "__main__":
    main()
