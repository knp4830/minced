# Wave 10+11 live steps (in order; nothing here has been run against live)

Verified on a fresh snapshot restore in exactly this order (about 2 minutes of SQL plus 90 s refresh).

1. Restore the Supabase project (it pauses) and wait for ACTIVE_HEALTHY. Back up live first (CLAUDE.md procedure). Note `auth.users` and Storage are not in the dump.
2. Apply migrations in timestamp order (wave 9's `20261017100000` and `110000` are already on live once PR #57's steps ran; the ten below are new, live goes 37 to 47):
   `120000_nutrition_tables`, `120100_nutrition_compute`, `120200_nutrition_search_and_hooks`, `150000_me_food_nutrient_snapshot`,
   `150100_recipe_ingredient_foods`, `160000_user_settings`, `160100_filtered_recipes_exclude`, `170000_nutrition_can_rule`, `180000_nutrition_recipe_audit`, `190000_search_foods_lead_ranking`.
   (All ten are needed BEFORE the code is merged; code first gives 500 on /settings, /recipes when signed in, and the Me panel.)
3. Seeds, each idempotent, in this order (supabase/ folder, run as the postgres role):
   `seed-nutrition-usda-1-foods.sql`, `seed-nutrition-usda-2-nutrients-01.sql`, `seed-nutrition-usda-3-links.sql`,
   `seed-ingredients-world.sql`, `seed-nutrition-world.sql`, `seed-nutrition-branded-extra.sql`, `seed-nutrition-zz-integration.sql`,
   `seed-nutrition-zy-replacements.sql`, `seed-nutrition-zzz-corrections.sql` (audit-foods fixes, see `scripts/nutrition/corrections/README.md`), then `seed-nutrition-zzzz-recipe-audit.sql` (must be last; audit-recipes fixes: to-taste list, prep rules, cooked forms, line corrections, `is_optional`; its lines are listed in `scripts/nutrition/review/recipe-line-fixes.csv`).
4. `ANALYZE;` then, in the SAME session, `SET jit = off; SELECT refresh_all_recipe_nutrients();` (expect 957, about 90 s; never with JIT on).
5. `VACUUM (FULL, ANALYZE) recipes;` (the refresh rewrites every recipe row).
6. Verify by counting, not "no error": ingredients 1,979 (was 610); aliases 3,004; usda_foods 10,406 (2,177 branded);
   ingredient_foods 3,696; ingredient_portions 1,762; nutrition_status complete 703 / partial 250 / unavailable 4 (a main ingredient with no amount is now a named gap instead of a free 0 g, so fewer recipes are "complete");
   `scripts/nutrition/sql-checks.sql`, `scripts/nutrition/check_usda_seeds.sql` and `scripts/nutrition/test_recipe_audit.sql` return no failures; `scripts/nutrition/validate_myplate.sql` prints the MyPlate comparison; database about 49 MB before the recipe refresh, 61 MB after it (VACUUM FULL recipes then).
7. `pnpm db:types` (already regenerated in this branch; re-run only if live differs), merge the PR, wait for deploy,
   revalidate recipe pages (ISR 1 h) so labels appear.
8. Smoke on live: a recipe page label, `/settings`, `/recipes` signed in with saved defaults, Me "Add food" type-ahead.
