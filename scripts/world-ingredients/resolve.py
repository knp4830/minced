"""Resolve curated world-ingredient rows to USDA FoodData Central foods.

Input : data/ingredients-*.txt   (pipe-separated, see data/README.md)
Output: cache/resolved.json      (consumed by emit_sql.py and report.py)

Resolution order per ingredient (CC0 USDA data only):
  1. SR Legacy / Foundation record whose description contains every token of the
     sr hint (raw preferred, cooked/canned/frozen/prepared penalised unless asked for);
  2. otherwise a FDC *Branded* record: the "medoid" of all complete US branded products
     matching the hint (the real product whose macros sit closest to the median of the
     group), so the default is a typical product, not an outlier. Flagged `branded_medoid`.
  3. otherwise unresolved -> the ingredient is still added (people can use it) but has
     no nutrition, so a recipe containing it is "partial". Never guessed.

Run: python -I scripts/world-ingredients/resolve.py
"""
import glob
import json
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fdcdb import rows, lit, nutrients_for  # noqa: E402
from quality import plausible, label_rounded_zero, MIN_SERVING, PREFERRED_SERVING, GLOBAL_EXCL  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PENALTY_WORDS = ["cooked", "boiled", "canned", "frozen", "prepared", "restaurant", "fast foods", "cooking",
                 "fried", "baked", "roasted", "dried", "dehydrated", "juice", "drained", "sweetened", "salted",
                 "imitation", "mixed", "babyfood", "babyfoods", "infant", "formula", "nfs", "school lunch",
                 "ready-to-eat", "ready-to-serve", "pickled", "made with", "from concentrate", "wild"]
AISLES = {"Produce", "Pantry", "Dairy", "Protein", "Spices", "Other"}
GROUPS = {"vegetables", "fruit", "herbs", "meat", "seafood", "eggs", "legumes", "grains", "nuts", "spices", "pantry", "-"}
REGIONS = {"EA", "SEA", "SA", "ME", "CA", "NAF", "WAF", "EAF", "SAF", "LAT", "CAR", "EUM", "EUW", "EUN", "EUE", "PAC", "IND", "NAM", "GLO"}
ALLERGENS = {"gluten", "dairy", "egg", "fish", "soy", "nuts", "shellfish", "sesame", "-"}


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")
    return s


def parse_tokens(txt):
    inc, exc, opts = [], [], {}
    for t in txt.split():
        if t == "?":
            continue
        if t.startswith("-") and len(t) > 1:
            exc.append(t[1:].replace("_", " "))
        elif "=" in t:
            k, v = t.split("=", 1)
            opts[k] = v.replace("_", " ")
        else:
            inc.append(t.replace("_", " "))
    return inc, exc, opts


def where_tokens(col, inc, exc):
    w = ["lower(%s) like %s" % (col, lit("%" + t.lower() + "%")) for t in inc]
    w += ["lower(%s) not like %s" % (col, lit("%" + t.lower() + "%")) for t in exc]
    return " and ".join(w) or "true"


def sr_pick(inc, exc, want_words):
    """Return ranked SR/Foundation candidates."""
    sql = ("select f.fdc_id, f.data_type, f.description, n.cnt from foods f "
           "join (select fdc_id, count(*) cnt from nut group by fdc_id) n using (fdc_id) where "
           + where_tokens("f.description", inc, exc))
    cands = rows(sql)
    scored = []
    for c in cands:
        d = c["description"].lower()
        s = len(d)
        for w in PENALTY_WORDS:
            if w in d and w not in want_words:
                s += 120
        if "raw" in d:
            s -= 25
        if c["data_type"] == "fndds":
            s += 60
        if c["data_type"] == "foundation":
            s += 30
        s += (23 - min(c["cnt"], 23)) * 8
        scored.append((s, c))
    scored.sort(key=lambda x: (x[0], x[1]["fdc_id"]))
    return [c for _, c in scored]


def medoid(ids, nut_by_id):
    vecs = {}
    for i in ids:
        m = nut_by_id.get(i, {})
        vecs[i] = [m.get(1008, 0) or 0, m.get(1003, 0) or 0, m.get(1004, 0) or 0, m.get(1005, 0) or 0, (m.get(1093, 0) or 0) / 10]
    dims = list(zip(*vecs.values()))
    med = [statistics.median(d) for d in dims]
    mad = [max(statistics.median([abs(x - m) for x in d]), 1.0) for d, m in zip(dims, med)]
    best, bd = None, None
    for i, v in vecs.items():
        dist = sum(abs(a - m) / s for a, m, s in zip(v, med, mad))
        if bd is None or dist < bd or (dist == bd and i < best):
            best, bd = i, dist
    return best, len(vecs)


# Branded categories that hold meals/snacks, not ingredients. A hint can override with cat=...
BAD_CATS = ["frozen dinners", "entrees", "pizza", "sandwiches", "candy", "ice cream", "snack", "cereal", "cookies",
            "cakes", "chocolate", "chips", "appetizers", "wraps", "soda", "cooked & prepared", "deli", "frozen prepared",
            "combination meals", "pasta dinners", "sushi", "breakfast", "dough based", "savoury", "biscuits", "bars",
            "dinner mixes", "mexican dinner", "flavored rice dishes", "chili & stew", "meat/poultry/other animals",
            "prepared soups", "other soups", "canned soup", "frozen bread", "pies", "vegetarian frozen", "sweet bakery",
            "croissants", "bakery", "gum", "puddings", "gelatin", "baby", "supplement", "vitamins", "weight control",
            "energy", "frozen patties", "frozen bacon", "frozen poultry", "frozen sausages", "bacon, sausages"]


def phrase_regex(inc):
    p = re.escape(" ".join(inc).lower()).replace("\\ ", " ")
    return "\\m" + p + "\\M"


def branded_candidates(inc, exc, opts, limit=150, owners=None, strict_cat=True):
    ml_ok = "d" in opts
    unit_clause = "lower(b.serving_unit) in ('g','grm')" + (" or lower(b.serving_unit) in ('ml','mlt')" if ml_ok else "")
    extra = ""
    if "cat" in opts:
        extra += " and lower(b.category) like " + lit("%" + opts["cat"].lower() + "%")
    elif strict_cat:
        extra += "".join(" and lower(b.category) not like %s" % lit("%" + c + "%") for c in BAD_CATS)
    if owners:
        extra += " and (" + " or ".join("lower(b.brand_owner) like %s or lower(b.brand_name) like %s" % (lit("%" + o + "%"), lit("%" + o + "%")) for o in owners) + ")"
    where = "lower(b.description) ~ %s" % lit(phrase_regex(inc))
    where += "".join(" and lower(b.description) not like %s" % lit("%" + t.lower() + "%") for t in exc)
    phrase_txt = " ".join(inc).lower()
    where += "".join(" and lower(b.description) not like %s" % lit("%" + g + "%") for g in GLOBAL_EXCL if g.strip() not in phrase_txt)
    plen = len(" ".join(inc))
    sql = ("select b.fdc_id, b.description, b.publication_date, b.brand_owner, b.brand_name, b.gtin, b.serving_size, "
           "b.serving_unit, b.household, b.category from branded b join bcore c using (fdc_id) where "
           + where + extra + " and (" + unit_clause + ") "
           "order by length(b.description) - %d, b.publication_date desc, b.fdc_id desc limit %d" % (plen, limit))
    return rows(sql)


def parse_ingredient_files():
    out, seen = [], {}
    for path in sorted(glob.glob(os.path.join(HERE, "data", "ingredients-*.txt"))):
        for ln, line in enumerate(open(path, encoding="utf-8"), 1):
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 7:
                raise SystemExit("%s:%d expected 7 fields, got %d: %s" % (path, ln, len(parts), line[:80]))
            name, aisle, group, regions, aliases, allergens, hint = parts
            assert aisle in AISLES, "%s:%d bad aisle %s" % (path, ln, aisle)
            assert group in GROUPS, "%s:%d bad group %s" % (path, ln, group)
            al = [a.strip() for a in aliases.split(";") if a.strip() and a.strip() != "-"]
            alg = [a.strip() for a in allergens.split(",") if a.strip()]
            for rg in regions.split(","):
                assert rg.strip() in REGIONS, "%s:%d bad region %s" % (path, ln, rg)
            for a in alg:
                assert a in ALLERGENS, "%s:%d bad allergen %s" % (path, ln, a)
            key = name.lower()
            if key in seen:
                raise SystemExit("%s:%d duplicate ingredient %s (also %s)" % (path, ln, name, seen[key]))
            seen[key] = "%s:%d" % (os.path.basename(path), ln)
            out.append({"name": name, "aisle": aisle, "group": None if group == "-" else group,
                        "regions": [r.strip() for r in regions.split(",") if r.strip()],
                        "aliases": al, "allergens": [a for a in alg if a != "-"], "hint": hint,
                        "file": os.path.basename(path)})
    return out


def main():
    items = parse_ingredient_files()
    only = sys.argv[1] if len(sys.argv) > 1 else None
    resolved = []
    stats = {"sr_legacy": 0, "foundation": 0, "fndds": 0, "branded_medoid": 0, "unresolved": 0}
    for it in items:
        if only and only.lower() not in it["name"].lower():
            continue
        hint = it["hint"]
        it["proxy"] = hint.lstrip().startswith("proxy:")
        hint = hint.replace("proxy:", "", 1)
        sr_part, _, br_part = hint.partition("//")
        sr_part, br_part = sr_part.strip(), br_part.strip()
        res = {"source": "unresolved", "fdc_id": None, "description": None, "alts": [], "n_candidates": 0, "density_used": None}
        if sr_part and sr_part != "-":
            inc, exc, opts = parse_tokens(sr_part)
            want = {w for w in PENALTY_WORDS if any(w in t for t in inc)}
            cands = sr_pick(inc, exc, want)
            if cands:
                top = cands[0]
                res.update(source=top["data_type"], fdc_id=top["fdc_id"], description=top["description"], n_candidates=len(cands),
                           alts=[c["description"] for c in cands[1:4]])
        if res["fdc_id"] is None and br_part and br_part != "-":
            cands, opts = [], {}
            for alt in br_part.split(","):
                inc, exc, opts = parse_tokens(alt)
                if inc:
                    cands += branded_candidates(inc, exc, opts)
            if cands:
                nb = nutrients_for([c["fdc_id"] for c in cands])
                dens = float(opts["d"]) if "d" in opts else None
                good = []
                for c in cands:
                    m = nb.get(c["fdc_id"], {})
                    ml = str(c["serving_unit"]).lower() in ("ml", "mlt")
                    if ml and not dens:
                        continue
                    if ml:
                        m = {k: (v / dens if v is not None else None) for k, v in m.items()}
                        nb[c["fdc_id"]] = m
                    ss = float(c["serving_size"])
                    if plausible(m, ss, it["name"]) and ss >= MIN_SERVING and not label_rounded_zero(m, ss, it["name"]):
                        c["_ss"] = ss
                        good.append(c)
                big = [c for c in good if c["_ss"] >= PREFERRED_SERVING]
                pool = big if len(big) >= 3 else good
                if pool:
                    ids = [c["fdc_id"] for c in pool]
                    best, n = medoid(ids, nb)
                    c = next(x for x in pool if x["fdc_id"] == best)
                    res.update(source="branded_medoid", fdc_id=best, description="%s [%s / %s]" % (c["description"], c["brand_owner"], c["category"]),
                               n_candidates=n, density_used=dens if str(c["serving_unit"]).lower() in ("ml", "mlt") else None)
        stats[res["source"]] += 1
        it["food"] = res
        resolved.append(it)
    path = os.path.join(HERE, "cache", "resolved.json")
    if only:
        for r in resolved:
            print("%-28s %-15s %-9s %s" % (r["name"], r["food"]["source"], r["food"]["fdc_id"], (r["food"]["description"] or "")[:90]))
        return
    json.dump(resolved, open(path, "w", encoding="utf-8"), indent=0)
    print(json.dumps(stats), len(resolved), "ingredients ->", path)


if __name__ == "__main__":
    main()
