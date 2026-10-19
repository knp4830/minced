"""Search / fetch USDA FoodData Central BRANDED foods through the API, into a committed cache.

Branded Foods are manufacturer label data (CC0 as published by USDA). We use them only where
SR Legacy / Foundation have no record (spice blends, curry pastes, mixes), flagged as label data.

    python -I scripts/nutrition/fetch_branded.py --search "italian seasoning" [--n 8]
    python -I scripts/nutrition/fetch_branded.py --fetch 2525305,2244609      # cache full records
    python -I scripts/nutrition/fetch_branded.py --fetch-mapped               # cache every branded id used by the mapping

Politeness: sequential, one call at a time, <= 3,600 requests/hour per key. The key is read from
the environment or .env.local and is never printed or written to the cache.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usda_bulk as ub  # noqa: E402
from fdc import load_api_key, API  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "fdc-branded.json")


def get(path, params, key):
    url = f"{API}{path}?{urllib.parse.urlencode({**params, 'api_key': key})}"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt * 3)
                continue
            raise SystemExit(f"FDC HTTP {e.code} for {path}")  # never echo the URL (it holds the key)
        except Exception:
            time.sleep(2 ** attempt * 2)
    raise SystemExit(f"FDC gave up on {path}")


def trim(d):
    nut = {}
    for fn in d.get("foodNutrients", []):
        n = fn.get("nutrient") or {}
        if n.get("id") is not None and fn.get("amount") is not None:
            nut[int(n["id"])] = fn["amount"]
    nutrients = {k: v for k, v in nut.items() if k in ub.WANTED}  # RAW, like the bulk loader
    portions = []
    for p in d.get("foodPortions", []) or []:
        g = p.get("gramWeight")
        if g:
            u = (p.get("measureUnit") or {}).get("name") or ""
            portions.append({"amount": p.get("amount") or 1, "unit": "" if u == "undetermined" else u,
                             "modifier": p.get("modifier") or "", "description": p.get("portionDescription") or "", "grams": g})
    return {
        "fdc_id": d["fdcId"],
        "description": d.get("description"),
        "data_type": "branded",
        "brand_owner": d.get("brandOwner"),
        "brand_name": d.get("brandName"),
        "serving_size": d.get("servingSize"),
        "serving_size_unit": d.get("servingSizeUnit"),
        "household_serving": d.get("householdServingFullText"),
        "publication_date": (d.get("publishedDate") or d.get("modifiedDate") or None),
        "category": d.get("brandedFoodCategory"),
        "nutrients": {str(k): v for k, v in nutrients.items()},
        "portions": portions,
    }


def load_cache():
    return json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}


def save_cache(c):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w", encoding="utf-8", newline="\n") as f:
        json.dump(c, f, indent=1, sort_keys=True, ensure_ascii=False)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--search")
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--fetch")
    ap.add_argument("--fetch-mapped", action="store_true")
    a = ap.parse_args()
    key = load_api_key()
    if not key:
        raise SystemExit("USDA_FDC_API_KEY not found")
    if a.search:
        for q in a.search.split("|"):
            d = get("/foods/search", {"query": q, "dataType": "Branded", "pageSize": a.n}, key)
            print(f"## {q}")
            for f in d.get("foods", []):
                kcal = next((n["value"] for n in f.get("foodNutrients", []) if n.get("nutrientId") == 1008), None)
                print(f"  {f['fdcId']} {f.get('description','')[:50]} | {f.get('brandOwner','')[:28]} | {f.get('servingSize')}{f.get('servingSizeUnit','')} | kcal={kcal} | {f.get('brandedFoodCategory','')[:30]}")
            time.sleep(0.6)
        return
    ids = []
    if a.fetch:
        ids = [int(x) for x in a.fetch.split(",")]
    if a.fetch_mapped:
        import mapping
        known = set(ub.load_all(("sr", "foundation", "fndds")))
        old = mapping.existing_map()
        want = {v["fdc_id"] for v in old.values()} | {f[2] for f in mapping.load()["foods"]}
        ids = sorted(i for i in want if i not in known)
    cache = load_cache()
    todo = [i for i in ids if str(i) not in cache]
    print(f"{len(ids)} requested, {len(todo)} to fetch")
    for i in todo:
        cache[str(i)] = trim(get(f"/food/{i}", {}, key))
        time.sleep(0.6)
    save_cache(cache)
    print("cached", len(cache))


if __name__ == "__main__":
    main()
