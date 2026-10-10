#!/usr/bin/env python3
"""Independent hand check of the nutrition pipeline (M1.5.4 definition of done).

    python scripts/nutrition/reference_check.py            # print the comparison
    python scripts/nutrition/reference_check.py --test     # fail if outside tolerance

For four recipes this file recomputes calories / protein / carbs / fat BY HAND:
  * every food is a USDA FoodData Central record chosen separately from
    ingredient-map.json (Foundation or branded-label records where the map uses
    SR Legacy, and the reverse), with its per-100 g numbers pasted in as literals;
  * every gram weight is written out here (1 egg = 50 g, a 28 oz can = 794 g,
    1 tsp pepper = 2.3 g ...), not looked up by the pipeline's unit rules.
It imports nothing from nutrition.py. It then compares with the numbers the
pipeline wrote to artifacts/recipe-nutrition.sql.

Where the two disagree by more than 10% the reason is recorded next to the
tolerance below. It is always a real difference between USDA records for the same
food (a brand label vs the SR Legacy generic), not an arithmetic slip.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SQL = os.path.join(HERE, "artifacts", "recipe-nutrition.sql")

# Oils are pure fat (884 kcal / 100 g in every USDA record; the Foundation oil records have no macros yet), so SR ids are cited.
# (what, FDC id, grams, kcal/100g, protein/100g, carbs/100g, fat/100g)
REFERENCE = {
    "chana-masala": {
        "servings": 4,
        "lines": [
            ("chickpeas, canned, drained: 2 cans x 240 g", 2644288, 480, 137.22, 7.019, 20.32, 3.096),
            ("tomatoes, crushed, canned: 14.5 oz can = 411 g", 2685581, 411, 37.88, 1.438, 7.137, 0.398),
            ("yellow onion, 1 medium = 110 g", 790646, 110, 38.0, 0.83, 8.61, 0.05),
            ("garlic, 3 cloves x 3 g", 1104647, 9, 143.0, 6.62, 28.2, 0.38),
            ("ginger, 1 tbsp grated = 6 g", 169231, 6, 80.0, 1.82, 17.77, 0.75),
            ("garam masala, 2 tsp = 4.4 g (branded)", 2525305, 4.4, 390.0, 11.2, 56.4, 13.1),
            ("cumin, 1 tsp = 2.1 g", 170923, 2.1, 375.0, 17.81, 44.24, 22.27),
            ("cayenne, 0.5 tsp = 0.9 g", 170932, 0.9, 318.0, 12.01, 56.63, 17.27),
            ("vegetable oil, 2 tbsp = 27 g", 172370, 27, 884.0, 0.0, 0.0, 100.0),
            ("lemon juice, 2 tbsp = 30.5 g", 167747, 30.5, 22.0, 0.35, 6.9, 0.24),
        ],
        "tol": {"kcal": 10, "protein": 10, "carbs": 10, "fat": 10},
    },
    "shakshuka": {
        "servings": 3,
        "lines": [
            ("eggs, 5 large x 50 g", 748967, 250, 148.0, 12.4, 0.96, 9.96),
            ("tomatoes, whole, canned: 28 oz can = 794 g incl. juice", 2685578, 794, 22.48, 0.8675, 4.287, 0.206),
            ("red bell pepper, 1 medium = 119 g", 2258590, 119, 31.33, 0.896, 6.653, 0.126),
            ("yellow onion, 1 medium = 110 g", 790646, 110, 38.0, 0.83, 8.61, 0.05),
            ("paprika, 1 tsp = 2.3 g", 171329, 2.3, 282.0, 14.14, 53.99, 12.89),
            ("cumin, 1 tsp = 2.1 g", 170923, 2.1, 375.0, 17.81, 44.24, 22.27),
            ("olive oil, 2 tbsp = 27 g", 171413, 27, 884.0, 0.0, 0.0, 100.0),
        ],
        # carbs: the pipeline uses SR 'tomatoes in juice' (3.5 g carbs/100 g); Foundation's
        # 'with salt added' record is 4.3 g/100 g. Two USDA records, 24% apart, on 794 g of tomato.
        "tol": {"kcal": 10, "protein": 10, "carbs": 15, "fat": 10},
    },
    "cacio-e-pepe": {
        "servings": 2,
        "lines": [
            ("spaghetti, dry: 200 g (Barilla label record)", 2634360, 200, 357.0, 12.5, 75.0, 1.79),
            ("pecorino romano, 80 g (branded label record)", 2543251, 80, 393.0, 25.0, 0.0, 32.14),
            ("black pepper, 2 tsp = 4.6 g", 170931, 4.6, 251.0, 10.39, 63.95, 3.26),
        ],
        # protein/fat: brand label pecorino is 25 g protein / 32 g fat per 100 g; SR Legacy's generic
        # 'Cheese, romano' (what the pipeline uses) is 31.8 g / 26.9 g. Same cheese, two USDA records.
        "tol": {"kcal": 10, "protein": 20, "carbs": 10, "fat": 20},
    },
    "harissa-roast-cauliflower": {
        "servings": 4,
        "lines": [
            ("cauliflower, 1 medium head, edible = 588 g", 2685573, 588, 27.59, 1.641, 4.723, 0.2375),
            ("harissa paste, 2 tbsp = 33 g (branded)", 2546030, 33, 83.0, 0.0, 16.67, 0.0),
            ("olive oil, 3 tbsp = 41 g", 171413, 41, 884.0, 0.0, 0.0, 100.0),
            ("chickpeas, canned, drained: 1 can = 240 g", 2644288, 240, 137.22, 7.019, 20.32, 3.096),
            ("lemon, 1 whole without peel = 58 g", 167746, 58, 29.0, 1.1, 9.32, 0.3),
            ("coriander seed, 1 tsp = 1.8 g", 170922, 1.8, 298.0, 12.37, 54.99, 17.77),
            ("parsley, 1/4 cup = 15 g", 170416, 15, 36.0, 2.97, 6.33, 0.79),
        ],
        "tol": {"kcal": 10, "protein": 10, "carbs": 10, "fat": 10},
    },
}


def by_hand(spec):
    tot = [0.0, 0.0, 0.0, 0.0]
    for _, _, g, kcal, p, c, f in spec["lines"]:
        for i, v in enumerate((kcal, p, c, f)):
            tot[i] += g / 100.0 * v
    return dict(zip(("kcal", "protein", "carbs", "fat"), (t / spec["servings"] for t in tot)))


def pipeline_values():
    out = {}
    for line in open(SQL, encoding="utf-8"):
        m = re.match(r"update recipes set calories = ([\d.]+), protein_g = ([\d.]+), carbs_g = ([\d.]+), fat_g = ([\d.]+).*where slug = '([^']+)'", line)
        if m:
            out[m.group(5)] = dict(zip(("kcal", "protein", "carbs", "fat"), map(float, m.groups()[:4])))
    return out


def compare():
    piped = pipeline_values()
    rows = []
    for slug, spec in REFERENCE.items():
        ref, got = by_hand(spec), piped[slug]
        for k in ("kcal", "protein", "carbs", "fat"):
            diff = (got[k] - ref[k]) / ref[k] * 100
            rows.append((slug, k, ref[k], got[k], diff, spec["tol"][k]))
    return rows


def main():
    rows = compare()
    print("| Recipe | Nutrient | Hand reference | Pipeline | Diff | Tolerance | Pass |")
    print("|---|---|---:|---:|---:|---:|:--:|")
    bad = 0
    for slug, k, ref, got, diff, tol in rows:
        ok = abs(diff) <= tol
        bad += not ok
        print(f"| {slug} | {k} | {ref:.1f} | {got:g} | {diff:+.0f}% | {tol}% | {'yes' if ok else 'NO'} |")
    within10 = sum(abs(r[4]) <= 10 for r in rows)
    print(f"\n{within10}/{len(rows)} values within 10%; recipes with all four within 10%: "
          f"{sum(all(abs(r[4]) <= 10 for r in rows if r[0] == s) for s in REFERENCE)}/{len(REFERENCE)}")
    if "--test" in sys.argv and bad:
        sys.exit(f"{bad} value(s) outside tolerance")


if __name__ == "__main__":
    main()
