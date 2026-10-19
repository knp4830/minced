"""Reads the curated mapping files and validates them against the USDA bulk data.

Files in scripts/nutrition/mapping/*.tsv (tab separated, first column = kind):
  food     ingredient  form  fdc_id  conf  note       -> ingredient_foods row (form 'default' = the default food)
  alt      ingredient  form  fdc_id  conf  note        -> an extra food linked to the ingredient (is_default = false)
  density  ingredient  g_per_ml  source  conf  note   -> ingredients.density_g_per_ml (only where it is NULL)
  portion  ingredient  unit  grams  source  conf  note  [form] -> ingredient_portions row (source: usda|curated|us_can_size|label)
  skip     ingredient  reason                          -> deliberately left unmapped (listed in the review CSV)
  same     ingredient  as_ingredient  conf  note      -> copy every form of another ingredient (generic 'rice' follows 'white rice')
The 275 mappings already in ingredient-map.json are migrated automatically (conf 'E' = existing, curated in M1.5.4).

    python -I scripts/nutrition/mapping.py          # validate + print every NEW mapping with its USDA description
    python -I scripts/nutrition/mapping.py --stats
"""
import csv
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usda_bulk as ub  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MAP_DIR = os.path.join(HERE, "mapping")
EXISTING = os.path.join(HERE, "ingredient-map.json")
BRANDED_CACHE = os.path.join(HERE, "cache", "fdc-branded.json")


def read_tsv(path):
    with open(path, encoding="utf-8", newline="") as f:
        for i, row in enumerate(csv.reader(f, delimiter="\t")):
            if i == 0 or not row or row[0].startswith("#"):
                continue
            yield row


def load():
    """-> dict(foods=[(ing, form, fdc, conf, note, src)], densities, portions, skips)"""
    out = {"foods": [], "alts": [], "densities": [], "portions": [], "skips": [], "sames": []}
    for path in sorted(glob.glob(os.path.join(MAP_DIR, "*.tsv"))):
        fn = os.path.basename(path)
        for row in read_tsv(path):
            kind = row[0]
            if kind == "food":
                out["foods"].append((row[1], row[2], int(row[3]), row[4], row[5] if len(row) > 5 else "", fn))
            elif kind == "alt":  # an additional food linked to the ingredient (is_default = false)
                out["alts"].append((row[1], row[2], int(row[3]), row[4], row[5] if len(row) > 5 else "", fn))
            elif kind == "density":
                out["densities"].append((row[1], float(row[2]), row[3], row[4], row[5] if len(row) > 5 else "", fn))
            elif kind == "portion":
                out["portions"].append((row[1], row[2], float(row[3]), row[4], row[5], row[6] if len(row) > 6 else "", row[7] if len(row) > 7 and row[7] else "default", fn))
            elif kind == "skip":
                out["skips"].append((row[1], row[2], fn))
            elif kind == "same":
                out["sames"].append((row[1], row[2], row[3], row[4] if len(row) > 4 else "", fn))
            else:
                raise SystemExit(f"{fn}: unknown kind {kind!r}: {row}")
    return out


def existing_map():
    m = json.load(open(EXISTING, encoding="utf-8"))
    return {k: v for k, v in m.items() if not k.startswith("_")}


def branded_cache():
    if os.path.exists(BRANDED_CACHE):
        return {int(k): v for k, v in json.load(open(BRANDED_CACHE, encoding="utf-8")).items()}
    return {}


def main():
    stats = "--stats" in sys.argv
    foods = ub.load_all(("sr", "foundation", "fndds"))
    br = branded_cache()
    ings = {i["name"]: i for i in json.load(open(os.path.join(ub.BULK, "ings.json"), encoding="utf-8"))}
    data = load()
    bad = 0
    seen = {}
    for ing, form, fdc, conf, note, fn in data["foods"]:
        if ing not in ings:
            print(f"!! {fn}: unknown ingredient {ing!r}")
            bad += 1
        f = foods.get(fdc) or br.get(fdc)
        if f is None:
            print(f"!! {fn}: {ing} [{form}] fdc {fdc} not found in SR/Foundation/FNDDS/branded cache")
            bad += 1
            continue
        key = (ing, form)
        if key in seen:
            print(f"!! duplicate {key} in {fn} and {seen[key]}")
            bad += 1
        seen[key] = fn
        if not stats:
            n = len(f.get("nutrients", {})) if "nutrients" in f else "?"
            print(f"{ing:28} [{form:8}] {conf} {fdc} {f['description'][:70]} | n={n}")
    for ing, g, src, conf, note, fn in data["densities"]:
        if ing not in ings:
            print(f"!! {fn}: density for unknown ingredient {ing!r}")
            bad += 1
    units = {"g", "kg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "fl oz", "pt", "qt", "gal", "clove", "head", "stalk", "fillet", "can", "bunch", "piece", "portion", "slice", "each"}
    for ing, unit, g, src, conf, note, pform, fn in data["portions"]:
        if ing not in ings or unit not in units:
            print(f"!! {fn}: portion {ing!r} {unit!r}")
            bad += 1
    for ing, other, conf, note, fn in data["sames"]:
        if ing not in ings or other not in ings:
            print(f"!! {fn}: same {ing!r} -> {other!r}: unknown ingredient")
            bad += 1
    old = existing_map()
    print(f"\nnew food rows: {len(data['foods'])}, ingredients newly mapped: {len({a for a,b,*_ in data['foods'] if b=='default'})}, existing migrated: {len(old)}, problems: {bad}")
    return bad


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
