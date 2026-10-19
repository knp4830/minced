#!/usr/bin/env bash
# Exports the ingredient list build.py reads (work/ingredients.psv) from a database container, using the CURRENT
# tags as the "previous allergens" column. Run it after any change to the ingredient set, then
#   python scripts/allergens/build.py --untagged     # new ingredients show up here with no tag
# add lines to review/tag-sources*.txt, and regenerate with --seed. The seed refuses to run if any ingredient is
# missing from the generated class table, so a forgotten ingredient fails loudly instead of being untagged.
#   CT=<container> bash scripts/allergens/export-ingredients.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
CT="${CT:-w10c-allergens-db}" bash "$HERE/q.sh" "select i.id, i.canonical_name, coalesce(i.filter_group,''), i.aisle_category, coalesce((select string_agg(a.slug,';' order by a.slug) from ingredient_allergens ia join allergens a on a.id=ia.allergen_id where ia.ingredient_id=i.id),''), (select count(*) from recipe_ingredients ri where ri.ingredient_id=i.id) from ingredients i order by i.id" > "$HERE/work/ingredients.psv"
wc -l "$HERE/work/ingredients.psv"
