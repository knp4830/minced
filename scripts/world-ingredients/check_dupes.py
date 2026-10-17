"""Check every new canonical name and alias against the catalog on the snapshot DB with the
real resolve_ingredient(). Exact / alias / singular hits mean the name is ALREADY covered.
Writes cache/dupes.json {name: [kind, existing_canonical]} and prints a summary.
Usage: python -I check_dupes.py   (container w10-world-db, database postgres)"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fdcdb import rows, lit  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "cache", "resolved.json"), encoding="utf-8"))
names = set()
for r in data:
    names.add(r["name"].lower())
    for a in r["aliases"]:
        names.add(a.lower())
names = sorted(names)
out = {}
for i in range(0, len(names), 400):
    chunk = names[i:i + 400]
    vals = ",".join("(%s)" % lit(n) for n in chunk)
    got = rows("select v.n, r.canonical_name::text as canon, r.match_kind::text as kind from (values %s) v(n) "
               "join lateral resolve_ingredient(v.n) r on true" % vals, db="postgres")
    for g in got:
        out[g["n"]] = [g["kind"], g["canon"]]
json.dump(out, open(os.path.join(HERE, "cache", "dupes.json"), "w", encoding="utf-8"), indent=0)
kinds = {}
for k, (kind, canon) in out.items():
    kinds.setdefault(kind, []).append((k, canon))
for kind, lst in kinds.items():
    print(kind, len(lst))
canon_names = {x["name"].lower() for x in data}
if len(sys.argv) > 1 and sys.argv[1] == "fuzzy":
    for k, (kind, canon) in sorted(out.items()):
        if kind == "fuzzy" and k in canon_names:
            print("  %s ~> %s" % (k, canon))
    raise SystemExit
for kind in kinds:
    if kind in ("exact", "alias", "singular", "singularized"):
        print("== %s" % kind)
        for k, canon in kinds[kind]:
            print("  %s -> %s" % (k, canon))
