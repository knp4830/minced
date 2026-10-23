"""Wave 14: compare the stored panel of linked BRANDED foods with FoodData Central itself (the label values), and report what our load dropped.

    python -I -X utf8 scripts/nutrition/foods14/audit_branded.py <container> [--limit N] [--defaults-only] [--out csv]

Reads the throwaway container; calls GET /v1/food/<id> once per branded food (cached in W14_CACHE, ~0.4 s apart; the key allows 3,600 an hour).
Per food and per tracked nutrient (nutrients.fdc_nutrient_id), the kinds are
  missing_in_db  FDC lists the nutrient, we do not store it   -> the load trimmed it; fill it
  extra_in_db    we store it, FDC does not list it           -> remove (not reported is NULL, never 0)
  mismatch       both exist and differ by more than 1 percent + 0.001 (after the per-100 g conversion the loader used)
FDC Branded values are per 100 g (or per 100 ml for liquids: servingSizeUnit mL; the seed converts those with the ingredient's density; those rows
are reported as 'scaled' and compared on the ratio between nutrients, not on the absolute value).
"""
import csv
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CACHE_DIR = os.environ.get("W14_CACHE") or os.path.join(tempfile.gettempdir(), "w14-cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CACHE_PATH = os.path.join(CACHE_DIR, "food-cache.json")
cache = json.load(open(CACHE_PATH, encoding="utf-8")) if os.path.exists(CACHE_PATH) else {}


def api_key():
    k = os.environ.get("USDA_FDC_API_KEY")
    if k:
        return k
    for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        if line.startswith("USDA_FDC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no USDA_FDC_API_KEY")


KEY = api_key()
DIRTY = [0]
LOCK = threading.Lock()


def food(fid):
    k = str(fid)
    if k not in cache:
        for attempt in range(40):   # a 429 (hourly cap) waits 45 s and tries again, up to about 30 minutes
            try:
                with urllib.request.urlopen("https://api.nal.usda.gov/fdc/v1/food/%s?api_key=%s" % (fid, KEY), timeout=60) as r:
                    d = json.load(r)
                with LOCK:   # keep only what the audit and build_w14.py read, so 3,700 foods stay a few MB
                    cache[k] = {a: d.get(a) for a in ("description", "brandOwner", "brandName", "servingSize", "servingSizeUnit", "householdServingFullText", "publicationDate", "modifiedDate")}
                    cache[k]["foodNutrients"] = [{"nutrient": {"id": (x.get("nutrient") or {}).get("id")}, "amount": x.get("amount")} for x in d.get("foodNutrients", [])]
                break
            except Exception as e:  # noqa: BLE001
                msg = str(e).replace(KEY, "***")
                if "404" in msg:
                    with LOCK:
                        cache[k] = None
                    break
                if attempt == 39 or ("429" not in msg and attempt >= 4):
                    raise SystemExit("FDC API failed: %s" % msg[:100])
                time.sleep(45 if "429" in msg else 4 * (attempt + 1))
        with LOCK:
            DIRTY[0] += 1
            if DIRTY[0] % 25 == 0:
                save()
        time.sleep(1.1)   # one request about every 1.1 s per worker; with 1 worker that is under the key's 3,600 an hour
    return cache[k]


def save():
    tmp = CACHE_PATH + ".tmp"
    snap = dict(cache)   # a copy: other workers keep adding while this one writes
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(snap, fh)
    for attempt in range(8):  # Windows: antivirus or a reader can hold the file for a moment
        try:
            os.replace(tmp, CACHE_PATH)
            break
        except PermissionError:
            time.sleep(1 + attempt)


def psql(ctr, sql):
    r = subprocess.run(["docker", "exec", "-i", ctr, "psql", "-U", "postgres", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"], input=sql,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise SystemExit(r.stderr)
    return [ln.split("\t") for ln in r.stdout.splitlines() if ln]


def main():
    ctr = sys.argv[1]
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    where = "and exists (select 1 from ingredient_foods d where d.fdc_id=u.fdc_id and d.is_default)" if "--defaults-only" in sys.argv else ""
    ids = [int(r[0]) for r in psql(ctr, "select u.fdc_id from usda_foods u where u.data_type='branded' and exists (select 1 from ingredient_foods f where f.fdc_id=u.fdc_id) %s order by u.fdc_id" % where)]
    if limit:
        ids = ids[:limit]
    nid = {int(a): b for a, b in psql(ctr, "select fdc_nutrient_id, key from nutrients where fdc_nutrient_id is not null")}
    nid_pk = {int(a): int(b) for a, b in psql(ctr, "select fdc_nutrient_id, id from nutrients where fdc_nutrient_id is not null")}
    stored = {}
    for f, n, v in psql(ctr, "select x.fdc_id, x.nutrient_id, x.amount_per_100g from usda_food_nutrients x join usda_foods u using (fdc_id) where u.data_type='branded'"):
        stored.setdefault(int(f), {})[int(n)] = float(v)
    todo = [i for i in ids if str(i) not in cache]
    print("fetching %d of %d foods with 1 worker" % (len(todo), len(ids)), flush=True)
    with ThreadPoolExecutor(1) as ex:   # one worker, about 1.1 s a request: the key allows 3,600 an hour
        list(ex.map(food, todo))
    rows, nf = [], 0
    for fid in ids:
        d = food(fid)
        if not d:
            rows.append((fid, "", "(food)", "gone_from_fdc", "", ""))
            continue
        nf += 1
        pub = {}
        for x in d.get("foodNutrients", []):
            nu = x.get("nutrient") or {}
            if nu.get("id") in nid_pk and x.get("amount") is not None:
                pub[nid_pk[nu["id"]]] = float(x["amount"])
        s = stored.get(fid, {})
        unit = (d.get("servingSizeUnit") or "").lower()
        scaled = unit in ("ml", "mlt")
        for n in sorted(set(s) | set(pub)):
            key = nid.get(next((k for k, v in nid_pk.items() if v == n), None), str(n))
            if n in pub and n not in s:
                rows.append((fid, d.get("description", "")[:50], key, "missing_in_db", "", pub[n]))
            elif n in s and n not in pub:
                rows.append((fid, d.get("description", "")[:50], key, "extra_in_db", s[n], ""))
            elif not scaled and abs(s[n] - pub[n]) > 0.01 * abs(pub[n]) + 0.001:
                rows.append((fid, d.get("description", "")[:50], key, "mismatch", s[n], pub[n]))
    save()
    from collections import Counter
    c = Counter(r[3] for r in rows)
    print("branded foods checked", nf, "of", len(ids), dict(c))
    bn = Counter((r[2], r[3]) for r in rows)
    for (k, kind), n in sorted(bn.items()):
        print("  %-22s %-14s %d" % (k, kind, n))
    if out:
        with open(out, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["fdc_id", "description", "nutrient", "kind", "stored", "fdc"])
            w.writerows(rows)


if __name__ == "__main__":
    main()
