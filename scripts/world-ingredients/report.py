"""Counts per cuisine/region and per category for the new ingredients, plus nutrition coverage and brand-food stats.
Reads review/new-ingredients.csv and review/brand-foods.csv (written by emit_sql.py); writes review/summary-by-region.csv and
review/summary-by-category.csv. Run: python -I scripts/world-ingredients/report.py"""
import csv
import os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "review")
NAMES = {"EA": "East Asia", "SEA": "Southeast Asia", "SA": "South Asia", "ME": "Middle East", "CA": "Central Asia and Caucasus",
         "NAF": "North Africa", "WAF": "West Africa", "EAF": "East Africa", "SAF": "Southern Africa", "LAT": "Latin America",
         "CAR": "Caribbean", "EUM": "Mediterranean Europe", "EUW": "Western Europe and British Isles", "EUN": "Nordic",
         "EUE": "Eastern Europe and Balkans", "PAC": "Pacific and Oceania", "IND": "Indigenous Americas",
         "NAM": "North America", "GLO": "Global staples"}
rows = list(csv.DictReader(open(os.path.join(R, "new-ingredients.csv"), encoding="utf-8")))
brands = list(csv.DictReader(open(os.path.join(R, "brand-foods.csv"), encoding="utf-8")))
reg = defaultdict(lambda: Counter())
cat = defaultdict(lambda: Counter())
for r in rows:
    has = 1 if r["fdc_id"] else 0
    for code in [c for c in r["regions"].split(";") if c]:
        reg[code]["ingredients"] += 1
        reg[code]["with_nutrition"] += has
    key = (r["aisle"], r["filter_group"] or "(none)")
    cat[key]["ingredients"] += 1
    cat[key]["with_nutrition"] += has
with open(os.path.join(R, "summary-by-region.csv"), "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["region_code", "region", "new_ingredients", "with_nutrition", "no_nutrition"])
    for code, c in sorted(reg.items(), key=lambda kv: -kv[1]["ingredients"]):
        w.writerow([code, NAMES[code], c["ingredients"], c["with_nutrition"], c["ingredients"] - c["with_nutrition"]])
with open(os.path.join(R, "summary-by-category.csv"), "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["aisle", "filter_group", "new_ingredients", "with_nutrition", "no_nutrition"])
    for (a, g), c in sorted(cat.items()):
        w.writerow([a, g, c["ingredients"], c["with_nutrition"], c["ingredients"] - c["with_nutrition"]])
print("new ingredients:", len(rows), "with nutrition:", sum(1 for r in rows if r["fdc_id"]))
print("by region (an ingredient can count in several):")
for code, c in sorted(reg.items(), key=lambda kv: -kv[1]["ingredients"]):
    print("  %-4s %-34s %4d  (nutrition %d)" % (code, NAMES[code], c["ingredients"], c["with_nutrition"]))
print("by aisle:", dict(Counter(r["aisle"] for r in rows)))
print("by filter_group:", dict(Counter(r["filter_group"] or "(none)" for r in rows)))
print("source:", dict(Counter(r["source"] for r in rows)))
print("match:", dict(Counter(r["match_type"] for r in rows)))
print("brand foods:", len(brands), "| distinct brands:", len({(b["brand_name"] or b["brand_owner"]).lower() for b in brands}),
      "| ingredients with brand foods:", len({b["ingredient"] for b in brands}))
print("brand foods by form:", dict(Counter(b["form"] for b in brands)))
