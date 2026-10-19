# Wave 10 + 11 + 10c live steps (in order; nothing here has been run against live)

Verified on a fresh snapshot restore in exactly this order (migrations about 3 minutes, seeds about 3 minutes, refresh about 3 minutes).
The snapshot at `.snapshot/live.sql` lacks some wave 7-9 objects; live has them once PR #57's steps ran, so on live skip `scripts/allergens/build-db-pre.sh`.

1. Restore the Supabase project (it pauses) and wait for ACTIVE_HEALTHY. Back up live first (CLAUDE.md procedure). Note `auth.users` and Storage are not in the dump.
2. Apply migrations in timestamp order (wave 9's `20261017100000` and `110000` must already be on live; live goes 37 to 54, the 17 below are new).
   Wave 10+11 (ten):
   `20261017120000_nutrition_tables`, `120100_nutrition_compute`, `120200_nutrition_search_and_hooks`, `150000_me_food_nutrient_snapshot`,
   `150100_recipe_ingredient_foods`, `160000_user_settings`, `160100_filtered_recipes_exclude`, `170000_nutrition_can_rule`, `180000_nutrition_recipe_audit`, `190000_search_foods_lead_ranking`.
   Wave 10c (seven):
   `20261018100000_nutrition_math_10c` (strict form rules, assumptions, size words),
   `110000_national_food_sources` (usda_foods.data_type gains cofid / cnf, source_code),
   `120000_allergens_split_and_diet_class` (nuts split, 11 allergens, diet_class, optional-only allergens),
   `130000_fridge_recipes_grouped` (grouped fridge RPC and add_missing_to_shopping_list),
   `140000_nutrient_dris_and_food_source` (nutrient_dris table, me_food_log.source),
   `150000_allergen_predicate_helper` (ONE `recipe_has_allergen()`; rewrites the predicate in match_recipes, search_recipes, filtered_recipes and fridge_recipes_grouped, aborts if any of them does not contain it exactly once; must come after `130000`),
   `160000_recipe_national_sources` (licence credit under the label).
   (All seventeen are needed BEFORE the code is merged; code first gives 500 on /settings, /pantry, /recipes when signed in, recipe pages and the Me panel.)
3. Seeds, each idempotent, in this order (supabase/ folder, run as the postgres role):
   `seed-nutrition-usda-1-foods.sql`, `seed-nutrition-usda-2-nutrients-01.sql`, `seed-nutrition-usda-3-links.sql`,
   `seed-ingredients-world.sql`, `seed-nutrition-world.sql`, `seed-nutrition-branded-extra.sql`, `seed-nutrition-zz-integration.sql`,
   `seed-nutrition-zy-replacements.sql`, `seed-nutrition-zzz-corrections.sql` (audit-foods fixes, see `scripts/nutrition/corrections/README.md`),
   `seed-nutrition-zzzz-recipe-audit.sql` (audit-recipes fixes: to-taste list, prep rules, cooked forms, line corrections, `is_optional`; its lines are listed in `scripts/nutrition/review/recipe-line-fixes.csv`),
   then 10c: `seed-nutrition-10c-foods.sql` (mappings, brand fixes, UK CoFID and Canadian Nutrient File foods), `seed-nutrition-zzzzz-math-10c.sql` (must be the LAST nutrition seed: qualifier rules, size factors, "1% milk" and "hot cocoa mix", cheddar assumption, restored recipe lines),
   and last of all `seed-allergen-tags.sql` (tags every ingredient: allergen, basis, reason, diet_class; runs `refresh_all_recipe_allergens()` and `refresh_all_recipe_diets()`; it REFUSES to run if an ingredient is missing from its table, so regenerate with `python scripts/allergens/build.py --seed` after any change to the ingredient set).
4. `ANALYZE;` then, in the SAME session, `SET jit = off; SELECT refresh_all_recipe_nutrients();` (expect 957, about 3 minutes; never with JIT on).
5. `VACUUM (FULL, ANALYZE) recipes;` (the refresh rewrites every recipe row).
6. Verify by counting, not "no error" (numbers from the integration run on the snapshot):
   ingredients 1,981; aliases 3,012; usda_foods 10,110 (branded 1,842, sr_legacy 7,793, foundation 436, cofid 23, cnf 16);
   ingredient_foods 3,518; ingredient_portions 1,968; ingredients with a food 1,741 (240 without; see the open items in the PR);
   nutrition_status complete 659 / partial 295 / unavailable 3;
   recipes per allergen (published 957): dairy 429, egg 193, fish 80, gluten 377, mollusks 4, peanuts 39, sesame 20, shellfish 10, soy 139, tree-nuts 55, wheat 353;
   recipes per diet: gluten-free 578, pescatarian 57, vegan 251, vegetarian 381;
   `scripts/nutrition/sql-checks.sql`, `scripts/nutrition/check_usda_seeds.sql`, `scripts/nutrition/test_recipe_audit.sql`, `scripts/nutrition/test_10c.sql` and `supabase/tests/allergens_test.sql`, `fridge_grouped_test.sql` return no failures;
   `scripts/nutrition/validate_myplate.sql` prints the MyPlate comparison (status complete: median kcal error 6.5%, 77.0% within 15%; every recipe counted from 90%+ of its mass: median 9.8%, 63.7% within 15%); database about 54 MB after VACUUM.
   Label invariants: `psql -At -f scripts/nutrition/export_label_inputs_10c.sql > label-inputs.json` then `node --experimental-strip-types scripts/test-label-coherence-10c.mts label-inputs.json` (957 labels, 0 problems).
7. `pnpm db:types` (already regenerated in this branch from the snapshot, additions only; re-run only if live differs), merge the PR, wait for deploy,
   revalidate recipe pages (ISR 1 h) so labels appear.
8. Smoke on live: a recipe page label, `/settings`, `/recipes` signed in with saved defaults, `/pantry` signed in and signed out, Me "Add food" type-ahead, filter "no peanuts" on /recipes, /pantry and search.
