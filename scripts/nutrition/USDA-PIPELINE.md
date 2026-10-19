# USDA data pipeline (wave 10, lane A)

Loads the generic USDA catalog and links the canonical ingredients to it. Data only: the tables and the
compute functions belong to the schema lane (`20261017120000_nutrition_tables.sql` and friends).

Licence: USDA FoodData Central (SR Legacy, Foundation, FNDDS, Branded) is CC0. Cite "U.S. Department of
Agriculture, Agricultural Research Service, FoodData Central (fdc.nal.usda.gov)". Open Food Facts (ODbL),
MyFitnessPal, Nutritionix, Edamam and scraped brand sites are NOT used.

## Rebuild from scratch

```
python -I scripts/nutrition/download_bulk.py                 # SR Legacy 2018, Foundation 2025-12, FNDDS 2024-10 -> bulk/ (gitignored)
# export the ingredient list once (needs a database with the snapshot):
python -I scripts/nutrition/_dbq.py <container> scripts/nutrition/export_ingredients.sql > scripts/nutrition/bulk/ings.json
python -I scripts/nutrition/fetch_branded.py --fetch-mapped  # branded records we link, via the API (cached in cache/fdc-branded.json)
python -I scripts/nutrition/build_usda_seeds.py              # writes supabase/seed-nutrition-usda-*.sql + review/*.csv
python -I scripts/nutrition/test_usda_seeds.py
```

Branded Foods is gigabytes and is NOT downloaded in bulk; only the 26 records the mapping uses are fetched.

## Load order (integrator)

After the migrations: `seed-nutrition-usda-1-foods.sql`, `seed-nutrition-usda-2-nutrients-NN.sql`,
`seed-nutrition-usda-3-links.sql`, then `select refresh_all_recipe_nutrients();` with `set jit = off`
(see below). All three are idempotent upserts. Then `analyze;` (the compute plans badly on unanalysed tables).

## What is stored

* `usda_foods`: all 7,793 SR Legacy + 436 Foundation foods + the 26 branded records linked to ingredients.
* `usda_food_nutrients`: per 100 g, keyed through `nutrients.fdc_nutrient_id` (the 4-digit CSV id, never the
  3-digit API number). An unreported nutrient has NO row; a 0 in the source is kept as 0. Vitamin D IU and
  Atwater energy are loaded RAW (hidden nutrients) and converted by the schema at read time. Ten negative
  "by difference" values were clamped to 0 (rounding artefacts above -0.5) or dropped (2 below -0.5).
* `ingredient_foods`: one default food per ingredient and form, plus alternates (`is_default = false`).
* `ingredient_portions`: USDA household weights (clove, head, stalk, fillet, slice, piece, each), curated US can
  sizes, and per-form volume weights for non-default forms (a cooked form never borrows the default's weights).
* `ingredients.density_g_per_ml`: filled only where NULL, from the food's own volume portions (median).

## Mapping files (`mapping/*.tsv`)

One decision per line: `food`, `alt`, `density`, `portion`, `skip`, `same`. See the header of `mapping.py`.
Rules: SR Legacy first; Foundation when it is complete; Branded only for blends and pastes SR lacks, flagged
"label data". Never map when unsure: `skip` rows carry the reason and appear in the review CSV.

`review/ingredient-mapping-review.csv` is the owner's sheet (batches of 30 by recipe-row impact);
`review/curated-weights-review.csv` lists every gram weight that is NOT a plain USDA household weight.

## Findings for other lanes

1. `nutrition_line_report` is 40x slower with JIT on: its large CTE exceeds `jit_above_cost`, 4 lines take
   2.3 s and `refresh_all_recipe_nutrients()` takes over an hour. With `set jit = off` it takes about 80 s.
   The function (and `refresh_recipe_nutrients`, `compute_nutrients`, `nutrition_summary`) need `set jit = off`
   in their definitions: a function-level SET on a caller did not reach the inner statement here.
2. A recipe line with unit `can` should select the ingredient's `canned` form when one exists (58 recipes are
   partial only because of can lines such as "1 can tomatoes"). The seed adds a `drained|rinsed -> canned`
   prep rule, which covers about a third of them.
