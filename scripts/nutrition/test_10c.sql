-- Wave 10c gates (mappings, brands, national sources). Run AFTER seed-nutrition-10c-foods.sql.
--   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/nutrition/test_10c.sql
-- Every block raises with the offenders; a green run means every gate passed. Read-only.

\echo == one default per (ingredient, form)
do $$
declare n int; list text;
begin
  select count(*), string_agg(ingredient_id || ':' || form, ', ') into n, list
  from (select ingredient_id, form from ingredient_foods group by 1, 2 having count(*) filter (where is_default) <> 1 limit 20) x;
  if n > 0 then raise exception 'GATE (ingredient, form) without exactly one default: %', list; end if;
end $$;

\echo == the audit wrong defaults are fixed
do $$
declare bad text;
begin
  select string_agg(i.canonical_name || '/' || f.form || '=' || f.fdc_id, '; ') into bad
  from ingredient_foods f join ingredients i on i.id = f.ingredient_id
  where f.is_default and (i.canonical_name::text, f.form, f.fdc_id) in (
    ('blue cheese dressing', 'default', 167692),   -- light
    ('doubanjiang', 'default', 171186),            -- sriracha
    ('dashi', 'default', 171583),                  -- vegetable broth
    ('kombu', 'default', 168457),                  -- raw kelp
    ('wakame', 'default', 170496),                 -- raw wakame
    ('pumpkin pie filling', 'default', 170527),    -- plain pumpkin
    ('sirloin steak', 'default', 169458),          -- cooked
    ('pork sausage', 'default', 174579),           -- pork and beef, cooked
    ('black beans', 'default', 2644285),           -- sparse Foundation
    ('black beans', 'canned', 404436),             -- Goya branded
    ('skim milk', 'default', 169868),              -- calcium fortified
    ('veal stock', 'default', 581024),             -- demi-glace
    ('vegan butter', 'default', 171415),           -- 35-39 percent spread
    ('golden syrup', 'default', 169578),           -- pancake syrup
    ('clotted cream', 'default', 170859),          -- heavy cream
    ('hearts of palm', 'default', 167714));        -- raw
  if bad is not null then raise exception 'GATE wrong defaults still present: %', bad; end if;
  -- positive expectations
  if not exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id
                  where f.is_default and f.form = 'default' and i.canonical_name = 'black beans' and f.fdc_id = 175237) then
    raise exception 'GATE black beans default must be the full-panel SR drained-basis record 175237'; end if;
  if not exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id
                  join ingredients c on c.canonical_name = 'cheddar cheese' join ingredient_foods cf on cf.ingredient_id = c.id and cf.is_default and cf.form = 'default'
                  where f.is_default and f.form = 'default' and i.canonical_name = 'shredded cheese' and f.fdc_id = cf.fdc_id) then
    raise exception 'GATE shredded cheese must default to the cheddar cheese food'; end if;
  if (select count(*) from ingredient_foods f join ingredients i on i.id = f.ingredient_id
       where i.canonical_name in ('milk', 'whole milk', 'skim milk') and f.is_default and f.form in ('default', 'whole', 'skim', 'low fat')) < 5 then
    raise exception 'GATE milk fat levels must stay separate foods (milk default 2 percent, forms low fat / skim / whole, whole milk, skim milk)'; end if;
end $$;

\echo == milk named by fat level has household weights (a form without them is a gap for every cup)
do $$
declare n int;
begin
  select count(*) into n from ingredient_foods f join ingredients i on i.id = f.ingredient_id
   where i.canonical_name = 'milk' and f.form in ('low fat', 'skim', 'whole')
     and not exists (select 1 from ingredient_portions p where p.ingredient_id = i.id and p.form = f.form and p.unit_id is not null);
  if n > 0 then raise exception 'GATE % milk forms have no household weights', n; end if;
end $$;

\echo == every brand link is a branded food of that ingredient: no flavoured / reduced / gluten-free variant under the plain name
do $$
declare n int; list text;
begin
  select count(*), string_agg(i.canonical_name || '=' || u.fdc_id, ', ') into n, list
  from ingredient_foods f join ingredients i on i.id = f.ingredient_id join usda_foods u on u.fdc_id = f.fdc_id
  where u.data_type = 'branded' and (i.canonical_name::text, u.fdc_id) in (
    ('chocolate chips', 662566), ('chocolate chips', 2148011), ('chocolate chips', 2666546), ('avocado oil', 2106904), ('panko breadcrumbs', 2069894),
    ('mayonnaise', 2369702), ('ranch seasoning', 2377869), ('wasabi powder', 2367697), ('ramen noodles', 2590912), ('pecans', 2125030),
    ('cream cheese', 497082), ('blue cheese', 2385922), ('sriracha', 1864946), ('chicken breast', 2600320), ('bacon', 1464658));
  if n > 0 then raise exception 'GATE known wrong brand links still present: %', list; end if;
end $$;

\echo == a food sold by volume is per 100 g with the ingredient own density (both Aji-Mirin labels are identical, so must agree)
do $$
declare a numeric; b numeric; d numeric;
begin
  select amount_per_100g into a from usda_food_nutrients where fdc_id = 2084844 and nutrient_id = 1;
  select amount_per_100g into b from usda_food_nutrients where fdc_id = 2039206 and nutrient_id = 1;
  select density_g_per_ml into d from ingredients where canonical_name = 'mirin';
  if a is null or b is null or abs(a - b) > 0.5 then raise exception 'GATE Aji-Mirin records disagree: % vs %', a, b; end if;
  if abs(a - 233.0 / d) > 1.5 then raise exception 'GATE Aji-Mirin kcal % is not 233 per 100 ml / density %', a, d; end if;
end $$;

\echo == plausibility of branded and national foods
do $$
declare n int; list text;
begin
  select count(*), string_agg(distinct x.fdc_id::text, ', ') into n, list
  from usda_food_nutrients x join usda_foods u on u.fdc_id = x.fdc_id join nutrients nu on nu.id = x.nutrient_id
  where u.data_type in ('branded', 'cofid', 'cnf')
    and ((nu.key = 'energy_kcal' and x.amount_per_100g > 902)
      or (nu.key in ('protein_g', 'carbs_g', 'fat_g') and x.amount_per_100g > 100.5)
      or (nu.key = 'sodium_mg' and x.amount_per_100g > 39400)
      or (nu.key = 'magnesium_mg' and x.amount_per_100g > 2500)
      or (nu.key = 'cholesterol_mg' and x.amount_per_100g > 3500)
      or (nu.key = 'vitamin_b12_mcg' and x.amount_per_100g > 120));
  if n > 0 then raise exception 'GATE implausible values in foods: %', list; end if;

  select count(*), string_agg(fdc_id::text, ', ') into n, list
  from (select x.fdc_id from usda_food_nutrients x join usda_foods u on u.fdc_id = x.fdc_id
         where u.data_type in ('branded', 'cofid', 'cnf') and x.nutrient_id in (2, 3, 7) group by x.fdc_id having sum(x.amount_per_100g) > 105 limit 20) y;
  if n > 0 then raise exception 'GATE protein+carbs+fat above 105 g per 100 g: %', list; end if;
end $$;

\echo == a label-rounded zero is "not reported": branded foods with a tiny serving and no energy row hold no zero macronutrient row
do $$
declare n int; list text;
begin
  select count(*), string_agg(distinct u.fdc_id::text, ', ') into n, list
  from usda_foods u
  where u.data_type = 'branded' and u.serving_size <= 8
    and not exists (select 1 from usda_food_nutrients k where k.fdc_id = u.fdc_id and k.nutrient_id = 1)
    and exists (select 1 from usda_food_nutrients z where z.fdc_id = u.fdc_id and z.nutrient_id in (2, 3, 7) and z.amount_per_100g = 0);
  if n > 0 then raise exception 'GATE tiny-serving foods keep zero macros with no energy: %', list; end if;
end $$;

\echo == national foods
do $$
declare n int;
begin
  select count(*) into n from usda_foods where data_type = 'cofid' and (source_code is null or fdc_id < 910000000);
  if n > 0 then raise exception 'GATE cofid rows must carry source_code and a synthetic fdc_id in the 910,000,000 range'; end if;
  select count(*) into n from usda_foods where data_type = 'cnf' and (source_code is null or fdc_id < 900000000 or fdc_id >= 910000000);
  if n > 0 then raise exception 'GATE cnf rows must carry source_code and a synthetic fdc_id in the 900,000,000 range'; end if;
  select count(*) into n from usda_foods u where u.data_type in ('cofid', 'cnf')
    and not exists (select 1 from usda_food_nutrients x where x.fdc_id = u.fdc_id and x.nutrient_id = 1);
  if n > 0 then raise notice 'NOTE % national foods have no energy row (published energy missing); they stay linked, as "not reported"', n; end if;
  select count(*) into n from usda_foods u where u.data_type in ('cofid', 'cnf') and not exists (select 1 from ingredient_foods f where f.fdc_id = u.fdc_id);
  if n > 0 then raise exception 'GATE % national foods are not linked to any ingredient', n; end if;
end $$;

\echo == no linked food lost every nutrient
do $$
declare n int; list text;
begin
  select count(*), string_agg(distinct f.fdc_id::text, ', ') into n, list
  from ingredient_foods f where not exists (select 1 from usda_food_nutrients x where x.fdc_id = f.fdc_id);
  if n > 0 then raise exception 'GATE linked foods without any nutrient row: %', list; end if;
end $$;

\echo == 10c gates passed
