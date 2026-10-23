#!/usr/bin/env python3
"""Turn dry-run printouts into the 'not imported' CSVs for the review.

    python -I scripts/myplate/w14_notimported.py rescue-full.txt rescue-sources.csv > docs/content/MYPLATE-NOT-IMPORTED-w14.csv
    python -I scripts/myplate/w14_notimported.py --nhs nhs-full.txt scripts/nhs/artifacts/recipes.json > docs/content/NHS-NOT-IMPORTED-w14.csv
"""
import csv
import json
import re
import sys
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8", newline="")


def reasons(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    body = text.split("=== NON-EXACT")[0]
    out = defaultdict(list)
    wanted = set()
    for line in body.splitlines():
        m = re.match(r"\s*(\S+)\s*\|\s*(\S.*?)\s*$", line)
        if m and m.group(1) not in ("slug",):
            out[m.group(1)].append(m.group(2))
    return out


w = csv.writer(sys.stdout)
if sys.argv[1] == "--nhs":
    rs = reasons(sys.argv[2])
    recs = json.load(open(sys.argv[3], encoding="utf-8"))
    sel = set(open("scripts/nhs/selected.txt").read().split())
    w.writerow(["slug", "title", "status", "reasons"])
    for r in recs:
        s = r["slug"]
        if s in sel:
            continue
        rr = rs.get(s)
        w.writerow([s, r["title"], "not imported" if rr else "passes every gate (not needed for the pilot of 20)", "; ".join(rr or [])])
else:
    rs = reasons(sys.argv[1])
    w.writerow(["slug", "title", "credited_source_class", "source_field", "status", "reasons"])
    for r in csv.DictReader(open(sys.argv[2], encoding="utf-8")):
        s = r["slug"]
        rr = [x for x in rs.get(s, []) if x != "slug already exists"]
        if r["class"] == "federal" and "slug already exists" in rs.get(s, []):
            rr = []
        if r["class"] == "federal" and "slug already exists" in rs.get(s, []):
            status = "IMPORTED (in review)"
        elif not rs.get(s):
            status = "passes every gate" if r["class"] != "federal" else "unknown"
            if r["class"] != "federal":
                status += "; HELD: page is credited to a non-federal source, owner decision on authorship"
        elif r["class"] != "federal":
            status = "not imported: non-federal source"
        else:
            status = "not imported"
        w.writerow([s, r["title"], r["class"], r["source_field"], status, "; ".join(rr)])
    seen = {r["slug"] for r in csv.DictReader(open(sys.argv[2], encoding="utf-8"))}
    for s in open("scripts/myplate/artifacts/missing-slugs.txt").read().split():
        if s not in seen:
            w.writerow([s, "", "unknown", "", "not imported: archived page not retrievable",
                        "the Internet Archive returned 404 (several slugs are page-chrome fragments, not recipes) or refused the connection after retries"])
