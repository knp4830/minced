"""Build proxies.psv: which default foods are DECLARED stand-ins ("no USDA food for X; Y is used instead").

    python -I scripts/nutrition/foods10c/build_proxies.py

A stand-in is a deliberate approximation (aleppo pepper counted as cayenne, gruyere as swiss). It was written down in the source files
as a "proxy:" hint or a "Proxy:" note but never reached the database, so a recipe label showed the number as exact. This script
collects every declaration into proxies.psv (ingredient|form|origin|note); build_10c.py turns it into ingredient_foods.is_proxy, and
the recipe label then says so (nutrition_assumptions).

Sources, all committed:
  scripts/world-ingredients/data/ingredients-*.txt   hint field starting "proxy:"
  scripts/nutrition/ingredient-map.json              note starting "Proxy"
  scripts/nutrition/mapping/*.tsv                    food rows whose note starts "Proxy"
  scripts/nutrition/foods10c/decisions.psv           a set_default whose reason mentions a proxy
  scripts/nutrition/foods10c/extra_proxies.psv       ingredients the audit found to be undeclared stand-ins (edit this file)
A declaration is dropped when a later wave 10c decision replaced that default with the real food (a set_default without "proxy" in its
reason, a national_links row) or removed the mapping (unmap), because the stand-in is then gone.
"""
import csv
import glob
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
NUT = os.path.join(HERE, "..")
WORLD = os.path.join(HERE, "..", "..", "world-ingredients", "data")


def psv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="|"))


def main():
    found = {}  # (ingredient, form) -> (origin, note)

    for path in sorted(glob.glob(os.path.join(WORLD, "ingredients-*.txt"))):
        for line in open(path, encoding="utf-8"):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            p = [x.strip() for x in line.rstrip("\n").split("|")]
            if len(p) == 7 and p[6].lstrip().startswith("proxy:"):
                found[(p[0].lower(), "default")] = ("world-hint", "stand-in chosen for " + p[0] + ": " + p[6].replace("proxy:", "", 1).strip(" /"))

    for name, v in json.load(open(os.path.join(NUT, "ingredient-map.json"), encoding="utf-8")).items():
        if isinstance(v, dict) and str(v.get("note", "")).lower().startswith("proxy"):
            found[(name.lower(), "default")] = ("ingredient-map", v["note"])

    for path in sorted(glob.glob(os.path.join(NUT, "mapping", "*.tsv"))):
        for r in csv.DictReader(open(path, encoding="utf-8", newline=""), delimiter="\t"):
            if r.get("kind") == "food" and str(r.get("note", "")).lower().startswith("proxy"):
                found[(r["ingredient"].lower(), r["form"] or "default")] = ("mapping", r["note"])

    dec = psv(os.path.join(HERE, "decisions.psv"))
    for d in dec:
        if d["action"] == "set_default" and "proxy" in d["reason"].lower():
            found[(d["ingredient"].lower(), d["form"] or "default")] = ("decision", d["reason"])

    extra = psv(os.path.join(HERE, "extra_proxies.psv"))
    for r in extra:
        found[(r["ingredient"].lower(), r["form"] or "default")] = ("audit", r["note"])

    # a later decision that put the real food in, or took the mapping away, ends the stand-in
    keep = set((r["ingredient"].lower(), r["form"] or "default") for r in extra)
    for d in dec:
        k = (d["ingredient"].lower(), d["form"] or "default")
        if k in keep or k not in found:
            continue
        if d["action"] == "unmap":
            del found[k]
        elif d["action"] == "set_default" and "proxy" not in d["reason"].lower():
            del found[k]
    for r in psv(os.path.join(HERE, "national_links.psv")):
        found.pop((r["ingredient"].lower(), r["form"] or "default"), None)
    for d in dec:  # unmap with form '*' covers every form
        if d["action"] == "unmap" and d["form"] in ("*", ""):
            for k in [k for k in found if k[0] == d["ingredient"].lower() and k not in keep]:
                del found[k]

    out = os.path.join(HERE, "proxies.psv")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("ingredient|form|origin|note\n")
        for (ing, form), (origin, note) in sorted(found.items()):
            f.write("%s|%s|%s|%s\n" % (ing, form, origin, re.sub(r"[|\r\n]+", " ", note).strip()))
    print("wrote", os.path.relpath(out), len(found), "declared stand-ins")


if __name__ == "__main__":
    main()
