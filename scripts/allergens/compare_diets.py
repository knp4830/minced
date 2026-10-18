#!/usr/bin/env python3
"""Old hand-made diet tags vs the derived ones. For every old tag that disappeared, show which ingredients block it.
   python scripts/allergens/compare_diets.py [removed|added-count]"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CT = os.environ.get("CT", "w10c-allergens-db")

def q(sql):
    r = subprocess.run(["docker", "exec", "-i", CT, "psql", "-At", "-F", "|", "-U", "postgres", "-d", "postgres", "-c", sql], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr); sys.exit(1)
    return [l.split("|") for l in r.stdout.strip().split("\n") if l]

old = {tuple(l.strip().split("|")) for l in open(os.path.join(HERE, "work", "old_diets.psv"), encoding="utf-8") if l.strip()}
new = {tuple(x) for x in q("select r.slug, d.slug from recipe_diets rd join recipes r on r.id=rd.recipe_id join diets d on d.id=rd.diet_id")}
order = {"vegan": 3, "vegetarian": 2, "pescatarian": 1}
# normalise: a vegan tag satisfies vegetarian and pescatarian (diet_satisfying), so compare "effective" sets
def eff(tags):
    out = set()
    for slug, diet in tags:
        out.add((slug, diet))
        if diet == "vegan":
            out |= {(slug, "vegetarian"), (slug, "pescatarian")}
        if diet == "vegetarian":
            out.add((slug, "pescatarian"))
    return out
eo, en = eff(old), eff(new)
removed = sorted(eo - en)
print(f"old tags {len(old)}, new tags {len(new)}; effective old {len(eo)}, effective new {len(en)}; effectively removed {len(removed)}, effectively added {len(en - eo)}")
if len(sys.argv) > 1 and sys.argv[1] == "removed":
    for slug, diet in removed:
        if diet == "pescatarian" and (slug, "vegetarian") in eo and (slug, "vegetarian") not in en:
            pass
        blockers = q(f"""select string_agg(distinct i.canonical_name || '[' || i.diet_class || ']', ', ') from recipes r join recipe_ingredients ri on ri.recipe_id=r.id join ingredients i on i.id=ri.ingredient_id
          where r.slug='{slug}' and (case '{diet}' when 'vegan' then i.diet_class <> 'plant' when 'vegetarian' then i.diet_class in ('meat','seafood') when 'pescatarian' then i.diet_class = 'meat'
            when 'gluten-free' then exists(select 1 from ingredient_allergens ia join allergens a on a.id=ia.allergen_id where ia.ingredient_id=i.id and a.slug='gluten') end)""")
        print(f"  {slug}: lost {diet}  <- {blockers[0][0] if blockers and blockers[0] else '?'}")
