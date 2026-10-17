# World ingredients and brand foods (wave 10)

Adds canonical ingredients the catalog lacks (world cuisines) and widely sold brand foods, all with nutrition from
**USDA FoodData Central** (SR Legacy, Foundation, Branded Foods; public domain, CC0 1.0). No Open Food Facts, MyFitnessPal,
Nutritionix, Edamam or scraped brand websites.

Output (committed): `supabase/seed-ingredients-world.sql`, `supabase/seed-nutrition-world.sql`, `review/*.csv`.
Run order at integration: wave 10 migrations (which create `nutrients`, `usda_foods`, `usda_food_nutrients`, `ingredient_foods`,
`ingredient_portions`), then the other nutrition seeds, then `seed-ingredients-world.sql`, then `seed-nutrition-world.sql`.
Both files are idempotent (`ON CONFLICT DO NOTHING`, guarded updates).

## How a row is built

1. `data/ingredients-*.txt` is the curated list: `name | aisle | filter_group | regions | aliases | allergens | hint`.
   `name` is what a cook types, in English; native and regional names are aliases; no simple plurals (CLAUDE.md vocabulary rules).
   `hint` is `<sr tokens> // <branded phrase>`. SR tokens must all appear in the USDA description (raw preferred; cooked, canned,
   frozen, prepared are penalised unless asked for; `-word` excludes; `_` is a space; `proxy:` marks an approximation).
   After `//` is a word-bounded phrase for FDC Branded Foods; options `cat=`, `d=` (g per ml for liquids), `-word`.
   `-` means "no USDA food": the ingredient is still added so people can use it, but a recipe containing it is partial.
2. `resolve.py` picks the food: SR Legacy / Foundation first (full micronutrients), otherwise the **medoid** of all complete US branded
   products matching the phrase (the real product whose energy and macros sit closest to the group median), never an outlier.
3. `data/brands-*.txt` lists brand specs: `ingredient | brand tokens | description phrase | options`. `brands.py` finds up to `n` products
   per spec, newest record per GTIN, shortest plain name first, and keeps only records that pass `quality.py`.
4. `emit_sql.py` applies the duplicate policy (below), pulls portions and density from USDA household weights (`portions.py`), and writes
   the seeds and review CSVs. `report.py` writes the region and category summaries.

## Quality rules (quality.py)

* US market, serving size in g or ml, energy + protein + fat + carbohydrate + sodium all reported.
* Energy within the Atwater band of 4P + 4C + 9F (alcohol, fibre and polyols are allowed for by a generous band), macros not above 105 g/100 g.
* Serving at least 1.5 g or ml. Labels round, so a 0.4 g spice serving that rounds to 0 kcal is not a true zero (unless the ingredient really
  is zero energy: salt, water, vinegar, tea, coffee, food colouring).
* Liquids sold by volume (ml serving) are converted to per 100 g with a stated density (spec `d=`, the ingredient's own density, or its
  USDA cup weight); products with no known density are skipped, never guessed.
* Dry staples must be dry (`kmin=250`); canned bean products are `form=canned` and must be under 200 kcal/100 g.
* Per ingredient and form, products whose energy is far from the group median are dropped as a different product.

## Duplicate policy

A new name that already resolves (exact, alias or singular) to an existing ingredient is skipped and listed in
`review/skipped-ingredients.csv`. Exceptions where the foods differ in nutrition (skim / reduced fat / whole milk, whole wheat pasta
and bread, ancho chile vs fresh poblano, tomato puree vs paste): the new row is kept, the old alias is re-pointed at it, and variants
join their parent's family so pantry matching still works.

## Testing

`test/contract_stub.sql` is a TEST FIXTURE of the shared data contract (not a migration). `test/reset_testdb.sh` builds a throwaway database
from a pristine reference container, `test/run_seed_test.sh` applies both seeds twice (idempotency), reports the database growth and runs
`test/checks.sql` (names resolve to themselves, no negative or implausible values, one default food per ingredient and form, portions sane).

Re-running from scratch needs the gitignored FDC downloads: `compact_fdc.py` (SR Legacy, Foundation, Branded zips from
fdc.nal.usda.gov/fdc-datasets), `add_survey.py` (FNDDS), `load_scratch.sh`, then `resolve.py`, `check_dupes.py`, `brands.py`, `emit_sql.py`.
