"""Emit the two seed files and the review CSVs from cache/resolved.json + cache/brands.json.

  supabase/seed-ingredients-world.sql   canonical ingredients, aliases, allergens, family links, alias re-points
  supabase/seed-nutrition-world.sql     usda_foods, usda_food_nutrients, ingredient_foods, ingredient_portions,
                                        ingredients.fdc_id / density_g_per_ml for the NEW ingredients
  scripts/world-ingredients/review/*.csv  what the owner reviews

Run order at integration: migrations (which create nutrients/usda_*/ingredient_*), then seed-ingredients-world.sql,
then seed-nutrition-world.sql. Both files are idempotent (ON CONFLICT DO NOTHING / guarded updates).
Run: python -I scripts/world-ingredients/emit_sql.py
"""
import csv
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fdcdb import rows, lit, nutrients_for  # noqa: E402
import portions as P  # noqa: E402
from resolve import slugify  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CACHE = os.path.join(HERE, "cache")

# New canonical rows we keep although an existing ALIAS already points elsewhere: the alias is re-pointed at the
# new row because the foods differ in nutrition (fat level, dried vs fresh, concentrate). parent = family_id target.
KEEP = {
    "skim milk": {"repoint": ["skim milk", "nonfat milk", "fat free milk", "fat-free milk", "skimmed milk"], "parent": "milk"},
    "reduced fat milk": {"repoint": ["2% milk", "low-fat milk", "low fat milk", "semi-skimmed milk"], "parent": "milk"},
    "whole milk": {"repoint": ["whole milk"], "parent": "milk"},
    "whole wheat pasta": {"repoint": ["whole wheat pasta"], "parent": "pasta"},
    "whole wheat bread": {"repoint": ["whole wheat bread"], "parent": "sandwich bread"},
    "ancho chile": {"repoint": ["ancho chile"], "parent": None},
    "tomato puree": {"repoint": ["tomato puree"], "parent": None},
}
STOP = {"fresh", "dried", "ground", "whole", "raw", "and", "the", "sauce", "paste", "powder", "mix"}


def sqlq(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(round(v, 4)) if isinstance(v, float) else str(v)
    return lit(v)


def stems(s):
    return {w[:4] for w in re.findall(r"[a-z]+", s.lower()) if len(w) > 2 and w not in STOP}


PROMOTE_DEFAULTS = r"""
-- Integration fix: an existing ingredient with no generic USDA food (e.g. seitan) got brand foods only, and the schema
-- requires exactly one default per (ingredient, form). Promote the brand closest to the group's median energy.
with grp as (
  select f.ingredient_id, f.form from ingredient_foods f group by 1, 2 having not bool_or(f.is_default)
), k as (
  select f.ingredient_id, f.form, f.fdc_id, coalesce(n.amount_per_100g, 0) as kcal
  from ingredient_foods f join grp g using (ingredient_id, form)
  left join usda_food_nutrients n on n.fdc_id = f.fdc_id and n.nutrient_id = 1
), m as (
  select ingredient_id, form, percentile_cont(0.5) within group (order by kcal) as med from k group by 1, 2
), e as (
  select k.*, m.med from k join m using (ingredient_id, form)
), pick as (
  select distinct on (ingredient_id, form) ingredient_id, form, fdc_id
  from e order by ingredient_id, form, abs(kcal - med), fdc_id
)
update ingredient_foods f set is_default = true
from pick p where f.ingredient_id = p.ingredient_id and f.form = p.form and f.fdc_id = p.fdc_id;
"""


def main():
    resolved = json.load(open(os.path.join(CACHE, "resolved.json"), encoding="utf-8"))
    dupes = json.load(open(os.path.join(CACHE, "dupes.json"), encoding="utf-8"))
    brands = json.load(open(os.path.join(CACHE, "brands.json"), encoding="utf-8")) if os.path.exists(os.path.join(CACHE, "brands.json")) else []
    existing = {r["n"] for r in rows("select canonical_name::text n from ingredients", db="postgres")}
    existing_alias = {r["n"] for r in rows("select alias::text n from ingredient_aliases", db="postgres")}
    slugs = {r["s"] for r in rows("select slug s from ingredients", db="postgres")}
    existing_l = {e.lower() for e in existing}

    # ---- dedupe policy ----
    keep_rows, skipped = [], []
    new_names = {r["name"].lower() for r in resolved}
    for r in resolved:
        key = r["name"].lower()
        d = dupes.get(key)
        if key in existing_l:
            skipped.append((r["name"], "already a canonical ingredient"))
            continue
        if d and d[0] in ("alias", "exact", "singular", "singularized") and key not in KEEP:
            skipped.append((r["name"], "already covered: %s -> %s" % (d[0], d[1])))
            continue
        keep_rows.append(r)
    claimed = set()
    for r in keep_rows:
        good = []
        for a in r["aliases"]:
            al = a.lower()
            d = dupes.get(al)
            if al in existing_alias and al not in [x.lower() for x in KEEP.get(r["name"].lower(), {}).get("repoint", [])]:
                continue
            if al in existing_l or al in new_names - {r["name"].lower()} or al in claimed or al == r["name"].lower():
                continue
            if d and d[0] in ("alias", "exact") and al not in [x.lower() for x in KEEP.get(r["name"].lower(), {}).get("repoint", [])]:
                continue
            claimed.add(al)
            good.append(a)
        r["aliases"] = good
    keep_names = {r["name"] for r in keep_rows}

    # ---- default foods metadata + nutrients ----
    ids = sorted({r["food"]["fdc_id"] for r in keep_rows if r["food"]["fdc_id"]} | {b["fdc_id"] for b in brands})
    meta, nut = {}, {}
    CH = 500
    for i in range(0, len(ids), CH):
        chunk = ids[i:i + CH]
        lst = ",".join(str(x) for x in chunk)
        for m in rows("select fdc_id, data_type, description, publication_date, null::text brand_owner, null::text brand_name, "
                      "null::float ss, null::text su, null::text household from foods where fdc_id in (%s)" % lst):
            meta[m["fdc_id"]] = m
        for m in rows("select fdc_id, 'branded' data_type, description, publication_date, brand_owner, brand_name, serving_size::float ss, "
                      "lower(serving_unit) su, household from branded where fdc_id in (%s)" % lst):
            meta[m["fdc_id"]] = m
        nut.update(nutrients_for(chunk))
    port_rows = {}
    for i in range(0, len(ids), CH):
        chunk = ",".join(str(x) for x in ids[i:i + CH])
        for p in rows("select fdc_id, amount::float amount, unit, modifier, descr, grams::float grams from portions where fdc_id in (%s)" % chunk):
            port_rows.setdefault(p["fdc_id"], []).append(p)

    def food_nutrients(fdc_id, density):
        m = {k: v for k, v in nut.get(fdc_id, {}).items() if v is not None}
        meta_ = meta[fdc_id]
        if meta_["data_type"] == "branded" and (meta_["su"] in ("ml", "mlt")):
            if not density:
                return None
            m = {k: v / density for k, v in m.items()}
        return {str(k): round(v, 4) for k, v in m.items()}

    # ---- per-ingredient finalisation ----
    ing_sql, alias_vals, allergen_vals, parent_updates, repoints = [], [], [], [], []
    food_ids_needed, ing_food_vals, port_vals, fd_vals = {}, [], [], []
    review = []
    slug_seen = set(slugs)
    for r in keep_rows:
        name = r["name"]
        slug = slugify(name)
        n = 2
        base = slug
        while slug in slug_seen:
            slug = "%s-%d" % (base, n)
            n += 1
        slug_seen.add(slug)
        r["slug"] = slug
        ing_sql.append("  (%s, %s, %s, false, %s)" % (lit(name), lit(slug), lit(r["aisle"]), lit(r["group"]) if r["group"] else "null"))
        for a in r["aliases"]:
            alias_vals.append("(%s, %s)" % (lit(name), lit(a)))
        for al in r["allergens"]:
            allergen_vals.append("(%s, %s)" % (lit(name), lit(al)))
        k = KEEP.get(name.lower())
        if k:
            for a in k["repoint"]:
                repoints.append("(%s, %s)" % (lit(name), lit(a)))
            if k["parent"]:
                parent_updates.append("(%s, %s)" % (lit(name), lit(k["parent"])))
        f = r["food"]
        density = None
        pdict = {}
        status = "no_nutrition"
        match = "unresolved"
        if f["fdc_id"]:
            fid = f["fdc_id"]
            m = meta.get(fid)
            dens_hint = f.get("density_used")
            if m and m["data_type"] == "branded" and m["su"] in ("ml", "mlt") and not dens_hint:
                f["fdc_id"] = None
            else:
                fn = food_nutrients(fid, dens_hint)
                if fn is None:
                    f["fdc_id"] = None
                else:
                    food_ids_needed[fid] = fn
                    ing_food_vals.append("(%s, 'default', %d, true)" % (lit(name), fid))
                    prow = port_rows.get(fid, [])
                    if m["data_type"] == "branded":
                        lp = P.label_portion(m.get("household"), m["ss"], "ml" if m["su"] in ("ml", "mlt") else "g", dens_hint)
                        if lp:
                            pdict[lp[0]] = (lp[1], lp[2])
                            port_vals_src = "label"
                        if dens_hint:
                            density = dens_hint
                        elif lp and lp[0] in P.ML:
                            density = round(lp[1] / P.ML[lp[0]], 3)
                            if not (0.05 < density < 3):
                                density = None
                        for u, (g, note) in pdict.items():
                            port_vals.append("(%s, %s, %s, 'label', %s)" % (lit(name), sqlq(u), sqlq(g), lit(note)))
                    else:
                        pdict = P.classify(prow)
                        density = P.density(prow)
                        for u, (g, note) in pdict.items():
                            port_vals.append("(%s, %s, %s, 'usda', %s)" % (lit(name), sqlq(u), sqlq(g), lit(note)))
                    fd_vals.append("(%s, %d, %s)" % (lit(name), fid, sqlq(density)))
                    status = m["data_type"]
                    nm = stems(name) | stems(" ".join(r["aliases"]))
                    match = "proxy" if r.get("proxy") else ("name-match" if nm & stems(m["description"]) else "related")
        review.append({
            "ingredient": name, "aisle": r["aisle"], "filter_group": r["group"] or "", "regions": ";".join(r["regions"]),
            "aliases": ";".join(r["aliases"]), "allergens": ";".join(r["allergens"]),
            "source": status, "match_type": match, "fdc_id": f["fdc_id"] or "",
            "usda_description": (meta[f["fdc_id"]]["description"] if f["fdc_id"] else "")[:140],
            "brand_owner": (meta[f["fdc_id"]].get("brand_owner") or "") if f["fdc_id"] else "",
            "density_g_per_ml": density or "", "portions": ";".join(sorted(("each" if u is None else u) for u in pdict)),
            "kcal_per_100g": (food_ids_needed[f["fdc_id"]].get("1008", "") if f["fdc_id"] in food_ids_needed else ""),
            "source_file": r["file"],
        })

    # ---- brand foods ----
    brand_review = []
    defaults_for_form = {}
    for b in brands:
        if b["ingredient"].lower() not in existing_l and b["ingredient"] not in keep_names:
            continue  # ingredient was dropped as a duplicate
        fid = b["fdc_id"]
        if fid in food_ids_needed:
            fn = food_ids_needed[fid]
        else:
            fn = {str(k): round(v, 4) for k, v in b["nutrients"].items() if v is not None}
            food_ids_needed[fid] = fn
        is_default = False
        if b["form"] != "default":
            key = (b["ingredient"], b["form"])
            if key not in defaults_for_form:
                defaults_for_form[key] = fid
                is_default = True
        ing_food_vals.append("(%s, %s, %d, %s)" % (lit(b["ingredient"]), lit(b["form"]), fid, "true" if is_default else "false"))
        n = {str(k): v for k, v in b["nutrients"].items()}
        brand_review.append({
            "ingredient": b["ingredient"], "form": b["form"], "fdc_id": fid, "brand_owner": b["brand_owner"] or "",
            "brand_name": b["brand_name"] or "", "description": b["description"], "serving_size": b["ss"],
            "serving_unit": b["su"], "household_serving": b["household"] or "", "gtin": b["gtin"] or "",
            "published": b["publication_date"], "kcal_per_100g": n.get("1008", ""), "protein_g": n.get("1003", ""),
            "fat_g": n.get("1004", ""), "carbs_g": n.get("1005", ""), "sodium_mg": n.get("1093", ""),
            "density_used": b.get("density") or "", "spec": b["spec"],
        })

    # ================= write seed-ingredients-world.sql =================
    out = []
    out.append("-- Minced wave 10, WORLD INGREDIENTS lane. Generated by scripts/world-ingredients/emit_sql.py. IDEMPOTENT.")
    out.append("-- %d new canonical ingredients curated across world cuisines; USDA FoodData Central (CC0) supplies the foods in" % len(keep_rows))
    out.append("-- seed-nutrition-world.sql. Run AFTER migrations, BEFORE seed-nutrition-world.sql.")
    out.append("-- Vocabulary rules (CLAUDE.md): canonical_name = what a cook types; regional/native names are aliases; no simple plurals.")
    out.append("begin;")
    out.append("insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple, filter_group) values")
    out.append(",\n".join(ing_sql))
    out.append("on conflict (canonical_name) do nothing;")
    if repoints:
        out.append("\n-- Existing aliases that belong to a nutritionally distinct new row are re-pointed at it.")
        out.append("update ingredient_aliases a set ingredient_id = i.id from (values\n  %s\n) v(cn, alias) join ingredients i on i.canonical_name = v.cn where a.alias = v.alias;" % ",\n  ".join(repoints))
    out.append("\ninsert into ingredient_aliases (ingredient_id, alias)\nselect i.id, v.alias from (values")
    out.append("  " + ",\n  ".join(alias_vals))
    out.append(") v(cn, alias) join ingredients i on i.canonical_name = v.cn\non conflict (alias) do nothing;")
    out.append("\ninsert into ingredient_allergens (ingredient_id, allergen_id)\nselect i.id, a.id from (values")
    out.append("  " + ",\n  ".join(allergen_vals))
    out.append(") v(cn, slug) join ingredients i on i.canonical_name = v.cn join allergens a on a.slug = v.slug\non conflict do nothing;")
    if parent_updates:
        out.append("\n-- Variants join their parent's family so a pantry holding \"milk\" still matches \"skim milk\".")
        out.append("update ingredients c set family_id = p.id from (values\n  %s\n) v(cn, pn) join ingredients p on p.canonical_name = v.pn where c.canonical_name = v.cn and c.family_id is null;" % ",\n  ".join(parent_updates))
    out.append("commit;")
    open(os.path.join(ROOT, "supabase", "seed-ingredients-world.sql"), "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")

    # ================= write seed-nutrition-world.sql =================
    out = []
    out.append("-- Minced wave 10, WORLD INGREDIENTS lane. Generated by scripts/world-ingredients/emit_sql.py. IDEMPOTENT.")
    out.append("-- Source: USDA FoodData Central (SR Legacy, Foundation, FNDDS, Branded Foods), public domain (CC0 1.0).")
    out.append("-- Nutrient data: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central (fdc.nal.usda.gov).")
    out.append("-- Needs the wave 10 schema (nutrients, usda_foods, usda_food_nutrients, ingredient_foods, ingredient_portions).")
    out.append("-- amount_per_100g: an absent row means \"not reported\"; a row with 0 is a true zero. Branded values are the label")
    out.append("-- values per 100 g (liquids sold by volume were converted with the stated density).")
    out.append("begin;")
    fids = sorted(food_ids_needed)
    for i in range(0, len(fids), 250):
        chunk = fids[i:i + 250]
        vals = []
        for fid in chunk:
            m = meta[fid]
            dt = m["data_type"]
            if dt == "branded":
                su = "ml" if m["su"] in ("ml", "mlt") else "g"
                vals.append("(%d, %s, 'branded', %s, %s, %s, %s, %s, %s)" % (
                    fid, lit(m["description"][:200]), sqlq(m["brand_owner"]), sqlq(m["brand_name"] or None),
                    sqlq(round(m["ss"], 2)), lit(su), sqlq(m["household"] or None), sqlq(m["publication_date"] or None) + "::date"))
            else:
                vals.append("(%d, %s, %s, null, null, null, null, null, %s::date)" % (fid, lit(m["description"][:200]), lit(dt), sqlq(m["publication_date"] or None)))
        out.append("insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving, publication_date) values\n  "
                   + ",\n  ".join(vals) + "\non conflict (fdc_id) do nothing;")
    for i in range(0, len(fids), 150):
        chunk = fids[i:i + 150]
        vals = ["(%d, %s::jsonb)" % (fid, lit(json.dumps(food_ids_needed[fid], separators=(",", ":")))) for fid in chunk]
        out.append("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\nselect v.fdc_id, n.id, e.value::numeric\nfrom (values\n  "
                   + ",\n  ".join(vals) + "\n) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e\njoin nutrients n on n.fdc_nutrient_id = e.key::int\non conflict (fdc_id, nutrient_id) do nothing;")
    out.append("""
-- Foods linked to canonical ingredients. A branded product is a FOOD of its canonical ingredient, never a new ingredient.
-- is_default becomes true only when the (ingredient, form) pair has no default yet.""")
    for i in range(0, len(ing_food_vals), 400):
        out.append("insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)\nselect i.id, v.form, v.fdc_id,\n  (v.is_default and not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = v.form and f.is_default))\nfrom (values\n  "
                   + ",\n  ".join(ing_food_vals[i:i + 400]) + "\n) v(cn, form, fdc_id, is_default) join ingredients i on i.canonical_name = v.cn\non conflict (ingredient_id, form, fdc_id) do nothing;")
    out.append("\n-- Household weights for the new ingredients (USDA food_portion rows or the label serving).")
    for i in range(0, len(port_vals), 400):
        out.append("insert into ingredient_portions (ingredient_id, unit_id, grams_per_unit, source, note)\nselect i.id, u.id, v.g, v.src, v.note\nfrom (values\n  "
                   + ",\n  ".join(port_vals[i:i + 400]) + "\n) v(cn, un, g, src, note) join ingredients i on i.canonical_name = v.cn left join units u on u.name = v.un\nwhere v.un is null or u.id is not null\non conflict do nothing;")
    out.append("\n-- Default USDA food + density on the new canonical ingredients (never overwrites an existing value).")
    for i in range(0, len(fd_vals), 400):
        out.append("update ingredients i set fdc_id = v.fdc_id, density_g_per_ml = coalesce(i.density_g_per_ml, v.d)\nfrom (values\n  "
                   + ",\n  ".join(fd_vals[i:i + 400]) + "\n) v(cn, fdc_id, d) where i.canonical_name = v.cn and i.fdc_id is null;")
    out.append(PROMOTE_DEFAULTS)
    out.append("commit;")
    open(os.path.join(ROOT, "supabase", "seed-nutrition-world.sql"), "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")

    # ================= review CSVs =================
    rdir = os.path.join(HERE, "review")
    os.makedirs(rdir, exist_ok=True)

    def wcsv(name, recs):
        if not recs:
            return
        with open(os.path.join(rdir, name), "w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(recs[0].keys()))
            w.writeheader()
            w.writerows(recs)

    wcsv("new-ingredients.csv", review)
    wcsv("brand-foods.csv", brand_review)
    wcsv("skipped-ingredients.csv", [{"ingredient": a, "reason": b} for a, b in skipped])
    stats = {
        "new_ingredients": len(keep_rows), "skipped_as_duplicates": len(skipped), "usda_foods": len(fids),
        "brand_foods_linked": len(brand_review), "portions": len(port_vals), "aliases": len(alias_vals),
        "no_nutrition": sum(1 for x in review if x["source"] == "no_nutrition"),
        "by_source": {k: sum(1 for x in review if x["source"] == k) for k in sorted({x["source"] for x in review})},
        "by_match": {k: sum(1 for x in review if x["match_type"] == k) for k in sorted({x["match_type"] for x in review})},
    }
    json.dump(stats, open(os.path.join(CACHE, "emit-stats.json"), "w"), indent=1)
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
