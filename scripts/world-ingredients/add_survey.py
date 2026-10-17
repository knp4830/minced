"""Append FNDDS (survey) foods and nutrients to the scratch tables. FNDDS = USDA Food and Nutrient
Database for Dietary Studies, part of FoodData Central, CC0. Run after load_scratch.sh:
  python -I add_survey.py   (needs the container up; uses docker exec psql)"""
import csv
import glob
import io
import os
import subprocess

csv.field_size_limit(1 << 30)
HERE = os.path.dirname(os.path.abspath(__file__))
base = glob.glob(os.path.join(HERE, "cache", "survey", "FoodData_Central_*"))[0]
WANT = {1008, 2047, 2048, 1003, 1004, 1005, 1079, 2000, 1093, 1253, 1258, 1087, 1089, 1090, 1092, 1095, 1106, 1114,
        1109, 1185, 1175, 1178, 1162, 1190, 1235}
CT = os.environ.get("W10_CONTAINER", "w10-world-db")


def copy(table, buf):
    p = subprocess.run(["docker", "exec", "-i", CT, "psql", "-U", "postgres", "-d", "fdc", "-q", "-c",
                        "\\copy %s from stdin csv" % table], input=buf.getvalue().encode("utf-8"), capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr.decode())


foods, nut = io.StringIO(), io.StringIO()
fw, nw = csv.writer(foods, lineterminator=chr(10)), csv.writer(nut, lineterminator=chr(10))
keep = set()
for r in csv.DictReader(open(os.path.join(base, "food.csv"), encoding="utf-8", newline="")):
    if r["data_type"] == "survey_fndds_food":
        keep.add(r["fdc_id"])
        fw.writerow([r["fdc_id"], "fndds", r["description"], r["food_category_id"], r["publication_date"]])
for r in csv.DictReader(open(os.path.join(base, "food_nutrient.csv"), encoding="utf-8", newline="")):
    if r["fdc_id"] in keep and int(r["nutrient_id"]) in WANT:
        nw.writerow([r["fdc_id"], r["nutrient_id"], r["amount"]])
subprocess.run(["docker", "exec", "-i", CT, "psql", "-U", "postgres", "-d", "fdc", "-q", "-c",
                "delete from nut where fdc_id in (select fdc_id from foods where data_type='fndds'); delete from foods where data_type='fndds'"])
copy("foods", foods)
copy("nut", nut)
print("fndds foods", len(keep))
