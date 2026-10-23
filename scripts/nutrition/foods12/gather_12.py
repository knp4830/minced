"""Stage 1 of wave 12 (needs the snapshot database, the FDC API key and, for FNDDS, the survey zip).

    python -I scripts/nutrition/foods12/gather_12.py

Reads    proxy_decisions.psv  (one decision per stand-in or loosely related mapping; see README.md)
         bm_specs.json        (strict FDC Branded searches used as evidence or to pick a real product)
Writes   gathered.json        (everything stage 2 needs: stand-in values, replacement records, evidence numbers)
No decision is made here; nothing is guessed. A reference that cannot be resolved stops the run.

Environment: W10_CONTAINER / W10_REF_CONTAINER = the restored snapshot container (default w12foods-db),
W12_FNDDS_ZIP = path to FoodData_Central_survey_food_csv_2024-10-31.zip, W12_CACHE = folder for the API cache
(outside the repo), USDA_FDC_API_KEY in .env.local. API use is polite: one request at a time, cached.
"""
import csv
import io
import json
import os
import re
import statistics
import sys
import tempfile
import time
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
os.environ.setdefault("W10_CONTAINER", "w12foods-db")
os.environ.setdefault("W10_REF_CONTAINER", os.environ["W10_CONTAINER"])
sys.path.insert(0, os.path.join(ROOT, "scripts", "world-ingredients"))
from fdcdb import rows, lit  # noqa: E402
from quality import plausible, label_rounded_zero, MIN_SERVING, GLOBAL_EXCL, sane_nutrients  # noqa: E402

csv.field_size_limit(1 << 30)
CACHE_DIR = os.environ.get("W12_CACHE") or os.path.join(tempfile.gettempdir(), "w12-cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CACHE_PATH = os.path.join(CACHE_DIR, "api-cache.json")
cache = json.load(open(CACHE_PATH, encoding="utf-8")) if os.path.exists(CACHE_PATH) else {}
NAT = os.path.join(ROOT, "scripts", "nutrition", "national", "cache", "national-foods.json")

OILS = ["sr:171030", "sr:171413", "sr:167702", "sr:171016", "sr:172336", "sr:171025"]
VINEGARS = ["cofid:17-339", "cnf:13", "fndds:2709351", "sr:172237"]


def api_key():
    k = os.environ.get("USDA_FDC_API_KEY")
    if k:
        return k
    for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        if line.startswith("USDA_FDC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no USDA_FDC_API_KEY")


KEY = api_key()


def _call(url, body=None):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"} if body else {})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt == 4:
                raise SystemExit("FDC API failed: %s" % str(e)[:120])
            time.sleep(4 * (attempt + 1))


def save_cache():
    tmp = CACHE_PATH + ".tmp"  # atomic: an interrupted write must never leave a half-written cache
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cache, fh)
    os.replace(tmp, CACHE_PATH)


def fdc_food(fid):
    k = "food:%s" % fid
    if k not in cache:
        cache[k] = _call("https://api.nal.usda.gov/fdc/v1/food/%s?api_key=%s" % (fid, KEY))
        save_cache()
        time.sleep(0.35)
    return cache[k]


def fdc_search(query, size=200):
    k = "search:%s:%d" % (query, size)
    if k not in cache:
        body = json.dumps({"query": query, "dataType": ["Branded"], "pageSize": size, "pageNumber": 1}).encode()
        cache[k] = _call("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + KEY, body)
        save_cache()
        time.sleep(0.4)
    return cache[k]


def nuts_from_search(f):
    """FDC nutrient_id (4-digit, what usda_food_nutrients is keyed on) -> amount per 100 g (or 100 ml)."""
    m = {}
    for x in f.get("foodNutrients", []):
        nid, v = x.get("nutrientId"), x.get("value")
        if nid is not None and v is not None:
            m[int(nid)] = float(v)
    if 1008 not in m:
        for alt in (2048, 2047):
            if alt in m:
                m[1008] = m[alt]
                break
    for alt in (2047, 2048):
        m.pop(alt, None)
    return m


def nuts_from_food(d):
    m = {}
    for x in d.get("foodNutrients", []):
        nu = x.get("nutrient") or {}
        if nu.get("id") is not None and x.get("amount") is not None:
            m[int(nu["id"])] = float(x["amount"])
    if 1008 not in m:
        for alt in (2048, 2047):
            if alt in m:
                m[1008] = m[alt]
                break
    for alt in (2047, 2048):
        m.pop(alt, None)
    return m


def short(m):
    return {"kcal": m.get(1008), "p": m.get(1003), "f": m.get(1004), "c": m.get(1005)}


# ---------------------------------------------------------------- references
NATIONAL = None
FNDDS = None
NUT_BY_NUMBER = None


def national(src, code):
    global NATIONAL
    if NATIONAL is None:
        NATIONAL = {(f["src"], f["code"]): f for f in json.load(open(NAT, encoding="utf-8"))}
    f = NATIONAL.get((src, code))
    if not f:
        raise SystemExit("national food not found: %s %s" % (src, code))
    n = f["nut"]
    return {"ref": "%s:%s" % (src, code), "src": src, "id": f["fdc_id"], "code": code,
            "desc": f["name"] + (" [" + f["desc"][:60] + "]" if f.get("desc") and src == "cofid" else ""),
            "n": {"kcal": n.get("energy_kcal"), "p": n.get("protein_g"), "f": n.get("fat_g"), "c": n.get("carbs_g")},
            "nut_keys": n}


def fndds(fid):
    global FNDDS, NUT_BY_NUMBER
    if FNDDS is None:
        zpath = os.environ.get("W12_FNDDS_ZIP") or os.path.join(CACHE_DIR, "survey.zip")
        if not os.path.exists(zpath):
            print("downloading FNDDS survey zip (3 MB, public domain) ...")
            urllib.request.urlretrieve("https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip", zpath)
        z = zipfile.ZipFile(zpath)
        names = z.namelist()

        def rd(n):
            m = [x for x in names if x.endswith("/" + n)][0]
            return csv.DictReader(io.TextIOWrapper(z.open(m), encoding="utf-8-sig", newline=""))

        desc, pub = {}, {}
        for r in rd("food.csv"):
            if r["data_type"] == "survey_fndds_food":
                desc[r["fdc_id"]] = r["description"]
                pub[r["fdc_id"]] = r["publication_date"]
        nut = {}
        for r in rd("food_nutrient.csv"):
            if r["fdc_id"] in desc and r["amount"] != "":
                nut.setdefault(r["fdc_id"], {})[r["nutrient_id"]] = float(r["amount"])
        FNDDS = (desc, pub, nut)
        NUT_BY_NUMBER = {r["fdc_number"]: r["key"] for r in rows("select fdc_number, key from nutrients where fdc_number is not null", db="postgres")}
    desc, pub, nut = FNDDS
    k = str(fid)
    if k not in desc:
        raise SystemExit("FNDDS food not found: %s" % fid)
    n = nut[k]
    mine = {NUT_BY_NUMBER[a]: v for a, v in n.items() if a in NUT_BY_NUMBER}
    return {"ref": "fndds:%s" % fid, "src": "fndds", "id": int(fid), "desc": desc[k], "published": pub[k],
            "n": {"kcal": n.get("208"), "p": n.get("203"), "f": n.get("204"), "c": n.get("205")}, "nut_numbers": n, "nut_keys_by_number": mine}


def sr(fid):
    r = rows("""select u.fdc_id, u.data_type, u.description,
      (select amount_per_100g from usda_food_nutrients where fdc_id=u.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1008)) kcal,
      (select amount_per_100g from usda_food_nutrients where fdc_id=u.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1003)) p,
      (select amount_per_100g from usda_food_nutrients where fdc_id=u.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1004)) f,
      (select amount_per_100g from usda_food_nutrients where fdc_id=u.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1005)) c,
      (select count(*) from usda_food_nutrients where fdc_id=u.fdc_id) nn
      from usda_foods u where u.fdc_id=%d""" % int(fid), db="postgres")
    if not r:
        raise SystemExit("not in the database: %s" % fid)
    r = r[0]
    return {"ref": "sr:%s" % fid, "src": r["data_type"], "id": r["fdc_id"], "desc": r["description"],
            "n": {"kcal": r["kcal"], "p": r["p"], "f": r["f"], "c": r["c"]}, "n_nutrients": r["nn"]}


def brand_direct(fid):
    d = fdc_food(fid)
    m = sane_nutrients(nuts_from_food(d))
    su = (d.get("servingSizeUnit") or "g").lower()
    return {"ref": "brand:%s" % fid, "src": "branded", "id": int(fid), "desc": d["description"], "brand_owner": d.get("brandOwner"),
            "brand_name": d.get("brandName"), "serving_size": d.get("servingSize"), "serving_unit": su, "household": d.get("householdServingFullText"),
            "published": (d.get("modifiedDate") or d.get("publicationDate") or "")[:10] or None, "gtin": d.get("gtinUpcc") or d.get("gtinUpc"),
            "n": short(m), "nut_ids": {str(k): round(v, 4) for k, v in m.items()}}


def sci(fid):
    d = fdc_food(fid)
    nm = d.get("scientificName")
    if not nm:
        for a in d.get("foodAttributes", []):
            if a.get("name") == "Scientific Name":
                nm = a.get("value")
    return {"ref": "sci:%s" % fid, "desc": d.get("description"), "scientific": nm}


def bm(key, specs, ingredient, want_pick=False):
    sp = specs[key]
    must = re.compile(sp["must"], re.I)
    excl = re.compile(sp["excl"], re.I) if sp.get("excl") else None
    res = fdc_search(sp["query"])
    cand, seen = [], set()
    for f in res.get("foods", []):
        desc = f.get("description") or ""
        if not must.search(desc) or (excl and excl.search(desc)):
            continue
        if any(g.strip() in desc.lower() for g in GLOBAL_EXCL if g.strip() not in (ingredient or "").lower() and g.strip() not in sp["query"].lower()):
            continue
        if f.get("marketCountry") not in (None, "United States"):
            continue
        su = (f.get("servingSizeUnit") or "").lower()
        if su not in ("g", "grm"):
            continue
        ss = f.get("servingSize")
        if not ss or ss < MIN_SERVING:
            continue
        m = nuts_from_search(f)
        m = sane_nutrients(m)
        if not plausible(m, ss, ingredient) or label_rounded_zero(m, ss, ingredient or ""):
            continue
        gtin = f.get("gtinUpc")
        if gtin and gtin in seen:
            continue
        seen.add(gtin)
        cand.append({"id": f["fdcId"], "desc": desc, "brand_owner": f.get("brandOwner"), "brand_name": f.get("brandName"), "serving_size": ss,
                     "serving_unit": "g", "household": f.get("householdServingFullText"), "published": f.get("publishedDate"), "gtin": gtin,
                     "m": m})
    out = {"ref": "bm:%s" % key, "query": sp["query"], "must": sp["must"], "excl": sp.get("excl", ""), "n_products": len(cand), "total_hits": res.get("totalHits")}
    if cand:
        ks = [c["m"].get(1008) for c in cand]
        out["median"] = {a: round(statistics.median([c["m"].get(b, 0) or 0 for c in cand]), 1) for a, b in (("kcal", 1008), ("p", 1003), ("f", 1004), ("c", 1005))}
        out["range_kcal"] = [round(min(ks)), round(max(ks))]
        # the product closest to the group median (scaled distance), shortest plain name breaking ties
        med = out["median"]

        def dist(c):
            m = c["m"]
            return (abs((m.get(1008) or 0) - med["kcal"]) / max(med["kcal"], 40) + abs((m.get(1003) or 0) - med["p"]) / max(med["p"], 8)
                    + abs((m.get(1004) or 0) - med["f"]) / max(med["f"], 8) + abs((m.get(1005) or 0) - med["c"]) / max(med["c"], 8))
        cand.sort(key=lambda c: (dist(c), len(c["desc"]), c["id"]))
        best = cand[0]
        out["medoid"] = {"id": best["id"], "desc": best["desc"], "brand_owner": best["brand_owner"], "brand_name": best["brand_name"],
                         "serving_size": best["serving_size"], "serving_unit": "g", "household": best["household"],
                         "published": best["published"], "gtin": best["gtin"], "n": short(best["m"]),
                         "nut_ids": {str(k): round(v, 4) for k, v in best["m"].items()}}
        out["products"] = [{"id": c["id"], "desc": c["desc"][:60], "brand": (c["brand_name"] or c["brand_owner"] or "")[:24], "n": short(c["m"])} for c in cand[:12]]
    return out


def resolve(ref, specs, ingredient):
    kind, _, val = ref.partition(":")
    if kind == "sr":
        return sr(val)
    if kind in ("cofid", "cnf"):
        return national(kind, val)
    if kind == "fndds":
        return fndds(val)
    if kind == "brand":
        return brand_direct(val)
    if kind == "sci":
        return sci(val)
    if kind == "bm":
        return bm(val, specs, ingredient)
    raise SystemExit("unknown reference %r" % ref)


def main():
    specs = json.load(open(os.path.join(HERE, "bm_specs.json"), encoding="utf-8"))
    dec = list(csv.DictReader(open(os.path.join(HERE, "proxy_decisions.psv"), encoding="utf-8", newline=""), delimiter="|"))
    names = [d["ingredient"] for d in dec]
    inlist = ",".join(lit(n) for n in names)
    standins = rows("""select i.canonical_name ing, f.form, f.is_default, f.is_proxy, f.fdc_id, u.data_type, u.description, u.brand_name,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1008)) kcal,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1003)) p,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1004)) f,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1005)) c,
      (select count(*) from recipe_ingredients ri where ri.ingredient_id=i.id) uses
      from ingredients i join ingredient_foods f on f.ingredient_id=i.id join usda_foods u on u.fdc_id=f.fdc_id
      where i.canonical_name in (%s) order by 1, 2, 3 desc""" % inlist, db="postgres")
    missing = [n for n in names if not any(s["ing"] == n for s in standins)]
    if missing:
        raise SystemExit("decision for an ingredient with no food: %s" % missing)
    proxies = {r["ing"] for r in rows("select i.canonical_name ing from ingredient_foods f join ingredients i on i.id=f.ingredient_id where f.is_proxy and f.is_default", db="postgres")}
    out = {"standins": standins, "proxy_flagged": sorted(proxies), "targets": {}, "evidence": {}}
    for d in dec:
        ing = d["ingredient"]
        if d["action"] in ("relink", "reform"):
            out["targets"][ing] = resolve(d["target"], specs, ing)
        refs = [x for x in d["evidence"].split(";") if x]
        ev = []
        for ref in refs:
            if ref == "oils":
                ev += [resolve(x, specs, ing) for x in OILS]
            elif ref == "vinegars":
                ev += [resolve(x, specs, ing) for x in VINEGARS]
            else:
                ev.append(resolve(ref, specs, ing))
        out["evidence"][ing] = ev
        # the unique bm: of a relink target also doubles as evidence
        if d["action"] == "relink" and d["target"].startswith("bm:"):
            out["evidence"][ing].append(out["targets"][ing])
    save_cache()
    json.dump(out, open(os.path.join(HERE, "gathered.json"), "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False, sort_keys=True)
    # a plain report of the branded picks, to read before running stage 2
    for ing, t in sorted(out["targets"].items()):
        if t["ref"].startswith("bm:"):
            print("%-22s n=%-3d median %s  -> %s %s %s" % (ing, t["n_products"], t.get("median"), t.get("medoid", {}).get("id"), (t.get("medoid", {}).get("desc") or "")[:40],
                                                              t.get("medoid", {}).get("n")))
    print("wrote gathered.json:", len(out["targets"]), "targets,", sum(len(v) for v in out["evidence"].values()), "evidence records")


if __name__ == "__main__":
    main()
