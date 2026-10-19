"""Normalise two national food-composition tables into our nutrient keys, per 100 g (wave 10c).

    UK  McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID) 2021, Public Health England.
        Licence: Open Government Licence v3.0 (see LICENCES.md).
    CA  Canadian Nutrient File (CNF) 2026, Health Canada.
        Licence: Open Government Licence - Canada (see LICENCES.md).

    python -I scripts/nutrition/national/load_national.py            # downloads once into cache/ (gitignored), writes cache/national-foods.json
    python -I scripts/nutrition/national/load_national.py --search 'regex' [cofid|cnf]

Rules (every one is a conversion of a published number, never a guess):
  * Only nutrients we store. An absent value stays absent ("not reported"); CoFID 'N' (no reliable data) and blanks are absent.
  * CoFID 'Tr' (trace, below the quantification limit) is stored as 0.
  * CoFID carbohydrate is AVAILABLE carbohydrate (monosaccharide equivalents) and excludes fibre; ours is total carbohydrate by
    difference. carbs_g is stored only when AOAC fibre (the US-comparable method) is published: carbs = CHO + AOAC fibre.
    NSP fibre (Englyst) is a different, lower method and is never stored as fiber_g.
  * CoFID vitamin A is retinol equivalents (carotene / 6); ours is RAE (carotene / 12): RAE = retinol + carotene / 12.
  * CNF uses USDA nutrient numbers, so it maps by nutrients.fdc_number.
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from xlsx_min import read_xlsx  # noqa: E402

CACHE = os.path.join(HERE, "cache")
COFID_URL = "https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx"
CNF_URL = ("https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/"
           "019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip")

# CNF Nutrient_Code (USDA number) -> our nutrients.key
CNF_MAP = {
    "208": "energy_kcal", "203": "protein_g", "205": "carbs_g", "291": "fiber_g", "269": "sugars_g", "204": "fat_g",
    "606": "sat_fat_g", "605": "trans_fat_g", "645": "mono_fat_g", "646": "poly_fat_g", "601": "cholesterol_mg",
    "307": "sodium_mg", "306": "potassium_mg", "301": "calcium_mg", "303": "iron_mg", "304": "magnesium_mg", "309": "zinc_mg",
    "305": "phosphorus_mg", "317": "selenium_mcg", "312": "copper_mg", "315": "manganese_mg", "320": "vitamin_a_mcg_rae",
    "401": "vitamin_c_mg", "328": "vitamin_d_mcg", "323": "vitamin_e_mg", "430": "vitamin_k_mcg", "404": "thiamin_mg",
    "405": "riboflavin_mg", "406": "niacin_mg", "415": "vitamin_b6_mg", "435": "folate_mcg_dfe", "418": "vitamin_b12_mcg",
    "410": "pantothenic_mg", "421": "choline_mg",
}
# CoFID tag (row 2 of each sheet) -> our key (direct, same units)
COFID_MAP = {
    "KCALS": "energy_kcal", "PROT": "protein_g", "FAT": "fat_g", "TOTSUG": "sugars_g", "SATFOD": "sat_fat_g",
    "MONOFOD": "mono_fat_g", "POLYFOD": "poly_fat_g", "NA": "sodium_mg", "K": "potassium_mg", "CA": "calcium_mg",
    "MG": "magnesium_mg", "P": "phosphorus_mg", "FE": "iron_mg", "CU": "copper_mg", "ZN": "zinc_mg", "MN": "manganese_mg",
    "SE": "selenium_mcg", "VITC": "vitamin_c_mg", "VITD": "vitamin_d_mcg", "VITE": "vitamin_e_mg", "VITK1": "vitamin_k_mcg",
    "THIA": "thiamin_mg", "RIBO": "riboflavin_mg", "NIAC": "niacin_mg", "VITB6": "vitamin_b6_mg", "FOLT": "folate_mcg_dfe",
    "VITB12": "vitamin_b12_mcg", "PANTO": "pantothenic_mg",
}
ID_BASE = {"cofid": 910_000_000, "cnf": 900_000_000}


def download(url, path):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())


def num(v):
    """CoFID cell -> float | None. 'Tr' -> 0.0, 'N' / blank -> None, '(1.2)' (estimated) -> 1.2."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "N", "n", "-"):
        return None
    if s.lower() in ("tr", "trace"):
        return 0.0
    s = s.strip("()[] ")
    try:
        x = float(s)
    except ValueError:
        return None
    return x if x >= 0 else None


def load_cofid():
    path = os.path.join(CACHE, "cofid2021.xlsx")
    download(COFID_URL, path)
    sheets = read_xlsx(path)
    foods = {}
    for name, rows in sheets.items():
        if not name.startswith("1.") or len(rows) < 4 or name in ("1.1 Notes", "1.2 Factors"):
            continue
        tags = rows[1]
        for r in rows[3:]:
            code = (r[0] or "").strip() if r else ""
            if not re.match(r"^\d+-\d+$", code):
                continue
            f = foods.setdefault(code, {"src": "cofid", "code": code, "name": (r[1] or "").strip(), "desc": (r[2] or "").strip(),
                                        "group": (r[3] or "").strip(), "raw": {}})
            for i, tag in enumerate(tags):
                if tag and i >= 7 and i < len(r):
                    f["raw"][tag] = r[i]
    out = []
    for code, f in foods.items():
        raw, nut = f.pop("raw"), {}
        for tag, key in COFID_MAP.items():
            v = num(raw.get(tag))
            if v is not None:
                nut[key] = v
        aoac, cho = num(raw.get("AOACFIB")), num(raw.get("CHO"))
        if aoac is not None:
            nut["fiber_g"] = aoac
            if cho is not None:
                nut["carbs_g"] = round(cho + aoac, 3)
        ret, car = num(raw.get("RET")), num(raw.get("CAREQU"))
        if ret is not None and car is not None:
            nut["vitamin_a_mcg_rae"] = round(ret + car / 12.0, 3)
        f["nut"] = nut
        f["water_g"] = num(raw.get("WATER"))
        n = code.split("-")
        f["fdc_id"] = ID_BASE["cofid"] + int(n[0]) * 10000 + int(n[1])
        out.append(f)
    return out


def load_cnf():
    path = os.path.join(CACHE, "cnf2026.zip")
    download(CNF_URL, path)
    z = zipfile.ZipFile(path)

    def rows(name):
        return list(csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig", newline="")))

    groups = {r["CNF_Food_Group_Code"]: r["CNF_Food_Group_Description_EN"] for r in rows("CNF_Food_Group.csv")}
    srcs = {r["Food_Source_Code"]: r["Food_Source_Description_EN"] for r in rows("Food_Source.csv")}
    foods = {}
    for r in rows("Food_Name.csv"):
        foods[r["Food_Code"]] = {
            "src": "cnf", "code": r["Food_Code"], "name": r["Food_Description_EN"].strip(), "desc": (r["Comment_EN"] or "").strip(),
            "alt": (r["Alternate_Description_EN"] or "").strip(), "group": groups.get(r["CNF_Food_Group_Code"], ""),
            "usda_ndb": r["USDA_NDB_Code"], "basis": srcs.get(r["Food_Source_Code"], ""), "nut": {},
            "fdc_id": ID_BASE["cnf"] + int(r["Food_Code"])}
    for r in rows("Nutrient_Amount.csv"):
        key = CNF_MAP.get(r["Nutrient_Code"])
        f = foods.get(r["Food_Code"])
        if key and f and r["Nutrient_Amount"] not in ("", None):
            v = float(r["Nutrient_Amount"])
            if v >= 0:
                f["nut"][key] = v
        if r["Nutrient_Code"] == "255" and f and r["Nutrient_Amount"]:
            f["water_g"] = float(r["Nutrient_Amount"])
    return list(foods.values())


def main():
    out = os.path.join(CACHE, "national-foods.json")
    if len(sys.argv) > 1 and sys.argv[1] == "--search":
        foods = json.load(open(out, encoding="utf-8"))
        rx = re.compile(sys.argv[2], re.I)
        which = sys.argv[3] if len(sys.argv) > 3 else None
        for f in foods:
            if which and f["src"] != which:
                continue
            if rx.search(f["name"] + " " + f.get("alt", "")):
                n = f["nut"]
                print(f["src"], f["code"], "|", f["name"][:70], "|", f["desc"][:30], "|", "kcal", n.get("energy_kcal"), "P", n.get("protein_g"),
                      "F", n.get("fat_g"), "C", n.get("carbs_g"), "na", n.get("sodium_mg"), "n=%d" % len(n), "|", f["group"][:18])
        return
    foods = load_cofid() + load_cnf()
    json.dump(foods, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    for s in ("cofid", "cnf"):
        print(s, sum(1 for f in foods if f["src"] == s), "foods")


if __name__ == "__main__":
    main()
