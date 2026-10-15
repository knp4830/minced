#!/usr/bin/env python3
"""List near-duplicate recipe pairs from cache/details.json (export_details.py): similar title stem AND similar ingredient set.

    python scripts/photos/near_dupes.py [min_jaccard=0.6]
Output is a review list, never an automatic delete.
"""
import json
import re
import sys
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache"
STOP = {"and", "with", "the", "a", "of", "in", "style", "easy", "quick", "simple", "classic", "homemade", "best", "no", "for", "on", "my"}


def stem(t):
    return {w.rstrip("s") for w in re.findall(r"[a-z]+", t.lower()) if w not in STOP and len(w) > 2}


def main():
    minj = float(sys.argv[1]) if len(sys.argv) > 1 else 0.6
    rs = json.loads((CACHE / "details.json").read_text(encoding="utf8"))
    for r in rs:
        r["_t"] = stem(r["title"])
        r["_i"] = {i.lower() for i in (r.get("ingredients") or [])}
    out = []
    for a in range(len(rs)):
        for b in range(a + 1, len(rs)):
            x, y = rs[a], rs[b]
            if not x["_t"] or not y["_t"] or not x["_i"] or not y["_i"]:
                continue
            tj = len(x["_t"] & y["_t"]) / len(x["_t"] | y["_t"])
            if tj < 0.4 and not (x["_t"] <= y["_t"] or y["_t"] <= x["_t"]):
                continue
            ij = len(x["_i"] & y["_i"]) / len(x["_i"] | y["_i"])
            if ij >= minj:
                out.append((ij, tj, x, y))
    out.sort(key=lambda t: -t[0])
    for ij, tj, x, y in out:
        print(f"{ij:.2f} {tj:.2f}  {x['slug']} ({len(x['_i'])} ing, {len(x.get('steps') or [])} st)  <>  {y['slug']} ({len(y['_i'])} ing, {len(y.get('steps') or [])} st)")
    print(len(out), "pairs")


main()
