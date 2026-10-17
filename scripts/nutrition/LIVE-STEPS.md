# Wave 10+11 live steps (in order; nothing here has been run against live)

Verified on a fresh snapshot restore in exactly this order (about 2 minutes of SQL plus 90 s refresh).

1. Restore the Supabase project (it pauses) and wait for ACTIVE_HEALTHY. Back up live first (CLAUDE.md procedure). Note `auth.users` and Storage are not in the dump.
2. Apply migrations in timestamp order (wave 9: `20261017100000`, `20261017110000`; wave 10+11):
   `120000_nutrition_tables`, `120100_nutrition_compute`, `120200_nutrition_search_and_hooks`, `150000_me_food_nutrient_snapshot`,
   `150100_recipe_ingredient_foods`, `160000_user_settings`, `160100_filtered_recipes_exclude`, `170000_nutrition_can_rule`.
   (All 10 are needed BEFORE the code is merged; code first gives 500 on /settings, /recipes when signed in, and the Me panel.)
3. Seeds, each idempotent, in this order (supabase/ folder, run as the postgres role):
   `seed-nutrition-usda-1-foods.sql`, `seed-nutrition-usda-2-nutrients-01.sql`, `seed-nutrition-usda-3-links.sql`,
   `seed-ingredients-world.sql`, `seed-nutrition-world.sql`, `seed-nutrition-zz-integration.sql` (must be last).
4. `ANALYZE;` then, in the SAME session, `SET jit = off; SELECT refresh_all_recipe_nutrients();` (expect 957, about 90 s; never with JIT on).
5. `VACUUM (FULL, ANALYZE) recipes;` (the refresh rewrites every recipe row).
6. Verify by counting, not "no error": ingredients 1,981 (was 610); aliases 3,022; usda_foods 10,593 (2,364 branded);
   ingredient_foods 3,877; ingredient_portions 1,740; nutrition_status complete 826 / partial 131 / unavailable 0;
   `scripts/nutrition/sql-checks.sql` and `scripts/nutrition/check_usda_seeds.sql` return no failures; database about 52 MB.
7. `pnpm db:types` (already regenerated in this branch; re-run only if live differs), merge the PR, wait for deploy,
   revalidate recipe pages (ISR 1 h) so labels appear.
8. Smoke on live: a recipe page label, `/settings`, `/recipes` signed in with saved defaults, Me "Add food" type-ahead.
