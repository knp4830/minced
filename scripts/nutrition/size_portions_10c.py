#!/usr/bin/env python3
"""Wave 10c: USDA household portions for size words (small / medium / large), one polite API call per food.

    python3 scripts/nutrition/size_portions_10c.py > scripts/nutrition/review/size-portions-raw-10c.csv

For each (ingredient, fdc_id) below it lists every FoodData Central portion whose description contains a size word, with its
gram weight. A human then picks the rows that mean "one whole item" and writes the ratio into size-factors-10c.csv:
factor = size grams / medium grams, applied to the ingredient's own each-weight. Nothing is guessed: a size USDA does not
publish for a food stays at 1.0 and the line is counted as the medium item.

Needs USDA_FDC_API_KEY (environment or .env.local). One request per second; the key is never printed.
"""
import csv
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fdc import load_api_key  # noqa: E402

FOODS = [  # ingredient, default food (SR Legacy)
    ("yellow onion", 170000), ("apple", 171688), ("egg", 171287), ("carrot", 170393), ("green bell pepper", 170427),
    ("russet potato", 170027), ("banana", 173944), ("tomato", 170457), ("red bell pepper", 170108), ("celery", 169988),
    ("cucumber", 168409), ("sweet potato", 168482), ("zucchini", 169291), ("orange", 169097), ("pear", 169118),
    ("red potato", 170029), ("cauliflower", 169986), ("garlic", 169230), ("cherry tomato", 170457), ("summer squash", 170487),
    ("egg whites", 172183), ("eggplant", 169228), ("jalapeno", 168576), ("peach", 169928), ("lemon", 167746),
    ("avocado", 171705), ("plantain", 168215), ("flour tortillas", 175037), ("butternut squash", 169295),
]
SIZE = ("small", "medium", "large", "extra large", "jumbo", "extra-large")


def get(fdc_id, key):
    url = f"https://api.nal.usda.gov/fdc/v1/food/{fdc_id}?api_key={key}"
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def main():
    key = load_api_key()
    if not key:
        sys.exit("USDA_FDC_API_KEY not set")
    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow(["ingredient", "fdc_id", "description", "portion", "gram_weight"])
    seen = {}
    for ing, fdc in FOODS:
        if fdc not in seen:
            try:
                seen[fdc] = get(fdc, key)
            except Exception as e:  # noqa: BLE001
                print(f"# {ing} {fdc}: {type(e).__name__}", file=sys.stderr)
                seen[fdc] = {}
            time.sleep(1.0)
        d = seen[fdc]
        for p in d.get("foodPortions") or []:
            text = " ".join(str(x) for x in (p.get("amount"), (p.get("measureUnit") or {}).get("name"), p.get("modifier"), p.get("portionDescription")) if x)
            if any(s in text.lower() for s in SIZE):
                w.writerow([ing, fdc, d.get("description", ""), text, p.get("gramWeight")])


if __name__ == "__main__":
    main()
