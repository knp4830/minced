#!/usr/bin/env python3
"""Polite FoodData Central lookup for new-ingredient nutrition (never prints the key).

    python -I scripts/originals/fdc_search.py "chunjang" [Branded|SR Legacy|Foundation] [pageSize]
    python -I scripts/originals/fdc_search.py --food 1234567        # nutrient table for one fdcId
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
key = None
for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
    if line.startswith("USDA_FDC_API_KEY="):
        key = line.split("=", 1)[1].strip().strip('"')
if not key:
    sys.exit("no USDA_FDC_API_KEY in .env.local")


def get(path: str, **params) -> dict:
    params["api_key"] = key
    url = "https://api.nal.usda.gov/fdc/v1/" + path + "?" + urllib.parse.urlencode(params)
    time.sleep(1.0)  # polite
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


if sys.argv[1] == "--raw":
    print(json.dumps(get(f"food/{sys.argv[2]}")))
elif sys.argv[1] == "--food":
    d = get(f"food/{sys.argv[2]}")
    print(d.get("fdcId"), d.get("description"), d.get("brandOwner"), d.get("brandedFoodCategory"), d.get("servingSize"), d.get("servingSizeUnit"), d.get("householdServingFullText"))
    print("ingredients:", (d.get("ingredients") or "")[:300])
    for n in d.get("foodNutrients", []):
        nu = n.get("nutrient", {})
        print(f"  {nu.get('number'):>5} {nu.get('name')}: {n.get('amount')} {nu.get('unitName')}")
else:
    q = sys.argv[1]
    dt = sys.argv[2] if len(sys.argv) > 2 else "Branded"
    size = int(sys.argv[3]) if len(sys.argv) > 3 else 15
    d = get("foods/search", query=q, dataType=dt, pageSize=size)
    print("hits", d.get("totalHits"))
    for f in d.get("foods", []):
        print(f["fdcId"], "|", f["description"], "|", f.get("brandOwner"), "|", f.get("servingSize"), f.get("servingSizeUnit"), "|", f.get("marketCountry"), f.get("publishedDate"))
