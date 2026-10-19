"""Print USDA candidate foods for canonical ingredients, for a human/LLM curator to choose from.

    python -I scripts/nutrition/candidates.py --unmapped [--start 0 --count 30] [--top 8]
    python -I scripts/nutrition/candidates.py --names "milk,margarine"

Reads scripts/nutrition/bulk/ings.json (from the database) and the bulk CSVs. Offline.
The output is a menu, not a decision: nothing here is written anywhere.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import usda_bulk as ub  # noqa: E402


def portion_summary(f, n=5):
    seen, out = set(), []
    for p in f["portions"]:
        lab = (p["modifier"] or p["description"] or p["unit"]).strip()
        s = f"{p['amount']:g} {p['unit']} {lab}".replace("  ", " ").strip()
        if s in seen:
            continue
        seen.add(s)
        out.append(f"{s}={p['grams']:g}g")
        if len(out) >= n:
            break
    return "; ".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--unmapped", action="store_true")
    ap.add_argument("--names")
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--count", type=int, default=30)
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--query", help="override search text for --names (single name)")
    ap.add_argument("--search", help="free text queries separated by '|'")
    ap.add_argument("--fndds", action="store_true", help="also search FNDDS")
    ap.add_argument("--grep", help="plain substring (case-insens.) filter on descriptions, with --search ignored")
    a = ap.parse_args()
    ings = json.load(open(os.path.join(ub.BULK, "ings.json"), encoding="utf-8"))
    foods = ub.load_all(("sr", "foundation", "fndds") if a.fndds else ("sr", "foundation"))
    if a.grep:
        for f in foods.values():
            if a.grep.lower() in f["description"].lower():
                print(f"  {f['fdc_id']} {f['data_type'][:2]} {f['description'][:90]} | kcal={ub.normalise(f['nutrients']).get(1008)} | {portion_summary(f, 4)}")
        return
    if a.search:
        for q in a.search.split("|"):
            ranked = sorted(foods.values(), key=lambda f: -ub.score(q, f["description"], f["data_type"]))[: a.top]
            print(f"## search: {q}")
            for f in ranked:
                tag = {"foundation": "F", "sr_legacy": "S", "fndds": "N"}[f["data_type"]]
                print(f"  {f['fdc_id']} {tag} {f['description'][:78]} | kcal={ub.normalise(f['nutrients']).get(1008)} | {portion_summary(f, 4)}")
        return
    if a.names:
        want = {n.strip() for n in a.names.split(",")}
        sel = [i for i in ings if i["name"] in want]
    else:
        sel = [i for i in ings if not i["fdc_id"]]
        sel.sort(key=lambda i: (-i["prows"], i["name"]))
        sel = sel[a.start : a.start + a.count]
    for i in sel:
        q = a.query or i["name"]
        ranked = sorted(foods.values(), key=lambda f: -ub.score(q, f["description"], f["data_type"]))[: a.top]
        print(f"## {i['id']} | {i['name']} | rows={i['prows']} | {i['aisle']} | units={i['units']}")
        for f in ranked:
            kcal = ub.normalise(f["nutrients"]).get(1008)
            tag = "F" if f["data_type"] == "foundation" else "S"
            print(f"  {f['fdc_id']} {tag} {f['description'][:78]} | kcal={kcal} | {portion_summary(f)}")


if __name__ == "__main__":
    main()
