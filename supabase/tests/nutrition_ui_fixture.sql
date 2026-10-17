-- TEST-ONLY FIXTURE for the nutrition UI lane (wave 10, lane D). NOT a migration, never applied to live.
--
-- The schema lane owns the real tables. This file re-creates a minimal version of the shared data contract
-- (docs/research/wave10-micronutrients-plan.md section 3.1) on a THROWAWAY database, with a handful of
-- hand-made foods, so the recipe-page label, the Me panel and the type-ahead can be exercised end to end
-- before the real data lands. Every number below is invented for testing: do not copy it anywhere.
--
-- Apply to a snapshot restore AFTER the wave 9 migrations and BEFORE 20261017150100 is exercised:
--   psql ... -f supabase/tests/nutrition_ui_fixture.sql
-- Do NOT apply it on top of the real schema-lane migration (the tables would collide).

begin;

create table nutrients (
  id smallint primary key,
  key text unique not null,
  name text not null,
  unit text not null,
  fdc_number integer,
  fdc_nutrient_id integer,
  dv_amount numeric,
  dv_unit text,
  display_group text,
  sort integer not null
);
insert into nutrients (id, key, name, unit, fdc_number, fdc_nutrient_id, dv_amount, dv_unit, display_group, sort) values
 (1,  'energy_kcal',    'Calories',            'kcal', 208, 1008, 2000, 'kcal', 'macro',   10),
 (2,  'fat_g',          'Total fat',           'g',    204, 1004, 78,   'g',    'macro',   20),
 (3,  'sat_fat_g',      'Saturated fat',       'g',    606, 1258, 20,   'g',    'macro',   30),
 (4,  'cholesterol_mg', 'Cholesterol',         'mg',   601, 1253, 300,  'mg',   'macro',   40),
 (5,  'sodium_mg',      'Sodium',              'mg',   307, 1093, 2300, 'mg',   'macro',   50),
 (6,  'carbs_g',        'Total carbohydrate',  'g',    205, 1005, 275,  'g',    'macro',   60),
 (7,  'fiber_g',        'Dietary fiber',       'g',    291, 1079, 28,   'g',    'macro',   70),
 (8,  'sugars_g',       'Total sugars',        'g',    269, 2000, null, null,   'macro',   80),
 (9,  'added_sugars_g', 'Added sugars',        'g',    539, 1235, 50,   'g',    'macro',   90),
 (10, 'protein_g',      'Protein',             'g',    203, 1003, 50,   'g',    'macro',   100),
 (11, 'vitamin_d_mcg',  'Vitamin D',           'mcg',  328, 1114, 20,   'mcg',  'vitamin', 110),
 (12, 'calcium_mg',     'Calcium',             'mg',   301, 1087, 1300, 'mg',   'mineral', 120),
 (13, 'iron_mg',        'Iron',                'mg',   303, 1089, 18,   'mg',   'mineral', 130),
 (14, 'potassium_mg',   'Potassium',           'mg',   306, 1092, 4700, 'mg',   'mineral', 140),
 (15, 'vitamin_c_mg',   'Vitamin C',           'mg',   401, 1162, 90,   'mg',   'vitamin', 150),
 (16, 'vitamin_a_mcg',  'Vitamin A',           'mcg',  320, 1106, 900,  'mcg',  'vitamin', 160),
 (17, 'folate_mcg',     'Folate',              'mcg',  435, 1190, 400,  'mcg',  'vitamin', 170),
 (18, 'zinc_mg',        'Zinc',                'mg',   309, 1095, 11,   'mg',   'mineral', 180);

create table usda_foods (
  fdc_id integer primary key,
  description text not null,
  data_type text not null check (data_type in ('foundation', 'sr_legacy', 'fndds', 'branded')),
  brand_owner text,
  brand_name text,
  serving_size numeric,
  serving_size_unit text,
  household_serving text,
  publication_date date,
  cached_at timestamptz default now()
);
create table usda_food_nutrients (
  fdc_id integer references usda_foods (fdc_id) on delete cascade,
  nutrient_id smallint references nutrients (id),
  amount_per_100g numeric not null,
  primary key (fdc_id, nutrient_id)
);
create table ingredient_foods (
  ingredient_id integer references ingredients (id) on delete cascade,
  form text not null default 'default',
  fdc_id integer references usda_foods (fdc_id) on delete cascade,
  is_default boolean not null default false,
  primary key (ingredient_id, form, fdc_id)
);

insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving) values
 (900001, 'Soy sauce made from soy and wheat (shoyu)', 'sr_legacy', null, null, null, null, null),
 (900002, 'SOY SAUCE', 'branded', 'Fixture Foods Co', 'Fixturemann', 15, 'ml', '1 tbsp (15 ml)'),
 (900003, 'LESS SODIUM SOY SAUCE', 'branded', 'Fixture Foods Co', 'Fixturemann', 15, 'ml', '1 tbsp (15 ml)'),
 (900004, 'Rice, white, long-grain, regular, raw', 'sr_legacy', null, null, null, null, null),
 (900005, 'Garlic, raw', 'sr_legacy', null, null, null, null, null),
 (900006, 'Oil, olive, salad or cooking', 'sr_legacy', null, null, null, null, null),
 (900007, 'Chicken, broilers or fryers, breast, meat only, raw', 'sr_legacy', null, null, null, null, null);

-- id order: kcal, fat, sat, chol, sodium, carbs, fiber, sugars, protein, vitD, calcium, iron, potassium, vitC, vitA, folate, zinc
insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)
select f, n, v from (values
 (900001,1,53),(900001,2,0.6),(900001,3,0.1),(900001,4,0),(900001,5,5493),(900001,6,4.9),(900001,7,0.8),(900001,8,0.4),(900001,10,8.1),(900001,12,33),(900001,13,2.4),(900001,14,435),(900001,17,14),(900001,18,0.4),
 (900002,1,67),(900002,2,0),(900002,3,0),(900002,5,6000),(900002,6,6.7),(900002,8,0),(900002,10,6.7),
 (900003,1,53),(900003,2,0),(900003,5,3800),(900003,6,6.7),(900003,10,6.7),
 (900004,1,365),(900004,2,0.7),(900004,3,0.2),(900004,4,0),(900004,5,5),(900004,6,80),(900004,7,1.3),(900004,8,0.1),(900004,10,7.1),(900004,12,28),(900004,13,0.8),(900004,14,115),(900004,15,0),(900004,17,231),(900004,18,1.1),
 (900005,1,149),(900005,2,0.5),(900005,3,0.1),(900005,4,0),(900005,5,17),(900005,6,33),(900005,7,2.1),(900005,8,1),(900005,10,6.4),(900005,12,181),(900005,13,1.7),(900005,14,401),(900005,15,31),(900005,17,3),(900005,18,1.2),
 (900006,1,884),(900006,2,100),(900006,3,13.8),(900006,4,0),(900006,5,2),(900006,6,0),(900006,10,0),(900006,13,0.6),
 (900007,1,120),(900007,2,2.6),(900007,3,0.6),(900007,4,73),(900007,5,45),(900007,6,0),(900007,10,22.5),(900007,12,5),(900007,13,0.4),(900007,14,334),(900007,18,0.7)
) as t(f, n, v);

-- ingredient ids: soy sauce 8, rice 3617, garlic 11, olive oil 34, chicken breast 322
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default) values
 (8, 'default', 900001, true), (8, 'default', 900002, false), (8, 'default', 900003, false),
 (3617, 'default', 900004, true), (11, 'default', 900005, true), (34, 'default', 900006, true), (322, 'default', 900007, true);

alter table recipes add column nutrition_status text check (nutrition_status in ('complete', 'partial', 'unavailable'));
alter table recipes add column nutrition_source text check (nutrition_source in ('usda_myplate', 'computed'));
alter table recipes add column nutrition_gaps text[];
alter table recipe_ingredients add column fdc_id integer references usda_foods (fdc_id);

create table recipe_nutrients (
  recipe_id uuid references recipes (id) on delete cascade,
  nutrient_id smallint references nutrients (id),
  amount_per_serving numeric,
  coverage numeric not null default 1 check (coverage between 0 and 1),
  computed_at timestamptz default now(),
  primary key (recipe_id, nutrient_id)
);

-- Reference data: select-only for the API roles.
alter table nutrients enable row level security;
alter table usda_foods enable row level security;
alter table usda_food_nutrients enable row level security;
alter table ingredient_foods enable row level security;
alter table recipe_nutrients enable row level security;
create policy nutrients_read on nutrients for select to anon, authenticated using (true);
create policy usda_foods_read on usda_foods for select to anon, authenticated using (true);
create policy usda_food_nutrients_read on usda_food_nutrients for select to anon, authenticated using (true);
create policy ingredient_foods_read on ingredient_foods for select to anon, authenticated using (true);
create policy recipe_nutrients_read on recipe_nutrients for select to anon, authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id and r.status = 'published'));
grant select on nutrients, usda_foods, usda_food_nutrients, ingredient_foods, recipe_nutrients to anon, authenticated;

-- compute_nutrients(lines, servings): mass and volume lines only (enough for the UI tests).
create function compute_nutrients(lines jsonb, servings integer default 1)
returns table (nutrient_id smallint, amount_per_serving numeric, coverage numeric, gaps text[])
language sql
stable
as $$
  with l as (
    select (e ->> 'ingredient_id')::integer as ingredient_id,
           nullif(e ->> 'fdc_id', '')::integer as fdc_id,
           (e ->> 'quantity')::numeric as q,
           nullif(e ->> 'unit_id', '')::integer as unit_id
      from jsonb_array_elements(lines) e
  ), g as (
    select l.*,
           coalesce(l.fdc_id, (select f.fdc_id from ingredient_foods f where f.ingredient_id = l.ingredient_id and f.is_default limit 1)) as food,
           case when u.kind = 'mass'   then l.q * u.to_base_factor
                when u.kind = 'volume' then l.q * u.to_base_factor * coalesce(i.density_g_per_ml, 1)
           end as grams
      from l
      left join units u on u.id = l.unit_id
      left join ingredients i on i.id = l.ingredient_id
  )
  select n.nutrient_id, sum(g.grams / 100 * n.amount_per_100g) / greatest(servings, 1), 1::numeric, '{}'::text[]
    from g join usda_food_nutrients n on n.fdc_id = g.food
   where g.grams is not null
   group by n.nutrient_id
$$;
grant execute on function compute_nutrients(jsonb, integer) to anon, authenticated;

-- search_foods(prefix, max_results): the shape the UI's adapter expects (see src/lib/foodHit.ts toFoodHit).
create function search_foods(prefix text, max_results integer default 12)
returns table (kind text, ingredient_id integer, fdc_id integer, label text, canonical_name text,
               brand_name text, household_serving text, kcal_per_100g numeric, has_nutrition boolean)
language sql
stable
as $$
  with q as (select lower(trim(prefix)) as p),
  ing as (
    select 'ingredient'::text as kind, s.ingredient_id, null::integer as fdc_id, s.canonical_name::text as label,
           s.canonical_name::text, null::text as brand_name, null::text as household_serving,
           (select n.amount_per_100g from ingredient_foods f join usda_food_nutrients n on n.fdc_id = f.fdc_id and n.nutrient_id = 1
             where f.ingredient_id = s.ingredient_id and f.is_default limit 1) as kcal,
           exists (select 1 from ingredient_foods f where f.ingredient_id = s.ingredient_id and f.is_default) as has_nutrition,
           s.score
      from suggest_ingredients(prefix, max_results) s
  ), foods as (
    select 'food'::text, f.ingredient_id, uf.fdc_id, uf.description, i.canonical_name::text,
           coalesce(uf.brand_name, uf.brand_owner), uf.household_serving,
           (select n.amount_per_100g from usda_food_nutrients n where n.fdc_id = uf.fdc_id and n.nutrient_id = 1),
           true, 0.5::real
      from usda_foods uf
      join ingredient_foods f on f.fdc_id = uf.fdc_id
      join ingredients i on i.id = f.ingredient_id
      cross join q
     where lower(uf.description) like '%' || q.p || '%' or lower(coalesce(uf.brand_name, '') || ' ' || coalesce(uf.brand_owner, '')) like '%' || q.p || '%'
  )
  select kind, ingredient_id, fdc_id, label, canonical_name, brand_name, household_serving, kcal, has_nutrition
    from (select * from ing union all select * from foods) u
   order by (kind = 'food'), score desc nulls last, label
   limit max_results
$$;
grant execute on function search_foods(text, integer) to anon, authenticated;

-- Stand-in for the schema lane's refresh function, so the "refresh after pick" hook in
-- set_my_recipe_foods can be seen to run.
create table fixture_refresh_log (recipe_id uuid, at timestamptz default now());
create function refresh_recipe_nutrients(p_recipe_id uuid) returns void language sql as
  $$ insert into fixture_refresh_log (recipe_id) values (p_recipe_id) $$;

-- Hand-made recipe_nutrients on four recipes: one published-macros + computed micros (complete), one
-- partial computed, one unavailable, and every other recipe stays empty (the "before data" case).
update recipes set nutrition_status = 'complete', nutrition_source = 'usda_myplate', nutrition_gaps = '{}' where slug = '2-step-chicken';
insert into recipe_nutrients (recipe_id, nutrient_id, amount_per_serving, coverage)
select r.id, v.n, v.a, v.c from recipes r, (values
 (1::smallint, 151::numeric, 1::numeric), (2, 4.6, 1), (3, 1.1, 1), (4, 62, 1), (5, 410, 1), (6, 6, 1), (7, 1.2, 1), (8, 2.1, 0.97), (9, 4, 1), (10, 22, 1),
 (11, 0.4, 0.95), (12, 41, 1), (13, 1.6, 1), (14, 480, 1), (15, 14, 0.96), (16, 38, 0.92), (17, 31, 0.8), (18, 1.9, 1)
) as v(n, a, c) where r.slug = '2-step-chicken';

update recipes set nutrition_status = 'partial', nutrition_source = 'computed', nutrition_gaps = array['gochujang', 'masala paste'] where slug = '20-minute-chicken-creole';
insert into recipe_nutrients (recipe_id, nutrient_id, amount_per_serving, coverage)
select r.id, v.n, v.a, v.c from recipes r, (values
 (1::smallint, 128::numeric, 1::numeric), (2, 4.2, 1), (3, 0.9, 1), (4, 48, 1), (5, 380, 1), (6, 12, 1), (7, 2, 1), (8, 4, 1), (9, 1.5, 1), (10, 14, 1),
 (12, 36, 0.55), (15, 22, 0.93)
) as v(n, a, c) where r.slug = '20-minute-chicken-creole';

update recipes set nutrition_status = 'unavailable', nutrition_source = 'computed', nutrition_gaps = array['everything'] where slug = '3-can-chili';

commit;
