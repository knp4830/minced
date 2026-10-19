# Wave 10 + 11 + 10c live steps (in order; nothing here has been run against live)

Verified on a fresh snapshot restore in exactly this order (migrations about 3 minutes, seeds about 3 minutes, refresh about 3 minutes).
The snapshot at `.snapshot/live.sql` lacks some wave 7-9 objects; live has them once PR #57's steps ran, so on live skip `scripts/allergens/build-db-pre.sh`.

1. Restore the Supabase project (it pauses) and wait for ACTIVE_HEALTHY. Back up live first (CLAUDE.md procedure). Note `auth.users` and Storage are not in the dump.
2. Apply migrations in timestamp order (wave 9's `20261017100000` and `110000` must already be on live; live goes 37 to 57, the 20 below are new).
   Wave 10+11 (ten):
   `20261017120000_nutrition_tables`, `120100_nutrition_compute`, `120200_nutrition_search_and_hooks`, `150000_me_food_nutrient_snapshot`,
   `150100_recipe_ingredient_foods`, `160000_user_settings`, `160100_filtered_recipes_exclude`, `170000_nutrition_can_rule`, `180000_nutrition_recipe_audit`, `190000_search_foods_lead_ranking`.
   Wave 10c (ten):
   `20261018100000_nutrition_math_10c` (strict form rules, assumptions, size words),
   `110000_national_food_sources` (usda_foods.data_type gains cofid / cnf, source_code),
   `120000_allergens_split_and_diet_class` (nuts split, 11 allergens, diet_class, optional-only allergens),
   `130000_fridge_recipes_grouped` (grouped fridge RPC and add_missing_to_shopping_list),
   `140000_nutrient_dris_and_food_source` (nutrient_dris table, me_food_log.source),
   `150000_allergen_predicate_helper` (ONE `recipe_has_allergen()`; rewrites the predicate in match_recipes, search_recipes, filtered_recipes and fridge_recipes_grouped, aborts if any of them does not contain it exactly once; must come after `130000`),
   `160000_recipe_national_sources` (licence credit under the label),
   `170000_food_proxy_and_brand_display` (`ingredient_foods.is_proxy`, stand-ins reach `nutrition_assumptions()`, `search_foods()` and `my_recipe_foods()` show `brand_name` only, never the barcode-prefix owner).
   `180000_vegan_requires_no_animal_allergen_tag` (vegan may not sit beside a dairy / egg / fish / shellfish / mollusks allergen tag of any basis; replaces `recipe_diet_rows()`; takes effect at the diet refresh in `seed-allergen-tags.sql`).
   `20261019120000_recipe_has_allergen_legacy_nuts` (allergen fixer: the database predicate also expands the legacy `nuts` slug to peanuts + tree-nuts; plain `create or replace`, safe for a non-superuser),
   `20261019100000_nutrition_computed_recipes_columns` (fixer round 2: `refresh_recipe_nutrients()` writes the computed macro columns for EVERY recipe we computed, not only a member's; the 106 "Minced original" recipes kept AI-drafted calories up to 98 percent off. Takes effect at the refresh in step 4; a computed recipe that is not complete then shows no calories column, and its label says "at least" from the ingredient rows).
   NOTE `150000_allergen_predicate_helper` now begins with `select similarity('a','a');` (docs/LESSONS.md section 2): without it a NON-superuser role (live) fails with "permission denied to set parameter pg_trgm.word_similarity_threshold" while re-creating search_recipes; a superuser snapshot hides this.
   (All twenty are needed BEFORE the code is merged; code first gives 500 on /settings, /pantry, /recipes when signed in, recipe pages and the Me panel.)
3. Seeds, each idempotent, in this order (supabase/ folder, run as the postgres role):
   `seed-nutrition-usda-1-foods.sql`, `seed-nutrition-usda-2-nutrients-01.sql`, `seed-nutrition-usda-3-links.sql`,
   `seed-ingredients-world.sql`, `seed-nutrition-world.sql`, `seed-nutrition-branded-extra.sql`, `seed-nutrition-zz-integration.sql`,
   `seed-nutrition-zy-replacements.sql`, `seed-nutrition-zzz-corrections.sql` (audit-foods fixes, see `scripts/nutrition/corrections/README.md`),
   `seed-nutrition-zzzz-recipe-audit.sql` (audit-recipes fixes: to-taste list, prep rules, cooked forms, line corrections, `is_optional`; its lines are listed in `scripts/nutrition/review/recipe-line-fixes.csv`),
   then 10c: `seed-nutrition-10c-foods.sql` (mappings, brand fixes, UK CoFID and Canadian Nutrient File foods), `seed-nutrition-zzzzz-math-10c.sql` (must be the LAST nutrition seed: qualifier rules, size factors, "1% milk" and "hot cocoa mix", cheddar assumption, restored recipe lines),
   and last of all `seed-allergen-tags.sql` (tags every ingredient: allergen, basis, reason, diet_class; runs `refresh_all_recipe_allergens()` and `refresh_all_recipe_diets()`; it REFUSES to run if an ingredient is missing from its table, so regenerate with `python scripts/allergens/build.py --seed` after any change to the ingredient set).
   Fixer round 1: the `low-fat milk` alias is now repointed to `1% milk` inside `seed-nutrition-zzzzz-math-10c.sql` (the 10c-foods seed runs before that ingredient exists and its guarded update is a no-op on a fresh database); `zzzzz` also adds sweetened ingredients to `added_sugar_ingredients` (dried cranberries 0.90, chocolate chips, corn syrup...); `seed-allergen-tags.sql` now marks 9 garnish lines (`scripts/allergens/review/garnish-lines.csv`, prep note gets ", for garnish") so their allergen is optional-only. Re-running `zzzzz` after the allergen seed re-adds a reason-less tag for `hot cocoa mix`; always run `seed-allergen-tags.sql` last.
   Fixer round 2 (audit-recipes): `seed-nutrition-zzzzz-math-10c.sql` now also (a) restores `fresh cranberries` on Cranberry Pumpkin Muffins, `ground ginger` on Ginger Bread Mix, `dried onion flakes` on three dehydrated-onion lines, `beet greens` on Sauteed Beet Greens, and the stated weight on three each-count potato lines (all in `scripts/nutrition/review/recipe-line-fixes-10c.csv`); (b) pairs a can's weight with its record (425 g net for the solids-and-liquids low-sodium black beans, no-salt-added corn and canned white / great northern / navy beans); (c) adds cooked egg (173424), boiled potato / corn, dried navy and great northern beans, and a juiced lemon / lime form (USDA yield 48 g / 44 g) with rules for `boiled`, `juiced` and `squeezed`; (d) gives water a low-sodium form and an each-weight so ice cubes and unsized water are never gaps; (e) a papaya `small` size factor. Re-run `python -I scripts/nutrition/build_math_seed_10c.py` after editing the CSVs. The refresh in step 4 now also rewrites the macro columns of every "Minced original" recipe from its ingredients.
   Fixer round 1 (audit-foods): CoFID `carbs_g` is stored only where CHO < 1 g (CHO is monosaccharide-equivalent, so CHO + fibre overstated starchy foods); black beans are SR 175237 read as cooked-equivalent drained solids (owner to confirm vs SR 175188 canned); seven dried-bean brands dropped from the canned default form; Aroy-D ready-to-eat green curry unlinked from the paste; sorghum syrup, semola rimacinata defaults corrected; new ingredient `light cream` (`single cream` alias moved to it, so `seed-allergen-tags.sql` now tags 1,983 ingredients); whole-wheat bread slice 32 g and whole-wheat pita 64 g; 11 more declared stand-ins. `scripts/nutrition/national/load_national.py` must be re-run (cache is gitignored) before `build_10c.py` if you regenerate.
4. `ANALYZE;` then, in the SAME session, `SET jit = off; SELECT refresh_all_recipe_nutrients();` (expect 957, about 3 minutes; never with JIT on).
5. `VACUUM (FULL, ANALYZE) recipes;` (the refresh rewrites every recipe row).
6. Verify by counting, not "no error" (numbers from the integration run on the snapshot):
   ingredients 1,983; aliases 3,014; usda_foods 10,092 (branded 1,822, sr_legacy 7,793, foundation 436, cofid 23, cnf 18);
   ingredient_foods 3,514; ingredient_portions 1,990; ingredients with a food 1,738 (245 without; see the open items in the PR); declared stand-ins flagged `ingredient_foods.is_proxy` 306 (136 recipes say so under the label);
   nutrition_status complete 664 / partial 290 / unavailable 3 (fixer round 2);
   recipes per allergen (957, counted on the integrated branch after fixer round 2): dairy 440, egg 192, fish 84, gluten 396, mollusks 4, peanuts 37, sesame 19, shellfish 10, soy 154, tree-nuts 50, wheat 372 (required lines; plus optional-only garnish: dairy 10, egg 3, gluten 2, peanuts 3, sesame 2, soy 6, tree-nuts 13, wheat 2);
   recipes per diet: gluten-free 559, pescatarian 57, vegan 238, vegetarian 392;
   `scripts/nutrition/sql-checks.sql`, `scripts/nutrition/check_usda_seeds.sql`, `scripts/nutrition/test_recipe_audit.sql`, `scripts/nutrition/test_10c.sql` and `supabase/tests/allergens_test.sql`, `fridge_grouped_test.sql` return no failures;
   `scripts/nutrition/validate_myplate.sql` prints the MyPlate comparison (status complete, 575 recipes: median kcal error 6.2%, protein 6.6, carbs 7.3, fat 7.3, 81.2% within 15%; every recipe counted from 90%+ of its mass, 848 recipes: median 8.7%, 66.9% within 15%); database about 54 MB after VACUUM.
   Label invariants: `psql -At -f scripts/nutrition/export_label_inputs_10c.sql > label-inputs.json` then `node --experimental-strip-types scripts/test-label-coherence-10c.mts label-inputs.json` (957 labels, 0 problems).
7. `pnpm db:types` (already regenerated in this branch from the snapshot, additions only; re-run only if live differs), merge the PR, wait for deploy,
   revalidate recipe pages (ISR 1 h) so labels appear.
8. Smoke on live: a recipe page label, `/settings`, `/recipes` signed in with saved defaults, `/pantry` signed in and signed out, Me "Add food" type-ahead, filter "no peanuts" on /recipes, /pantry and search.
