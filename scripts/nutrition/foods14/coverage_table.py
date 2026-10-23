"""Wave 14: join out/coverage-before.txt and out/coverage-after.txt (coverage_w14.sql output) into scripts/nutrition/review/panel-coverage-w14.csv and print a table.

    python -I -X utf8 scripts/nutrition/foods14/coverage_table.py
"""
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REVIEW = os.path.join(HERE, "..", "review", "panel-coverage-w14.csv")


def load(name):
    out = {}
    for ln in open(os.path.join(HERE, "out", name), encoding="utf-8"):
        p = ln.strip().split("|")
        if len(p) == 7 and p[0] != "nutrient":
            out[p[0]] = p
    return out


def main():
    b, a = load("coverage-before.txt"), load("coverage-after.txt")
    rows = []
    for k, v in b.items():
        w = a[k]
        rows.append([k, v[1], v[2], v[3], w[1], w[2], w[3], v[4], v[5], v[6], w[4], w[5], w[6]])
    with open(REVIEW, "w", encoding="utf-8", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["nutrient", "foods_with_before", "foods_total_before", "foods_pct_before", "foods_with_after", "foods_total_after", "foods_pct_after",
                     "lines_with_before", "lines_total_before", "lines_pct_before", "lines_with_after", "lines_total_after", "lines_pct_after"])
        wr.writerows(rows)
    print("%-20s %8s %8s   %8s %8s" % ("nutrient", "foods%B", "foods%A", "lines%B", "lines%A"))
    for r in rows:
        print("%-20s %8s %8s   %8s %8s" % (r[0], r[3], r[6], r[9], r[12]))


if __name__ == "__main__":
    main()
