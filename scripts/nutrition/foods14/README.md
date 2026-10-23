# Wave 14: foods and exact vitamins

Two jobs, one seed (`supabase/seed-nutrition-w14-foods.sql`, generated, idempotent, no migration, no new package). Live steps: `scripts/nutrition/LIVE-STEPS.md`, "Wave 14".

## 1. A trusted food for every ingredient that has none

At the start of wave 14, 458 of 1,984 ingredients had no food. The owner's rules:

* A record must be **the food itself** (USDA SR Legacy / Foundation / FNDDS first; UK CoFID or Canadian CNF for world ingredients, licences as recorded in
  `national/LICENCES.md`; a real FoodData Central label only when it is the actual product), or the **same food in another form**, or a **very close relative**
  within about 10 percent on calories and the main macros, with both values cited. Otherwise the ingredient stays a **named gap**.
* Strict stand-ins stay strict: a blend with no trusted record stays a named gap (Italian seasoning, Dijon mustard, scotch bonnet).
* A record the recipe maths cannot use (no energy: CoFID asafoetida, CoFID Chinese 5 spice) is not linked: it would only turn "no USDA food linked" into
  "food has no nutrient data" (`food_has_nutrition()` needs energy).

Result: 22 ingredients get a food (each IS that food, none is a stand-in), 17 label defaults are upgraded to a fuller trusted record of the same food, beef stew meat and
pointed gourd follow the owner's decisions, and 436 stay named gaps. Of the 458, almost all are regional spices, blends, pastes and specialty items for which no
trusted record exists; `review/foods-w14.csv` gives the reason for each (and the closest record that was considered but not used, with its values).

Files

* `decisions_w14.psv` is the source of truth: `ingredient | action | ref | kind | form | note | evidence`.
  * `link`: the ingredient has no food; `ref` becomes its default. `relink`: it has one; `ref` replaces it (the old default stays as an alternate when within 25 percent).
  * `upgrade`: a branded (label) default is replaced by a trusted record of the SAME food. The build refuses unless the new panel is at least 5 nutrients fuller and
    energy stays within 12 percent (or 5 kcal) and each macro within 12 percent (or 2.5 g) of the label.
  * `gap`: a named gap. `ref` (optional) is the closest record that was considered; the sheet prints its values.
  * `kind`: `same` (the record IS this food), `form` (the same food in another form), `close` (a very close relative; `evidence` lists independent trusted records, and
    the build stops unless every one of them is within 12 percent / 5 kcal and 12 percent / 2.5 g of the record). The stand-in flag is set for `close` only.
  * `ref`: `sr:<fdc_id>`, `found:<fdc_id>`, `fndds:<fdc_id>`, `cofid:<code>`, `cnf:<code>`, `brand:<fdc_id>` (a real FDC label, from `fetch_food.py`).
  * An ingredient with no line is a named gap with the default reason.
* `candidates_w14.py` (a name-match aid over SR / Foundation / FNDDS / CoFID / CNF), `gather14.py` (FoodData Central search: non-branded records and how many real labels
  agree), `label_agreement.py` (where 5 or more usable labels agree), `direct_hits.py`, `upgrade_candidates.py` produce `candidates-w14.txt`, `fdc-hits-w14.txt` and
  `out/upgrade-candidates.txt`. They help a person decide; they decide nothing.
* `build_w14.py <container>` checks every decision, loads the full panel of any record that is not in the database yet (SR / Foundation from the database, FNDDS from the
  survey CSVs through `nutrients.fdc_number`, CoFID / CNF from the national cache, a label from the FDC API cache), derives densities and household weights from the record's
  own USDA portions (never guessed), lists sweetened foods in `added_sugar_ingredients`, and writes `supabase/seed-nutrition-w14-foods.sql`,
  `scripts/nutrition/review/foods-w14.csv` and `scripts/nutrition/test_w14_foods.sql`.

## 2. Exact vitamins and minerals

* `audit_panel.py <container>` compares the per-100 g panel we store for every linked SR Legacy / Foundation / FNDDS / CoFID / CNF food with the publisher's own file.
  Kinds: `missing_in_db` (a trimmed load), `extra_in_db` (stored where the publisher reports nothing), `mismatch`. Result before and after wave 14: `differences: {}`.
* `audit_branded.py <container>` does the same for FoodData Central Branded foods through the API (`GET /v1/food/<id>`, cached outside the repo, one request about every
  1.1 s). On the 292 branded foods that are a default, the only differences are values the load dropped on purpose (label-rounded zeros on tiny servings, an impossible
  unit in the source, a child larger than its parent): see `out/branded-defaults-diff-before.csv`.
* `coverage_w14.sql` prints, per nutrient, how many default foods (and recipe lines) carry it, read the way the app reads it (`food_nutrient_amount`);
  `coverage_table.py` joins before and after into `review/panel-coverage-w14.csv`. A nutrient a source does not report has no row: NULL, never 0. Added sugars read 100 percent
  by design (the schema returns 0 for an ingredient that is not a sweetener), so that line is not a coverage figure.
* `outliers_w14.sql` lists the three largest stored values per nutrient among default foods; none is a unit slip (butter oil cholesterol was the old one, already fixed).
* What limits coverage now is the sources, not the load: SR Legacy does not report vitamin K / choline / trans fat for many foods, labels report 6 to 21 nutrients.

## Rebuild

```
python -I scripts/nutrition/download_bulk.py                         # SR Legacy, Foundation, FNDDS CSVs -> bulk/
python -I scripts/nutrition/national/load_national.py               # CoFID and CNF -> national/cache (gitignored)
bash scripts/nutrition/foods14/restore_w12state.sh <container>      # throwaway database that matches live (snapshot + the Wave 12 steps)
python -I -X utf8 scripts/nutrition/foods14/gather14.py <container>  # FDC search (key in .env.local; cached in W14_CACHE, about 1,700 requests)
python -I -X utf8 scripts/nutrition/foods14/build_w14.py <container> # writes the seed, the review sheet and the checks
bash scripts/nutrition/foods14/apply.sh <container> supabase/seed-nutrition-w14-foods.sql scripts/nutrition/test_w14_foods.sql
```

`<container>` is a throwaway Postgres. The scripts only read it (the apply step writes the seed into it, never into live). Windows note: run Python with `-X utf8`.
The FDC key allows 3,600 requests an hour; `gather14.py` uses 12 workers and `audit_branded.py` one.
