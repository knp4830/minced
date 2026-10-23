"""Wave 14 aid: where do the real FoodData Central labels of an ingredient agree?

    python -I -X utf8 scripts/nutrition/foods14/label_agreement.py [--csv nofood.csv]

For every ingredient without a food (saved list), reads the cached FDC Branded searches (gather14.py), keeps the usable labels with the wave 10 gates
(sold by weight, serving 1.5 g or more, energy plausible against the macros, no label-rounded zeros, the ingredient's words all in the product name) and reports how many
agree with the median: energy within 12 percent (or 5 kcal) and protein, fat and carbohydrate each within 12 percent (or 2.5 g), the same tolerance as the owner's rule.
It prints a candidate only when 5 or more labels agree on 70 percent or more. A candidate is a lead for a person to read, never a decision: the product names
must be the ingredient itself (a hot sauce "with habanero" is not habanero).
"""
import csv
import json
import os
import re
import statistics
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts", "world-ingredients"))
from quality import plausible, label_rounded_zero, MIN_SERVING, GLOBAL_EXCL, sane_nutrients  # noqa: E402

CACHE_DIR = os.environ.get("W14_CACHE") or os.path.join(tempfile.gettempdir(), "w14-cache")
STOP = {"and", "or", "with", "the", "of", "a", "in"}


def toks(s):
    return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in STOP]


def load_cache():
    cache = {}
    leg = os.path.join(CACHE_DIR, "api-cache.json")
    if os.path.exists(leg):
        try:
            for k, v in json.load(open(leg, encoding="utf-8")).items():
                if k.startswith("search:"):
                    cache[k] = v
        except Exception:  # noqa: BLE001
            pass
    p = os.path.join(CACHE_DIR, "search-cache.jsonl")
    for line in open(p, encoding="utf-8"):
        try:
            o = json.loads(line)
            cache[o["k"]] = o["v"]
        except Exception:  # noqa: BLE001
            pass
    return cache


def nuts(f):
    m = {}
    for x in f.get("foodNutrients", []):
        nid, v = x.get("nutrientId"), x.get("value")
        if nid is not None and v is not None:
            m[int(nid)] = float(v)
    if 1008 not in m:
        for alt in (2048, 2047):
            if alt in m:
                m[1008] = m[alt]
                break
    return m


def ok(a, b, kcal):
    a, b = a or 0.0, b or 0.0
    return abs(a - b) <= max(0.12 * b, 5.0 if kcal else 2.5)


def main():
    path = sys.argv[sys.argv.index("--csv") + 1] if "--csv" in sys.argv else os.path.join(HERE, "out", "nofood-w14.csv")
    cache = load_cache()
    rows = list(csv.DictReader(open(path, encoding="utf-8", newline="")))
    shown = 0
    for r in rows:
        name = r["canonical_name"]
        als = [a for a in r["aliases"].split("; ") if a and a.lower() != name.lower()]
        for q in [name] + als[:1]:
            res = cache.get("search:%s:Branded:100" % q)
            if not res:
                continue
            tk = toks(q)
            cand, seen = [], set()
            for f in res.get("foods", []):
                desc = f.get("description") or ""
                dl = desc.lower()
                if not all(t in dl for t in tk):
                    continue
                if any(g.strip() in dl for g in GLOBAL_EXCL if g.strip() not in name.lower() and g.strip() not in q.lower()):
                    continue
                if f.get("marketCountry") not in (None, "United States"):
                    continue
                su, ss = (f.get("servingSizeUnit") or "").lower(), f.get("servingSize")
                if su not in ("g", "grm") or not ss or ss < MIN_SERVING:
                    continue
                m = sane_nutrients(nuts(f))
                if not plausible(m, ss, name) or label_rounded_zero(m, ss, name):
                    continue
                g = f.get("gtinUpc")
                if g and g in seen:
                    continue
                seen.add(g)
                cand.append((f["fdcId"], desc, f.get("brandName") or f.get("brandOwner") or "", m))
            if len(cand) < 5:
                continue
            med = {k: statistics.median([(c[3].get(k) or 0) for c in cand]) for k in (1008, 1003, 1004, 1005)}
            agree = [c for c in cand if ok(c[3].get(1008), med[1008], True) and all(ok(c[3].get(k), med[k], False) for k in (1003, 1004, 1005))]
            frac = len(agree) / len(cand)
            if frac >= 0.7 and len(agree) >= 5:
                shown += 1
                print("## %s (q=%r): %d of %d labels agree near %.0f kcal (p %.1f f %.1f c %.1f), pub %s rev %s" % (name, q, len(agree), len(cand), med[1008], med[1003], med[1004], med[1005], r["pub"], r["rev"]))
                for c in agree[:4]:
                    print("     %-9s %-55s %-20s k %.0f" % (c[0], c[1][:55], c[2][:20], c[3].get(1008) or 0))
    print(shown, "candidates")


if __name__ == "__main__":
    main()
