#!/usr/bin/env python3
"""List candidates that were NOT rejected in a dry-run printout.   python -I scripts/nhs/list_ok.py recipes.json dry.txt"""
import json
import re
import sys

d = {r["slug"]: r for r in json.load(open(sys.argv[1], encoding="utf-8"))}
rej = set()
for line in open(sys.argv[2], encoding="utf-8", errors="replace").read().split("=== NON-EXACT")[0].splitlines():
    m = re.match(r"\s*(\S+)\s*\|\s*(\S.*)", line)
    if m and m.group(1) in d:
        rej.add(m.group(1))
ok = [s for s in d if s not in rej]
print(len(ok), "accepted")
for s in ok:
    r = d[s]
    print(s, "|", r["title"], "| serves", r["servings"], "|", len(r["ingredients"]), "ingredients |",
          [i.get("orig", i["line"]) for i in r["ingredients"] if "coriander" in i.get("orig", i["line"]).lower()])
