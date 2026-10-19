"""One-off builder for link_corrections.tsv (kept so the list is reproducible and reviewable).

Inputs: the audit's wrong_links.csv (fdc_id, ing, form, is_default, ... reason) passed as argv[1], plus the fixer's own
additions below. Output: link_corrections.tsv beside this file. The TSV (not this script) is the source of truth that
build_corrections.py splices into supabase/seed-nutrition-zzz-corrections.sql.

Actions
  drop_link    delete one ingredient_foods row (ingredient, form, fdc_id). If it was the default, the corrections seed
               promotes another passing food of the same form, or leaves the form unmapped when none remains.
  set_default  make (ingredient, form, fdc_id) the default, linking it first when it is not linked yet.
  unmap        delete every food link (form '*' = all forms) and every household weight of the ingredient.
"""
import csv
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

EXTRA = [
    ("drop_link", "chicken bouillon", "default", "2103757", "fixer: shrimp bouillon"),
    ("drop_link", "chicken bouillon", "default", "2055351", "fixer: ham flavor bouillon"),
    ("drop_link", "chicken bouillon", "default", "2658084", "fixer: beef flavor bouillon"),
    ("drop_link", "chicken bouillon", "default", "2272625", "fixer: beef flavor bouillon"),
    ("drop_link", "chicken bouillon", "default", "2703459", "fixer: flavor not stated"),
    ("drop_link", "chicken bouillon", "default", "1470206", "fixer: flavor not stated"),
    ("drop_link", "maple syrup", "default", "2563134", "fixer: ORIGINAL SYRUP is a pancake syrup, not maple"),
    ("drop_link", "maple syrup", "default", "2273347", "fixer: ORIGINAL SYRUP is a pancake syrup, not maple"),
    ("drop_link", "maple syrup", "default", "1628085", "fixer: ORIGINAL SYRUP is a pancake syrup, not maple"),
    ("drop_link", "maple syrup", "default", "2039980", "fixer: TABLE SYRUP is not maple"),
    ("drop_link", "maple syrup", "default", "1628093", "fixer: LITE SYRUP is not maple"),
    ("drop_link", "dried cranberries", "default", "362358", "fixer: cheese with cranberries"),
    ("drop_link", "cheddar cheese", "default", "1620090", "fixer: beef and cheddar franks"),
    ("drop_link", "granulated sugar", "default", "2170013", "fixer: powdered sugar"),
    ("drop_link", "kalamata olives", "default", "2550776", "fixer: olive spread"),
    ("drop_link", "jerk seasoning", "default", "1178660", "fixer: hot pepper sauce"),
    ("drop_link", "pickled ginger", "default", "1923417", "fixer: honey and ginger fruit juice"),
    ("drop_link", "strawberry yogurt", "default", "2109486", "fixer: strawberry cheese tubes"),
    ("drop_link", "sweet pickle relish", "default", "1592845", "fixer: dill relish is not sweet relish"),
    ("drop_link", "sweet pickle relish", "default", "1601925", "fixer: dill relish is not sweet relish"),
    ("drop_link", "sweet pickle relish", "default", "2541457", "fixer: dill relish is not sweet relish"),
    ("drop_link", "sweet pickle relish", "default", "2601817", "fixer: dill relish is not sweet relish"),
    ("drop_link", "sweet pickle relish", "default", "2155383", "fixer: dill relish is not sweet relish"),
    ("drop_link", "ramen noodles", "default", "623428", "fixer: ramen wakame miso soup"),
    ("drop_link", "soba noodles", "default", "1774211", "fixer: chilli miso ramen meal"),
    ("drop_link", "pita bread", "default", "2426842", "fixer: toasted pita bits"),
    ("drop_link", "phyllo dough", "default", "1857691", "fixer: baklava"),
    ("drop_link", "whole wheat flour", "default", "2404971", "fixer: whole wheat pearl couscous"),
    ("drop_link", "whole grain mustard", "default", "2037615", "fixer: honey dijon mustard"),
    ("drop_link", "sichuan peppercorns", "default", "1981171", "fixer: stir fry sauce"),
    ("drop_link", "greek yogurt", "default", "1215240", "fixer: chocolate topped dessert"),
    ("drop_link", "chipotle in adobo", "default", "1869021", "fixer: chipotle sauce, no adobo"),
    ("drop_link", "chipotle in adobo", "default", "2592860", "fixer: chipotle sauce, no adobo"),
    ("drop_link", "longganisa", "default", "458222", "fixer: a vegan longanisa as the default"),
    ("drop_link", "old bay seasoning", "default", "2533994",
     "fixer: energy label-rounded to 0 on a 0.6 g serving; the earlier mapping lane skipped this ingredient for the same reason"),
    ("drop_link", "matcha", "default", "1940857", "fixer: matcha booster beverage mixer"),
    ("drop_link", "canned clams", "default", "171977", "canned clam LIQUID (about 2 kcal/100 g), not the clams"),
    ("set_default", "canned clams", "default", "171976", "SR canned clams, drained solids (the clams, 142 kcal/100 g)"),
    ("set_default", "matcha", "default", "2465824", "plain matcha powder (label: 1/2 tsp = 1.5 g, 333 kcal/100 g)"),
    ("set_default", "bresaola", "default", "2305175", "dry-cured bresaola, 179 kcal/100 g with protein 35.7 g (the old default read 250 vs 161 expected); added by add_foods.py"),
    ("set_default", "chicken", "default", "171052", "raw is the usual recipe state; cooked roasted overstated raw-weight lines by about 40 percent"),
    ("set_default", "chicken", "cooked", "171054", "prep notes saying cooked/shredded/roasted route to this form"),
    ("unmap", "garlic scapes", "*", "", "proxy: bulb garlic is 149 vs about 43 kcal/100 g for scapes; unmapped rather than overstate 3x"),
    ("unmap", "fenugreek leaves", "*", "", "proxy: spinach is 23 vs about 49 kcal/100 g for fresh methi"),
    ("unmap", "suya spice", "*", "", "proxy: curry powder is 325 vs about 500 kcal/100 g (ground peanut based)"),
    ("unmap", "hilsa", "*", "", "proxy: Atlantic herring is 158 vs about 270 kcal/100 g (hilsa is much fattier)"),
    ("unmap", "guanciale", "*", "", "proxy: bacon is 417 vs about 650 kcal/100 g (jowl is almost pure fat)"),
    ("unmap", "everything bagel seasoning", "*", "", "labels disagree 0 to 714 kcal (tiny servings round to 0); the earlier mapping lane skipped it"),
    ("unmap", "old bay seasoning", "*", "", "salt-based blend; branded labels round to 0; the earlier mapping lane skipped it"),
    ("unmap", "lemon pepper", "*", "", "labels round to 0 kcal per serving and salt varies; the earlier mapping lane skipped it"),
    ("unmap", "dosa batter", "*", "", "only a dry idli/dosa mix exists in the data, not batter"),
    ("unmap", "dried tofu", "*", "", "pressed/baked tofu: only seasoned baked cubes exist in the data"),
    ("unmap", "hibiscus flowers", "*", "", "only flowers in syrup exist in the data; dried calyces are not sweetened"),
    ("unmap", "fonio", "*", "", "the only plain fonio record has 20 kcal/100 g beside 82 g carbohydrate (about 356 expected) and a corrupt serving"),
]


def main():
    src = sys.argv[1]
    rows = list(csv.DictReader(open(src, encoding="utf-8")))
    out = [("drop_link", r["ing"], r["form"], r["fdc_id"], f"{r['sev']}: {r['reason']}") for r in rows]
    seen, final = set(), []
    for a in out + EXTRA:
        key = a[:4]
        if key in seen:
            continue
        seen.add(key)
        final.append(a)
    with open(os.path.join(HERE, "link_corrections.tsv"), "w", encoding="utf-8", newline="\n") as f:
        f.write("action\tingredient\tform\tfdc_id\treason\n")
        for a in final:
            f.write("\t".join(a) + "\n")
    print(len(final), "actions")


main()
