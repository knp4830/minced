"""Loader for the official USDA FoodData Central bulk CSVs (SR Legacy, Foundation, FNDDS).

Everything here is offline and CC0. Run `python -I scripts/nutrition/download_bulk.py`
first. Nothing in this module touches a database.

Nutrient ids are the 4-digit `nutrient.id` used by food_nutrient.csv (NOT the 3-digit
`nutrient_nbr` the web API calls "number"; mixing them is the classic bug).
"""
import csv
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
BULK = os.path.join(HERE, "bulk")

# contract nutrient id -> (key, unit). Keys match the `nutrients.key` plan (section 3.1).
NUTRIENTS = {
    1008: ("energy_kcal", "kcal"),
    1003: ("protein_g", "g"),
    1005: ("carbs_g", "g"),
    1004: ("fat_g", "g"),
    1079: ("fiber_g", "g"),
    2000: ("sugars_g", "g"),
    1235: ("added_sugars_g", "g"),
    1093: ("sodium_mg", "mg"),
    1253: ("cholesterol_mg", "mg"),
    1258: ("saturated_fat_g", "g"),
    1087: ("calcium_mg", "mg"),
    1089: ("iron_mg", "mg"),
    1090: ("magnesium_mg", "mg"),
    1092: ("potassium_mg", "mg"),
    1095: ("zinc_mg", "mg"),
    1106: ("vitamin_a_mcg", "mcg"),
    1162: ("vitamin_c_mg", "mg"),
    1114: ("vitamin_d_mcg", "mcg"),
    1109: ("vitamin_e_mg", "mg"),
    1185: ("vitamin_k_mcg", "mcg"),
    1175: ("vitamin_b6_mg", "mg"),
    1178: ("vitamin_b12_mcg", "mcg"),
    1190: ("folate_mcg", "mcg"),
    1257: ("trans_fat_g", "g"),
    1292: ("mono_fat_g", "g"),
    1293: ("poly_fat_g", "g"),
    1091: ("phosphorus_mg", "mg"),
    1103: ("selenium_mcg", "mcg"),
    1098: ("copper_mg", "mg"),
    1101: ("manganese_mg", "mg"),
    1165: ("thiamin_mg", "mg"),
    1166: ("riboflavin_mg", "mg"),
    1167: ("niacin_mg", "mg"),
    1170: ("pantothenic_mg", "mg"),
    1180: ("choline_mg", "mg"),
}
# Source-only ("hidden") nutrients that the schema's nutrient_conversions turn into the contract rows at
# read time: vitamin D IU x 0.025 -> mcg, Atwater energy -> kcal. They are loaded RAW; the seed never converts.
HIDDEN = {1110: "vitamin_d_iu", 2048: "energy_atwater_specific", 2047: "energy_atwater_general"}
ENERGY_FALLBACKS = (2047, 2048)  # Atwater general / specific (Foundation reports these)
VITD_IU = 1110  # vitamin D in IU: / 40 = mcg when 1114 is absent
WANTED = set(NUTRIENTS) | set(HIDDEN)

DATASETS = {
    "sr": ("sr_legacy", "sr_legacy_food"),
    "foundation": ("foundation", "foundation_food"),
    "fndds": ("fndds", "survey_fndds_food"),
}


def _rows(path):
    with open(path, encoding="utf-8", newline="") as f:
        yield from csv.DictReader(f)


def load_dataset(key):
    """-> dict fdc_id -> {fdc_id, description, data_type, publication_date, nutrients{id: amount}, portions[...]}"""
    dtype, raw_type = DATASETS[key]
    d = os.path.join(BULK, key)
    foods = {}
    for r in _rows(os.path.join(d, "food.csv")):
        if r["data_type"] == raw_type:
            foods[int(r["fdc_id"])] = {
                "fdc_id": int(r["fdc_id"]),
                "description": r["description"].strip(),
                "data_type": dtype,
                "publication_date": r["publication_date"] or None,
                "nutrients": {},
                "portions": [],
            }
    for r in _rows(os.path.join(d, "food_nutrient.csv")):
        fid = int(r["fdc_id"])
        f = foods.get(fid)
        if f is None or r["amount"] == "":
            continue
        nid = int(r["nutrient_id"])
        if nid in WANTED:
            f["nutrients"][nid] = float(r["amount"])
    units = {r["id"]: r["name"] for r in _rows(os.path.join(d, "measure_unit.csv"))}
    for r in _rows(os.path.join(d, "food_portion.csv")):
        f = foods.get(int(r["fdc_id"])) if r["fdc_id"] else None
        if f is None or not r["gram_weight"]:
            continue
        u = units.get(r["measure_unit_id"], "")
        f["portions"].append(
            {
                "amount": float(r["amount"] or 1),
                "unit": "" if u in ("undetermined", "") else u,
                "modifier": r["modifier"] or "",
                "description": r["portion_description"] or "",
                "grams": float(r["gram_weight"]),
            }
        )
    return foods  # nutrients stay RAW (hidden source rows included); normalise() is for display math only


def normalise(n):
    """Collapse the raw nutrient map to the contract ids. Energy falls back to Atwater;
    vitamin D falls back to IU/40. A nutrient not reported stays ABSENT (never 0)."""
    out = {k: v for k, v in n.items() if k in NUTRIENTS}
    if 1008 not in out:
        for alt in ENERGY_FALLBACKS:
            if alt in n:
                out[1008] = n[alt]
                break
    if 1114 not in out and VITD_IU in n:
        out[1114] = round(n[VITD_IU] / 40.0, 3)
    return out


def load_all(keys=("sr", "foundation")):
    foods = {}
    for k in keys:
        foods.update(load_dataset(k))
    return foods


# ----------------------------------------------------------------- search
_STOP = {"and", "or", "with", "without", "the", "of", "in", "for", "a", "an", "to"}


def stem(w):
    w = w.lower()
    for suf in ("ies", "es", "s"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def tokens(text):
    return [stem(t) for t in re.findall(r"[a-z]+", text.lower()) if t not in _STOP]


def score(query, desc, data_type):
    """Rank a USDA description for a cook's ingredient name. USDA names run
    'Category, food, state', so the head noun in the first two segments counts most."""
    q = tokens(query)
    if not q:
        return -99
    segs = [tokens(s) for s in desc.split(",")]
    flat = [t for s in segs for t in s]
    head = q[-1]
    sc = 0.0
    if any(head in s for s in segs[:2]):
        sc += 4
    elif head in flat:
        sc += 1
    sc += 2.0 * sum(1 for t in q[:-1] if t in flat)
    if len(q) > 1 and all(t in flat for t in q):
        sc += 2
    sc -= 0.6 * max(0, len(segs) - 3)
    if "raw" in desc.lower():
        sc += 1
    if segs and segs[0] and segs[0][0] not in q and head not in segs[0]:
        sc -= 1
    extra = [t for t in flat if t not in q]
    sc -= 0.15 * len(extra)
    if data_type == "foundation":
        sc += 0.3
    low = desc.lower()
    if "babyfood" in low or "fast foods" in low or "restaurant" in low:
        sc -= 3
    if re.search(r"\b[A-Z]{3,}\b", desc):  # brand names in SR are upper-case (SILK, BREYERS)
        sc -= 2
    if all(t in flat for t in q) and len(segs[0]) <= len(q) + 1:
        sc += 1.5  # the first segment is essentially the query
    return sc
