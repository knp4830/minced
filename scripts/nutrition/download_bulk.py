"""Download the official USDA FoodData Central bulk CSVs into the gitignored bulk/ cache.

SR Legacy (2018, final), Foundation Foods, FNDDS (survey) are CC0 / public domain.
Idempotent: skips files already extracted. Branded Foods (gigabytes) is NOT downloaded.
"""
import os
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
BULK = os.path.join(HERE, "bulk")
BASE = "https://fdc.nal.usda.gov/fdc-datasets/"
SETS = {
    "sr": "FoodData_Central_sr_legacy_food_csv_2018-04.zip",
    "foundation": "FoodData_Central_foundation_food_csv_2025-12-18.zip",
    "fndds": "FoodData_Central_survey_food_csv_2024-10-31.zip",
}


def main():
    os.makedirs(BULK, exist_ok=True)
    for key, name in SETS.items():
        out = os.path.join(BULK, key)
        if os.path.exists(os.path.join(out, "food.csv")):
            print(key, "already extracted")
            continue
        zpath = os.path.join(BULK, key + ".zip")
        if not os.path.exists(zpath):
            print("downloading", name)
            urllib.request.urlretrieve(BASE + name, zpath)
        os.makedirs(out, exist_ok=True)
        with zipfile.ZipFile(zpath) as z:
            for m in z.namelist():
                if m.endswith(".csv"):
                    # flatten any folder inside the zip
                    with z.open(m) as src, open(os.path.join(out, os.path.basename(m)), "wb") as dst:
                        dst.write(src.read())
        print(key, "extracted")


if __name__ == "__main__":
    main()
