#!/usr/bin/env python3
"""Compare our computed per-serving numbers with the NHS-published ones.
    docker exec -i <c> psql -U postgres -At -F'|' < scripts/nhs/check.sql > check.txt
    python -I scripts/nhs/compare.py scripts/nhs/artifacts/selected.json check.txt
"""
import json
import sys

d = {r["slug"]: r["nutrition"] for r in json.load(open(sys.argv[1], encoding="utf-8"))}
print(f"{'slug':45} {'kcal ours/NHS':>16} {'prot':>12} {'carb':>12} {'fat':>12}")
errs = []
for line in open(sys.argv[2], encoding="utf-8"):
    f = line.rstrip("\n").split("|")
    slug = f[0]
    if slug not in d or not f[3]:
        continue
    n = d[slug]
    ours = [float(x) for x in f[3:7]]
    theirs = [n.get("calories"), n.get("protein_g"), n.get("carbs_g"), n.get("fat_g")]
    cells = []
    for o, t in zip(ours, theirs):
        cells.append(f"{o:.0f}/{t:.0f}" if t is not None else f"{o:.0f}/-")
    if theirs[0]:
        errs.append(abs(ours[0] - theirs[0]) / theirs[0])
    print(f"{slug:45} {cells[0]:>16} {cells[1]:>12} {cells[2]:>12} {cells[3]:>12}")
if errs:
    errs.sort()
    print(f"kcal error: median {errs[len(errs)//2]*100:.1f}%  max {errs[-1]*100:.1f}%  (n={len(errs)})")
