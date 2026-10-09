"""USDA FoodData Central client with a persistent, committed cache (M1.5.4).

Every lookup goes through `Fdc`, which checks `cache/fdc-cache.json` first.
The cache is committed on purpose:
  * USDA FDC data is public domain, so storing it is allowed;
  * a committed cache makes every run reproducible and key-free, and a new
    machine (or CI) never spends the 3,600 req/hour budget re-fetching;
  * entries are trimmed to the six nutrients the schema stores plus portions,
    so the file stays small enough to review in a diff.
Secrets are never written to the cache or printed.
"""
import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(HERE, "cache", "fdc-cache.json")
API = "https://api.nal.usda.gov/fdc/v1"

# our column -> FDC nutrient numbers, in preference order. Energy has fallbacks
# because Foundation foods often report Atwater-calculated energy (957/958)
# instead of 208.
NUTRIENTS = {
    "kcal": ["208", "957", "958"],
    "protein_g": ["203"],
    "carbs_g": ["205"],
    "fat_g": ["204"],
    "sodium_mg": ["307"],
    "fiber_g": ["291"],
}
KEYS = list(NUTRIENTS)


def load_api_key():
    key = os.environ.get("USDA_FDC_API_KEY")
    if key:
        return key
    candidates = [os.path.join(os.getcwd(), ".env.local")]
    try:
        common = subprocess.check_output(
            ["git", "rev-parse", "--git-common-dir"], cwd=HERE, text=True
        ).strip()
        root = os.path.dirname(os.path.abspath(os.path.join(HERE, common)))
        candidates.append(os.path.join(root, ".env.local"))
    except Exception:
        pass
    for path in candidates:
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                if line.startswith("USDA_FDC_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


class Fdc:
    def __init__(self, offline=False):
        self.offline = offline
        self.key = None
        self.requests = 0
        self.cache = {"search": {}, "food": {}}
        if os.path.exists(CACHE_PATH):
            self.cache = json.load(open(CACHE_PATH, encoding="utf-8"))
        self.dirty = False

    def save(self):
        if not self.dirty:
            return
        os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
        # sorted keys + trailing newline => stable diffs
        with open(CACHE_PATH, "w", encoding="utf-8", newline="\n") as f:
            json.dump(self.cache, f, indent=1, sort_keys=True, ensure_ascii=False)
            f.write("\n")
        self.dirty = False

    def _get(self, path, params):
        if self.offline:
            raise RuntimeError(f"offline and not cached: {path} {params}")
        if self.key is None:
            self.key = load_api_key()
            if not self.key:
                raise RuntimeError("USDA_FDC_API_KEY not found in env or .env.local")
        url = f"{API}{path}?{urllib.parse.urlencode({**params, 'api_key': self.key})}"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    self.requests += 1
                    if self.requests % 25 == 0:
                        self.save()  # keep progress if a long run is interrupted
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code == 429 or e.code >= 500:
                    time.sleep(2 ** attempt * 2)
                    continue
                # never echo the URL: it contains the key
                raise RuntimeError(f"FDC HTTP {e.code} for {path}") from None
        raise RuntimeError(f"FDC gave up on {path}")

    def search(self, query, n=8, types="Foundation,SR Legacy"):
        """Top-N candidates. Default Foundation + SR Legacy (lab-analysed data);
        pass types="Branded" only for foods SR lacks (gochujang, harissa) --
        branded entries are manufacturer labels and far noisier."""
        k = f"{query.lower().strip()}|{n}|{types}"
        if k not in self.cache["search"]:
            d = self._get(
                "/foods/search",
                {"query": query, "dataType": types, "pageSize": n},
            )
            self.cache["search"][k] = [
                {"fdc_id": f["fdcId"], "description": f["description"], "data_type": f["dataType"]}
                for f in d.get("foods", [])
            ]
            self.dirty = True
        return self.cache["search"][k]

    def food(self, fdc_id):
        k = str(fdc_id)
        if k not in self.cache["food"]:
            d = self._get(f"/food/{fdc_id}", {})
            self.cache["food"][k] = trim_food(d)
            self.dirty = True
        return self.cache["food"][k]


def trim_food(d):
    by_num = {}
    for fn in d.get("foodNutrients", []):
        nut = fn.get("nutrient") or {}
        if nut.get("number") is not None and fn.get("amount") is not None:
            by_num[str(nut["number"])] = fn["amount"]
    per100 = {}
    for key, nums in NUTRIENTS.items():
        for n in nums:
            if n in by_num:
                per100[key] = by_num[n]
                break
    portions = []
    for p in d.get("foodPortions", []):
        g = p.get("gramWeight")
        if not g:
            continue
        unit = (p.get("measureUnit") or {}).get("name") or ""
        portions.append(
            {
                "amount": p.get("amount") or 1,
                "unit": "" if unit == "undetermined" else unit,
                "modifier": p.get("modifier") or "",
                "description": p.get("portionDescription") or "",
                "grams": g,
            }
        )
    return {
        "fdc_id": d["fdcId"],
        "description": d.get("description"),
        "data_type": d.get("dataType"),
        "per100g": per100,
        "portions": portions,
    }
