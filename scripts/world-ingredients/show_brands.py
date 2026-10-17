"""Print brands.json compactly. Usage: python -I show_brands.py [ingredient-substring]"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "cache", "brands.json"), encoding="utf-8"))
sub = " ".join(sys.argv[1:]).lower()
susp = sub == "suspicious"
if susp:
    sub = ""
if sub == "outliers":
    import statistics
    by = {}
    for b in data:
        by.setdefault(b["ingredient"], []).append(b)
    for ing, lst in by.items():
        if len(lst) < 3:
            continue
        med = statistics.median([float(b["nutrients"].get("1008") or 0) for b in lst])
        for b in lst:
            k = float(b["nutrients"].get("1008") or 0)
            if abs(k - med) > 0.6 * max(med, 40):
                print("%-20s med %5.0f | %5.0f %-55s | %s" % (ing[:20], med, k, b["description"][:55], (b["brand_name"] or b["brand_owner"] or "")[:20]))
    raise SystemExit
for b in data:
    if sub and sub not in b["ingredient"].lower():
        continue
    if susp:
        toks = [t[:5] for t in b["ingredient"].lower().replace("-", " ").split() if len(t) > 3]
        d = b["description"].lower()
        if any(t in d for t in toks):
            continue
    n = {int(k): v for k, v in b["nutrients"].items()}
    print("%-22s %-60s | %s | %s%s | k%s s%s" % (b["ingredient"][:22], b["description"][:60], (b["brand_name"] or b["brand_owner"] or "")[:22],
          b["ss"], b["su"], round(n.get(1008) or 0), round(n.get(1093) or 0)))
