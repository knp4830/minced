"""Wave 14 stage 1: candidate trusted records for every ingredient without a food (a review aid, not a decision).

    python -I -X utf8 scripts/nutrition/foods14/candidates_w14.py <container> [--out candidates-w14.txt] [--only name1,name2]

Reads  the throwaway container (ingredients without ingredient_foods, with the recipes that use them),
       scripts/nutrition/bulk/{sr,foundation,fndds} and scripts/nutrition/national/cache/national-foods.json (CoFID, CNF).
Writes a text sheet: per ingredient, the top candidates from each source with energy and macros per 100 g.
A candidate is only a name match. The owner's rule (a record must be the same food or a very close relative within ~10 percent on
calories and main macros, both values cited) is applied by the person deciding, in decisions_w14.psv.
"""
import csv
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BULK = os.path.join(ROOT, "scripts", "nutrition", "bulk")
NAT = os.path.join(ROOT, "scripts", "nutrition", "national", "cache", "national-foods.json")

STOP = {"and", "or", "with", "without", "in", "of", "the", "a", "for", "nfs", "raw", "fresh", "ns", "as", "to", "from"}


def toks(s):
    out = []
    for t in re.findall(r"[a-z0-9]+", s.lower().replace("&", " and ")):
        if t in STOP:
            continue
        if len(t) > 3 and t.endswith("ies"):
            t = t[:-3] + "y"
        elif len(t) > 3 and t.endswith("es") and t[-3] in "sxz":
            t = t[:-2]
        elif len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
            t = t[:-1]
        out.append(t)
    return out


def psql(ctr, sql):
    r = subprocess.run(["docker", "exec", "-i", ctr, "psql", "-U", "postgres", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"], input=sql,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise SystemExit(r.stderr)
    return [ln.split("\t") for ln in r.stdout.splitlines() if ln]


def rd(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        yield from csv.DictReader(fh)


def load_usda(sub, dts, tag):
    # SR / Foundation files key nutrients by the 4-digit id (1008); the FNDDS file by the number (208)
    foods = {}
    for r in rd(os.path.join(BULK, sub, "food.csv")):
        if r["data_type"] in dts:
            foods[r["fdc_id"]] = r["description"]
    nut = defaultdict(dict)
    want = {"1008": "k", "2047": "k2", "2048": "k3", "1003": "p", "1004": "f", "1005": "c", "1079": "fib"}
    if tag == "fndds":
        want = {"208": "k", "203": "p", "204": "f", "205": "c", "291": "fib"}
    n_all = defaultdict(int)
    for r in rd(os.path.join(BULK, sub, "food_nutrient.csv")):
        if r["fdc_id"] in foods and r["amount"] != "":
            n_all[r["fdc_id"]] += 1
            if r["nutrient_id"] in want:
                nut[r["fdc_id"]][want[r["nutrient_id"]]] = float(r["amount"])
    out = []
    for f, d in foods.items():
        n = nut.get(f, {})
        k = n.get("k", n.get("k3", n.get("k2")))
        out.append({"ref": "%s:%s" % (tag, f), "src": tag, "name": d, "k": k, "p": n.get("p"), "f": n.get("f"), "c": n.get("c"), "nn": n_all[f]})
    return out


def load_nat():
    out = []
    for f in json.load(open(NAT, encoding="utf-8")):
        n = f["nut"]
        d = f["name"] + ((" [" + f["desc"][:50] + "]") if f.get("desc") and f["src"] == "cofid" else "")
        out.append({"ref": "%s:%s" % (f["src"], f["code"]), "src": f["src"], "name": d, "k": n.get("energy_kcal"), "p": n.get("protein_g"), "f": n.get("fat_g"),
                    "c": n.get("carbs_g"), "nn": len(n)})
    return out


GENERIC = {"sauce", "paste", "dried", "fresh", "powder", "seed", "leaf", "flour", "spice", "mix", "oil", "blend", "wine", "chile", "chili", "pepper", "sugar", "salt",
           "root", "fruit", "bean", "green", "red", "black", "white", "sweet", "hot", "cheese", "bread", "rice", "meat", "soup", "tea", "juice", "butter", "milk", "cream",
           "ground", "whole", "wild", "korean", "japanese", "chinese", "indian", "thai", "mexican", "italian", "african", "turkish", "persian", "peruvian", "filipino"}


def relaxed(q, dt):
    """Head-word match for names the strict scorer finds nothing for: any distinctive query word (4+ letters, not generic) inside the description."""
    words = [t for t in q if len(t) >= 4 and t not in GENERIC]
    return sum(1 for t in words if t in dt) / len(words) if words else 0


def score(q, dt, dlen):
    """q: query tokens, dt: description token set. Reward covering the query, penalise a long description."""
    if not q:
        return 0
    hit = sum(1 for t in q if t in dt)
    if hit == 0:
        return 0
    cover = hit / len(q)
    if cover < 0.5 or (hit < 2 and len(q) > 1 and cover < 1):
        return 0
    return cover * 10 - 0.35 * max(0, dlen - len(q)) + (3 if hit == len(q) else 0)


def fmt(x):
    return "-" if x is None else ("%.0f" % x if abs(x) >= 10 else "%.1f" % x)


def main():
    ctr = sys.argv[1]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(HERE, "candidates-w14.txt")
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    sql = ("select i.id, i.canonical_name, coalesce(u.pub,0), coalesce(u.rev,0), coalesce((select string_agg(a.alias::text, '; ') from ingredient_aliases a where a.ingredient_id=i.id),'') "
           "from ingredients i left join (select ri.ingredient_id, count(distinct r.id) filter (where r.status='published') pub, count(distinct r.id) filter (where r.status='in_review') rev "
           "from recipe_ingredients ri join recipes r on r.id=ri.recipe_id group by 1) u on u.ingredient_id=i.id "
           "where not exists (select 1 from ingredient_foods f where f.ingredient_id=i.id) order by coalesce(u.pub,0)+coalesce(u.rev,0) desc, i.canonical_name")
    if "--csv" in sys.argv:   # offline: a saved list instead of the container
        ings = [(int(r["id"]), r["canonical_name"], int(r["pub"]), int(r["rev"]), r["aliases"]) for r in
                csv.DictReader(open(sys.argv[sys.argv.index("--csv") + 1], encoding="utf-8", newline=""))]
    else:
        ings = [(int(a), b, int(c), int(d), e) for a, b, c, d, e in psql(ctr, sql)]
    if only:
        ings = [i for i in ings if i[1] in only]
    cat = load_usda("sr", ("sr_legacy_food",), "sr") + load_usda("foundation", ("foundation_food",), "found") + load_usda("fndds", ("survey_fndds_food",), "fndds") + load_nat()
    for c in cat:
        c["t"] = toks(c["name"])
        c["ts"] = set(c["t"])
    print("catalogue", len(cat), "ingredients", len(ings))
    lines = []
    for iid, name, pub, rev, aliases in ings:
        qs = [(name, toks(name))] + [(a, toks(a)) for a in aliases.split("; ") if a][:8]
        best = {}
        for qn, q in qs:
            for c in cat:
                s = score(q, c["ts"], len(c["t"]))
                if qn != name:
                    s -= 1.0
                if s > 3.5 and (c["ref"] not in best or best[c["ref"]][0] < s):
                    best[c["ref"]] = (s, c, qn)
        lines.append("### %s | id %d | pub %d rev %d | aliases: %s" % (name, iid, pub, rev, aliases[:140]))
        by = defaultdict(list)
        for s, c, qn in sorted(best.values(), key=lambda x: -x[0]):
            by[c["src"]].append((s, c, qn))
        shown = 0
        for src in ("sr", "found", "fndds", "cofid", "cnf"):
            seen = set()
            for s, c, qn in by[src][:12]:
                key = (c["name"].lower().replace(", raw", ""), None if c["k"] is None else round(c["k"]))
                if key in seen or (src == "cnf" and any((x["name"].lower(), None if x["k"] is None else round(x["k"])) == key for _, x, _ in by["sr"][:12])):
                    continue
                seen.add(key)
                if len(seen) > 3:
                    break
                lines.append("   %-14s %-3s %-70s k %-4s p %-4s f %-4s c %-4s n%-2d (%.1f %s)" % (c["ref"], "", c["name"][:70], fmt(c["k"]), fmt(c["p"]), fmt(c["f"]), fmt(c["c"]), c["nn"], s, qn if qn != name else ""))
                shown += 1
        if not shown:
            rel = {}
            for qn, q in qs:
                for c in cat:
                    r = relaxed(q, c["ts"])
                    if r > 0 and (c["ref"] not in rel or rel[c["ref"]][0] < r - 0.01 * len(c["t"])):
                        rel[c["ref"]] = (r - 0.01 * len(c["t"]), c, qn)
            top = sorted(rel.values(), key=lambda x: -x[0])[:6]
            for s_, c, qn in top:
                lines.append("   ~%-13s %-3s %-70s k %-4s p %-4s f %-4s c %-4s n%-2d (relaxed %s)" % (c["ref"], "", c["name"][:70], fmt(c["k"]), fmt(c["p"]), fmt(c["f"]), fmt(c["c"]), c["nn"], qn))
            if not top:
                lines.append("   (no name match)")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
