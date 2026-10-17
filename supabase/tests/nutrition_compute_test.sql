-- Wave 10 nutrition compute regression. Self-contained: all data is fixture data
-- (fdc ids 990001+, ingredients named "fixture ..."), everything rolls back.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/nutrition_compute_test.sql
--
-- Needs: the three 2026101712xxxx nutrition migrations applied. Runs as the table owner (postgres).
-- Real FDC values used for the owner's example (SR Legacy, per 100 g):
--   174036 ground beef 80/20 raw : 254 kcal, 17.17 P, 20.0 F, 0 C, 66 mg Na, 2.14 mcg B12, 71 mg chol
--   169230 garlic raw            : 149 kcal, 6.36 P, 0.5 F, 33.06 C, 17 mg Na, 0 B12, 1 clove = 3 g
--   174277 soy sauce (shoyu)     : 53 kcal, 8.14 P, 0.57 F, 4.93 C, 5493 mg Na, 0 B12, 1 tbsp = 16 g
-- Hand calculation, 2 lb beef (907.184 g) + 1 clove garlic (3 g) + 1 tbsp soy sauce (16 g), serves 4:
--   kcal    = (907.184*2.54 + 3*1.49 + 16*0.53) / 4           = 579.30
--   protein = (907.184*0.1717 + 3*0.0636 + 16*0.0814) / 4     = 39.314
--   sodium  = (907.184*0.66 + 3*0.17 + 16*54.93) / 4          = 369.53
--   B12     = (907.184*2.14/100*100/100 ...) 907.184*0.0214/4  = 4.853 mcg  (2.14 mcg per 100 g)

begin;

-- helper: relative closeness
create function pg_temp.approx(actual numeric, expected numeric, pct numeric default 1) returns boolean
language sql immutable as $$ select actual is not null and abs(actual - expected) <= abs(expected) * pct / 100 $$;

create function pg_temp.nut(rec jsonb, servings int, k text) returns numeric
language sql stable as $$ select amount_per_serving from compute_nutrients(rec, servings) where nutrient_key = k $$;

-- ---------------------------------------------------------------- fixtures
insert into ingredients (canonical_name, slug, aisle_category) values
  ('fixture mystery spice', 'fixture-mystery-spice', 'Spices'),   -- never linked to a food
  ('fixture rice',          'fixture-rice',          'Pantry'),
  ('fixture sugar',         'fixture-sugar',         'Pantry'),
  ('fixture jam',           'fixture-jam',           'Pantry'),
  ('fixture ketchup',       'fixture-ketchup',       'Pantry'),
  ('fixture calciferol',    'fixture-calciferol',    'Other'),
  ('fixture atwater',       'fixture-atwater',       'Other'),
  ('fixture cooking fat',   'fixture-cooking-fat',   'Other');

create temp table ids (k text primary key, id integer);
insert into ids select 'beef',  id from ingredients where canonical_name = 'ground beef';
insert into ids select 'garlic', id from ingredients where canonical_name = 'garlic';
insert into ids select 'soy',   id from ingredients where canonical_name = 'soy sauce';
insert into ids select regexp_replace(canonical_name::text, '^fixture ', ''), id from ingredients where canonical_name::text like 'fixture %';
insert into ids select 'u_' || name, id from units;

do $$ begin
  if (select count(*) from ids where k in ('beef', 'garlic', 'soy')) <> 3 then
    raise exception 'FAILED: seed ingredients ground beef / garlic / soy sauce missing'; end if;
end $$;

-- the real vocabulary may already be linked to foods by a seed: clear it for these ingredients, inside the transaction only
delete from ingredient_foods    where ingredient_id in (select id from ids);
delete from ingredient_portions where ingredient_id in (select id from ids);
delete from added_sugar_ingredients where ingredient_id in (select id from ids);

insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving) values
  (990001, 'FIXTURE Beef, ground, 80% lean meat / 20% fat, raw', 'sr_legacy', null, null, null, null, null),
  (990002, 'FIXTURE Garlic, raw',                                'sr_legacy', null, null, null, null, null),
  (990003, 'FIXTURE Soy sauce made from soy and wheat (shoyu)',  'sr_legacy', null, null, null, null, null),
  (990004, 'FIXTUREBRAND SOY SAUCE',                              'branded', 'Fixturebrand Sales USA, Inc.', 'FIXTUREBRAND', 15, 'ml', '1 Tbsp'),
  (990005, 'FIXTUREBRAND SOY SAUCE NO LABEL DATA',                'branded', 'Fixturebrand Sales USA, Inc.', 'FIXTUREBRAND', 15, 'ml', '1 Tbsp'),
  (990006, 'FIXTURE Rice, white, raw',                            'sr_legacy', null, null, null, null, null),
  (990007, 'FIXTURE Rice, white, cooked',                         'sr_legacy', null, null, null, null, null),
  (990008, 'FIXTURE Sugar, granulated',                           'sr_legacy', null, null, null, null, null),
  (990009, 'FIXTURE Jam',                                         'sr_legacy', null, null, null, null, null),
  (990010, 'FIXTURE Ketchup',                                     'sr_legacy', null, null, null, null, null),
  (990011, 'FIXTURE Vitamin D in IU only',                        'branded', 'X', 'X', 100, 'g', null),
  (990012, 'FIXTURE Atwater-only energy (Foundation)',            'foundation', null, null, null, null, null),
  (990013, 'FIXTURE Oil',                                         'sr_legacy', null, null, null, null, null),
  (990014, 'FIXTURE Soy sauce, reduced sodium',                   'sr_legacy', null, null, null, null, null);

-- nutrient ids: 1 kcal 2 protein 3 carbs 4 fiber 5 sugars 6 added sugars 7 fat 8 sat 12 chol 13 sodium 23 vit A 25 vit D mcg 33 B12 90 vit D IU 91 Atwater spec
insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g) values
  (990001, 1, 254), (990001, 2, 17.17), (990001, 7, 20), (990001, 3, 0), (990001, 13, 66), (990001, 12, 71), (990001, 33, 2.14), (990001, 4, 0), (990001, 8, 7.581),
  (990002, 1, 149), (990002, 2, 6.36), (990002, 7, 0.5), (990002, 3, 33.06), (990002, 13, 17), (990002, 12, 0), (990002, 33, 0), (990002, 23, 0), (990002, 4, 2.1),
  (990003, 1, 53), (990003, 2, 8.14), (990003, 7, 0.57), (990003, 3, 4.93), (990003, 13, 5493), (990003, 12, 0), (990003, 33, 0), (990003, 23, 0), (990003, 4, 0.8),
  (990004, 1, 67), (990004, 2, 13.33), (990004, 7, 0), (990004, 3, 0), (990004, 13, 6133),
  -- 990005 has no nutrient rows at all
  (990006, 1, 365), (990006, 2, 7.13), (990006, 7, 0.66), (990006, 3, 80),
  (990007, 1, 130), (990007, 2, 2.69), (990007, 7, 0.28), (990007, 3, 28.17),
  (990008, 1, 387), (990008, 5, 100), (990008, 3, 100),
  (990009, 1, 250), (990009, 5, 48),
  (990010, 1, 100), (990010, 5, 22),
  (990011, 1, 100), (990011, 90, 40),                   -- 40 IU per 100 g = 1.0 mcg per 100 g
  (990012, 91, 200),                      -- Atwater specific only, no 208 row
  (990013, 1, 884), (990013, 7, 100),
  (990014, 1, 60), (990014, 13, 3300);

insert into ingredient_foods (ingredient_id, form, fdc_id, is_default) values
  ((select id from ids where k = 'beef'),   'default', 990001, true),
  ((select id from ids where k = 'garlic'), 'default', 990002, true),
  ((select id from ids where k = 'soy'),    'default', 990003, true),
  ((select id from ids where k = 'soy'),    'default', 990004, false),   -- the brand
  ((select id from ids where k = 'soy'),    'default', 990005, false),   -- a brand with no label data
  ((select id from ids where k = 'soy'),    'default', 990014, false),   -- a second generic USDA food
  ((select id from ids where k = 'rice'),   'default', 990006, true),
  ((select id from ids where k = 'rice'),   'cooked',  990007, true),
  ((select id from ids where k = 'sugar'),  'default', 990008, true),
  ((select id from ids where k = 'jam'),    'default', 990009, true),
  ((select id from ids where k = 'ketchup'),'default', 990010, true),
  ((select id from ids where k = 'calciferol'), 'default', 990011, true),
  ((select id from ids where k = 'atwater'),    'default', 990012, true),
  ((select id from ids where k = 'cooking fat'),'default', 990013, true);

insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source) values
  ((select id from ids where k = 'garlic'), 'default', (select id from ids where k = 'u_clove'), 3, 'usda'),
  ((select id from ids where k = 'soy'),    'default', (select id from ids where k = 'u_tbsp'), 16, 'usda'),
  ((select id from ids where k = 'rice'),   'default', (select id from ids where k = 'u_cup'), 185, 'usda'),
  ((select id from ids where k = 'rice'),   'cooked',  (select id from ids where k = 'u_cup'), 158, 'usda'),
  ((select id from ids where k = 'rice'),   'default', null, 50, 'curated');
update ingredients set density_g_per_ml = 0.85 where id = (select id from ids where k = 'sugar');
update ingredients set density_g_per_ml = 1.0  where id = (select id from ids where k = 'jam');

insert into added_sugar_ingredients (ingredient_id, fraction) values
  ((select id from ids where k = 'sugar'), 1), ((select id from ids where k = 'jam'), 1);

-- the owner's example as a stored recipe
insert into recipes (slug, title, servings, status) values ('fixture-beef-garlic-soy', 'Fixture beef garlic soy', 4, 'published');
insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, sort_order)
select r.id, x.ing, x.q, x.u, x.s
from   recipes r,
       (values ((select id from ids where k = 'beef'),   2::numeric, (select id from ids where k = 'u_lb'),    0),
               ((select id from ids where k = 'garlic'), 1::numeric, (select id from ids where k = 'u_clove'), 1),
               ((select id from ids where k = 'soy'),    1::numeric, (select id from ids where k = 'u_tbsp'),  2)) x(ing, q, u, s)
where  r.slug = 'fixture-beef-garlic-soy';

-- ================================================================ T1: reference data
do $$
begin
  if (select count(*) from nutrients where display_group <> 'hidden') <> 35 then raise exception 'FAILED T1: expected 35 shown nutrients'; end if;
  if (select count(*) from nutrients where display_group = 'hidden') <> 3 then raise exception 'FAILED T1: expected 3 source-only nutrients'; end if;
  -- the compute functions refer to these ids by number
  if (select key from nutrients where id = 1)  <> 'energy_kcal'     then raise exception 'FAILED T1: id 1'; end if;
  if (select key from nutrients where id = 5)  <> 'sugars_g'        then raise exception 'FAILED T1: id 5'; end if;
  if (select key from nutrients where id = 6)  <> 'added_sugars_g'  then raise exception 'FAILED T1: id 6'; end if;
  if (select key from nutrients where id = 90) <> 'vitamin_d_iu'    then raise exception 'FAILED T1: id 90'; end if;
  if (select key from nutrients where id = 91) <> 'energy_atwater_spec' then raise exception 'FAILED T1: id 91'; end if;
  -- FDA 2016 DVs
  if (select dv_amount from nutrients where key = 'sodium_mg') <> 2300 then raise exception 'FAILED T1: sodium DV'; end if;
  if (select dv_amount from nutrients where key = 'vitamin_d_mcg') <> 20 then raise exception 'FAILED T1: vitamin D DV'; end if;
  if (select dv_amount from nutrients where key = 'added_sugars_g') <> 50 then raise exception 'FAILED T1: added sugars DV'; end if;
  if (select dv_amount from nutrients where key = 'sugars_g') is not null then raise exception 'FAILED T1: total sugars has no DV'; end if;
  if (select fdc_nutrient_id from nutrients where key = 'vitamin_d_mcg') <> 1114 or (select fdc_nutrient_id from nutrients where key = 'added_sugars_g') <> 1235
    then raise exception 'FAILED T1: verified FDC ids'; end if;
  if (select count(*) from nutrients where fdc_nutrient_id is not null group by fdc_nutrient_id having count(*) > 1 limit 1) is not null
    then raise exception 'FAILED T1: duplicate fdc_nutrient_id'; end if;
  raise notice 'ok T1 reference data';
end $$;

-- ================================================================ T2: the owner's example, hand calculated
do $$
declare
  rid uuid := (select id from recipes where slug = 'fixture-beef-garlic-soy');
  lines jsonb;
  st record;
begin
  perform refresh_recipe_nutrients(rid);
  select jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'quantity', quantity, 'unit_id', unit_id) order by sort_order)
    into lines from recipe_ingredients where recipe_id = rid;

  if not pg_temp.approx(pg_temp.nut(lines, 4, 'energy_kcal'), 579.30) then
    raise exception 'FAILED T2: kcal % (want 579.30)', pg_temp.nut(lines, 4, 'energy_kcal'); end if;
  if not pg_temp.approx(pg_temp.nut(lines, 4, 'protein_g'), 39.314) then
    raise exception 'FAILED T2: protein % (want 39.314)', pg_temp.nut(lines, 4, 'protein_g'); end if;
  if not pg_temp.approx(pg_temp.nut(lines, 4, 'sodium_mg'), 369.53) then
    raise exception 'FAILED T2: sodium % (want 369.53)', pg_temp.nut(lines, 4, 'sodium_mg'); end if;
  if not pg_temp.approx(pg_temp.nut(lines, 4, 'vitamin_b12_mcg'), 4.853) then
    raise exception 'FAILED T2: B12 % (want 4.853)', pg_temp.nut(lines, 4, 'vitamin_b12_mcg'); end if;
  -- carbs: (907.184*0 + 3*0.3306 + 16*0.0493) / 4
  if not pg_temp.approx(pg_temp.nut(lines, 4, 'carbs_g'), (3 * 0.3306 + 16 * 0.0493) / 4) then
    raise exception 'FAILED T2: carbs %', pg_temp.nut(lines, 4, 'carbs_g'); end if;

  -- the stored cache agrees with the function, and the recipe is complete
  select * into st from recipes where id = rid;
  if (select nutrition_status from recipes where id = rid) <> 'complete' then
    raise exception 'FAILED T2: status % (want complete)', (select nutrition_status from recipes where id = rid); end if;
  if not pg_temp.approx((select amount_per_serving from recipe_nutrients where recipe_id = rid and nutrient_id = 1), 579.30) then
    raise exception 'FAILED T2: stored kcal'; end if;
  if (select nutrition_gaps from recipes where id = rid) <> '{}' then raise exception 'FAILED T2: gaps should be empty'; end if;
  -- a catalog recipe (author_id null): the macro columns are never written by a refresh
  if (select calories from recipes where id = rid) is not null then raise exception 'FAILED T2: catalog macros must not be overwritten'; end if;

  -- vitamin A: beef does not report it, garlic and soy report true zeros -> amount 0 with coverage < 1, NOT a full-coverage zero
  if (select coverage from compute_nutrients(lines, 4) where nutrient_key = 'vitamin_a_mcg_rae') > 0.05 then
    raise exception 'FAILED T2: vitamin A coverage should be about 0.02 (beef missing)'; end if;
  -- a nutrient nothing reports has no row at all
  if exists (select 1 from compute_nutrients(lines, 4) where nutrient_key = 'selenium_mcg') then
    raise exception 'FAILED T2: unreported nutrient must have no row'; end if;
  -- full coverage where every counted food reports
  if (select coverage from compute_nutrients(lines, 4) where nutrient_key = 'energy_kcal') <> 1 then
    raise exception 'FAILED T2: kcal coverage should be 1'; end if;
  raise notice 'ok T2 owner example within 1%%';
end $$;

-- ================================================================ T3: an unmapped line is a gap, not a number
do $$
declare
  b int := (select id from ids where k = 'beef');
  g int := (select id from ids where k = 'garlic');
  s int := (select id from ids where k = 'soy');
  m int := (select id from ids where k = 'mystery spice');
  lb int := (select id from ids where k = 'u_lb'); cl int := (select id from ids where k = 'u_clove'); tb int := (select id from ids where k = 'u_tbsp');
  tsp int := (select id from ids where k = 'u_tsp');
  base jsonb; plus jsonb; sm record;
begin
  base := jsonb_build_array(jsonb_build_object('ingredient_id', b, 'quantity', 2, 'unit_id', lb),
                            jsonb_build_object('ingredient_id', g, 'quantity', 1, 'unit_id', cl),
                            jsonb_build_object('ingredient_id', s, 'quantity', 1, 'unit_id', tb));
  plus := base || jsonb_build_array(jsonb_build_object('ingredient_id', m, 'quantity', 2, 'unit_id', tsp));
  if pg_temp.nut(plus, 4, 'energy_kcal') <> pg_temp.nut(base, 4, 'energy_kcal') then
    raise exception 'FAILED T3: an unmapped line changed the total'; end if;
  select * into sm from nutrition_summary(plus);
  if sm.status <> 'partial' then raise exception 'FAILED T3: status % (want partial)', sm.status; end if;
  if sm.gaps <> array['fixture mystery spice (no USDA food linked)'] then raise exception 'FAILED T3: gaps %', sm.gaps; end if;
  if sm.quantified_lines <> 4 or sm.counted_lines <> 3 then raise exception 'FAILED T3: line counts'; end if;

  -- a line with a food but no gram weight (a can of garlic: a count unit with no portion) is also a gap
  plus := base || jsonb_build_array(jsonb_build_object('ingredient_id', g, 'quantity', 1, 'unit_id', (select id from units where name = 'can')));
  select * into sm from nutrition_summary(plus);
  if sm.gaps <> array['garlic (no gram weight for can)'] then raise exception 'FAILED T3b: gaps %', sm.gaps; end if;

  -- fewer than half countable -> unavailable
  plus := jsonb_build_array(jsonb_build_object('ingredient_id', m, 'quantity', 1, 'unit_id', tsp),
                            jsonb_build_object('ingredient_id', m, 'quantity', 2, 'unit_id', tsp),
                            jsonb_build_object('ingredient_id', g, 'quantity', 1, 'unit_id', cl));
  if (select status from nutrition_summary(plus)) <> 'unavailable' then raise exception 'FAILED T3c: 1 of 3 counted must be unavailable'; end if;

  -- a brand with no label data selected by fdc_id: gap, never zero calories
  plus := jsonb_build_array(jsonb_build_object('ingredient_id', s, 'fdc_id', 990005, 'quantity', 1, 'unit_id', tb));
  if (select state from nutrition_line_report(plus)) <> 'no_nutrients' then raise exception 'FAILED T3d: want no_nutrients'; end if;
  raise notice 'ok T3 gaps are gaps';
end $$;

-- ================================================================ T4: to taste / optional / excluded
do $$
declare
  s int := (select id from ids where k = 'soy');
  g int := (select id from ids where k = 'garlic');
  cl int := (select id from ids where k = 'u_clove');
  fat int := (select id from ids where k = 'cooking fat');
  tb int := (select id from ids where k = 'u_tbsp');
  lines jsonb; sm record;
begin
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', s, 'quantity', null, 'unit_id', null));
  select * into sm from nutrition_summary(lines);
  if sm.status <> 'unavailable' or sm.quantified_lines <> 0 then raise exception 'FAILED T4: to-taste only must be unavailable, got %', sm.status; end if;
  if sm.to_taste <> array['soy sauce'] then raise exception 'FAILED T4: to_taste list %', sm.to_taste; end if;
  if exists (select 1 from compute_nutrients(lines, 2)) then raise exception 'FAILED T4: to-taste-only produced numbers'; end if;

  -- to taste next to a counted line: counts 0, is not a gap, status stays complete
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', g, 'quantity', 2, 'unit_id', cl),
                             jsonb_build_object('ingredient_id', s, 'quantity', null, 'unit_id', null));
  select * into sm from nutrition_summary(lines);
  if sm.status <> 'complete' or cardinality(sm.gaps) <> 0 then raise exception 'FAILED T4b: % %', sm.status, sm.gaps; end if;
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'sodium_mg'), 2 * 3 * 0.17) then raise exception 'FAILED T4b: sodium must exclude the to-taste soy sauce'; end if;

  -- optional: excluded and listed
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', g, 'quantity', 2, 'unit_id', cl),
                             jsonb_build_object('ingredient_id', s, 'quantity', 1, 'unit_id', tb, 'is_optional', true));
  select * into sm from nutrition_summary(lines);
  if sm.optional_lines <> array['soy sauce'] or sm.status <> 'complete' then raise exception 'FAILED T4c'; end if;
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'sodium_mg'), 2 * 3 * 0.17) then raise exception 'FAILED T4c: optional was counted'; end if;

  -- prep rule: fat only used to grease the pan is listed, not counted
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', g, 'quantity', 2, 'unit_id', cl),
                             jsonb_build_object('ingredient_id', fat, 'quantity', 1, 'unit_id', tb, 'prep_note', 'for greasing the pan'));
  select * into sm from nutrition_summary(lines);
  if sm.excluded_lines <> array['fixture cooking fat'] or sm.status <> 'complete' then raise exception 'FAILED T4d: %', sm.excluded_lines; end if;
  raise notice 'ok T4 to taste / optional / excluded';
end $$;

-- ================================================================ T5: forms, density, each, conversions
do $$
declare
  r int := (select id from ids where k = 'rice');
  sg int := (select id from ids where k = 'sugar');
  ca int := (select id from ids where k = 'calciferol');
  at int := (select id from ids where k = 'atwater');
  cup int := (select id from ids where k = 'u_cup'); tb int := (select id from ids where k = 'u_tbsp');
  lines jsonb;
begin
  -- raw: 1 cup = 185 g x 3.65 = 675.25 kcal ; cooked via the prep note: 158 g x 1.30 = 205.4 kcal
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', r, 'quantity', 1, 'unit_id', cup));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 675.25) then raise exception 'FAILED T5: raw rice'; end if;
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', r, 'quantity', 1, 'unit_id', cup, 'prep_note', 'cooked'));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 205.4) then raise exception 'FAILED T5: cooked rice picked the wrong food/weight'; end if;
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', r, 'quantity', 1, 'unit_id', cup, 'form', 'cooked'));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 205.4) then raise exception 'FAILED T5: explicit form'; end if;
  -- each: 2 rice (no unit) = 2 x 50 g x 3.65
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', r, 'quantity', 2));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 365) then raise exception 'FAILED T5: each portion'; end if;
  -- cooked form must NOT borrow the raw weight when it has no weight of its own (the raw form has an "each" row of 50 g)
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', r, 'quantity', 1, 'prep_note', 'cooked'));
  if (select state from nutrition_line_report(lines)) <> 'no_grams' then raise exception 'FAILED T5: cooked must not use raw weights'; end if;
  -- but a cooked tbsp is derived from the COOKED cup row (158 g), not the raw one (185 g)
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', r, 'quantity', 1, 'unit_id', tb, 'prep_note', 'cooked'));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 158 * 14.7868 / 236.588 * 1.30) then raise exception 'FAILED T5: cooked derived density'; end if;
  -- density (default form): 1 cup sugar = 236.588 ml x 0.85 g/ml
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', sg, 'quantity', 1, 'unit_id', cup));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 236.588 * 0.85 * 3.87) then raise exception 'FAILED T5: density path'; end if;
  -- derived density: rice has a cup row (185 g); a tbsp is 14.7868/236.588 of it -> 11.5625 g
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', r, 'quantity', 1, 'unit_id', tb));
  if (select basis from nutrition_line_report(lines)) <> 'derived_density' then raise exception 'FAILED T5: derived density'; end if;
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 185 * 14.7868 / 236.588 * 3.65) then raise exception 'FAILED T5: derived density value'; end if;
  -- vitamin D: IU-only food converts to mcg (40 IU per 100 g = 1.0 mcg per 100 g); 200 g -> 2.0 mcg
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', ca, 'quantity', 200, 'unit_id', (select id from ids where k = 'u_g')));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'vitamin_d_mcg'), 2.0) then raise exception 'FAILED T5: vitamin D IU conversion %', pg_temp.nut(lines, 1, 'vitamin_d_mcg'); end if;
  -- Atwater-only energy becomes kcal; the hidden source nutrients never appear
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', at, 'quantity', 100, 'unit_id', (select id from ids where k = 'u_g')));
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'energy_kcal'), 200) then raise exception 'FAILED T5: Atwater fallback'; end if;
  if exists (select 1 from compute_nutrients(lines, 1) where nutrient_key in ('vitamin_d_iu', 'energy_atwater_spec')) then
    raise exception 'FAILED T5: hidden nutrients leaked'; end if;
  raise notice 'ok T5 forms / density / each / conversions';
end $$;

-- ================================================================ T6: added sugars estimate
do $$
declare
  sg int := (select id from ids where k = 'sugar'); jm int := (select id from ids where k = 'jam'); kc int := (select id from ids where k = 'ketchup');
  g int := (select id from ids where k = 'u_g');
  lines jsonb;
begin
  lines := jsonb_build_array(jsonb_build_object('ingredient_id', sg, 'quantity', 100, 'unit_id', g),
                             jsonb_build_object('ingredient_id', jm, 'quantity', 100, 'unit_id', g),
                             jsonb_build_object('ingredient_id', kc, 'quantity', 100, 'unit_id', g));
  -- listed sweeteners: 100 g sugar (100 g sugars) + 100 g jam (48 g sugars) = 148 g; ketchup is unlisted -> 0
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'added_sugars_g'), 148) then raise exception 'FAILED T6: added sugars %', pg_temp.nut(lines, 1, 'added_sugars_g'); end if;
  if not pg_temp.approx(pg_temp.nut(lines, 1, 'sugars_g'), 170) then raise exception 'FAILED T6: total sugars'; end if;
  if not (select is_estimated from nutrients where key = 'added_sugars_g') then raise exception 'FAILED T6: added sugars must be flagged estimated'; end if;
  -- a food that reports added sugars itself wins over the list
  insert into usda_food_nutrients values (990009, 6, 10);
  if not pg_temp.approx(pg_temp.nut(jsonb_build_array(jsonb_build_object('ingredient_id', jm, 'quantity', 100, 'unit_id', g)), 1, 'added_sugars_g'), 10)
    then raise exception 'FAILED T6: direct added sugars must win'; end if;
  raise notice 'ok T6 added sugars';
end $$;

-- ================================================================ T7: per-line brand override
do $$
declare
  s int := (select id from ids where k = 'soy'); tb int := (select id from ids where k = 'u_tbsp'); g int := (select id from ids where k = 'garlic');
  generic jsonb; brand jsonb; bad jsonb;
begin
  generic := jsonb_build_array(jsonb_build_object('ingredient_id', s, 'quantity', 1, 'unit_id', tb));
  brand   := jsonb_build_array(jsonb_build_object('ingredient_id', s, 'fdc_id', 990004, 'quantity', 1, 'unit_id', tb));
  -- the brand uses the ingredient's tbsp weight (16 g) with the brand's own per-100 g values
  if not pg_temp.approx(pg_temp.nut(generic, 1, 'sodium_mg'), 16 * 54.93) then raise exception 'FAILED T7: generic sodium'; end if;
  if not pg_temp.approx(pg_temp.nut(brand,   1, 'sodium_mg'), 16 * 61.33) then raise exception 'FAILED T7: brand sodium %', pg_temp.nut(brand, 1, 'sodium_mg'); end if;
  -- a food that belongs to another ingredient is refused and reported, never silently used
  bad := jsonb_build_array(jsonb_build_object('ingredient_id', s, 'fdc_id', 990002, 'quantity', 1, 'unit_id', tb));
  if (select state from nutrition_line_report(bad)) <> 'bad_food' then raise exception 'FAILED T7: foreign fdc_id accepted'; end if;
  if exists (select 1 from compute_nutrients(bad, 1)) then raise exception 'FAILED T7: bad food produced numbers'; end if;
  raise notice 'ok T7 brand override';
end $$;

-- ================================================================ T8: idempotent refresh, and no search_vector / updated_at churn
do $$
declare
  rid uuid := (select id from recipes where slug = 'fixture-beef-garlic-soy');
  h1 text; h2 text; c1 text; c2 text;
begin
  perform refresh_recipe_nutrients(rid);
  select md5(string_agg(nutrient_id || ':' || amount_per_serving || ':' || coverage, '|' order by nutrient_id)) into h1 from recipe_nutrients where recipe_id = rid;
  select md5(row(nutrition_status, nutrition_gaps, nutrition_source, calories)::text) into c1 from recipes where id = rid;

  alter table recipes disable trigger recipes_before_write;
  update recipes set search_vector = to_tsvector('simple', 'sentinel'), updated_at = '2000-01-01' where id = rid;
  alter table recipes enable trigger recipes_before_write;

  perform refresh_recipe_nutrients(rid);
  perform refresh_recipe_nutrients(rid);
  select md5(string_agg(nutrient_id || ':' || amount_per_serving || ':' || coverage, '|' order by nutrient_id)) into h2 from recipe_nutrients where recipe_id = rid;
  select md5(row(nutrition_status, nutrition_gaps, nutrition_source, calories)::text) into c2 from recipes where id = rid;
  if h1 <> h2 or c1 <> c2 then raise exception 'FAILED T8: refresh is not idempotent'; end if;
  if (select search_vector from recipes where id = rid) <> to_tsvector('simple', 'sentinel') then raise exception 'FAILED T8: refresh recomputed search_vector'; end if;
  if (select updated_at from recipes where id = rid) <> '2000-01-01' then raise exception 'FAILED T8: refresh bumped updated_at'; end if;
  -- the flag does not leak: the next ordinary update bumps updated_at again
  update recipes set title = title || '!' where id = rid;
  if (select updated_at from recipes where id = rid) = '2000-01-01' then raise exception 'FAILED T8: skip flag leaked into later updates'; end if;
  -- the whole-table batch runs and returns the recipe count
  if refresh_all_recipe_nutrients() <> (select count(*) from recipes) then raise exception 'FAILED T8: refresh_all count'; end if;
  raise notice 'ok T8 idempotent, no churn';
end $$;

-- ================================================================ T9: one default per (ingredient, form)
do $$
declare s int := (select id from ids where k = 'soy');
begin
  begin
    insert into ingredient_foods (ingredient_id, form, fdc_id, is_default) values (s, 'default', 990006, true);
    raise exception 'FAILED T9: two defaults for one (ingredient, form) were accepted';
  exception when unique_violation then null; end;

  -- a form that has foods but no default fails when the deferred check fires
  insert into ingredient_foods (ingredient_id, form, fdc_id, is_default) values (s, 'canned', 990006, false);
  begin
    set constraints ingredient_foods_one_default immediate;
    raise exception 'FAILED T9: a form with foods but no default was accepted';
  exception when check_violation then null; end;
  set constraints ingredient_foods_one_default deferred;
  delete from ingredient_foods where ingredient_id = s and form = 'canned';
  set constraints ingredient_foods_one_default immediate;
  raise notice 'ok T9 default uniqueness';
end $$;

-- ================================================================ T10: guards
do $$
begin
  begin perform * from compute_nutrients('[]'::jsonb, 0); raise exception 'FAILED T10: servings 0 accepted';
  exception when sqlstate '22023' then null; end;
  begin perform * from compute_nutrients('{"a":1}'::jsonb, 1); raise exception 'FAILED T10: non-array accepted';
  exception when sqlstate '22023' then null; end;
  begin perform * from nutrition_line_report((select jsonb_agg('{}'::jsonb) from generate_series(1, 201))); raise exception 'FAILED T10: 201 lines accepted';
  exception when sqlstate '22023' then null; end;
  if (select state from nutrition_line_report('[{"ingredient_id": 999999999, "quantity": 1}]')) <> 'bad_line' then raise exception 'FAILED T10: unknown ingredient'; end if;
  if exists (select 1 from compute_nutrients('[]'::jsonb, 3)) then raise exception 'FAILED T10: empty recipe produced numbers'; end if;
  raise notice 'ok T10 guards';
end $$;

-- ================================================================ T11: user-recipe save hook (private implementation stubbed)
do $$
declare
  uid uuid := 'dddddddd-0000-0000-0000-00000000aa01';
  s int := (select id from ids where k = 'soy'); g int := (select id from ids where k = 'garlic');
  res jsonb; rid uuid; st text;
begin
  insert into auth.users (id, email) values (uid, 'nutri@example.test') on conflict (id) do nothing;
  insert into profiles (id) values (uid) on conflict (id) do nothing;
  perform set_config('request.jwt.claim.sub', uid::text, true);

  create schema if not exists private;
  -- stand-in for the real private implementation (not in dumps): inserts the recipe and its rows like the real one
  create or replace function private.save_my_recipe(p_recipe_id uuid, p_data jsonb, p_submit boolean) returns jsonb
  language plpgsql as $f$
  declare v uuid;
  begin
    insert into recipes (slug, title, servings, status, author_id)
    values ('fixture-user-' || substr(md5(random()::text), 1, 6), 'Fixture user recipe', 2, 'draft', auth.uid()) returning id into v;
    insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, sort_order)
    select v, x.ing, x.q, x.u, (row_number() over (order by x.o) - 1)::int
    from   (select (e ->> 'ingredient_id')::int as ing, (e ->> 'quantity')::numeric as q, nullif(e ->> 'unit_id', '')::int as u, o
            from   jsonb_array_elements(p_data -> 'ingredients') with ordinality t(e, o)
            where  nullif(trim(coalesce(e ->> 'name', '')), '') is not null) x;   -- compact numbering, like the real function
    return jsonb_build_object('id', v, 'slug', 'x', 'status', 'draft');
  end $f$;

  insert into feature_flags (name, enabled) values ('user_recipes', true)
  on conflict (name) do update set enabled = true;

  -- row 1 blank, row 2 garlic, row 3 soy sauce with the brand, row 4 soy sauce with a food that is NOT linked to soy sauce
  res := save_my_recipe(null, jsonb_build_object('ingredients', jsonb_build_array(
            jsonb_build_object('name', '', 'quantity', ''),
            jsonb_build_object('name', 'garlic', 'ingredient_id', g, 'quantity', 4, 'unit_id', (select id from ids where k = 'u_clove')),
            jsonb_build_object('name', 'soy sauce', 'ingredient_id', s, 'quantity', 1, 'unit_id', (select id from ids where k = 'u_tbsp'), 'fdc_id', '990004'),
            jsonb_build_object('name', 'soy sauce', 'ingredient_id', s, 'quantity', 1, 'unit_id', (select id from ids where k = 'u_tbsp'), 'fdc_id', '990002'))), false);
  rid := (res ->> 'id')::uuid;

  if (select fdc_id from recipe_ingredients where recipe_id = rid and sort_order = 0) is not null then raise exception 'FAILED T11: garlic should have no choice'; end if;
  if (select fdc_id from recipe_ingredients where recipe_id = rid and sort_order = 1) is distinct from 990004 then raise exception 'FAILED T11: linked brand choice not stored'; end if;
  if (select fdc_id from recipe_ingredients where recipe_id = rid and sort_order = 2) is not null then raise exception 'FAILED T11: unlinked food choice must be dropped'; end if;
  st := (select nutrition_status from recipes where id = rid);
  if st <> 'complete' then raise exception 'FAILED T11: status % (want complete)', st; end if;
  -- user recipes get their macro columns filled from the computation: (4*3*1.49 + 16*0.67 + 16*0.53)/2 kcal
  if not pg_temp.approx((select calories from recipes where id = rid), round((4 * 3 * 1.49 + 16 * 0.67 + 16 * 0.53) / 2, 0), 1) then
    raise exception 'FAILED T11: calories %, lines %', (select calories from recipes where id = rid),
      (select jsonb_agg(to_jsonb(r)) from nutrition_line_report((select jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'fdc_id', fdc_id,
         'quantity', quantity, 'unit_id', unit_id) order by sort_order) from recipe_ingredients where recipe_id = rid)) r); end if;
  if (select count(*) from recipe_nutrients where recipe_id = rid) < 8 then raise exception 'FAILED T11: nutrients not stored'; end if;
  raise notice 'ok T11 save hook';
end $$;

-- ================================================================ T12: type-ahead
do $$
declare r record; n int;
begin
  -- empty / short input
  if exists (select 1 from search_foods('', 10)) or exists (select 1 from search_foods('s', 10)) or exists (select 1 from search_foods(null, 10)) then
    raise exception 'FAILED T12: short input must return nothing'; end if;

  -- "soy sauce": the canonical ingredient first, then foods, then brands
  select * into r from search_foods('soy sauce', 12) limit 1;
  if r.kind <> 'ingredient' or r.ingredient_name <> 'soy sauce' or r.fdc_id is not null then raise exception 'FAILED T12: first row should be the canonical ingredient, got % %', r.kind, r.label; end if;
  if not r.has_nutrition then raise exception 'FAILED T12: soy sauce has nutrition'; end if;
  if not exists (select 1 from search_foods('soy sauce', 12) where fdc_id = 990004 and kind = 'brand' and brand = 'FIXTUREBRAND' and has_nutrition) then
    raise exception 'FAILED T12: the brand is missing under its ingredient: %', (select jsonb_agg(to_jsonb(s)) from search_foods('soy sauce', 12) s); end if;
  if exists (select 1 from search_foods('soy sauce', 12) where fdc_id = 990005 and has_nutrition) then
    raise exception 'FAILED T12: a food without label data must say has_nutrition false'; end if;
  if (select max(ord) from (select row_number() over () ord, kind, score from search_foods('soy sauce', 12)) a where kind = 'ingredient' and score >= 0.6)
     > (select min(ord) from (select row_number() over () ord, kind from search_foods('soy sauce', 12)) a where kind = 'brand') then
    raise exception 'FAILED T12: brands must rank after exact/prefix/word canonical ingredients'; end if;
  if (select max(ord) from (select row_number() over () ord, kind from search_foods('soy sauce', 12)) a where kind = 'food')
     > (select min(ord) from (select row_number() over () ord, kind from search_foods('soy sauce', 12)) a where kind = 'brand') then
    raise exception 'FAILED T12: generic foods must rank before brands'; end if;
  if (select max(ord) from (select row_number() over () ord, kind, score from search_foods('soy sauce', 12)) a where kind = 'brand')
     > (select min(ord) from (select row_number() over () ord, kind, score from search_foods('soy sauce', 12)) a where kind = 'ingredient' and score < 0.6) then
    raise exception 'FAILED T12: fuzzy ingredient matches must not outrank brands'; end if;

  -- typing the brand finds it, with the serving info from the label
  select * into r from search_foods('fixturebrand', 12) where fdc_id = 990004;
  if r.ingredient_id is null or r.serving_size <> 15 or r.serving_size_unit <> 'ml' or r.household_serving <> '1 Tbsp' then
    raise exception 'FAILED T12: brand search / serving info'; end if;
  if not exists (select 1 from search_foods('fixturebrand soy', 12) where fdc_id = 990004) then raise exception 'FAILED T12: brand + word'; end if;
  if exists (select 1 from search_foods('fixturebrand garlic', 12) where fdc_id = 990004) then raise exception 'FAILED T12: all words must match'; end if;

  -- an ingredient the vocabulary has but with no food linked: listed, flagged as not calculable
  select * into r from search_foods('fixture mystery spice', 5) where kind = 'ingredient' limit 1;
  if r.ingredient_id is null or r.has_nutrition then raise exception 'FAILED T12: unlinked ingredient must show has_nutrition false'; end if;

  -- the limit is honoured and capped
  select count(*) into n from search_foods('fixture', 3);
  if n > 3 then raise exception 'FAILED T12: limit not honoured'; end if;
  if (select count(*) from search_foods('fixture', 1000)) > 25 then raise exception 'FAILED T12: cap'; end if;
  raise notice 'ok T12 search_foods';
end $$;

rollback;
