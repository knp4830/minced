-- Sanity gates for the nutrition data, run AFTER the nutrition migrations, the seed-nutrition-*.sql
-- files and refresh_all_recipe_nutrients(). Read-only except the last block.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/nutrition/sql-checks.sql
--
-- Every gate raises on failure with the offenders, so a green run means every gate passed.
-- Gate list (plan section 4.4): no negatives; kcal within 10% of 4P+4C+9F; plausible maxima;
-- coverage in (0,1]; status consistent with its rows; a default food per (ingredient, form);
-- a second refresh produces identical rows (md5).

\echo == food-level gates (usda_food_nutrients, per 100 g)
do $$
declare n int; list text;
begin
  select count(*), string_agg(fdc_id::text, ', ' order by fdc_id) into n, list
  from (select fdc_id from usda_food_nutrients where amount_per_100g < 0 limit 20) x;
  if n > 0 then raise exception 'GATE negative amounts: foods %', list; end if;

  -- energy cannot exceed pure fat (SR oils and tallow are 902; branded labels round up to about 930, so the ceiling is 940); salt is the sodium ceiling (about 39,300 mg / 100 g)
  select count(*), string_agg(fdc_id || ':' || nutrient_id || '=' || amount_per_100g, ', ') into n, list
  from (select fdc_id, nutrient_id, amount_per_100g from usda_food_nutrients
        where (nutrient_id = 1 and amount_per_100g > 940)
           or (nutrient_id = 13 and amount_per_100g > 40000)
           or (nutrient_id in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11) and amount_per_100g > 100)
        order by fdc_id limit 20) x;
  if n > 0 then raise exception 'GATE implausible per-100 g values: %', list; end if;

  -- macros cannot add up to far more than 100 g (allow label rounding on branded foods)
  select count(*), string_agg(fdc_id::text, ', ') into n, list
  from (select m.fdc_id from (select fdc_id,
               sum(amount_per_100g) filter (where nutrient_id = 2) as p,
               sum(amount_per_100g) filter (where nutrient_id = 3) as c,
               sum(amount_per_100g) filter (where nutrient_id = 7) as f
        from usda_food_nutrients where nutrient_id in (2, 3, 7) group by fdc_id) m
        where coalesce(m.p, 0) + coalesce(m.c, 0) + coalesce(m.f, 0) > 105 order by m.fdc_id limit 20) x;
  if n > 0 then raise exception 'GATE protein+carbs+fat > 105 g per 100 g: foods %', list; end if;
  raise notice 'ok food-level gates';
end $$;

\echo == link gates (ingredient_foods, ingredient_portions)
do $$
declare n int; list text;
begin
  select count(*), string_agg(ingredient_id || '/' || form, ', ') into n, list from (
    select ingredient_id, form from ingredient_foods group by 1, 2 having count(*) filter (where is_default) <> 1 limit 20) x;
  if n > 0 then raise exception 'GATE (ingredient, form) without exactly one default: %', list; end if;

  select count(*), string_agg(fdc_id::text, ', ') into n, list from (
    select distinct f.fdc_id from ingredient_foods f
    where f.is_default and not food_has_nutrition(f.fdc_id) order by 1 limit 20) x;
  if n > 0 then raise warning 'WARN % default foods have no energy value (their recipes stay gaps): %', n, list; end if;

  select count(*), string_agg(ingredient_id::text, ', ') into n, list from (
    select ingredient_id from ingredient_portions
    where grams_per_unit > 2000 and unit_id is not null order by 1 limit 20) x;
  if n > 0 then raise exception 'GATE portion over 2 kg per unit: ingredients %', list; end if;
  raise notice 'ok link gates';
end $$;

\echo == recipe-level gates (recipe_nutrients, recipes.nutrition_*)
do $$
declare n int; list text;
begin
  select count(*) into n from recipes where nutrition_status is null;
  if n > 0 then raise warning 'WARN % recipes were never refreshed (run refresh_all_recipe_nutrients())', n; end if;

  select count(*), string_agg(slug, ', ') into n, list from (
    select r.slug from recipes r where r.nutrition_status = 'complete'
      and not exists (select 1 from recipe_nutrients x where x.recipe_id = r.id and x.nutrient_id = 1) limit 20) x;
  if n > 0 then raise exception 'GATE complete recipe without a calories row: %', list; end if;

  select count(*), string_agg(slug, ', ') into n, list from (
    select r.slug from recipes r where r.nutrition_status = 'complete' and cardinality(r.nutrition_gaps) > 0 limit 20) x;
  if n > 0 then raise exception 'GATE complete recipe that lists gaps: %', list; end if;

  select count(*), string_agg(slug, ', ') into n, list from (
    select r.slug from recipes r where r.nutrition_status = 'partial' and coalesce(cardinality(r.nutrition_gaps), 0) = 0 limit 20) x;
  if n > 0 then raise exception 'GATE partial recipe with no named gap: %', list; end if;

  select count(*), string_agg(slug, ', ') into n, list from (
    select r.slug from recipes r where r.nutrition_status = 'unavailable'
      and exists (select 1 from recipe_nutrients x where x.recipe_id = r.id) limit 20) x;
  if n > 0 then raise exception 'GATE unavailable recipe that has stored numbers (to-taste-only must show no zeros): %', list; end if;

  select count(*) into n from recipe_nutrients where coverage <= 0 or coverage > 1 or amount_per_serving < 0;
  if n > 0 then raise exception 'GATE % recipe_nutrients rows with coverage outside (0,1] or a negative amount', n; end if;

  -- plausible per-serving maxima (a recipe serving of more than 6000 kcal or 20 g sodium is an import error)
  select count(*), string_agg(slug || ':' || k || '=' || amt, ', ') into n, list from (
    select r.slug, nu.key as k, x.amount_per_serving as amt
    from recipe_nutrients x join recipes r on r.id = x.recipe_id join nutrients nu on nu.id = x.nutrient_id
    where (nu.key = 'energy_kcal' and x.amount_per_serving > 6000)
       or (nu.key = 'sodium_mg'   and x.amount_per_serving > 20000)
       or (nu.key in ('protein_g', 'carbs_g', 'fat_g') and x.amount_per_serving > 400)
    order by 1 limit 20) x;
  if n > 0 then raise exception 'GATE implausible per-serving values: %', list; end if;

  -- 4 kcal/g protein and carbohydrate, 9 kcal/g fat: only where all four are fully covered
  select count(*), string_agg(slug || ':' || round(kcal) || 'vs' || round(est), ', ') into n, list from (
    select r.slug, k.v as kcal, 4 * p.v + 4 * c.v + 9 * f.v as est
    from recipes r
    join lateral (select amount_per_serving v from recipe_nutrients where recipe_id = r.id and nutrient_id = 1 and coverage >= 0.999) k on true
    join lateral (select amount_per_serving v from recipe_nutrients where recipe_id = r.id and nutrient_id = 2 and coverage >= 0.999) p on true
    join lateral (select amount_per_serving v from recipe_nutrients where recipe_id = r.id and nutrient_id = 3 and coverage >= 0.999) c on true
    join lateral (select amount_per_serving v from recipe_nutrients where recipe_id = r.id and nutrient_id = 7 and coverage >= 0.999) f on true
    where k.v >= 50 and abs(k.v - (4 * p.v + 4 * c.v + 9 * f.v)) > 0.10 * k.v
    order by r.slug limit 20) x;
  if n > 0 then
    -- alcohol (7 kcal/g), sugar alcohols and fibre make a few legitimate exceptions: surface, do not hide
    raise warning 'WARN % recipes where kcal differs more than 10%% from 4P+4C+9F (check alcohol / fibre): %', n, list;
  end if;
  raise notice 'ok recipe-level gates';
end $$;

\echo == idempotency (WRITES: run on a throwaway database only)
do $$
declare h1 text; h2 text; s1 text; s2 text;
begin
  perform refresh_all_recipe_nutrients();
  select md5(string_agg(recipe_id || ':' || nutrient_id || ':' || amount_per_serving || ':' || coverage, '|' order by recipe_id, nutrient_id)) into h1 from recipe_nutrients;
  select md5(string_agg(id || ':' || coalesce(nutrition_status, '-') || ':' || coalesce(array_to_string(nutrition_gaps, ','), '-'), '|' order by id)) into s1 from recipes;
  perform refresh_all_recipe_nutrients();
  select md5(string_agg(recipe_id || ':' || nutrient_id || ':' || amount_per_serving || ':' || coverage, '|' order by recipe_id, nutrient_id)) into h2 from recipe_nutrients;
  select md5(string_agg(id || ':' || coalesce(nutrition_status, '-') || ':' || coalesce(array_to_string(nutrition_gaps, ','), '-'), '|' order by id)) into s2 from recipes;
  if h1 is distinct from h2 or s1 is distinct from s2 then raise exception 'GATE second refresh changed the rows'; end if;
  raise notice 'ok idempotent (recipe_nutrients md5 %)', h1;
end $$;

\echo == summary
select nutrition_status, count(*) from recipes group by 1 order by 1;
