"""Stream the FDC bulk CSVs (SR Legacy, Foundation, Branded) into compact CSVs
holding only what this lane needs. Run with `python -I`. Data: USDA FoodData
Central, CC0 (public domain). The raw zips live in the gitignored cache/.

Outputs (cache/compact/): foods.csv, branded.csv, nutrients.csv, portions.csv
Branded foods are filtered to the US market with a usable serving size in g/ml.
"""
import csv, glob, os, sys
csv.field_size_limit(1 << 30)
HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, "cache")
OUT = os.path.join(C, "compact")
os.makedirs(OUT, exist_ok=True)

# FDC 4-digit nutrient_id (what food_nutrient.csv uses) -> our key.
WANT = {
    1008: "kcal", 2047: "kcal_atwater_gen", 2048: "kcal_atwater_spec",
    1003: "protein", 1004: "fat", 1005: "carbs", 1079: "fiber", 2000: "sugars",
    1093: "sodium", 1253: "cholesterol", 1258: "sat_fat", 1087: "calcium",
    1089: "iron", 1090: "magnesium", 1092: "potassium", 1095: "zinc",
    1106: "vit_a_rae", 1114: "vit_d_mcg", 1109: "vit_e", 1185: "vit_k",
    1175: "vit_b6", 1178: "vit_b12", 1162: "vit_c", 1190: "folate_dfe",
    1235: "added_sugars",
}


def d(prefix):
    return glob.glob(os.path.join(C, prefix, "FoodData_Central_*"))[0]


def rows(path):
    with open(path, encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f)


def writer(name):
    return csv.writer(open(os.path.join(OUT, name), "w", encoding="utf-8", newline=""))


def main():
    foods, brand, nut, por = writer("foods.csv"), writer("branded.csv"), writer("nutrients.csv"), writer("portions.csv")
    for ds, dt in (("sr", "sr_legacy"), ("foundation", "foundation")):
        base = d(ds)
        keep = set()
        for r in rows(os.path.join(base, "food.csv")):
            if r["data_type"] in ("sr_legacy_food", "foundation_food"):
                keep.add(r["fdc_id"])
                foods.writerow([r["fdc_id"], dt, r["description"], r["food_category_id"], r["publication_date"]])
        for r in rows(os.path.join(base, "food_nutrient.csv")):
            if r["fdc_id"] in keep and int(r["nutrient_id"]) in WANT:
                nut.writerow([r["fdc_id"], r["nutrient_id"], r["amount"]])
        mu = {r["id"]: r["name"] for r in rows(os.path.join(base, "measure_unit.csv"))}
        for r in rows(os.path.join(base, "food_portion.csv")):
            if r["fdc_id"] in keep and r["gram_weight"]:
                por.writerow([r["fdc_id"], r["amount"], mu.get(r["measure_unit_id"], ""), r["modifier"],
                              r["portion_description"], r["gram_weight"]])
        print(ds, len(keep), file=sys.stderr)
    base = d("branded")
    keep = {}
    for r in rows(os.path.join(base, "branded_food.csv")):
        if r["market_country"] and r["market_country"] != "United States":
            continue
        try:
            ss = float(r["serving_size"])
        except ValueError:
            continue
        if ss <= 0 or r["serving_size_unit"].lower() not in ("g", "ml", "grm", "mlt"):
            continue
        keep[r["fdc_id"]] = r
    print("branded candidates", len(keep), file=sys.stderr)
    for r in rows(os.path.join(base, "food.csv")):
        b = keep.get(r["fdc_id"])
        if b is None or r["data_type"] != "branded_food":
            continue
        brand.writerow([r["fdc_id"], r["description"], r["publication_date"], b["brand_owner"], b["brand_name"],
                        b["subbrand_name"], b["gtin_upc"], b["serving_size"], b["serving_size_unit"],
                        b["household_serving_fulltext"], b["branded_food_category"], b["ingredients"][:400]])
    n = 0
    for r in rows(os.path.join(base, "food_nutrient.csv")):
        if r["fdc_id"] in keep and int(r["nutrient_id"]) in WANT:
            nut.writerow([r["fdc_id"], r["nutrient_id"], r["amount"]])
            n += 1
    print("branded nutrient rows", n, file=sys.stderr)


main()
