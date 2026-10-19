#!/usr/bin/env python3
"""Ingredients that recipes actually use, split into tagged and untagged (plant), most used first.  python show_used.py [untagged|tagged]"""
import csv, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(HERE, "review", "ingredient-allergens.csv"), encoding="utf-8")))
mode = sys.argv[1] if len(sys.argv) > 1 else "untagged"
used = sorted((r for r in rows if int(r["recipe_uses"]) > 0), key=lambda r: -int(r["recipe_uses"]))
sel = [r for r in used if (not r["allergens"]) == (mode == "untagged")]
print(len(sel), "of", len(used), "used ingredients are", mode)
print(" | ".join(f"{r['ingredient']}({r['recipe_uses']}){'' if r['diet_class']=='plant' else '{'+r['diet_class'][:3]+'}'}" + ("" if mode == "untagged" else "[" + r["allergens"].replace(":I", "").replace(":T", "~").replace(":V", "?") + "]") for r in sel))
