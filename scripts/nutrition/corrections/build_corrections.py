"""Splice link_corrections.tsv into supabase/seed-nutrition-zzz-corrections.sql (between the BEGIN/END LINK ACTIONS markers).

    python -I scripts/nutrition/corrections/build_corrections.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SQL = os.path.join(HERE, "..", "..", "..", "supabase", "seed-nutrition-zzz-corrections.sql")
BEGIN = "-- BEGIN LINK ACTIONS (generated; edit scripts/nutrition/corrections/link_corrections.tsv)\n"
END = "-- END LINK ACTIONS\n"


def lit(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    rows = list(csv.DictReader(open(os.path.join(HERE, "link_corrections.tsv"), encoding="utf-8", newline=""), delimiter="\t"))
    vals = []
    for r in rows:
        assert r["action"] in ("drop_link", "set_default", "unmap"), r
        fdc = r["fdc_id"].strip() or "null"
        vals.append(f"  ({lit(r['action'])}, {lit(r['ingredient'])}, {lit(r['form'])}, {fdc}, {lit(r['reason'])})")
    block = "insert into _link_actions (action, ingredient, form, fdc_id, reason) values\n" + ",\n".join(vals) + ";\n"
    s = open(SQL, encoding="utf-8").read()
    a, b = s.index(BEGIN) + len(BEGIN), s.index(END)
    with open(SQL, "w", encoding="utf-8", newline="\n") as f:
        f.write(s[:a] + block + s[b:])
    print(len(rows), "link actions written")


main()
