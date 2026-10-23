"""Stage 2 of wave 12: build supabase/seed-nutrition-w12-foods.sql and the review sheets.

    python -I scripts/nutrition/foods12/build_w12.py

Reads    proxy_decisions.psv   one decision per stand-in or loosely related mapping (the SOURCE OF TRUTH: edit it, never the SQL)
         gathered.json         stage 1 (gather_12.py): stand-in values, replacement records, evidence numbers (needs the FDC key once)
         brands_accepted.json  stage B (brands_w12.py select): brand products that passed every gate
Writes   supabase/seed-nutrition-w12-foods.sql
         scripts/nutrition/review/proxy-audit-w12.csv    every decision with values and source
         scripts/nutrition/review/brands-w12-summary.csv counts by category and brand

THE OWNER'S RULE (checked here, the build stops when a kept stand-in breaks it): a stand-in stays only when it is the same food in another
form, or a very close relative whose calories are within 12 percent (or 5 kcal) and whose protein, fat and carbohydrate are each within 12
percent (or 2.5 g) of EVERY trusted figure in the evidence. Otherwise the ingredient is relinked to a trusted record (USDA SR / Foundation /
FNDDS, a real FoodData Central label, UK CoFID, Canadian CNF) or unmapped (an honest "no nutrition data").
"""
import csv
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
os.environ.setdefault("W10_CONTAINER", "w12foods-db")
os.environ.setdefault("W10_REF_CONTAINER", os.environ["W10_CONTAINER"])
sys.path.insert(0, os.path.join(ROOT, "scripts", "world-ingredients"))
from fdcdb import rows, lit as qlit  # noqa: E402
from quality import sane_nutrients  # noqa: E402

OUT_SQL = os.path.join(ROOT, "supabase", "seed-nutrition-w12-foods.sql")
OUT_AUDIT = os.path.join(ROOT, "scripts", "nutrition", "review", "proxy-audit-w12.csv")
OUT_TEST = os.path.join(ROOT, "scripts", "nutrition", "test_w12_foods.sql")
OUT_BRANDS = os.path.join(ROOT, "scripts", "nutrition", "review", "brands-w12-summary.csv")
LICENCE = {"sr_legacy": "USDA FDC (public domain)", "foundation": "USDA FDC (public domain)", "fndds": "USDA FNDDS (public domain)",
           "branded": "USDA FDC Branded (CC0 1.0)", "cofid": "UK CoFID 2021 (Open Government Licence v3.0)", "cnf": "Canadian Nutrient File 2026 (Open Government Licence - Canada)"}


def lit(v):
    return "null" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"


def f1(x):
    return "" if x is None else ("%.1f" % float(x)).rstrip("0").rstrip(".")


def within(a, b, kcal):
    """a: stand-in, b: trusted figure. kcal: 12 percent or 5 kcal; macros: 12 percent or 2.5 g. None on either side is skipped."""
    if a is None or b is None:
        return True
    a, b = float(a), float(b)
    return abs(a - b) <= max(0.12 * b, 5.0 if kcal else 2.5)


def evid_n(e):
    if e["ref"].startswith("bm:"):
        return e.get("median") if e.get("n_products") else None
    n = e.get("n")
    return n if n and n.get("kcal") is not None else None


def main():
    dec = list(csv.DictReader(open(os.path.join(HERE, "proxy_decisions.psv"), encoding="utf-8", newline=""), delimiter="|"))
    g = json.load(open(os.path.join(HERE, "gathered.json"), encoding="utf-8"))
    brands = json.load(open(os.path.join(HERE, "brands_accepted.json"), encoding="utf-8")) if os.path.exists(os.path.join(HERE, "brands_accepted.json")) else []
    names = [d["ingredient"] for d in dec]
    uses = {r["n"]: r["c"] for r in rows("select i.canonical_name::text n, count(distinct ri.recipe_id) c from ingredients i left join recipe_ingredients ri on ri.ingredient_id=i.id "
                                         "where i.canonical_name::text in (%s) group by 1" % ",".join(qlit(n) for n in names), db="postgres")}
    by_ing = defaultdict(list)
    for s in g["standins"]:
        by_ing[s["ing"]].append(s)

    problems, audit = [], []
    new_foods = {}   # ref -> record (the foods to insert)
    acts = []        # (ingredient, action, form, new_fdc, proxy, reason)
    drop_alt = []    # (ingredient, form, fdc_id): non-default links that belonged to the old stand-in's family
    for d in dec:
        ing, act = d["ingredient"], d["action"]
        cur = [s for s in by_ing[ing] if s["is_default"]]
        old = next((s for s in cur if s["form"] == "default"), cur[0])
        oldn = {"kcal": old["kcal"], "p": old["p"], "f": old["f"], "c": old["c"]}
        ev = g["evidence"].get(ing, [])
        evrows = [(e, evid_n(e)) for e in ev if not e["ref"].startswith("sci:")]
        row = {"ingredient": ing, "recipes_using": uses.get(ing, 0), "decision": "", "old_food": "%s %s" % (old["fdc_id"], old["description"]),
               "old_kcal": f1(old["kcal"]), "old_protein": f1(old["p"]), "old_fat": f1(old["f"]), "old_carbs": f1(old["c"]),
               "new_food": "", "new_kcal": "", "new_protein": "", "new_fat": "", "new_carbs": "", "kcal_diff_pct": "", "source": "", "reason": d["note"]}
        if act == "keep":
            kind = d["kind"]
            row["decision"] = "keep (same food, not a stand-in)" if kind == "same" else "keep (close relative, declared stand-in)"
            shown = []
            for e, n in evrows:
                if n is None:
                    continue
                ok = within(oldn["kcal"], n.get("kcal"), True) and all(within(oldn[k], n.get(k), False) for k in ("p", "f", "c"))
                shown.append("%s: %s kcal %s/%s/%s%s" % (e["ref"], f1(n.get("kcal")), f1(n.get("p")), f1(n.get("f")), f1(n.get("c")), "" if ok else " OUT"))
                if not ok:
                    problems.append("%s breaks the rule vs %s %s" % (ing, e["ref"], n))
            sci = [e for e in ev if e["ref"].startswith("sci:")]
            if sci:
                shown += ["%s: %s" % (e["ref"], e.get("scientific")) for e in sci]
            if not shown:
                problems.append("%s: keep with no evidence" % ing)
            row["new_food"] = "evidence: " + "; ".join(shown)
            row["source"] = "; ".join(sorted({LICENCE.get((e.get("src") or ("branded" if e["ref"].startswith(("bm:", "brand:")) else "sr_legacy")), "") for e, _ in evrows}))
            acts.append((ing, "keep", old["form"], None, kind == "close", d["note"]))
        elif act in ("relink", "reform"):
            t = g["targets"][ing]
            if t["ref"].startswith("bm:"):
                if not t.get("medoid"):
                    problems.append("%s: no branded product for %s" % (ing, t["ref"]))
                    continue
                m = t["medoid"]
                rec = {"kind": "branded", "fdc_id": m["id"], "desc": m["desc"], "owner": m["brand_owner"], "brand": m["brand_name"], "ss": m["serving_size"], "su": m["serving_unit"],
                       "hh": m["household"], "pub": m["published"], "nut_ids": m["nut_ids"]}
                tn, tdesc, tsrc = m["n"], "%s (%s; %d labels agree near %s kcal)" % (m["desc"], m["brand_name"] or m["brand_owner"], t["n_products"], f1(t["median"]["kcal"])), "branded"
            elif t["ref"].startswith("brand:"):
                rec = {"kind": "branded", "fdc_id": t["id"], "desc": t["desc"], "owner": t["brand_owner"], "brand": t["brand_name"], "ss": t["serving_size"], "su": t["serving_unit"],
                       "hh": t["household"], "pub": t["published"], "nut_ids": t["nut_ids"]}
                tn, tdesc, tsrc = t["n"], t["desc"], "branded"
            elif t["ref"].startswith("fndds:"):
                rec = {"kind": "fndds", "fdc_id": t["id"], "desc": t["desc"], "pub": t["published"], "nut_keys": t["nut_keys_by_number"]}
                tn, tdesc, tsrc = t["n"], t["desc"], "fndds"
            elif t["src"] in ("cofid", "cnf"):
                rec = {"kind": t["src"], "fdc_id": t["id"], "desc": t["desc"], "code": t["code"]}
                tn, tdesc, tsrc = t["n"], t["desc"], t["src"]
            else:
                rec = {"kind": "sr", "fdc_id": t["id"]}
                tn, tdesc, tsrc = t["n"], t["desc"], t["src"]
            new_foods[t["ref"]] = rec
            form = "dried" if act == "reform" else "default"
            if tn.get("kcal") is not None and old["kcal"]:
                row["kcal_diff_pct"] = "%+.0f" % (100.0 * (float(tn["kcal"]) - float(old["kcal"])) / float(old["kcal"]))
            row["decision"] = "reform (record is a different form)" if act == "reform" else "relink to a trusted record"
            row["new_food"] = "%s %s" % (t["ref"], tdesc)
            row["new_kcal"], row["new_protein"], row["new_fat"], row["new_carbs"] = (f1(tn.get(k)) for k in ("kcal", "p", "f", "c"))
            row["source"] = LICENCE[tsrc if tsrc != "sr" else t["src"]]
            acts.append((ing, act, form, rec["fdc_id"], False, d["note"]))
            if act == "relink" and tn.get("kcal") is not None:
                for s in by_ing[ing]:
                    if not s["is_default"] and s["form"] == form and s["kcal"] is not None and abs(float(s["kcal"]) - float(tn["kcal"])) > max(0.25 * float(tn["kcal"]), 20):
                        drop_alt.append((ing, form, s["fdc_id"]))
        elif act == "unmap":
            row["decision"] = "unmap (honest gap: no nutrition data)"
            best = [(e, n) for e, n in evrows if n]
            if best:
                e, n = best[0]
                row["new_food"] = "closest evidence (not used): %s" % e["ref"]
                row["new_kcal"], row["new_protein"], row["new_fat"], row["new_carbs"] = (f1(n.get(k)) for k in ("kcal", "p", "f", "c"))
                if n.get("kcal") is not None and old["kcal"]:
                    row["kcal_diff_pct"] = "%+.0f" % (100.0 * (float(n["kcal"]) - float(old["kcal"])) / float(old["kcal"]))
            acts.append((ing, "unmap", "*", None, False, d["note"]))
        else:
            problems.append("%s: unknown action %s" % (ing, act))
            continue
        audit.append(row)
    if problems:
        print("STOP: %d problems" % len(problems))
        for p in problems:
            print("  ", p)
        raise SystemExit(1)

    # ---- the SQL
    sql = []
    w = sql.append
    w("""-- Wave 12 (trusted stand-ins + more brands). Generated by scripts/nutrition/foods12/build_w12.py. IDEMPOTENT.
-- Sources of truth (edit these, not this file): scripts/nutrition/foods12/proxy_decisions.psv (one decision per stand-in), brand_allowlist.txt and the
-- search results behind brands_accepted.json (brands_w12.py). Review sheets: scripts/nutrition/review/proxy-audit-w12.csv, brands-w12.csv.
-- Run AFTER seed-nutrition-10c-foods.sql (which sets the declared stand-ins) and BEFORE seed-nutrition-zzzzz-math-10c.sql, then ANALYZE and
-- refresh_all_recipe_nutrients() with jit off (see scripts/nutrition/LIVE-STEPS.md, Wave 12).
-- Owner's rule: a stand-in stays only when it is the same food in another form or a very close relative within about 10 percent on calories and the
-- main macronutrients; otherwise the ingredient gets a trusted record or no nutrition data at all.
-- Licences: USDA FoodData Central (public domain / CC0 1.0); UK CoFID 2021 (Open Government Licence v3.0); Canadian Nutrient File 2026 (Open Government
-- Licence - Canada), see scripts/nutrition/national/LICENCES.md.
begin;
""")
    # 1. replacement foods
    fvals, nvals, nat_vals, nat_nuts, fn_vals, fn_nuts = [], [], [], [], [], []
    natcache = {(f["src"], f["code"]): f for f in json.load(open(os.path.join(ROOT, "scripts", "nutrition", "national", "cache", "national-foods.json"), encoding="utf-8"))}
    for ref, r in sorted(new_foods.items()):
        if r["kind"] == "branded":
            nutr = sane_nutrients({int(k): v for k, v in r["nut_ids"].items()})
            fvals.append("(%d, %s, 'branded', %s, %s, %s, %s, %s, %s::date)" % (r["fdc_id"], lit(r["desc"][:200]), lit(r["owner"]), lit(r["brand"]), r["ss"], lit(r["su"]), lit(r["hh"]), lit(r["pub"])))
            nvals.append("(%d, %s::jsonb)" % (r["fdc_id"], lit(json.dumps({str(k): round(v, 4) for k, v in sorted(nutr.items())}, separators=(",", ":")))))
        elif r["kind"] in ("cofid", "cnf"):
            f = natcache[(r["kind"], r["code"])]
            nat_vals.append("(%d, %s, %s, %s)" % (f["fdc_id"], lit(f["name"] + (" [" + f["desc"] + "]" if f["desc"] and f["src"] == "cnf" and len(f["desc"]) < 60 else "")), lit(r["kind"]), lit(r["code"])))
            nat_nuts.append("(%d, %s::jsonb)" % (f["fdc_id"], lit(json.dumps({k: v for k, v in sorted(f["nut"].items())}, separators=(",", ":")))))
        elif r["kind"] == "fndds":
            fn_vals.append("(%d, %s, 'fndds', %s::date)" % (r["fdc_id"], lit(r["desc"][:200]), lit(r["pub"])))
            fn_nuts.append("(%d, %s::jsonb)" % (r["fdc_id"], lit(json.dumps({k: v for k, v in sorted(r["nut_keys"].items())}, separators=(",", ":")))))
    if fvals:
        w("-- 1a. real FoodData Central label products that replace a stand-in (one real record each, never averaged)")
        w("insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving, publication_date)\nvalues\n  " + ",\n  ".join(fvals) + "\non conflict (fdc_id) do nothing;")
        w("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\nselect v.fdc_id, n.id, e.value::numeric\nfrom (values\n  " + ",\n  ".join(nvals) + "\n) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e\njoin nutrients n on n.fdc_nutrient_id = e.key::int\non conflict (fdc_id, nutrient_id) do nothing;")
    if nat_vals:
        w("-- 1b. UK CoFID and Canadian Nutrient File records (synthetic fdc_id, publisher code in source_code; nutrient keys are ours, per 100 g)")
        w("insert into usda_foods (fdc_id, description, data_type, source_code)\nvalues\n  " + ",\n  ".join(nat_vals) + "\non conflict (fdc_id) do nothing;")
        w("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\nselect v.fdc_id, n.id, e.value::numeric\nfrom (values\n  " + ",\n  ".join(nat_nuts) + "\n) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e\njoin nutrients n on n.key = e.key\non conflict (fdc_id, nutrient_id) do nothing;")
    if fn_vals:
        w("-- 1c. USDA FNDDS records")
        w("insert into usda_foods (fdc_id, description, data_type, publication_date)\nvalues\n  " + ",\n  ".join(fn_vals) + "\non conflict (fdc_id) do nothing;")
        w("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\nselect v.fdc_id, n.id, e.value::numeric\nfrom (values\n  " + ",\n  ".join(fn_nuts) + "\n) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e\njoin nutrients n on n.key = e.key\non conflict (fdc_id, nutrient_id) do nothing;")

    # 2. decisions
    w("""
-- 2. one decision per stand-in (or loosely related mapping)
create temp table _w12 (ingredient text, action text, form text, new_fdc integer, proxy boolean, reason text) on commit drop;
insert into _w12 values
  """ + ",\n  ".join("(%s, %s, %s, %s, %s, %s)" % (lit(a[0]), lit(a[1]), lit(a[2]), a[3] if a[3] else "null", "true" if a[4] else "false", lit(a[5][:200])) for a in acts) + ";")
    w("""
-- 2a. unmap: the ingredient keeps existing, it just has no nutrition (and no household weights: a weight without a food means nothing)
delete from ingredient_portions p using _w12 a, ingredients i where a.action = 'unmap' and i.canonical_name = a.ingredient and p.ingredient_id = i.id;
delete from ingredient_foods f using _w12 a, ingredients i where a.action = 'unmap' and i.canonical_name = a.ingredient and f.ingredient_id = i.id;
update ingredients i set fdc_id = null from _w12 a where a.action = 'unmap' and i.canonical_name = a.ingredient;

-- 2b. relink: the stand-in goes, the trusted record becomes the default of the form, and it is not a stand-in
create temp table _w12_alt (ingredient text, form text, fdc_id integer) on commit drop;
insert into _w12_alt values
  """ + (",\n  ".join("(%s, %s, %d)" % (lit(a), lit(b), c) for a, b, c in drop_alt) if drop_alt else "('', '', 0)") + """;
delete from ingredient_foods f using _w12 a, ingredients i
 where a.action = 'relink' and i.canonical_name = a.ingredient and f.ingredient_id = i.id and f.form = a.form and f.is_default and f.fdc_id <> a.new_fdc;
delete from ingredient_foods f using _w12_alt a, ingredients i
 where i.canonical_name = a.ingredient and f.ingredient_id = i.id and f.form = a.form and f.fdc_id = a.fdc_id and not f.is_default;
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default, is_proxy)
select i.id, a.form, a.new_fdc, true, false from _w12 a join ingredients i on i.canonical_name = a.ingredient
 where a.action = 'relink' and exists (select 1 from usda_foods u where u.fdc_id = a.new_fdc)
on conflict (ingredient_id, form, fdc_id) do update set is_default = true, is_proxy = false;
update ingredients i set fdc_id = a.new_fdc from _w12 a
 where a.action = 'relink' and i.canonical_name = a.ingredient and exists (select 1 from usda_foods u where u.fdc_id = a.new_fdc);

-- 2c. reform: the record is real but it is another form of the ingredient (chervil: the SR record is dried chervil)
update ingredient_foods f set form = a.form, is_proxy = false
  from _w12 a join ingredients i on i.canonical_name = a.ingredient
 where a.action = 'reform' and f.ingredient_id = i.id and f.fdc_id = a.new_fdc and f.form <> a.form
   and not exists (select 1 from ingredient_foods e where e.ingredient_id = i.id and e.form = a.form and e.fdc_id = a.new_fdc);
update ingredients i set fdc_id = null from _w12 a where a.action = 'reform' and i.canonical_name = a.ingredient and i.fdc_id = a.new_fdc;

-- 2d. the stand-in flag follows the audit: 'same food' is no stand-in; a kept close relative is still declared (the label says so)
update ingredient_foods f set is_proxy = a.proxy
  from _w12 a join ingredients i on i.canonical_name = a.ingredient
 where a.action = 'keep' and f.ingredient_id = i.id and f.is_default and f.is_proxy is distinct from a.proxy;

-- 2e. a recipe line that pinned a food the ingredient no longer links to goes back to the ingredient's default
update recipe_ingredients ri set fdc_id = null
  from _w12 a join ingredients i on i.canonical_name = a.ingredient
 where ri.ingredient_id = i.id and ri.fdc_id is not null
   and not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.fdc_id = ri.fdc_id);
""")
    # 3. brands
    if brands:
        bv, bn, bl = [], [], []
        for b in brands:
            nutr = sane_nutrients({int(k): v for k, v in b["nutrients_per_100g"].items()})
            bv.append("(%d, %s, 'branded', %s, %s, %s, %s, %s, %s::date)" % (b["fdc_id"], lit(b["description"][:200]), lit(b["brand_owner"]), lit(b["brand_name"]), b["serving_size"], lit(b["serving_unit"]), lit(b["household"]), lit(b["published"])))
            bn.append("(%d, %s::jsonb)" % (b["fdc_id"], lit(json.dumps({str(k): round(v, 4) for k, v in sorted(nutr.items())}, separators=(",", ":")))))
            bl.append("(%s, %s, %d)" % (lit(b["ingredient"]), lit(b["form"]), b["fdc_id"]))
        w("-- 3. brand foods people actually buy (FDC Branded Foods, CC0). Each is a real FDC id linked to its canonical ingredient, never the default.")
        w("--    Values are label values per 100 g; foods sold by volume were converted with the ingredient's density (ingredients.density_g_per_ml) when the list was built.")
        for i in range(0, len(bv), 300):
            w("insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving, publication_date)\nvalues\n  " + ",\n  ".join(bv[i:i + 300]) + "\non conflict (fdc_id) do nothing;")
        for i in range(0, len(bn), 200):
            w("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\nselect v.fdc_id, n.id, e.value::numeric\nfrom (values\n  " + ",\n  ".join(bn[i:i + 200]) + "\n) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e\njoin nutrients n on n.fdc_nutrient_id = e.key::int\non conflict (fdc_id, nutrient_id) do nothing;")
        for i in range(0, len(bl), 400):
            w("insert into ingredient_foods (ingredient_id, form, fdc_id, is_default, is_proxy)\nselect i.id, v.form, v.fdc_id, false, false\nfrom (values\n  " + ",\n  ".join(bl[i:i + 400]) + "\n) v(cn, form, fdc_id) join ingredients i on i.canonical_name = v.cn\n"
              "where exists (select 1 from ingredient_foods d where d.ingredient_id = i.id and d.form = v.form and d.is_default)\non conflict (ingredient_id, form, fdc_id) do nothing;")
    w("commit;\n")
    with open(OUT_SQL, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(sql))

    # ---- the checks that go with it (run after the seed on a throwaway copy; every gate raises with the offenders)
    un = sorted(a[0] for a in acts if a[1] == "unmap")
    rl = sorted((a[0], a[3]) for a in acts if a[1] == "relink")
    kc = sorted(a[0] for a in acts if a[1] == "keep" and a[4])
    ks = sorted(a[0] for a in acts if a[1] == "keep" and not a[4])
    bids = sorted(b["fdc_id"] for b in brands)

    def arr(xs):
        return "array[" + ", ".join(lit(x) for x in xs) + "]::text[]"

    t = ["-- Wave 12 checks (generated by scripts/nutrition/foods12/build_w12.py). Run after supabase/seed-nutrition-w12-foods.sql:",
         "--   psql \"$URL\" -v ON_ERROR_STOP=1 -f scripts/nutrition/test_w12_foods.sql",
         "-- Every gate raises with the offenders; a green run prints 'wave 12 checks passed'.",
         "do $$ declare n int; list text; begin",
         "  -- one default per (ingredient, form)",
         "  select count(*), string_agg(i || '/' || f, ', ') into n, list from (select i.canonical_name::text i, f.form f from ingredient_foods f join ingredients i on i.id = f.ingredient_id group by 1, 2 having count(*) filter (where f.is_default) <> 1 limit 20) x;",
         "  if n > 0 then raise exception 'GATE not exactly one default: %', list; end if;",
         "  -- unmapped ingredients have no food and no household weight",
         "  select count(*), string_agg(i.canonical_name::text, ', ') into n, list from ingredients i where i.canonical_name::text = any(%s) and (exists (select 1 from ingredient_foods f where f.ingredient_id = i.id) or exists (select 1 from ingredient_portions p where p.ingredient_id = i.id));" % arr(un),
         "  if n > 0 then raise exception 'GATE unmapped ingredient still has a food: %', list; end if;",
         "  -- relinked ingredients: the trusted record is the default and is not a stand-in",
         "  select count(*), string_agg(v.cn, ', ') into n, list from (values %s) v(cn, fdc) where not exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id where i.canonical_name = v.cn and f.is_default and f.fdc_id = v.fdc and not f.is_proxy);" % ", ".join("(%s, %d)" % (lit(a), b) for a, b in rl),
         "  if n > 0 then raise exception 'GATE relink not applied: %', list; end if;",
         "  -- the stand-ins left are exactly the kept close relatives, and the kept 'same food' records are not stand-ins",
         "  select count(*), string_agg(i.canonical_name::text, ', ') into n, list from ingredient_foods f join ingredients i on i.id = f.ingredient_id where f.is_proxy and not (f.is_default and i.canonical_name::text = any(%s));" % arr(kc),
         "  if n > 0 then raise exception 'GATE unexpected stand-in: %', list; end if;",
         "  select count(*), string_agg(i.canonical_name::text, ', ') into n, list from ingredient_foods f join ingredients i on i.id = f.ingredient_id where f.is_default and f.is_proxy = false and i.canonical_name::text = any(%s);" % arr(kc),
         "  if n > 0 then raise exception 'GATE close relative lost its stand-in flag: %', list; end if;",
         "  select count(*), string_agg(i.canonical_name::text, ', ') into n, list from ingredient_foods f join ingredients i on i.id = f.ingredient_id where f.is_proxy and i.canonical_name::text = any(%s);" % arr(ks),
         "  if n > 0 then raise exception 'GATE same-food record still flagged: %', list; end if;",
         "end $$;"]
    if bids:
        t += ["do $$ declare n int; list text; begin",
              "  -- brand foods: branded, shown with a brand, never a default, one ingredient each, energy present, and near the ingredient's own default food",
              "  create temp table _wb on commit drop as select unnest(array[%s]) fdc_id;" % ", ".join(str(b) for b in bids),
              "  select count(*), string_agg(f.fdc_id::text, ', ') into n, list from ingredient_foods f join _wb using (fdc_id) where f.is_default;",
              "  if n > 0 then raise exception 'GATE a brand food is a default: %', list; end if;",
              "  select count(*), string_agg(u.fdc_id::text, ', ') into n, list from usda_foods u join _wb using (fdc_id) where u.data_type <> 'branded' or u.brand_name is null or u.brand_name = '';",
              "  if n > 0 then raise exception 'GATE brand food without a brand name: %', list; end if;",
              "  select count(*), string_agg(fdc_id::text, ', ') into n, list from (select fdc_id from ingredient_foods f join _wb using (fdc_id) group by 1 having count(distinct ingredient_id) > 1) x;",
              "  if n > 0 then raise exception 'GATE brand food linked to two ingredients: %', list; end if;",
              "  select count(*), string_agg(u.fdc_id::text, ', ') into n, list from usda_foods u join _wb using (fdc_id) where not exists (select 1 from usda_food_nutrients k where k.fdc_id = u.fdc_id and k.nutrient_id = 1);",
              "  if n > 0 then raise exception 'GATE brand food without energy: %', list; end if;",
              "  select count(*), string_agg(distinct i.canonical_name::text, ', ') into n, list from ingredient_foods f join _wb using (fdc_id) join ingredients i on i.id = f.ingredient_id",
              "    join usda_food_nutrients b on b.fdc_id = f.fdc_id and b.nutrient_id = 1",
              "    join ingredient_foods d on d.ingredient_id = f.ingredient_id and d.form = f.form and d.is_default",
              "    join usda_food_nutrients dk on dk.fdc_id = d.fdc_id and dk.nutrient_id = 1",
              "   where abs(b.amount_per_100g - dk.amount_per_100g) > greatest(0.25 * dk.amount_per_100g, 20) + 0.01;",
              "  if n > 0 then raise exception 'GATE brand food far from the ingredient default: %', list; end if;",
              "end $$;"]
    t += ["\\echo wave 12 checks passed", ""]
    with open(OUT_TEST, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(t))

    os.makedirs(os.path.dirname(OUT_AUDIT), exist_ok=True)
    with open(OUT_AUDIT, "w", encoding="utf-8", newline="") as fh:
        wr = csv.DictWriter(fh, fieldnames=list(audit[0].keys()))
        wr.writeheader()
        wr.writerows(sorted(audit, key=lambda r: (r["decision"], r["ingredient"])))
    cats, bybrand = Counter(), Counter()
    for b in brands:
        cats[b["category"] or "(none)"] += 1
        bybrand[b["brand_name"] or "(none)"] += 1
    with open(OUT_BRANDS, "w", encoding="utf-8", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["kind", "name", "brand_foods"])
        for k, v in cats.most_common():
            wr.writerow(["category", k, v])
        for k, v in bybrand.most_common():
            wr.writerow(["brand", k, v])
    c = Counter(a[1] + ("-" + ("close" if a[4] else "same") if a[1] == "keep" else "") for a in acts)
    print("wrote", os.path.relpath(OUT_SQL, ROOT), "| decisions", dict(c), "| new replacement foods", len(new_foods), "| dropped alt links", len(drop_alt), "| brand foods", len(brands))


if __name__ == "__main__":
    main()
