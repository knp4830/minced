-- Minced -- ingredient -> allergen map: SUPERSEDED (wave 10c).
--
-- This file (wave 1) tagged ~700 ingredients with eight allergens, one 'Nuts' bucket and no record of why. It is
-- replaced by supabase/seed-allergen-tags.sql, generated from the reviewed table in
-- scripts/allergens/review/ingredient-allergens.csv (all 1,979 ingredients, 11 allergens, a basis and a reason per tag,
-- plus the diet class). That seed REPLACES the whole ingredient_allergens table, so running this old map afterwards
-- would only re-add untagged-reason rows under names that no longer exist ('Nuts', 'Shellfish').
--
-- Kept as a no-op so old instructions that name it fail safe instead of failing loudly half way.
-- Run order for a fresh database: migrations, seed-ingredients*.sql, ..., then seed-allergen-tags.sql.

select 'seed-allergens.sql is superseded by seed-allergen-tags.sql; nothing to do' as notice;
