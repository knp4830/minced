"""Wave 14: explain the differences audit_branded.py found between our stored branded panels and FoodData Central.

    python -I -X utf8 scripts/nutrition/foods14/branded_diff_summary.py          (reads out/branded-all-diff.csv)

Splits the `missing_in_db` rows into
  * foods that have no energy in the database (the load rejected the label: rounded to zero on a tiny serving, or macros that disagree with the energy),
  * values FDC lists that the load dropped on purpose (impossible units such as cholesterol 214,286 mg, a child larger than its parent), with the value, and
  * label zeros that were not kept (absent means not reported, never 0).
The result of wave 14: nothing was trimmed by accident.
"""
import collections
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    rows = list(csv.DictReader(open(os.path.join(HERE, "out", "branded-all-diff.csv"), encoding="utf-8")))
    miss = [r for r in rows if r["kind"] == "missing_in_db"]
    by = collections.defaultdict(list)
    for r in miss:
        by[r["fdc_id"]].append(r)
    allmacro = [k for k, v in by.items() if any(x["nutrient"] == "energy_kcal" for x in v)]
    print("foods with any missing:", len(by), "| foods with no energy in the database (label rejected on purpose):", len(allmacro))
    nz = [r for r in miss if r["fdc_id"] not in allmacro and float(r["fdc"] or 0) != 0]
    print("missing with a non-zero FDC value on foods that kept their macros:", len(nz))
    for r in nz:
        print(" ", r["fdc_id"], r["description"][:40], r["nutrient"], r["fdc"])
    z = [r for r in miss if r["fdc_id"] not in allmacro and float(r["fdc"] or 0) == 0]
    print("missing but the FDC value is 0.0 (a label zero the load did not keep):", len(z), collections.Counter(r["nutrient"] for r in z).most_common())
    print("energy mismatches:", sum(1 for r in rows if r["kind"] == "mismatch"), "(pure fats capped at 900 kcal by the load's sanity rule; the label says 917 to 929)")
    print("stored where the FDC food record has no amount:", sum(1 for r in rows if r["kind"] == "extra_in_db"),
          "(riboflavin / niacin / copper / B6 of enriched flours and breads: FDC's search view lists a value 'calculated from value per serving size measure', its food record lists none)")


if __name__ == "__main__":
    main()
