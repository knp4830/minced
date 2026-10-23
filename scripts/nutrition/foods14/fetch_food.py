"""Wave 14: fetch FoodData Central food records (GET /v1/food/<id>) into the cache that build_w14.py and audit_branded.py read.

    python -I -X utf8 scripts/nutrition/foods14/fetch_food.py 393776 361973 ...      (prints id, description, brand, serving, number of tracked nutrients)

The cache is W14_CACHE/food-cache.json (outside the repo). One request at a time, 0.4 s apart. The key is read from .env.local and never printed.
"""
import json
import os
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CACHE_DIR = os.environ.get("W14_CACHE") or os.path.join(tempfile.gettempdir(), "w14-cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CACHE_PATH = os.path.join(CACHE_DIR, "food-cache.json")


def api_key():
    k = os.environ.get("USDA_FDC_API_KEY")
    if k:
        return k
    for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        if line.startswith("USDA_FDC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no USDA_FDC_API_KEY")


def main():
    key = api_key()
    cache = json.load(open(CACHE_PATH, encoding="utf-8")) if os.path.exists(CACHE_PATH) else {}
    for fid in sys.argv[1:]:
        if fid not in cache:
            for attempt in range(5):
                try:
                    with urllib.request.urlopen("https://api.nal.usda.gov/fdc/v1/food/%s?api_key=%s" % (fid, key), timeout=60) as r:
                        cache[fid] = json.load(r)
                    break
                except Exception as e:  # noqa: BLE001
                    msg = str(e).replace(key, "***")
                    if attempt == 4:
                        raise SystemExit("FDC API failed: %s" % msg[:100])
                    time.sleep(30 if "429" in msg else 4 * (attempt + 1))
            time.sleep(0.4)
        d = cache[fid]
        n = sum(1 for x in d.get("foodNutrients", []) if x.get("amount") is not None)
        print("%-9s %-50s %-24s serving %s %s  nutrients %d" % (fid, (d.get("description") or "")[:50], (d.get("brandName") or d.get("brandOwner") or "")[:24],
                                                               d.get("servingSize"), d.get("servingSizeUnit"), n))
    tmp = CACHE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cache, fh)
    for attempt in range(8):
        try:
            os.replace(tmp, CACHE_PATH)
            break
        except PermissionError:
            time.sleep(1 + attempt)


if __name__ == "__main__":
    main()
