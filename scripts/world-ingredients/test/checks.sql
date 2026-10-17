-- Sanity gates for the WORLD lane seeds (run on the "seedtest" database after both seeds). Each query prints PASS/FAIL.
\echo '--- 1. every new ingredient: slug set, no empty names'
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from ingredients where id > (select max_ing from _baseline) and (canonical_name::text <> btrim(canonical_name::text) or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$');

\echo '--- 2. every canonical name and alias of the new rows resolves (exact/alias) to its own ingredient'
with a as (
  select i.id, i.canonical_name::text n from ingredients i where i.id > (select max_ing from _baseline)
  union all
  select ia.ingredient_id, ia.alias::text from ingredient_aliases ia where ia.ingredient_id > (select max_ing from _baseline)
), r as (
  select a.id, a.n, (select rr.ingredient_id from resolve_ingredient(a.n) rr limit 1) as got from a
)
select case when count(*) filter (where got is distinct from id) = 0 then 'PASS' else 'FAIL' end as result,
       count(*) as names_checked, count(*) filter (where got is distinct from id) as resolved_elsewhere
from r;

\echo '--- 2b. (detail) names that resolve to a different ingredient'
with a as (
  select i.id, i.canonical_name::text n from ingredients i where i.id > (select max_ing from _baseline)
  union all
  select ia.ingredient_id, ia.alias::text from ingredient_aliases ia where ia.ingredient_id > (select max_ing from _baseline)
)
select a.n, a.id as expected, rr.ingredient_id as got, rr.canonical_name, rr.match_kind
from a cross join lateral (select * from resolve_ingredient(a.n) limit 1) rr where rr.ingredient_id <> a.id limit 40;

\echo '--- 3. foods: no negative amounts, energy plausible, macros not above 100 g/100 g'
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from usda_food_nutrients where amount_per_100g < 0;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from usda_food_nutrients n join nutrients nu on nu.id = n.nutrient_id where nu.key = 'calories' and n.amount_per_100g > 930;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from (
  select f.fdc_id,
    max(n.amount_per_100g) filter (where nu.key = 'protein_g') p, max(n.amount_per_100g) filter (where nu.key = 'fat_g') fa,
    max(n.amount_per_100g) filter (where nu.key = 'carbs_g') c
  from usda_foods f join usda_food_nutrients n using (fdc_id) join nutrients nu on nu.id = n.nutrient_id group by f.fdc_id
) t where coalesce(p,0) + coalesce(fa,0) + coalesce(c,0) > 105;

\echo '--- 4. energy within Atwater tolerance (4P+4C+9F), foods with all four reported'
select count(*) as foods_checked,
       count(*) filter (where k > 25 and abs(k - (4*p + 4*c + 9*fa)) > 0.4*k + 25) as outside_tolerance
from (
  select f.fdc_id,
    max(n.amount_per_100g) filter (where nu.key = 'calories') k, max(n.amount_per_100g) filter (where nu.key = 'protein_g') p,
    max(n.amount_per_100g) filter (where nu.key = 'fat_g') fa, max(n.amount_per_100g) filter (where nu.key = 'carbs_g') c
  from usda_foods f join usda_food_nutrients n using (fdc_id) join nutrients nu on nu.id = n.nutrient_id group by f.fdc_id
) t where k is not null and p is not null and fa is not null and c is not null;

\echo '--- 5. new ingredients with a default food have exactly one default, and ingredients.fdc_id agrees'
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from ingredients i
where i.id > (select max_ing from _baseline) and i.fdc_id is not null
  and (select count(*) from ingredient_foods f where f.ingredient_id = i.id and f.form = 'default' and f.is_default) <> 1;

\echo '--- 6. branded foods carry a serving size (brand_owner may be blank in FDC for a few records)'
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from usda_foods where data_type = 'branded' and (serving_size is null or serving_size_unit is null);

\echo '--- 7. portions: positive grams, density in a plausible range'
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from ingredient_portions where grams_per_unit <= 0 or grams_per_unit > 5000;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as result, count(*) as bad
from ingredients where id > (select max_ing from _baseline) and density_g_per_ml is not null and (density_g_per_ml < 0.05 or density_g_per_ml > 3);

\echo '--- 8. allergen consistency (review list, not a hard gate)'
select i.canonical_name::text as ingredient, 'soy missing' as issue from ingredients i
where i.id > (select max_ing from _baseline) and i.canonical_name::text ~* '(soy sauce|tofu|miso|tempeh|natto|edamame|soybean|soy flour|kinako)'
  and not exists (select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id where ia.ingredient_id = i.id and a.slug = 'soy')
union all
select i.canonical_name::text, 'sesame missing' from ingredients i
where i.id > (select max_ing from _baseline) and i.canonical_name::text ~* '(sesame|tahini|halva|za.atar|dukkah|furikake)'
  and not exists (select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id where ia.ingredient_id = i.id and a.slug = 'sesame')
union all
select i.canonical_name::text, 'fish missing' from ingredients i
where i.id > (select max_ing from _baseline) and i.canonical_name::text ~* '(fish sauce|anchov|bonito|herring|caviar|mackerel|sardine|salmon|tuna|cod |trout)'
  and not exists (select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id where ia.ingredient_id = i.id and a.slug = 'fish')
union all
select i.canonical_name::text, 'dairy missing' from ingredients i
where i.id > (select max_ing from _baseline) and i.aisle_category = 'Dairy' and i.canonical_name::text !~* '(vegan|dairy-free)'
  and not exists (select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id where ia.ingredient_id = i.id and a.slug = 'dairy')
union all
select i.canonical_name::text, 'gluten missing' from ingredients i
where i.id > (select max_ing from _baseline) and i.canonical_name::text ~* '(noodles|pasta|bread|flour|wrapper|couscous|bulgur|farro|spelt|rye|barley|seitan|soy sauce|panko|crackers)'
  and i.canonical_name::text !~* '(rice|corn|chickpea|buckwheat|tapioca|mung|cellophane|gluten-free|almond|coconut|oat flour|potato|cassava|teff|sorghum|sweet potato|millet|konjac|shirataki)'
  and not exists (select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id where ia.ingredient_id = i.id and a.slug = 'gluten')
limit 60;

\echo '--- 9. totals'
select (select count(*) from ingredients) as ingredients, (select count(*) from ingredients where id > (select max_ing from _baseline)) as new_ingredients,
       (select count(*) from ingredient_aliases) as aliases, (select count(*) from usda_foods) as usda_foods,
       (select count(*) from usda_foods where data_type = 'branded') as branded_foods,
       (select count(*) from usda_food_nutrients) as food_nutrient_rows, (select count(*) from ingredient_foods) as ingredient_food_links,
       (select count(*) from ingredient_portions) as portions;
