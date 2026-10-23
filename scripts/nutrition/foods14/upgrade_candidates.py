"""Wave 14 aid: branded default foods that a fuller, non-branded record of the SAME food could replace.

    python -I -X utf8 scripts/nutrition/foods14/upgrade_candidates.py <container> > out/upgrade-candidates.txt

A branded default is a label: 6 to 21 of the 35 tracked nutrients, values rounded to the label's serving. When USDA SR Legacy / Foundation / FNDDS, UK CoFID or the Canadian
Nutrient File has a record of the same food, that record carries the full panel from the publisher's analysis. This prints, per branded default, the best name match in each
trusted source with energy, macros and panel size so a person can decide (decisions go to decisions_w14.psv as `relink`, kind `same`, never `close`).
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import candidates_w14 as c  # noqa: E402


def main():
    ctr = sys.argv[1]
    rows = c.psql(ctr, """select i.canonical_name, coalesce((select string_agg(a.alias::text, '; ') from ingredient_aliases a where a.ingredient_id=i.id),''),
      u.fdc_id, left(u.description, 40), food_nutrient_amount(u.fdc_id,1::smallint,i.id), food_nutrient_amount(u.fdc_id,2::smallint,i.id), food_nutrient_amount(u.fdc_id,7::smallint,i.id),
      food_nutrient_amount(u.fdc_id,3::smallint,i.id), (select count(*) from usda_food_nutrients x where x.fdc_id=u.fdc_id and x.nutrient_id <= 35),
      (select count(distinct ri.recipe_id) from recipe_ingredients ri where ri.ingredient_id=i.id)
      from ingredient_foods f join ingredients i on i.id=f.ingredient_id join usda_foods u on u.fdc_id=f.fdc_id
      where f.is_default and f.form='default' and u.data_type='branded' order by 10 desc, 1""")
    cat = c.load_usda("sr", ("sr_legacy_food",), "sr") + c.load_usda("foundation", ("foundation_food",), "found") + c.load_usda("fndds", ("survey_fndds_food",), "fndds") + c.load_nat()
    for x in cat:
        x["t"] = c.toks(x["name"])
        x["ts"] = set(x["t"])
    fl = lambda v: None if v in ("", None) else float(v)  # noqa: E731
    for name, aliases, fid, desc, k, p, f, cb, panel, nrec in rows:
        qs = [(name, c.toks(name))] + [(a, c.toks(a)) for a in aliases.split("; ") if a][:4]
        best = {}
        for qn, q in qs:
            for x in cat:
                if not q or not all(t in x["ts"] for t in q):
                    continue
                s = 10 - 0.5 * max(0, len(x["t"]) - len(q)) - (0 if qn == name else 1)
                if x["ref"] not in best or best[x["ref"]][0] < s:
                    best[x["ref"]] = (s, x)
        top = sorted(best.values(), key=lambda v: -v[0])[:4]
        if not top:
            continue
        print("### %s | recipes %s | now brand %s %s | k %s p %s f %s c %s | panel %s" % (name, nrec, fid, desc, c.fmt(fl(k)), c.fmt(fl(p)), c.fmt(fl(f)), c.fmt(fl(cb)), panel))
        for s, x in top:
            print("     %-14s %-60s k %-4s p %-4s f %-4s c %-4s n%d" % (x["ref"], x["name"][:60], c.fmt(x["k"]), c.fmt(x["p"]), c.fmt(x["f"]), c.fmt(x["c"]), x["nn"]))


if __name__ == "__main__":
    main()
