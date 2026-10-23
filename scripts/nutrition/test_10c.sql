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
                  where f.is_default and f.form = 'default' and i.canonical_name = 'black beans' and f.fdc_id = 175188) then
    raise exception 'GATE black beans default must be the owner-chosen canned full-panel SR record 175188'; end if;
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
  -- 2084844 is the duplicate label the foods seed removes; when it is still present the two must agree
  select amount_per_100g into a from usda_food_nutrients where fdc_id = 2039206 and nutrient_id = 1;
  select amount_per_100g into b from usda_food_nutrients where fdc_id = 2084844 and nutrient_id = 1;
  select density_g_per_ml into d from ingredients where canonical_name = 'mirin';
  if a is null then raise exception 'GATE Aji-Mirin record 2039206 has no energy'; end if;
  if exists (select 1 from usda_foods where fdc_id = 2084844) and (b is null or abs(a - b) > 0.5) then raise exception 'GATE Aji-Mirin records disagree: % vs %', a, b; end if;
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

\echo == audit round 2: wrong defaults, links and brands are fixed
do $$
declare bad text; n int;
begin
  select string_agg(i.canonical_name || '/' || f.form || '=' || f.fdc_id, '; ') into bad
  from ingredient_foods f join ingredients i on i.id = f.ingredient_id
  where (f.is_default and (i.canonical_name::text, f.fdc_id) in (
          ('cider', 168746),                 -- regular beer
          ('harusame', 168908),              -- wheat somen
          ('yellow lentils', 172436),        -- pigeon peas
          ('japanese curry roux', 2119516),  -- Kary's Cajun roux
          ('sambal oelek', 362929),          -- chili garlic sauce
          ('erythritol', 370129),            -- monk fruit blend
          ('halva', 413608)))                -- chocolate covered
     or (i.canonical_name::text in ('ramen noodles', 'vegetable juice', 'spaghetti') and f.fdc_id in
          (2621853, 2288303, 2059595, 1867578, 414561, 400229, 400224, 386269, 372237, 2082895, 2568584, 1849736));
  if bad is not null then raise exception 'GATE round 2 wrong links still present: %', bad; end if;
  -- wave 14: 'hard cider' left this list; USDA FNDDS has a real "Hard cider" record (scripts/nutrition/foods14/decisions_w14.psv), the gap here was about a wrong link
  select count(*) into n from ingredients i where i.canonical_name::text in ('lemon myrtle', 'pickling spice', 'sea vegetables', 'sambal')
    and exists (select 1 from ingredient_foods f where f.ingredient_id = i.id);
  if n > 0 then raise exception 'GATE % ingredients that must be a gap still have a food', n; end if;
  if not exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id where i.canonical_name = 'cider' and f.is_default and f.fdc_id = 173933) then
    raise exception 'GATE cider must be apple juice (173933)'; end if;
  if (select canonical_name from resolve_ingredient('cream')) is distinct from 'heavy cream' then raise exception 'GATE resolve_ingredient(cream) must be heavy cream'; end if;
  if (select canonical_name from resolve_ingredient('hard cider')) is distinct from 'hard cider' then raise exception 'GATE hard cider must resolve to its own ingredient'; end if;
  if (select i.canonical_name from ingredient_aliases a join ingredients i on i.id = a.ingredient_id where a.alias = 'low-fat milk') is distinct from '1% milk' then
    raise exception 'GATE alias low-fat milk must point at 1%% milk (USDA lowfat)'; end if;
end $$;

\echo == a food brand is never the barcode-prefix owner
do $$
begin
  if exists (select 1 from pg_proc where proname in ('search_foods', 'my_recipe_foods') and pronamespace = 'public'::regnamespace
              and prosrc ~ 'coalesce\((uf|f)\.brand_name, (uf|f)\.brand_owner\)') then
    raise exception 'GATE search_foods / my_recipe_foods still fall back to brand_owner as the displayed brand';
  end if;
end $$;

\echo == declared stand-ins carry the proxy flag and reach the label
do $$
declare n int; t text[];
begin
  select count(*) into n from ingredient_foods where is_proxy;
  if n < 20 then raise exception 'GATE only % proxy flags, expected the close relatives kept by the wave 12 audit (about 33; there were about 300 before it)', n; end if;
  select count(*) into n from ingredient_foods where is_proxy and not is_default;
  if n > 0 then raise exception 'GATE % proxy flags on non-default links', n; end if;
  if not exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id where f.is_proxy and i.canonical_name in ('thai basil', 'pisco', 'mexican crema')) then
    raise exception 'GATE thai basil / pisco / mexican crema must stay flagged as stand-ins (wave 12 kept them as close relatives)'; end if;
  if exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id where f.is_proxy and i.canonical_name in ('curry leaves', 'clotted cream', 'sambal', 'aleppo pepper', 'galangal', 'sumac', 'ube', 'pea shoots', 'pepper jack')) then
    raise exception 'GATE a replaced or unmapped ingredient is still flagged as a stand-in'; end if;
  t := nutrition_assumptions(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'thai basil'), 'quantity', 50, 'unit_id', (select id from units where name = 'g'))));
  if t is null or cardinality(t) < 1 or t[1] not like 'nutrition for thai basil uses %' then raise exception 'GATE the label assumption for a stand-in is missing: %', t; end if;
end $$;

\echo == a branded default whose energy disagrees with its macros lost the unreliable rows
do $$
declare list text;
begin
  select string_agg(d.fdc_id::text, ', ') into list from (
    select distinct f.fdc_id,
           (select amount_per_100g from usda_food_nutrients where fdc_id = f.fdc_id and nutrient_id = 1) kcal,
           (select 4 * coalesce(sum(amount_per_100g) filter (where nutrient_id in (2, 3)), 0) + 9 * coalesce(sum(amount_per_100g) filter (where nutrient_id = 7), 0)
              from usda_food_nutrients where fdc_id = f.fdc_id) fm
      from ingredient_foods f join usda_foods u on u.fdc_id = f.fdc_id where f.is_default and u.data_type = 'branded') d
   where d.kcal >= 10 and abs(d.kcal - d.fm) > 15 and abs(d.kcal - d.fm) > 0.20 * greatest(d.kcal, d.fm);
  if list is not null then raise exception 'GATE branded defaults with energy inconsistent with their macros: %', list; end if;
end $$;

\echo == recipe math, fixer round 2 (needs the migration 20261019100000 and a refresh_all_recipe_nutrients() after the seeds)
do $$
declare n int; g numeric; frm text; v_food int;
begin
  -- 'fresh or frozen cranberries' are the fresh berry, not dried sweetened
  if (select count(*) from recipe_ingredients ri join recipes rc on rc.id = ri.recipe_id join ingredients i on i.id = ri.ingredient_id
       where rc.source_url like '%/cranberry-pumpkin-muffins' and i.canonical_name = 'dried cranberries') > 0 then
    raise exception 'GATE Cranberry Pumpkin Muffins still has dried cranberries'; end if;
  select n.amount_per_serving into g from recipe_nutrients n join recipes rc on rc.id = n.recipe_id
   where rc.source_url like '%/cranberry-pumpkin-muffins' and n.nutrient_id = 1;
  if g is null or abs(g - 207) / 207 > 0.10 then raise exception 'GATE Cranberry Pumpkin Muffins computes % kcal, published 207', g; end if;

  -- a hard-boiled egg is the cooked egg (173424), a boiled russet potato the boiled potato (170440)
  select x.fdc_id, x.form into v_food, frm from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'egg'), 'quantity', 4, 'prep_note', 'hard-boiled'))) x;
  if v_food is distinct from 173424 or frm is distinct from 'cooked' then raise exception 'GATE hard-boiled egg uses food % form %', v_food, frm; end if;
  select x.fdc_id into v_food from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'russet potato'), 'quantity', 3, 'unit_id', (select id from units where name = 'cup'), 'prep_note', 'diced & boiled'))) x;
  if v_food is distinct from 170440 then raise exception 'GATE boiled russet potato uses food %', v_food; end if;

  -- a lemon or lime that is only juiced counts its juice yield (USDA: 48 g / 44 g), not the whole fruit
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'lime'), 'quantity', 1, 'prep_note', 'juiced'))) x;
  if g is distinct from 44 then raise exception 'GATE a juiced lime counts % g, expected the 44 g juice yield', g; end if;
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'lemon'), 'quantity', 2, 'prep_note', 'juiced'))) x;
  if g is distinct from 96 then raise exception 'GATE 2 juiced lemons count % g, expected 96', g; end if;

  -- a can's weight goes with its record: a solids-and-liquids record (low-sodium black beans, no-salt corn, canned white beans) is the 425 g net can
  select count(*) into n from ingredient_portions p join ingredients i on i.id = p.ingredient_id join units u on u.id = p.unit_id
   where u.name = 'can' and p.grams_per_unit <> 425
     and ((i.canonical_name = 'black beans' and p.form in ('default', 'canned', 'low_sodium')) or (i.canonical_name = 'corn' and p.form in ('low_sodium', 'low sodium'))
          or (i.canonical_name in ('white beans', 'cannellini beans', 'great northern beans', 'navy beans') and p.form in ('default', 'canned', 'low_sodium')));
  if n > 0 then raise exception 'GATE % can weights are not paired with their solids-and-liquids record', n; end if;

  -- water (and ice) is never a gap: it carries no nutrient
  select count(*) into n from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id
    cross join lateral nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', ri.ingredient_id, 'quantity', ri.quantity, 'unit_id', ri.unit_id, 'prep_note', ri.prep_note, 'is_optional', ri.is_optional))) x
   where i.canonical_name = 'water' and x.state in ('no_form', 'no_grams', 'no_food');
  if n > 0 then raise exception 'GATE % water lines are still gaps', n; end if;

  -- a weight stated for an each-count line is used: 4 potatoes "about 1 pound" is 454 g, not 4 x 230 g
  select x.grams into g from recipe_ingredients ri join recipes rc on rc.id = ri.recipe_id join ingredients i on i.id = ri.ingredient_id
    cross join lateral nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', ri.ingredient_id, 'quantity', ri.quantity, 'unit_id', ri.unit_id, 'prep_note', ri.prep_note))) x
   where rc.source_url like '%/potato-salad' and i.canonical_name = 'russet potato';
  if g is null or abs(g - 453.592) > 1 then raise exception 'GATE Potato Salad potatoes count % g, the note states about 1 pound', g; end if;

  -- recipes we computed carry the computed macro columns, never the AI-drafted ones; MyPlate keeps USDA's published values
  select count(*) into n from recipes rc join recipe_nutrients k on k.recipe_id = rc.id and k.nutrient_id = 1
   where rc.source_name not like 'USDA MyPlate%' and rc.nutrition_source = 'computed' and rc.nutrition_status = 'complete'
     and rc.calories is distinct from round(k.amount_per_serving, 0);
  if n > 0 then raise exception 'GATE % computed complete recipes whose calories column is not the computed value', n; end if;
  select count(*) into n from recipes rc where rc.nutrition_source = 'computed' and rc.nutrition_status <> 'complete' and rc.calories is not null;
  if n > 0 then raise exception 'GATE % computed partial recipes still show a calories column', n; end if;
end $$;

\echo == wave 10d gates (final audit defects)
do $$
declare n int; g numeric; f text;
begin
  -- black beans: canned default and canned form are SR 175188; cooked stays 173735, low sodium 175238
  select count(*) into n from ingredient_foods x join ingredients i on i.id = x.ingredient_id
   where i.canonical_name = 'black beans' and x.is_default
     and (x.form, x.fdc_id) in (('default', 175188), ('canned', 175188), ('cooked', 173735), ('low_sodium', 175238), ('drained', 175237), ('low_sodium_drained', 173735));
  if n <> 6 then raise exception 'GATE black bean forms: % of 6 expected defaults', n; end if;
  -- pinto beans: canned drained solids by default, raw only as dried
  select count(*) into n from ingredient_foods x join ingredients i on i.id = x.ingredient_id
   where i.canonical_name = 'pinto beans' and x.is_default and (x.form, x.fdc_id) in (('default', 173797), ('canned', 173797), ('dried', 175199));
  if n <> 3 then raise exception 'GATE pinto forms: % of 3 expected defaults', n; end if;
  -- a drained can is the drained solids (255 g); an undrained can is the 425 g net contents
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'black beans'),
         'quantity', 1, 'unit_id', (select id from units where name = 'can'), 'prep_note', 'drained and rinsed'))) x;
  if g is distinct from 255 then raise exception 'GATE 1 can black beans, drained and rinsed counts % g, expected 255', g; end if;
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'black beans'),
         'quantity', 1, 'unit_id', (select id from units where name = 'can'), 'prep_note', 'low-sodium, drained and rinsed'))) x;
  if g is distinct from 255 then raise exception 'GATE 1 can low-sodium black beans, drained and rinsed counts % g, expected 255', g; end if;
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'black beans'),
         'quantity', 1, 'unit_id', (select id from units where name = 'can'), 'prep_note', 'low-sodium'))) x;
  if g is distinct from 425 then raise exception 'GATE 1 can low-sodium black beans counts % g, expected 425', g; end if;
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'black beans'),
         'quantity', 1, 'unit_id', (select id from units where name = 'can'), 'prep_note', null))) x;
  if g is distinct from 425 then raise exception 'GATE 1 can black beans counts % g, expected 425', g; end if;
  -- soaked dry beans keep the dry record
  select x.form into f from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'black beans'),
         'quantity', 8, 'unit_id', (select id from units where name = 'oz'), 'prep_note', 'dried, soaked and drained'))) x;
  if f is distinct from 'dried' then raise exception 'GATE dried soaked and drained black beans use form %', f; end if;

  -- wrong gluten-free pasta, beer cider, sweetened amchur
  select count(*) into n from ingredient_foods x join ingredients i on i.id = x.ingredient_id
   where (i.canonical_name = 'gluten-free pasta' and x.fdc_id in (2659104, 2570665, 2504164, 383432, 394548))
      or (i.canonical_name = 'cider' and x.fdc_id = 168746) or i.canonical_name = 'dried mango powder';
  if n > 0 then raise exception 'GATE % wrong links (wheat pasta under gluten-free, beer under cider, sweetened mango under amchur) remain', n; end if;
  select count(*) into n from ingredient_foods x join ingredients i on i.id = x.ingredient_id
   where i.canonical_name = 'gluten-free pasta' and x.fdc_id in (2598848, 2625999);
  if n < 2 then raise exception 'GATE the two gluten-free pasta brands 2598848 and 2625999 must stay'; end if;

  -- russet potato: USDA medium 213 g
  select p.grams_per_unit into g from ingredient_portions p join ingredients i on i.id = p.ingredient_id
   where i.canonical_name = 'russet potato' and p.form = 'default' and p.unit_id is null;
  if g is distinct from 213 then raise exception 'GATE russet potato each-weight is % g, expected 213', g; end if;
  select p.grams_per_unit into g from ingredient_portions p join ingredients i on i.id = p.ingredient_id
   where i.canonical_name = 'potato' and p.form = 'default' and p.unit_id is null;
  if g is distinct from 213 then raise exception 'GATE potato each-weight is % g, expected 213', g; end if;

  -- uncooked beats cooked: 8 oz fusilli, uncooked, 4 cups cooked is dry pasta
  select x.form into f from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'fusilli'),
         'quantity', 8, 'unit_id', (select id from units where name = 'oz'), 'prep_note', 'uncooked, 4 cups cooked'))) x;
  if f is distinct from 'default' then raise exception 'GATE 8 oz fusilli uncooked uses form %, expected the dry default', f; end if;
  select x.form into f from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'pasta'),
         'quantity', 6, 'unit_id', (select id from units where name = 'oz'), 'prep_note', 'whole wheat, uncooked, cooked, drained'))) x;
  if f is distinct from 'default' then raise exception 'GATE 6 oz pasta uncooked, cooked uses form %', f; end if;
  select x.form into f from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'macaroni'),
         'quantity', 2, 'unit_id', (select id from units where name = 'cup'), 'prep_note', 'cooked, or other pasta'))) x;
  if f is distinct from 'cooked' then raise exception 'GATE 2 cups cooked macaroni uses form %, expected cooked', f; end if;

  -- a bare 1 cauliflower "cut in large florets" is a head (588 g); "4 small florets" count florets (25 g each)
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'cauliflower'),
         'quantity', 1, 'unit_id', null, 'prep_note', 'cut in large florets'))) x;
  if g is distinct from 588 then raise exception 'GATE 1 cauliflower cut in large florets counts % g, expected the 588 g head', g; end if;
  select x.grams into g from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'cauliflower'),
         'quantity', 4, 'unit_id', null, 'prep_note', 'florets (cut in half)'))) x;
  if g is distinct from 100 then raise exception 'GATE 4 florets count % g, expected 4 x 25', g; end if;

  -- Mac and Beans Medley: the can is beans, not beef broth
  select count(*) into n from recipe_ingredients ri join recipes r on r.id = ri.recipe_id join ingredients i on i.id = ri.ingredient_id
   where r.slug = 'mac-and-beans-medley' and i.canonical_name = 'beef broth';
  if n > 0 then raise exception 'GATE Mac and Beans Medley still has beef broth'; end if;

  -- densities
  if (select density_g_per_ml from ingredients where canonical_name = 'almond milk') is distinct from 1.03 then raise exception 'GATE almond milk density'; end if;
  if (select density_g_per_ml from ingredients where canonical_name = 'mexican crema') is distinct from 1.0 then raise exception 'GATE mexican crema density'; end if;

  -- national foods added in 10d, with the publisher's code
  select count(*) into n from usda_foods u where (u.data_type, u.source_code) in (('cofid', '13-339'), ('cofid', '13-341'), ('cnf', '2499'), ('cofid', '13-853'), ('cofid', '13-857'));
  if n <> 5 then raise exception 'GATE % of 5 added national foods present', n; end if;
  select count(*) into n from ingredient_foods x join ingredients i on i.id = x.ingredient_id
   where x.is_default and ((x.form = 'default' and (i.canonical_name, x.fdc_id) in (('plantain', 169130), ('kombu', 910130339), ('wakame', 910130341), ('dulse', 900002499), ('fresh sage', 910130853), ('fresh tarragon', 910130857)))
      or (x.form = 'green' and i.canonical_name = 'plantain' and x.fdc_id = 168215));
  if n <> 7 then raise exception 'GATE % of 7 expected 10d default links', n; end if;
end $$;

\echo == 10c gates passed
