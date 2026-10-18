"""Resolve curated brand specs (data/brands-*.txt) to FDC Branded Foods records (CC0).

Spec line:  ingredient | brand tokens (a/b/c) | description phrase (blank = ingredient name) | options
Options: n=3 (max products), d=1.08 (g/ml, required for ml-serving liquids when the ingredient has no known
density), -word (exclude), form=default|canned|dried|...  (ingredient_foods.form)
A product qualifies when: US market, serving size in g/ml, energy + protein + fat + carbs + sodium reported,
brand token found in brand_owner / brand_name / description, and the phrase appears word-bounded in the description.
Newest publication per GTIN wins. Products are ranked by shortest description (plain, un-flavoured names first).
Output: cache/brands.json
Run: python -I scripts/world-ingredients/brands.py
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fdcdb import rows, lit, nutrients_for  # noqa: E402
from resolve import phrase_regex, BAD_CATS  # noqa: E402
from quality import plausible, label_rounded_zero, MIN_SERVING, GLOBAL_EXCL  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def parse_specs():
    specs = []
    for path in sorted(glob.glob(os.path.join(HERE, "data", "brands-*.txt"))):
        for ln, line in enumerate(open(path, encoding="utf-8"), 1):
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            p = [x.strip() for x in line.split("|")]
            if len(p) < 3:
                raise SystemExit("%s:%d need >= 3 fields" % (path, ln))
            ing, brands, phrase = p[0], p[1], p[2]
            opts = p[3] if len(p) > 3 else ""
            o = {"n": 3, "d": None, "form": "default", "excl": []}
            for t in opts.split():
                if t.startswith("n="):
                    o["n"] = max(1, int(round(int(t[2:]) * float(os.environ.get("N_SCALE", "1.6")))))
                elif t.startswith("d="):
                    o["d"] = float(t[2:])
                elif t.startswith("kmin="):
                    o["kmin"] = float(t[5:])
                elif t.startswith("form="):
                    o["form"] = t[5:]
                elif t.startswith("-"):
                    o["excl"].append(t[1:].replace("_", " ").lower())
                elif t.startswith("cat="):
                    o["cat"] = t[4:].replace("_", " ").lower()
            specs.append({"ingredient": ing, "brands": [b.strip().lower() for b in brands.split("/") if b.strip()],
                          "phrase": (phrase or ing).lower(), "opts": o, "src": "%s:%d" % (os.path.basename(path), ln)})
    return specs


def ingredient_density(name, cache={}):
    """g/ml from the snapshot (ingredients.density_g_per_ml) or from the ingredient's USDA cup/tbsp portion."""
    if name in cache:
        return cache[name]
    r = rows("select density_g_per_ml::float d, fdc_id from ingredients where canonical_name = %s" % lit(name), db="postgres")
    d = None
    if r and r[0]["d"]:
        d = r[0]["d"]
    elif r and r[0]["fdc_id"]:
        p = rows("select unit, modifier, grams, amount from portions where fdc_id = %d" % r[0]["fdc_id"])
        d = density_from_portions(p)
    cache[name] = d
    return d


def density_from_portions(p):
    ml = {"cup": 236.588, "tbsp": 14.7868, "tablespoon": 14.7868, "tsp": 4.92892, "teaspoon": 4.92892, "fl oz": 29.5735}
    best = []
    for x in p:
        mod = (x.get("modifier") or "").strip().lower()
        unit = (x.get("unit") or "").strip().lower()
        key = None
        for k in ml:
            if mod == k or unit == k:
                key = k
        if key and float(x["amount"] or 0) > 0:
            best.append(float(x["grams"]) / float(x["amount"]) / ml[key])
    if best:
        best.sort()
        return best[len(best) // 2]
    return None



def main():
    specs = parse_specs()
    known = {r["canonical_name"].lower() for r in rows("select canonical_name::text canonical_name from ingredients", db="postgres")}
    rp = os.path.join(HERE, "cache", "resolved.json")
    if os.path.exists(rp):
        known |= {x["name"].lower() for x in json.load(open(rp, encoding="utf-8"))}
    unknown = sorted({s["ingredient"] for s in specs if s["ingredient"].lower() not in known})
    if unknown:
        print("UNKNOWN ingredients in specs (skipped):", "; ".join(unknown))
    specs = [s for s in specs if s["ingredient"].lower() in known]
    out, report = [], []
    seen, seen_sig = set(), set()
    for sp in specs:
        o = sp["opts"]
        brand_sql = " or ".join("lower(b.brand_owner) like %s or lower(b.brand_name) like %s or lower(b.description) like %s"
                                % ((lit("%" + t + "%"),) * 3) for t in sp["brands"])
        rx = lit("(" + "|".join(phrase_regex(a.split()) for a in sp["phrase"].split(",")) + ")")
        gx = [g for g in GLOBAL_EXCL if g.strip() not in sp["ingredient"].lower() and g.strip() not in sp["phrase"]]
        ex = "".join(" and lower(b.description) not like %s" % lit("%" + e + "%") for e in o["excl"] + gx)
        if "cat" in o:
            catc = " and lower(b.category) like %s" % lit("%" + o["cat"] + "%")
        else:
            catc = "".join(" and lower(b.category) not like %s" % lit("%" + c + "%") for c in BAD_CATS)
        sql = ("select * from (select distinct on (b.gtin) b.fdc_id, b.description, b.publication_date, b.brand_owner, b.brand_name, "
               "b.gtin, b.serving_size::float ss, lower(b.serving_unit) su, b.household, b.category "
               "from branded b join bcore c using (fdc_id) where (%s) and lower(b.description) ~ %s%s%s "
               "and lower(b.serving_unit) in ('g','grm','ml','mlt') "
               "order by b.gtin, b.publication_date desc, b.fdc_id desc) t order by length(description), fdc_id limit %d"
               % (brand_sql, rx, ex, catc, max(o["n"] * 4, 12)))
        try:
            cands = rows(sql)
        except RuntimeError as e:
            report.append((sp["src"], sp["ingredient"], "ERROR " + str(e)[:80]))
            continue
        got, skipped_ml, bad = 0, 0, 0
        nb = nutrients_for([c["fdc_id"] for c in cands])
        for c in cands:
            if got >= o["n"]:
                break
            if c["fdc_id"] in seen:
                continue
            ml = c["su"] in ("ml", "mlt")
            dens = None
            if ml:
                dens = o["d"] or ingredient_density(sp["ingredient"])
                if not dens:
                    skipped_ml += 1
                    continue
            m = nb.get(c["fdc_id"], {})
            if dens:
                m = {k: (v / dens if v is not None else None) for k, v in m.items()}
            kmax = 200 if o["form"] == "canned" else None
            if o.get("kmin") and (m.get(1008) or 0) < o["kmin"]:
                bad += 1
                continue
            if not plausible(m, c["ss"], sp["ingredient"]) or (kmax and (m.get(1008) or 0) > kmax) or c["ss"] < MIN_SERVING \
                    or label_rounded_zero(m, c["ss"], sp["ingredient"]):
                bad += 1
                continue
            sig = (sp["ingredient"], (c["brand_name"] or c["brand_owner"] or "").lower(), c["description"].lower())
            sig2 = (sp["ingredient"], round(m.get(1008) or 0), round(m.get(1003) or 0, 1), round(m.get(1004) or 0, 1),
                    round(m.get(1005) or 0, 1), round(m.get(1093) or 0, -1))
            if sig in seen_sig or sig2 in seen_sig:
                continue
            seen_sig.add(sig)
            seen_sig.add(sig2)
            c["density"] = dens
            c["ingredient"] = sp["ingredient"]
            c["form"] = o["form"]
            c["spec"] = sp["src"]
            c["su"] = "ml" if ml else "g"
            c["ss"] = round(c["ss"], 2)
            c["nutrients"] = m
            out.append(c)
            seen.add(c["fdc_id"])
            got += 1
        report.append((sp["src"], sp["ingredient"], "%d found (cands %d, ml-skipped %d, implausible %d) brands=%s" % (got, len(cands), skipped_ml, bad, "/".join(sp["brands"]))))
    # Outlier rule: within an ingredient+form group of >= 4 products, drop energy values far from the group median
    # (a different product slipped into the phrase match, or a label-rounding artefact).
    import statistics
    groups = {}
    for c in out:
        groups.setdefault((c["ingredient"], c["form"]), []).append(c)
    dropped = []
    for key, lst in groups.items():
        if len(lst) < 4:
            continue
        med = statistics.median([c["nutrients"].get(1008) or 0 for c in lst])
        for c in lst:
            k = c["nutrients"].get(1008) or 0
            if abs(k - med) > 0.6 * max(med, 40) and abs(k - med) > 40:
                dropped.append(c)
    drop_ids = {c["fdc_id"] for c in dropped}
    out = [c for c in out if c["fdc_id"] not in drop_ids]
    print("outlier drops:", len(drop_ids))
    json.dump(out, open(os.path.join(HERE, "cache", "brands.json"), "w", encoding="utf-8"), indent=0)
    json.dump(report, open(os.path.join(HERE, "cache", "brands-report.json"), "w", encoding="utf-8"), indent=0)
    zero = [r for r in report if r[2].startswith("0 found") or r[2].startswith("ERROR")]
    print("brand foods:", len(out), "specs:", len(specs), "specs with 0:", len(zero))
    for r in zero:
        print("  none:", r[0], r[1], r[2][:90])


if __name__ == "__main__":
    main()
