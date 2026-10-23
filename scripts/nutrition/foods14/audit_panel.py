"""Wave 14: audit the micronutrient panel of every food an ingredient links to, against the published source.

    python -I -X utf8 scripts/nutrition/foods14/audit_panel.py <container> [--out scripts/nutrition/review/panel-audit-w14.csv]

Needs scripts/nutrition/bulk/{sr,foundation,fndds} (python -I scripts/nutrition/download_bulk.py) and the national cache
(python -I scripts/nutrition/national/load_national.py). Reads the throwaway Postgres container only (never live).

For every usda_foods row that some ingredient links to (any form, default or not) it compares OUR stored per-100 g panel (nutrients 1..35 plus the
hidden IU / Atwater rows) with the publisher's file:
  missing_in_db  the publisher reports it, we do not store it (a trimmed load)       -> must be filled
  extra_in_db    we store it, the publisher does not report it (invented / stale)    -> must go (NULL, never 0)
  mismatch       both exist and differ by more than 0.5 percent + 0.001              -> reported
  zero_extra     a stored 0 where the publisher reports nothing                      -> reported as extra_in_db with value 0
Branded foods have no bulk file: they are audited against the FDC API by audit_branded.py.
Prints coverage per nutrient (percent of linked foods that carry it) so before / after can be compared.
"""
import csv
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BULK = os.path.join(ROOT, "scripts", "nutrition", "bulk")
NAT = os.path.join(ROOT, "scripts", "nutrition", "national", "cache", "national-foods.json")


def psql(ctr, sql):
    r = subprocess.run(["docker", "exec", "-i", ctr, "psql", "-U", "postgres", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"], input=sql,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise SystemExit(r.stderr)
    return [ln.split("\t") for ln in r.stdout.splitlines() if ln]


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        yield from csv.DictReader(fh)


def main():
    ctr = sys.argv[1]
    out = None
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    nuts = {int(a): (b, c) for a, b, c in psql(ctr, "select id, key, coalesce(fdc_nutrient_id::text,'') from nutrients")}
    fid_to_id = {int(c): i for i, (k, c) in nuts.items() if c}
    linked = psql(ctr, "select distinct u.fdc_id, u.data_type, coalesce(u.source_code,'') from ingredient_foods f join usda_foods u using (fdc_id)")
    linked = {int(a): (b, c) for a, b, c in linked}
    stored = defaultdict(dict)
    for a, n, v in psql(ctr, "select x.fdc_id, x.nutrient_id, x.amount_per_100g from usda_food_nutrients x where x.fdc_id in (select fdc_id from ingredient_foods)"):
        stored[int(a)][int(n)] = float(v)
    ours = {int(i) for i in nuts if int(i) <= 35}
    print("linked foods", len(linked), Counter(t for t, _ in linked.values()))

    # publisher side
    pub = defaultdict(dict)
    for sub, dts in (("sr", ("sr_legacy",)), ("foundation", ("foundation",))):
        want = {f for f, (t, _) in linked.items() if t in dts}
        p = os.path.join(BULK, sub, "food_nutrient.csv")
        for r in read_csv(p):
            f = int(r["fdc_id"])
            if f in want and r["amount"] != "":
                n = fid_to_id.get(int(r["nutrient_id"]))
                if n:
                    pub[f][n] = float(r["amount"])
    # FNDDS: the survey file keys nutrients by number (208), not by the 4-digit id
    fnum = {a: int(b) for a, b in psql(ctr, "select fdc_number, id from nutrients where fdc_number is not null")}
    wantf = {f for f, (t, _) in linked.items() if t == "fndds"}
    if wantf:
        for r in read_csv(os.path.join(BULK, "fndds", "food_nutrient.csv")):
            f = int(r["fdc_id"])
            if f in wantf and r["amount"] != "" and r["nutrient_id"] in fnum:
                pub[f][fnum[r["nutrient_id"]]] = float(r["amount"])
    nat = {}
    if os.path.exists(NAT):
        for f in json.load(open(NAT, encoding="utf-8")):
            nat[f["fdc_id"]] = f
    key_to_id = {k: i for i, (k, c) in nuts.items()}
    for f, (t, _) in linked.items():
        if t in ("cofid", "cnf") and f in nat:
            for k, v in nat[f]["nut"].items():
                if k in key_to_id:
                    pub[f][key_to_id[k]] = float(v)

    rows = []
    for f, (t, code) in sorted(linked.items()):
        if t not in ("sr_legacy", "foundation", "cofid", "cnf", "fndds"):
            continue
        s, p = stored.get(f, {}), pub.get(f, {})
        for n in sorted(set(s) | set(p)):
            if n not in nuts:
                continue
            if n in s and n not in p:
                # SR energy rows can be derived at load time (Foundation: Atwater); only flag a clean extra
                rows.append((f, t, nuts[n][0], "extra_in_db", s[n], ""))
            elif n in p and n not in s:
                rows.append((f, t, nuts[n][0], "missing_in_db", "", p[n]))
            elif abs(s[n] - p[n]) > 0.005 * abs(p[n]) + 0.001:
                rows.append((f, t, nuts[n][0], "mismatch", s[n], p[n]))
    c = Counter((r[1], r[3]) for r in rows)
    print("differences:", dict(c))
    byn = Counter((r[2], r[3]) for r in rows)
    for (k, kind), n in sorted(byn.items()):
        print("  %-22s %-14s %d" % (k, kind, n))
    if out:
        with open(out, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["fdc_id", "data_type", "nutrient", "kind", "stored", "published"])
            w.writerows(rows)

    # coverage per nutrient over the foods that are the default of some ingredient form
    dfl = {int(a) for (a,) in psql(ctr, "select distinct fdc_id from ingredient_foods where is_default")}
    print("\ncoverage over %d default foods (percent carrying each nutrient):" % len(dfl))
    for i in sorted(ours):
        have = sum(1 for f in dfl if i in stored.get(f, {}))
        print("  %-22s %5.1f%% (%d)" % (nuts[i][0], 100.0 * have / len(dfl), have))


if __name__ == "__main__":
    main()
