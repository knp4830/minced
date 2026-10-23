#!/usr/bin/env python3
"""Write docs/content/RECIPE-REVIEW-w14.md from the throwaway container the seeds were applied to.

    python -I scripts/myplate/w14_review.py <container> > docs/content/RECIPE-REVIEW-w14.md

Reads the computed recipes back from the database (never from the payload), so the sheet shows what the owner will
actually see in /admin/review.
"""
import csv
import json
import subprocess
import sys
from pathlib import Path

C = sys.argv[1]
OGL = "Contains public sector information licensed under the Open Government Licence v3.0."

SQL = """
select coalesce(json_agg(x order by x.src, x.slug), '[]') from (
 select r.slug, r.title, r.servings, r.prep_time_min, r.cook_time_min, r.source_name, r.source_url, r.source_license,
  case when r.source_license like 'Contains public sector%%' then 'nhs' else 'usda' end as src,
  round(r.calories) as kcal, round(r.protein_g) as protein, round(r.carbs_g) as carbs, round(r.fat_g) as fat,
  r.nutrition_status, r.nutrition_gaps, r.nutrition_assumptions,
  (select json_agg(a.name order by a.name) from recipe_allergens ra join allergens a on a.id = ra.allergen_id where ra.recipe_id = r.id) as allergens,
  (select json_agg(d.name order by d.name) from recipe_diets rd join diets d on d.id = rd.diet_id where rd.recipe_id = r.id) as diets,
  (select json_agg(json_build_object('q', ri.quantity, 'u', u.name, 'n', i.canonical_name, 'p', ri.prep_note, 'o', ri.is_optional) order by ri.sort_order)
     from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id left join units u on u.id = ri.unit_id where ri.recipe_id = r.id) as ings,
  (select json_agg(s.instruction order by s.sort_order) from recipe_steps s where s.recipe_id = r.id) as steps
 from recipes r
 where r.status = 'in_review' and (r.source_license like 'Contains public sector%%' or (r.source_name like '%%MyPlate%%' and r.created_at > now() - interval '1 day'))
) x;
"""


def q(sql: str) -> str:
    p = subprocess.run(["docker", "exec", "-i", C, "psql", "-U", "postgres", "-At"], input=sql, capture_output=True, text=True, encoding="utf-8")
    if p.returncode:
        sys.exit(p.stderr)
    return p.stdout


def fmt_q(x):
    if x is None:
        return ""
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    rows = json.loads(q(SQL).strip())
    nhs_pub = {r["slug"]: r["nutrition"] for r in json.load(open("scripts/nhs/artifacts/selected.json", encoding="utf-8"))}
    usda_pub = {r["slug"]: r["nutrition"] for r in json.load(open("scripts/myplate/artifacts/rescue-federal.json", encoding="utf-8"))}
    rewrites = {}
    for r in json.load(open("scripts/nhs/artifacts/selected.json", encoding="utf-8")):
        rewrites[r["slug"]] = [(i["orig"], i["line"], i["prep_note"]) for i in r["ingredients"] if i.get("orig") != i["line"] or i.get("prep_note")]

    print("# Wave 14 recipe review sheet\n")
    print("Everything below lands as `in_review`; nothing is public until you approve it in `/admin/review`. Numbers are computed by the database from the ingredient rows (never typed); "
          "`complete` means every line was counted, `partial` means a named gap (the label then says \"at least\" and shows no calories column).\n")
    print("## 1. Licence and credit (read this first)\n")
    print("- **NHS Better Health: Healthier Families recipes.** The NHS terms (https://www.nhs.uk/our-policies/terms-and-conditions/, clauses 3.3 to 3.4) release NHS website content under the Open Government Licence v3.0, commercial use included. "
          "Clause 3.5 excludes logos, images, personal data and third-party items, so **no image was taken**. Clause 3.6b: adapted content must carry "
          f"\"{OGL}\" and must not be attributed to the NHS website. The page itself shows only a Crown copyright line; the licence grant is in the site terms. "
          "robots.txt does not disallow `/healthier-families/`; pages were fetched at one request every 3 seconds. **The recipe page does not yet render this credit line** "
          "(it shows \"Original recipe by Minced\" for any unknown source), so approve none of the NHS recipes until the credit is shown (patch in the lane report).")
    print("- **USDA MyPlate rescues.** Public-domain US federal works, from the Internet Archive capture. Only pages whose `Source:` names a federal body were rescued; pages credited to a university, extension service, state agency or company are listed in section 5 and were NOT imported.\n")

    for title, key, pub in (("2. NHS pilot (20 recipes)", "nhs", nhs_pub), ("3. Rescued USDA MyPlate recipes", "usda", usda_pub)):
        grp = [r for r in rows if r["src"] == key]
        print(f"## {title}\n")
        if not grp:
            print("None.\n")
            continue
        print("| Recipe | Serves | Our kcal | Published kcal | Protein / carbs / fat (ours) | Status | Allergens | Diets |")
        print("|---|---|---|---|---|---|---|---|")
        for r in grp:
            p = pub.get(r["slug"], {})
            print(f"| [{r['title']}]({r['source_url']}) | {r['servings']} | {r['kcal'] if r['kcal'] is not None else 'n/a'} | {fmt_q(p.get('calories')) or 'n/a'} | "
                  f"{r['protein'] if r['protein'] is not None else '-'} / {r['carbs'] if r['carbs'] is not None else '-'} / {r['fat'] if r['fat'] is not None else '-'} | {r['nutrition_status']} | "
                  f"{', '.join(r['allergens'] or []) or 'none'} | {', '.join(r['diets'] or []) or '-'} |")
        print()
        for r in grp:
            print(f"### {r['title']}  (`{r['slug']}`)\n")
            print(f"Source: {r['source_url']}  \nCredit: {r['source_license']}  \nTimes: prep {r['prep_time_min']} min, cook {r['cook_time_min']} min.\n")
            if r["nutrition_gaps"]:
                print(f"Named gaps: {'; '.join(r['nutrition_gaps'])}\n")
            print("Ingredients as stored:\n")
            for i in r["ings"] or []:
                qty = fmt_q(i["q"])
                print(f"- {qty} {i['u'] or ''} {i['n']}{', ' + i['p'] if i['p'] else ''}{' (optional)' if i['o'] else ''}".replace("-  ", "- ").replace("  ", " "))
            if key == "nhs" and rewrites.get(r["slug"]):
                print("\nWording changed before matching (page text -> catalog name):\n")
                for o, l, n in rewrites[r["slug"]]:
                    print(f"- `{o}` -> `{l}`{' [' + n + ']' if n else ''}")
            print("\nMethod:\n")
            for n, s in enumerate(r["steps"] or [], 1):
                print(f"{n}. {s}")
            print()

    print("## 4. NHS candidates not imported\n")
    print("The pilot looked at all 183 Healthier Families pages that publish structured data (4 of 187 were not parsed) and took the 20 above. The rest are not rejects of quality; they were either not needed for the pilot of 20 or failed a gate. "
          "The most common gate failures, by recipe count: \"lower-fat spread\" / \"reduced-fat\" cheeses with no matching ingredient (mapped to margarine / cheddar / cream cheese with a low-fat qualifier where the dish still reads true); "
          "\"handful\" and \"sprig\" amounts (no gram weight, so rejected rather than guessed); \"mixed salad leaves\" style blends; and UK-only items (wafer-thin ham, pizza bases, malt loaves, popping corn).\n")
    print("## 5. USDA MyPlate pages not imported\n")
    src_csv = Path("scripts/myplate/artifacts/rescue-sources.csv")
    if src_csv.exists():
        rows_csv = list(csv.DictReader(open(src_csv, encoding="utf-8")))
        from collections import Counter
        print("Pages in the Internet Archive capture that are not in the catalog, by who the page credits:\n")
        for k, n in Counter(r["class"] for r in rows_csv).most_common():
            print(f"- {k}: {n}")
        print("\nSee `docs/content/MYPLATE-NOT-IMPORTED-w14.csv` for every page, its credited source and the reason.\n")


main()
