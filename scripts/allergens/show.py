#!/usr/bin/env python3
"""Compact view of review/ingredient-allergens.csv for reading.   python scripts/allergens/show.py [tagged|animal|all] [from] [to]"""
import csv, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(HERE, "review", "ingredient-allergens.csv"), encoding="utf-8")))
ab = {"gluten": "G", "wheat": "W", "dairy": "D", "egg": "E", "fish": "F", "soy": "S", "peanuts": "P", "tree-nuts": "N", "shellfish": "X", "mollusks": "M", "sesame": "Se"}
mode = sys.argv[1] if len(sys.argv) > 1 else "tagged"
lo = int(sys.argv[2]) if len(sys.argv) > 2 else 0
hi = int(sys.argv[3]) if len(sys.argv) > 3 else 10**9
out = []
for r in rows:
    if mode == "tagged" and not r["allergens"]:
        continue
    if mode == "animal" and r["diet_class"] == "plant":
        continue
    t = ",".join(ab[p.split(":")[0]] + p.split(":")[1].lower() for p in r["allergens"].split(";") if p)
    out.append(f"{r['ingredient']} [{t}]" + ("" if r["diet_class"] == "plant" else " {" + r["diet_class"][:3] + "}"))
print(len(out))
print(" | ".join(out[lo:hi]))
