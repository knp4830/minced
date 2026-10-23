"""Wave 14 stage 1b: ask FoodData Central about every ingredient that has no food (a review aid; no decision is made here).

    python -I -X utf8 scripts/nutrition/foods14/gather14.py <container> [--limit N] [--only a,b] [--names a,b,c]

Reads    the throwaway container (ingredients without a food, with aliases; --names picks ingredients by name instead, e.g. defaults whose label has no energy),
         USDA_FDC_API_KEY from .env.local (polite use: one request at a time, ~0.4 s apart; the key allows 3,600 an hour).
Writes   scripts/nutrition/foods14/fdc-hits-w14[-names].txt   per ingredient: non-branded records (SR Legacy, Foundation, FNDDS) and, for branded, how many
                                                              real labels agree and the median per 100 g (the strict-label method of wave 12).
         W14_CACHE/search-cache.jsonl                         every API answer, append-only (default: a temp folder outside the repo), so a re-run costs nothing.
Nothing here links an ingredient; scripts/nutrition/foods14/decisions_w14.psv does, and build_w14.py checks it.
"""
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts", "world-ingredients"))
from quality import plausible, label_rounded_zero, MIN_SERVING, GLOBAL_EXCL, sane_nutrients  # noqa: E402

CACHE_DIR = os.environ.get("W14_CACHE") or os.path.join(tempfile.gettempdir(), "w14-cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CACHE_PATH = os.path.join(CACHE_DIR, "search-cache.jsonl")
LEGACY = os.path.join(CACHE_DIR, "api-cache.json")   # the first, raw cache of an interrupted run: read-only
STOP = {"and", "or", "with", "the", "of", "a", "in"}
KEEP = ("fdcId", "description", "dataType", "brandName", "brandOwner", "servingSize", "servingSizeUnit", "marketCountry", "gtinUpc", "publishedDate",
        "householdServingFullText", "foodCategory")


def reduce_result(res):
    return {"totalHits": res.get("totalHits"), "foods": [dict({a: f.get(a) for a in KEEP},
            foodNutrients=[{"nutrientId": x.get("nutrientId"), "value": x.get("value")} for x in f.get("foodNutrients", [])]) for f in res.get("foods", [])]}


cache = {}
if os.path.exists(LEGACY):
    try:
        for k, v in json.load(open(LEGACY, encoding="utf-8")).items():
            if k.startswith("search:"):
                cache[k] = reduce_result(v)
    except Exception:  # noqa: BLE001  a half-written legacy file is simply ignored
        pass
if os.path.exists(CACHE_PATH):
    for line in open(CACHE_PATH, encoding="utf-8"):
        try:
            o = json.loads(line)
            cache[o["k"]] = o["v"]
        except Exception:  # noqa: BLE001
            pass


def api_key():
    k = os.environ.get("USDA_FDC_API_KEY")
    if k:
        return k
    for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        if line.startswith("USDA_FDC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no USDA_FDC_API_KEY")


KEY = api_key()


def _call(url, body):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if "429" in str(e):
                time.sleep(60)
            elif attempt == 4:
                raise SystemExit("FDC API failed: %s" % str(e).replace(KEY, "***")[:120])
            else:
                time.sleep(4 * (attempt + 1))
    raise SystemExit("FDC API gave up")


LOCK = threading.Lock()


def search(query, types, size):
    k = "search:%s:%s:%d" % (query, ",".join(types), size)
    if k not in cache:
        body = json.dumps({"query": query, "dataType": types, "pageSize": size, "pageNumber": 1}).encode()
        v = reduce_result(_call("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + KEY, body))
        with LOCK:
            cache[k] = v
            with open(CACHE_PATH, "a", encoding="utf-8") as fh:   # append-only: nothing is ever rewritten
                fh.write(json.dumps({"k": k, "v": v}) + "\n")
        time.sleep(0.4)
    return cache[k]


def prefetch(jobs, workers=12):
    """The API answers in a few seconds a call; a few workers keep a 450-ingredient run to minutes (the key allows 3,600 an hour)."""
    todo = [j for j in jobs if "search:%s:%s:%d" % (j[0], ",".join(j[1]), j[2]) not in cache]
    print("prefetching %d searches with %d workers" % (len(todo), workers), flush=True)
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(lambda j: search(*j), todo))


def nuts(f):
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


def short(m):
    return {"k": m.get(1008), "p": m.get(1003), "f": m.get(1004), "c": m.get(1005)}


def fmt(m):
    g = lambda v: "-" if v is None else ("%.0f" % v if abs(v) >= 10 else "%.1f" % v)  # noqa: E731
    return "k %s p %s f %s c %s" % (g(m["k"]), g(m["p"]), g(m["f"]), g(m["c"]))


def toks(s):
    return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in STOP]


def branded(query, ingredient):
    res = search(query, ["Branded"], 100)
    tk = toks(query)
    cand, seen = [], set()
    for f in res.get("foods", []):
        desc = f.get("description") or ""
        dl = desc.lower()
        if not all(t in dl for t in tk):
            continue
        if any(g.strip() in dl for g in GLOBAL_EXCL if g.strip() not in ingredient.lower() and g.strip() not in query.lower()):
            continue
        if f.get("marketCountry") not in (None, "United States"):
            continue
        su = (f.get("servingSizeUnit") or "").lower()
        ss = f.get("servingSize")
        if su not in ("g", "grm") or not ss or ss < MIN_SERVING:
            continue
        m = sane_nutrients(nuts(f))
        if not plausible(m, ss, ingredient) or label_rounded_zero(m, ss, ingredient):
            continue
        gtin = f.get("gtinUpc")
        if gtin and gtin in seen:
            continue
        seen.add(gtin)
        cand.append({"id": f["fdcId"], "desc": desc[:60], "brand": (f.get("brandName") or f.get("brandOwner") or "")[:22], "ss": ss, "n": short(m)})
    out = {"query": query, "hits": res.get("totalHits"), "n": len(cand)}
    if cand:
        out["median"] = {a: round(statistics.median([(c["n"][a] or 0) for c in cand]), 1) for a in "kpfc"}
        ks = [c["n"]["k"] or 0 for c in cand]
        out["range_kcal"] = [round(min(ks)), round(max(ks))]
        med = out["median"]
        cand.sort(key=lambda c: abs((c["n"]["k"] or 0) - med["k"]))
        out["products"] = cand[:5]
    return out


def psql(ctr, sql):
    r = subprocess.run(["docker", "exec", "-i", ctr, "psql", "-U", "postgres", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"], input=sql,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise SystemExit(r.stderr)
    return [ln.split("\t") for ln in r.stdout.splitlines() if ln]


def main():
    ctr = sys.argv[1]
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    sql = ("select i.id, i.canonical_name, coalesce((select string_agg(a.alias::text, '; ' order by a.id) from ingredient_aliases a where a.ingredient_id=i.id),'') "
           "from ingredients i left join (select ri.ingredient_id, count(distinct ri.recipe_id) c from recipe_ingredients ri group by 1) u on u.ingredient_id=i.id "
           "where not exists (select 1 from ingredient_foods f where f.ingredient_id=i.id) order by coalesce(u.c,0) desc, i.canonical_name")
    if "--names" in sys.argv:
        names = sys.argv[sys.argv.index("--names") + 1].split(",")
        sql = ("select i.id, i.canonical_name, coalesce((select string_agg(a.alias::text, '; ' order by a.id) from ingredient_aliases a where a.ingredient_id=i.id),'') "
               "from ingredients i where i.canonical_name::text in (%s) order by 2" % ",".join("'" + n.replace("'", "''") + "'" for n in names))
    if "--csv" in sys.argv:   # offline: a saved list (id, canonical_name, ..., aliases) instead of the container
        import csv
        rows = list(csv.DictReader(open(sys.argv[sys.argv.index("--csv") + 1], encoding="utf-8", newline="")))
        ings = [(r["id"], r["canonical_name"], r["aliases"]) for r in rows]
    else:
        ings = [(a, b, c) for a, b, c in psql(ctr, sql)]
    if only:
        ings = [i for i in ings if i[1] in only]
    if limit:
        ings = ings[:limit]
    jobs = []
    for iid, name, aliases in ings:
        als = [a for a in aliases.split("; ") if a and a.lower() != name.lower()]
        qs = [name] + als[:2]
        jobs += [(q, ["Foundation", "SR Legacy", "Survey (FNDDS)"], 8) for q in qs] + [(q, ["Branded"], 100) for q in qs[:2]]
    prefetch(jobs)
    out = []
    for n, (iid, name, aliases) in enumerate(ings):
        als = [a for a in aliases.split("; ") if a and a.lower() != name.lower()]
        qs = [name] + als[:2]
        out.append("### %s | id %s" % (name, iid))
        seen = set()
        for q in qs:
            res = search(q, ["Foundation", "SR Legacy", "Survey (FNDDS)"], 8)
            qt = toks(q)
            for f in res.get("foods", []):
                d = (f.get("description") or "")
                if f["fdcId"] in seen:
                    continue
                if not any(t in d.lower() for t in qt):
                    continue
                seen.add(f["fdcId"])
                out.append("   %-10s %-8s %-62s %s%s" % (f["fdcId"], {"Survey (FNDDS)": "fndds", "SR Legacy": "sr", "Foundation": "found"}.get(f.get("dataType"), f.get("dataType")),
                                                       d[:62], fmt(short(nuts(f))), "   (q: %s)" % q if q != name else ""))
        for q in qs[:2]:
            b = branded(q, name)
            if b["n"]:
                out.append("   BRANDED q=%r: %d labels, median %s, kcal range %s" % (q, b["n"], fmt({a: b["median"][a] for a in "kpfc"}), b["range_kcal"]))
                for p in b["products"][:3]:
                    out.append("      %-9s %-60s %-22s %s" % (p["id"], p["desc"], p["brand"], fmt(p["n"])))
            else:
                out.append("   BRANDED q=%r: 0 usable labels (%s hits)" % (q, b["hits"]))
        if n % 25 == 0:
            print(n, name, flush=True)
    path = os.path.join(HERE, "fdc-hits-w14%s.txt" % (("-" + sys.argv[sys.argv.index("--tag") + 1]) if "--tag" in sys.argv else ""))
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out) + "\n")
    print("wrote", path)


if __name__ == "__main__":
    main()
