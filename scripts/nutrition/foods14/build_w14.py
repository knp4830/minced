"""Wave 14 stage 2: turn decisions_w14.psv into supabase/seed-nutrition-w14-foods.sql, the review sheet and the checks.

    python -I -X utf8 scripts/nutrition/foods14/build_w14.py <container>

The container is a throwaway restore of the snapshot with the wave 12 steps applied (see scripts/nutrition/LIVE-STEPS.md); it is only READ.
Reads    decisions_w14.psv   one line per ingredient that has no food or whose food changes (the SOURCE OF TRUTH; edit it, never the SQL)
         scripts/nutrition/bulk/{sr,foundation,fndds}                       (python -I scripts/nutrition/download_bulk.py)
         scripts/nutrition/national/cache/national-foods.json               (python -I scripts/nutrition/national/load_national.py)
         W14_CACHE/food-cache.json                                          (FDC /food/<id> answers for the `brand:` references)
Writes   supabase/seed-nutrition-w14-foods.sql                              idempotent, run on live AFTER every wave 12 step, before the refresh
         scripts/nutrition/review/foods-w14.csv                             every ingredient that had no food: decision, source id, values, evidence, reason
         scripts/nutrition/test_w14_foods.sql                               the gates (one default each, no invented stand-ins, panel present)

decisions_w14.psv columns:  ingredient | action | ref | kind | form | note | evidence
  action  link    the ingredient gets this record as its default food
          relink  the ingredient already has a default; it becomes this record
          gap     a named gap: no trusted record (the ingredient keeps existing, recipes say "at least")
  ref     sr:<fdc_id>  found:<fdc_id>  fndds:<fdc_id>  cofid:<code>  cnf:<code>  brand:<fdc_id>
  kind    same   the record IS this food                              (no stand-in flag)
          form   the record is the same food in another form          (no stand-in flag; the note names the form)
          close  a very close relative, verified: the record's energy is within 12 percent (or 5 kcal) and protein, fat and carbohydrate each within
                 12 percent (or 2.5 g) of EVERY figure in `evidence` (refs of independent trusted records of the real food); the stand-in flag stays on
THE OWNER'S RULE (wave 14): a strict stand-in stays a named gap. A blend with no trusted record, an Italian seasoning, a Dijon, a scotch bonnet stay gaps.
"""
import csv
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
NUT = os.path.join(ROOT, "scripts", "nutrition")
BULK = os.path.join(NUT, "bulk")
NAT = os.path.join(NUT, "national", "cache", "national-foods.json")
sys.path.insert(0, NUT)
sys.path.insert(0, os.path.join(ROOT, "scripts", "world-ingredients"))
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location('nutrition_portions', os.path.join(NUT, 'portions.py'))   # NOT scripts/world-ingredients/portions.py
pt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pt)
from quality import sane_nutrients, plausible  # noqa: E402

OUT_SQL = os.path.join(ROOT, "supabase", "seed-nutrition-w14-foods.sql")
OUT_CSV = os.path.join(NUT, "review", "foods-w14.csv")
OUT_TEST = os.path.join(NUT, "test_w14_foods.sql")
LICENCE = {"sr_legacy": "USDA FDC SR Legacy (public domain)", "foundation": "USDA FDC Foundation Foods (public domain)", "fndds": "USDA FNDDS (public domain)",
           "branded": "USDA FDC Branded (CC0 1.0)", "cofid": "UK CoFID 2021 (Open Government Licence v3.0)", "cnf": "Canadian Nutrient File 2026 (Open Government Licence - Canada)"}
CACHE_DIR = os.environ.get("W14_CACHE") or os.path.join(tempfile.gettempdir(), "w14-cache")
ADDED_SUGARS = {   # ingredient -> (fraction of carbohydrate that is added sugar, why)
    "simple syrup": (1.0, "sweetener: sugar dissolved in water (FNDDS total sugars 45.7 of 45.6 g carbohydrate)"),
    "maple butter": (1.0, "sweetener: maple syrup counts as added sugar (CNF carbohydrate is all sugar)"),
    "haupia": (0.63, "FNDDS reports 14.7 g total sugars of 23.5 g carbohydrate; coconut milk, sugar and cornstarch, so the sugars are treated as added"),
}
GAP_DEFAULT = "no trusted record of this food in USDA SR Legacy, Foundation or FNDDS, UK CoFID, Canadian CNF, or a real FoodData Central label set"


def psql(ctr, sql):
    r = subprocess.run(["docker", "exec", "-i", ctr, "psql", "-U", "postgres", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"], input=sql,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise SystemExit(r.stderr)
    return [ln.split("\t") for ln in r.stdout.splitlines() if ln]


def lit(v):
    return "null" if v in (None, "") else "'" + str(v).replace("'", "''") + "'"


def f1(x):
    return "" if x is None else ("%.1f" % float(x)).rstrip("0").rstrip(".")


def within(a, b, kcal):
    if a is None or b is None:
        return True
    a, b = float(a), float(b)
    return abs(a - b) <= max(0.12 * b, 5.0 if kcal else 2.5)


def eval_frac(x):
    a, _, b = x.partition("/")
    return float(a) / float(b) if b else float(a)


def rd(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        yield from csv.DictReader(fh)


class Sources:
    """Resolves a reference to {ref, src, fdc_id, desc, n{kcal,p,f,c}, nutrients{our nutrient id: per 100 g} (only for foods that must be inserted), portions[]}."""

    def __init__(self, ctr):
        self.ctr = ctr
        self.nut_by_num = {a: int(b) for a, b in psql(ctr, "select fdc_number, id from nutrients where fdc_number is not null")}
        self.nut_by_key = {b: int(a) for a, b in psql(ctr, "select id, key from nutrients")}
        self.nat = None
        self.fndds = None
        self.sr = {}
        self.brand_cache = None

    def db_food(self, fid):
        r = psql(self.ctr, """select u.fdc_id, u.data_type, u.description,
          food_nutrient_amount(u.fdc_id, 1::smallint, null),
          food_nutrient_amount(u.fdc_id, 2::smallint, null),
          food_nutrient_amount(u.fdc_id, 7::smallint, null),
          food_nutrient_amount(u.fdc_id, 3::smallint, null),
          (select count(*) from usda_food_nutrients where fdc_id=u.fdc_id and nutrient_id <= 35)
          from usda_foods u where u.fdc_id=%d""" % int(fid))
        if not r:
            return None
        a = r[0]
        num = lambda x: None if x in ("", None) else float(x)  # noqa: E731
        return {"fdc_id": int(a[0]), "src": a[1], "desc": a[2], "n": {"kcal": num(a[3]), "p": num(a[4]), "f": num(a[5]), "c": num(a[6])}, "panel": int(a[7])}

    def portions_for(self, sub, fid):
        """Household weights of an SR / Foundation / FNDDS record from the bulk food_portion.csv (cached per dataset).

        SR and Foundation name the measure in `measure_unit` + `modifier`. FNDDS does not: its measure is the TEXT of portion_description ("1 cup", "1 ham hock",
        "1 fl oz (no ice)") and its `modifier` is a numeric code, so each FNDDS description is split into amount, unit and rest. Descriptions that are not a household
        measure of the food itself (quantity not specified, surface inch, with ice, per ounce yielded, school or fun-size packs) are dropped."""
        key = ("portions", sub)
        if key not in self.sr:
            d = os.path.join(BULK, sub)
            units = {r["id"]: r["name"] for r in rd(os.path.join(d, "measure_unit.csv"))}
            by = defaultdict(list)
            for r in rd(os.path.join(d, "food_portion.csv")):
                if not (r["fdc_id"] and r["gram_weight"]):
                    continue
                if sub == "fndds":
                    desc = (r["portion_description"] or "").strip()
                    if re.search(r"quantity not specified|surface inch|yields|with ice|nfs|fun size|individual|school|package|packet|bottle|\bcans?\b", desc, re.I):
                        continue
                    m = re.match(r"^(\d+\s+\d+/\d+|\d+/\d+|\d*\.?\d+)\s+(.*)$", desc)
                    if not m:
                        continue
                    a = m.group(1).split()
                    amount = (float(a[0]) + eval_frac(a[1])) if len(a) == 2 else eval_frac(a[0])
                    rest = m.group(2)
                    um = re.match(r"^(fl\.? ?oz|tsp|tbsp|cups?|teaspoons?|tablespoons?)\b[ ,]*(.*)$", rest, re.I)
                    unit, mod = (um.group(1).lower(), um.group(2)) if um else ("", rest)
                    unit = {"teaspoon": "tsp", "teaspoons": "tsp", "tablespoon": "tbsp", "tablespoons": "tbsp", "cups": "cup", "fl. oz": "fl oz", "floz": "fl oz"}.get(unit, unit)
                    by[int(r["fdc_id"])].append({"amount": amount, "unit": unit, "modifier": "", "description": mod, "grams": float(r["gram_weight"])})
                else:
                    u = units.get(r["measure_unit_id"], "")
                    by[int(r["fdc_id"])].append({"amount": float(r["amount"] or 1), "unit": "" if u in ("undetermined", "") else u, "modifier": r["modifier"] or "",
                                                 "description": r["portion_description"] or "", "grams": float(r["gram_weight"])})
            self.sr[key] = by
        return self.sr[key].get(int(fid), [])

    def resolve(self, ref):
        kind, _, val = ref.partition(":")
        if kind in ("sr", "found"):
            f = self.db_food(val)
            if not f:
                raise SystemExit("not in the database: %s" % ref)
            if f["src"] not in ("sr_legacy", "foundation"):
                raise SystemExit("%s is %s, expected %s" % (ref, f["src"], "sr_legacy" if kind == "sr" else "foundation"))
            f.update(ref=ref, new=False, portions=self.portions_for("sr" if f["src"] == "sr_legacy" else "foundation", val))
            return f
        if kind in ("cofid", "cnf"):
            if self.nat is None:
                self.nat = {(x["src"], x["code"]): x for x in json.load(open(NAT, encoding="utf-8"))}
            x = self.nat.get((kind, val))
            if not x:
                raise SystemExit("national food not found: %s" % ref)
            n = x["nut"]
            desc = x["name"] + (" [" + x["desc"][:60] + "]" if x.get("desc") and kind == "cofid" else "")
            return {"ref": ref, "src": kind, "fdc_id": x["fdc_id"], "desc": desc, "code": val, "new": True, "portions": [],
                    "n": {"kcal": n.get("energy_kcal"), "p": n.get("protein_g"), "f": n.get("fat_g"), "c": n.get("carbs_g")},
                    "nutrients": {self.nut_by_key[k]: float(v) for k, v in n.items() if k in self.nut_by_key}, "panel": sum(1 for k in n if k in self.nut_by_key and self.nut_by_key[k] <= 35)}
        if kind == "fndds":
            if self.fndds is None:
                d = os.path.join(BULK, "fndds")
                desc, pub = {}, {}
                for r in rd(os.path.join(d, "food.csv")):
                    if r["data_type"] == "survey_fndds_food":
                        desc[r["fdc_id"]] = r["description"].strip()
                        pub[r["fdc_id"]] = r["publication_date"]
                nut = defaultdict(dict)
                for r in rd(os.path.join(d, "food_nutrient.csv")):
                    if r["fdc_id"] in desc and r["amount"] != "":
                        nut[r["fdc_id"]][r["nutrient_id"]] = float(r["amount"])
                self.fndds = (desc, pub, nut)
            desc, pub, nut = self.fndds
            if val not in desc:
                raise SystemExit("FNDDS food not found: %s" % ref)
            mine = {self.nut_by_num[a]: v for a, v in nut[val].items() if a in self.nut_by_num and v >= 0}
            n = nut[val]
            return {"ref": ref, "src": "fndds", "fdc_id": int(val), "desc": desc[val], "pub": pub[val], "new": True, "portions": self.portions_for("fndds", val),
                    "n": {"kcal": n.get("208"), "p": n.get("203"), "f": n.get("204"), "c": n.get("205")}, "nutrients": mine, "panel": sum(1 for k in mine if k <= 35)}
        if kind == "brand":
            if self.brand_cache is None:
                p = os.path.join(CACHE_DIR, "food-cache.json")
                self.brand_cache = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
            d = self.brand_cache.get(val)
            if not d:
                raise SystemExit("branded food %s is not in the FDC cache (run audit_branded.py or fetch it)" % ref)
            if (d.get("servingSizeUnit") or "").lower() not in ("g", "grm"):
                raise SystemExit("%s is not sold by weight" % ref)
            pk = {}
            fid_to_pk = {int(a): int(b) for a, b in psql(self.ctr, "select fdc_nutrient_id, id from nutrients where fdc_nutrient_id is not null")}
            m = {}
            for x in d.get("foodNutrients", []):
                nu = x.get("nutrient") or {}
                if nu.get("id") is not None and x.get("amount") is not None:
                    m[int(nu["id"])] = float(x["amount"])
            m = sane_nutrients(m)
            if not plausible(m, d.get("servingSize"), ""):
                raise SystemExit("%s fails the label sanity gate" % ref)
            for k, v in m.items():
                if k in fid_to_pk:
                    pk[fid_to_pk[k]] = v
            return {"ref": ref, "src": "branded", "fdc_id": int(val), "desc": d["description"], "owner": d.get("brandOwner"), "brand": d.get("brandName"), "ss": d.get("servingSize"),
                    "su": "g", "hh": d.get("householdServingFullText"), "pub": (d.get("modifiedDate") or d.get("publicationDate") or "")[:10] or None, "new": True, "portions": [],
                    "n": {"kcal": m.get(1008), "p": m.get(1003), "f": m.get(1004), "c": m.get(1005)}, "nutrients": pk, "panel": sum(1 for k in pk if k <= 35)}
        raise SystemExit("unknown reference %r" % ref)


def main():
    ctr = sys.argv[1]
    S = Sources(ctr)
    dec = list(csv.DictReader(open(os.path.join(HERE, "decisions_w14.psv"), encoding="utf-8", newline=""), delimiter="|"))
    seen = Counter(d["ingredient"] for d in dec)
    dups = [k for k, v in seen.items() if v > 1]
    if dups:
        raise SystemExit("duplicate decisions: %s" % dups)
    # every ingredient that has no food must have a decision (the default is a named gap); decisions for others must be relinks
    rows = psql(ctr, """select i.id, i.canonical_name, i.aisle_category,
      coalesce(u.pub,0), coalesce(u.rev,0), exists (select 1 from ingredient_foods f where f.ingredient_id=i.id)
      from ingredients i left join (select ri.ingredient_id, count(distinct r.id) filter (where r.status='published') pub, count(distinct r.id) filter (where r.status='in_review') rev
        from recipe_ingredients ri join recipes r on r.id=ri.recipe_id group by 1) u on u.ingredient_id=i.id""")
    ing = {b: {"id": int(a), "aisle": c, "pub": int(d), "rev": int(e), "has": f == "t", "done": False} for a, b, c, d, e, f in rows}
    # a re-run on a database that already has this seed: the ingredient's default food is the decision's own record
    for name_, fid_ in psql(ctr, "select i.canonical_name, f.fdc_id from ingredient_foods f join ingredients i on i.id=f.ingredient_id where f.is_default and f.form='default'"):
        for d_ in dec:
            if d_["ingredient"] == name_ and d_["action"] == "link" and d_["ref"].partition(":")[2].isdigit() and int(fid_) == int(d_["ref"].partition(":")[2]):
                ing[name_]["done"] = True
            elif d_["ingredient"] == name_ and d_["action"] == "link" and d_["ref"].startswith(("cofid:", "cnf:")):
                ing[name_]["done"] = ing[name_].get("done", False) or int(fid_) >= 900000000
    current = {}
    for nm, fid_ in psql(ctr, "select i.canonical_name, f.fdc_id from ingredient_foods f join ingredients i on i.id=f.ingredient_id where f.is_default and f.form='default'"):
        fo = S.db_food(fid_)
        if fo:
            current[nm] = fo
    problems, out_rows, plan = [], [], []
    by = {d["ingredient"]: d for d in dec}
    for name in by:
        if name not in ing:
            problems.append("unknown ingredient %r" % name)
    no_food = [n for n, v in ing.items() if not v["has"]]
    resolved = {}

    def get(ref):
        if ref not in resolved:
            resolved[ref] = S.resolve(ref)
        return resolved[ref]

    for name in sorted(no_food, key=lambda n: (-(ing[n]["pub"] + ing[n]["rev"]), n)) + sorted(n for n in by if n in ing and ing[n]["has"]):
        d = by.get(name)
        info = ing[name]
        base = {"ingredient": name, "aisle": info["aisle"], "published_recipes": info["pub"], "in_review_recipes": info["rev"]}
        if d is None or d["action"] == "gap":
            row = dict(base, decision="gap (named: no nutrition data)", kind="", ref=(d or {}).get("ref", ""), food="", data_type="", licence="", kcal="", protein_g="", fat_g="", carbs_g="",
                       panel_nutrients="", evidence="", note=(d or {}).get("note") or GAP_DEFAULT)
            if d and d.get("ref"):
                try:
                    r = get(d["ref"])
                    row.update(food="considered, not linked: %s %s" % (r["ref"], r["desc"][:80]), kcal=f1(r["n"]["kcal"]), protein_g=f1(r["n"]["p"]), fat_g=f1(r["n"]["f"]), carbs_g=f1(r["n"]["c"]))
                except SystemExit as e:
                    problems.append("%s: %s" % (name, e))
            out_rows.append(row)
            continue
        act, ref, kind = d["action"], d["ref"], d["kind"]
        if act not in ("link", "relink", "upgrade"):
            problems.append("%s: unknown action %s" % (name, act))
            continue
        if act == "link" and info["has"] and not info["done"]:
            problems.append("%s already has a food; use relink" % name)
            continue
        if act in ("relink", "upgrade") and not info["has"]:
            problems.append("%s has no food; use link" % name)
            continue
        if kind not in ("same", "form", "close"):
            problems.append("%s: kind must be same, form or close" % name)
            continue
        try:
            r = get(ref)
        except SystemExit as e:
            problems.append("%s: %s" % (name, e))
            continue
        ev_txt = []
        if act == "upgrade":
            # a branded default (a label: few nutrients, values rounded to the serving) is replaced by a trusted record of the SAME food that carries a fuller panel,
            # only when the numbers stay where they were: energy within 12 percent (or 5 kcal), each macro within 12 percent (or 2.5 g) of the label's non-missing figures
            cur = current.get(name)
            if cur and cur["fdc_id"] == r["fdc_id"]:   # a re-run on a database that already has this seed
                ev_txt.append("already applied")
                act = "relink"
            elif kind != "same" or not cur or cur["src"] != "branded":
                problems.append("%s: an upgrade needs kind same and a branded default today" % name)
                continue
            else:
                if r["src"] == "branded" or r["panel"] < cur["panel"] + 5:
                    problems.append("%s: upgrade record %s is branded or its panel (%d) is not at least 5 nutrients fuller than the label (%d)" % (name, ref, r["panel"], cur["panel"]))
                    continue
                if not (within(r["n"]["kcal"], cur["n"]["kcal"], True) and all(within(r["n"][k], cur["n"][k], False) for k in ("p", "f", "c"))):
                    problems.append("%s: upgrade %s moves the numbers: record %s vs current label %s" % (name, ref, r["n"], cur["n"]))
                    continue
                ev_txt.append("replaces brand %s %s: %s kcal %s/%s/%s, panel %d -> %d" % (cur["fdc_id"], cur["desc"][:40], f1(cur["n"]["kcal"]), f1(cur["n"]["p"]), f1(cur["n"]["f"]), f1(cur["n"]["c"]), cur["panel"], r["panel"]))
                act = "relink"
        if kind == "close":
            evs = [e for e in (d["evidence"] or "").split(";") if e.strip()]
            if not evs:
                problems.append("%s: close relative with no evidence" % name)
            for e in evs:
                try:
                    x = get(e.strip())
                except SystemExit as ex:
                    problems.append("%s: evidence %s: %s" % (name, e, ex))
                    continue
                ok = within(r["n"]["kcal"], x["n"]["kcal"], True) and all(within(r["n"][k], x["n"][k], False) for k in ("p", "f", "c"))
                ev_txt.append("%s: %s kcal %s/%s/%s%s" % (x["ref"], f1(x["n"]["kcal"]), f1(x["n"]["p"]), f1(x["n"]["f"]), f1(x["n"]["c"]), "" if ok else " OUT"))
                if not ok:
                    problems.append("%s breaks the owner's rule against %s: record %s vs evidence %s" % (name, e, r["n"], x["n"]))
        if r["n"]["kcal"] is None:   # the recipe maths (food_has_nutrition) needs energy; a record without it would only turn a named gap into "food has no nutrient data"
            problems.append("%s: %s reports no energy; keep it a named gap" % (name, ref))
        form = d.get("form") or "default"
        plan.append({"ingredient": name, "action": act, "form": form, "rec": r, "proxy": kind == "close", "note": d["note"], "kind": kind})
        out_rows.append(dict(base, decision=("upgrade" if d["action"] == "upgrade" else "relink" if act == "relink" else "link") + (" (%s)" % kind), kind=kind, ref=ref, food=r["desc"][:120], data_type=r["src"], licence=LICENCE[r["src"]],
                             kcal=f1(r["n"]["kcal"]), protein_g=f1(r["n"]["p"]), fat_g=f1(r["n"]["f"]), carbs_g=f1(r["n"]["c"]), panel_nutrients=r["panel"],
                             evidence="; ".join(ev_txt), note=d["note"]))
    if problems:
        print("STOP: %d problems" % len(problems))
        for p in problems:
            print("  ", p)
        raise SystemExit(1)

    # ---------------------------------------------------------------- SQL
    sql = []
    w = sql.append
    w("""-- Wave 14 (foods and exact vitamins). Generated by scripts/nutrition/foods14/build_w14.py. IDEMPOTENT.
-- Source of truth (edit it, not this file): scripts/nutrition/foods14/decisions_w14.psv. Review sheet: scripts/nutrition/review/foods-w14.csv.
-- Run on live AFTER every wave 12 step (seed-nutrition-w12-foods.sql, seed-ingredients-w12.sql, seed-originals-w12.sql, seed-cuisine-backfill-w12.sql),
-- then ANALYZE and `SET jit = off; SELECT refresh_all_recipe_nutrients();` (see scripts/nutrition/LIVE-STEPS.md, Wave 14).
-- Owner's rule: an ingredient gets a record only when it IS that food (or the same food in another form), or a very close relative verified within about
-- 10 percent on energy and the main macros against independent trusted records; anything else stays a named gap.
-- Licences: USDA FoodData Central (public domain / CC0 1.0); UK CoFID 2021 (Open Government Licence v3.0); Canadian Nutrient File 2026 (Open Government
-- Licence - Canada), see scripts/nutrition/national/LICENCES.md. A nutrient the source does not report has NO row (never 0).
begin;
""")
    recs = {}
    for p in plan:
        recs[p["rec"]["ref"]] = p["rec"]
    new = [r for r in recs.values() if r["new"]]
    nat = [r for r in new if r["src"] in ("cofid", "cnf")]
    fn = [r for r in new if r["src"] == "fndds"]
    br = [r for r in new if r["src"] == "branded"]

    def nut_insert(items):
        vals = []
        for r in items:
            vals.append("(%d, %s::jsonb)" % (r["fdc_id"], lit(json.dumps({str(k): round(v, 4) for k, v in sorted(r["nutrients"].items())}, separators=(",", ":")))))
        return ("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\nselect v.fdc_id, e.key::smallint, e.value::real\nfrom (values\n  " + ",\n  ".join(vals) +
                "\n) v(fdc_id, j) cross join lateral jsonb_each_text(v.j) e\njoin nutrients n on n.id = e.key::smallint\non conflict (fdc_id, nutrient_id) do nothing;")
    if nat:
        w("-- 1a. UK CoFID and Canadian Nutrient File records (synthetic fdc_id, publisher code in source_code; values per 100 g)")
        w("insert into usda_foods (fdc_id, description, data_type, source_code)\nvalues\n  " + ",\n  ".join(
            "(%d, %s, %s, %s)" % (r["fdc_id"], lit(r["desc"]), lit(r["src"]), lit(r["code"])) for r in sorted(nat, key=lambda r: r["fdc_id"])) + "\non conflict (fdc_id) do nothing;")
        w(nut_insert(sorted(nat, key=lambda r: r["fdc_id"])))
    if fn:
        w("-- 1b. USDA FNDDS records (nutrient numbers mapped through nutrients.fdc_number)")
        w("insert into usda_foods (fdc_id, description, data_type, publication_date)\nvalues\n  " + ",\n  ".join(
            "(%d, %s, 'fndds', %s::date)" % (r["fdc_id"], lit(r["desc"][:200]), lit(r["pub"])) for r in sorted(fn, key=lambda r: r["fdc_id"])) + "\non conflict (fdc_id) do nothing;")
        w(nut_insert(sorted(fn, key=lambda r: r["fdc_id"])))
    if br:
        w("-- 1c. real FoodData Central label products (one real record each, never averaged)")
        w("insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving, publication_date)\nvalues\n  " + ",\n  ".join(
            "(%d, %s, 'branded', %s, %s, %s, %s, %s, %s::date)" % (r["fdc_id"], lit(r["desc"][:200]), lit(r["owner"]), lit(r["brand"]), r["ss"], lit(r["su"]), lit(r["hh"]), lit(r["pub"]))
            for r in sorted(br, key=lambda r: r["fdc_id"])) + "\non conflict (fdc_id) do nothing;")
        w(nut_insert(sorted(br, key=lambda r: r["fdc_id"])))

    w("""
-- 2. one decision per ingredient
create temp table _w14 (ingredient text, action text, form text, new_fdc integer, proxy boolean, reason text) on commit drop;
insert into _w14 values
  """ + ",\n  ".join("(%s, %s, %s, %d, %s, %s)" % (lit(p["ingredient"]), lit(p["action"]), lit(p["form"]), p["rec"]["fdc_id"], "true" if p["proxy"] else "false", lit(p["note"][:200]))
                     for p in plan) + ";")
    w("""
-- 2a. relink: the old default of the form becomes a non-default alternate (2c drops it when it is more than 25 percent / 20 kcal from the new record)
update ingredient_foods f set is_default = false, is_proxy = false from _w14 a, ingredients i
 where a.action = 'relink' and i.canonical_name = a.ingredient and f.ingredient_id = i.id and f.form = a.form and f.is_default and f.fdc_id <> a.new_fdc;
-- 2b. the new default (a food that is not in usda_foods on this database is skipped, and the gate below says so)
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default, is_proxy)
select i.id, a.form, a.new_fdc, true, a.proxy from _w14 a join ingredients i on i.canonical_name = a.ingredient
 where exists (select 1 from usda_foods u where u.fdc_id = a.new_fdc)
on conflict (ingredient_id, form, fdc_id) do update set is_default = true, is_proxy = excluded.is_proxy;
update ingredients i set fdc_id = a.new_fdc from _w14 a
 where a.form = 'default' and i.canonical_name = a.ingredient and exists (select 1 from usda_foods u where u.fdc_id = a.new_fdc);
-- 2c. a non-default alternate that is far from the new default is dropped (a brand that disagrees with the record is not a brand of this food)
delete from ingredient_foods f using _w14 a, ingredients i, usda_food_nutrients nk, usda_food_nutrients ok
 where a.action = 'relink' and i.canonical_name = a.ingredient and f.ingredient_id = i.id and f.form = a.form and not f.is_default
   and nk.fdc_id = a.new_fdc and nk.nutrient_id = 1 and ok.fdc_id = f.fdc_id and ok.nutrient_id = 1
   and abs(ok.amount_per_100g - nk.amount_per_100g) > greatest(0.25 * nk.amount_per_100g, 20);
-- 2d. a recipe line that pinned a food the ingredient no longer links to goes back to the ingredient's default
update recipe_ingredients ri set fdc_id = null
  from _w14 a join ingredients i on i.canonical_name = a.ingredient
 where ri.ingredient_id = i.id and ri.fdc_id is not null
   and not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.fdc_id = ri.fdc_id);
""")
    # densities and household weights from the record's own USDA portions (never guessed)
    dens, prow = [], []
    known = set(pt.COUNT_UNITS) | {"each"}
    for p in plan:
        r = p["rec"]
        if not r.get("portions"):
            continue
        food = {"portions": r["portions"]}
        d = pt.density(food)
        if d and p["form"] == "default":
            dens.append((p["ingredient"], round(d, 3)))
        if p["form"] == "default":
            for u in sorted(known):
                g = pt.count_grams(food, u)
                if u == "each" and not g:
                    # "1 ham hock" is one of the thing itself: the portion names the ingredient (singular), so it is the 'each' weight
                    sing = p["ingredient"].lower()
                    sing = sing[:-1] if sing.endswith("s") and not sing.endswith("ss") else sing
                    for q in r["portions"]:
                        if not q["unit"] and q["description"].lower().startswith(sing) and not pt.PART_WORDS.search(q["description"].lower()):
                            g = q["grams"] / (q["amount"] or 1)
                            break
                if g:
                    prow.append((p["ingredient"], p["form"], u, round(g, 2), "usda", "USDA household weight"))
        else:
            for u, g in sorted(pt.volume_grams_per_unit(food).items()):
                prow.append((p["ingredient"], p["form"], u, round(g, 2), "usda", "USDA household weight"))
    if dens:
        w("-- 3. densities from the record's own volume portions (only where the ingredient has none)")
        w("update ingredients i set density_g_per_ml = v.d from (values\n  " + ",\n  ".join("(%s, %s)" % (lit(a), b) for a, b in dens) +
          "\n) as v(ing, d)\nwhere i.canonical_name = v.ing and i.density_g_per_ml is null;")
    if prow:
        w("-- 4. household weights (USDA portions of the record)")
        w("insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)\nselect i.id, v.form, u.id, v.g, v.src, v.note from (values\n  " +
          ",\n  ".join("(%s, %s, %s, %s, %s, %s)" % (lit(a), lit(b), lit(c), d, lit(e), lit(f)) for a, b, c, d, e, f in prow) +
          "\n) as v(ing, form, unit, g, src, note)\njoin ingredients i on i.canonical_name = v.ing\nleft join units u on u.name = v.unit\nwhere v.unit = 'each' or u.id is not null\n"
          "on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;")
    # added sugars are derived (food_nutrient_amount returns 0 unless the ingredient is listed): list the sweetened foods this wave links
    added = [(n, f, t) for n, (f, t) in ADDED_SUGARS.items() if any(p["ingredient"] == n for p in plan)]
    if added:
        w("-- 5. sweetened foods: added sugars are a share of the record's carbohydrate (the schema returns 0 for an ingredient that is not listed)")
        w("insert into added_sugar_ingredients (ingredient_id, fraction, note)\nselect i.id, v.f, v.n from (values\n  " + ",\n  ".join("(%s, %s, %s)" % (lit(a), b, lit(c)) for a, b, c in added) +
          "\n) as v(ing, f, n) join ingredients i on i.canonical_name = v.ing\non conflict (ingredient_id) do nothing;")
    w("commit;\n")
    with open(OUT_SQL, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(sql))

    # ---------------------------------------------------------------- the checks
    linked = sorted(p["ingredient"] for p in plan)
    close = sorted(p["ingredient"] for p in plan if p["proxy"])
    gaps = sorted(r["ingredient"] for r in out_rows if r["decision"].startswith("gap"))

    def arr(xs):
        return "array[" + ", ".join(lit(x) for x in xs) + "]::text[]"
    t = ["-- Wave 14 checks (generated by scripts/nutrition/foods14/build_w14.py). Run after supabase/seed-nutrition-w14-foods.sql:",
         "--   psql \"$URL\" -v ON_ERROR_STOP=1 -f scripts/nutrition/test_w14_foods.sql",
         "do $$ declare n int; list text; begin",
         "  select count(*), string_agg(i || '/' || f, ', ') into n, list from (select i.canonical_name::text i, f.form f from ingredient_foods f join ingredients i on i.id = f.ingredient_id group by 1, 2 having count(*) filter (where f.is_default) <> 1 limit 20) x;",
         "  if n > 0 then raise exception 'GATE not exactly one default: %', list; end if;",
         "  select count(*), string_agg(v.cn, ', ') into n, list from (values %s) v(cn, fdc) where not exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id where i.canonical_name = v.cn and f.is_default and f.fdc_id = v.fdc);"
         % ", ".join("(%s, %d)" % (lit(p["ingredient"]), p["rec"]["fdc_id"]) for p in plan),
         "  if n > 0 then raise exception 'GATE link not applied: %', list; end if;",
         "  select count(*), string_agg(i.canonical_name::text, ', ') into n, list from ingredient_foods f join ingredients i on i.id = f.ingredient_id where f.is_default and f.is_proxy and i.canonical_name::text = any(%s) is not true and f.form = 'default' and i.canonical_name::text = any(%s);" % (arr(close), arr(linked)),
         "  if n > 0 then raise exception 'GATE unexpected stand-in flag: %', list; end if;",
         "  select count(*), string_agg(i.canonical_name::text, ', ') into n, list from ingredient_foods f join ingredients i on i.id = f.ingredient_id where i.canonical_name::text = any(%s) and not exists (select 1 from ingredient_foods d where d.ingredient_id = i.id);" % arr(gaps),
         "  -- a named gap has no food (informational: counted, not an error)",
         "  select count(*) into n from ingredients i where i.canonical_name::text = any(%s) and exists (select 1 from ingredient_foods d where d.ingredient_id = i.id);" % arr(gaps),
         "  if n > 0 then raise exception 'GATE a named gap has a food: % ingredients', n; end if;",
         "  -- every linked food carries energy unless the publisher reports none",
         "  select count(*), string_agg(distinct i.canonical_name::text, ', ') into n, list from ingredient_foods f join ingredients i on i.id = f.ingredient_id where f.is_default and i.canonical_name::text = any(%s) and not exists (select 1 from usda_food_nutrients k where k.fdc_id = f.fdc_id and k.nutrient_id in (1, 91, 92));" % arr(linked),
         "  if n > 0 then raise exception 'GATE a linked food reports no energy (the recipe maths ignores it): %', list; end if;",
         "end $$;",
         "\\echo wave 14 checks passed", ""]
    with open(OUT_TEST, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(t))

    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as fh:
        wr = csv.DictWriter(fh, fieldnames=list(out_rows[0].keys()))
        wr.writeheader()
        wr.writerows(out_rows)
    c = Counter(r["decision"].split(" ")[0] + (" " + r["kind"] if r["kind"] else "") for r in out_rows)
    print("wrote", os.path.relpath(OUT_SQL, ROOT), "|", dict(c), "| new foods", len(new), "| densities", len(dens), "| portions", len(prow))


if __name__ == "__main__":
    main()
