-- Wave 10, lane B (schema + compute), migration 1 of 4: nutrition tables.
--
-- Design: docs/research/wave10-micronutrients-plan.md section 3.1, extended by the
-- owner's wave-10/11 goal (brands as FOODS linked to a canonical ingredient, a
-- per-line food override, and a type-ahead that returns brands).
--
-- Rules this file enforces:
--   * USDA FoodData Central is the only nutrient source (CC0). Nothing here loads data;
--     data arrives through supabase/seed-nutrition-*.sql after the migrations.
--   * A nutrient with NO row in usda_food_nutrients was not reported. A row with 0 is a true zero.
--     Missing is never zero.
--   * Brands are rows in usda_foods linked to a canonical ingredient through ingredient_foods.
--     They are never separate canonical ingredients (CLAUDE.md domain rule).
--   * Reference tables are select-only to anon/authenticated. Writes happen in migrations,
--     seeds (operator) and SECURITY DEFINER functions only.
--
-- Non-superuser safe: no SET pg_trgm.*, no superuser-only statements. A pg_trgm function is
-- called first so the extension is loaded in this session (LESSONS section 2).

select similarity('a', 'a');

-- ---------------------------------------------------------------------------
-- nutrients: the single source for what we track, its unit and its FDA Daily Value
-- ---------------------------------------------------------------------------
create table nutrients (
  id              smallint primary key,
  key             text     not null unique,
  name            text     not null,
  unit            text     not null,            -- OUR unit text (never trust the payload's mu symbol)
  fdc_number      text,                         -- API "nutrient.number" (e.g. '301')
  fdc_nutrient_id integer,                      -- bulk CSV / API "nutrient.id" (e.g. 1087). Do not mix them up.
  dv_amount       numeric,                      -- FDA 2016 adult Daily Value, null = none exists
  dv_unit         text,
  display_group   text     not null check (display_group in ('energy', 'macro', 'fat', 'carb', 'mineral', 'vitamin', 'hidden')),
  sort            smallint not null,
  is_estimated    boolean  not null default false,  -- shown as "estimated" in the UI (added sugars)
  check ((dv_amount is null) = (dv_unit is null)),
  check (dv_amount is null or dv_amount > 0)
);
comment on table nutrients is
  'Tracked nutrients. display_group hidden = source-only values used for conversions, never shown or stored per recipe.';
comment on column nutrients.fdc_nutrient_id is
  'The 4-digit id used by the bulk food_nutrient.csv. fdc_number is the 3-digit API number. Verified against live API 2026-10-16.';

insert into nutrients (id, key, name, unit, fdc_number, fdc_nutrient_id, dv_amount, dv_unit, display_group, sort, is_estimated) values
  ( 1, 'energy_kcal',        'Calories',                'kcal', '208', 1008, 2000,  'kcal', 'energy',  10, false),
  ( 2, 'protein_g',          'Protein',                 'g',    '203', 1003,   50,  'g',    'macro',   20, false),
  ( 3, 'carbs_g',            'Carbohydrate',            'g',    '205', 1005,  275,  'g',    'carb',    30, false),
  ( 4, 'fiber_g',            'Dietary fiber',           'g',    '291', 1079,   28,  'g',    'carb',    31, false),
  ( 5, 'sugars_g',           'Total sugars',            'g',    '269', 2000, null,  null,   'carb',    32, false),
  ( 6, 'added_sugars_g',     'Added sugars',            'g',    '539', 1235,   50,  'g',    'carb',    33, true),
  ( 7, 'fat_g',              'Total fat',               'g',    '204', 1004,   78,  'g',    'fat',     40, false),
  ( 8, 'sat_fat_g',          'Saturated fat',           'g',    '606', 1258,   20,  'g',    'fat',     41, false),
  ( 9, 'trans_fat_g',        'Trans fat',               'g',    '605', 1257, null,  null,   'fat',     42, false),
  (10, 'mono_fat_g',         'Monounsaturated fat',     'g',    '645', 1292, null,  null,   'fat',     43, false),
  (11, 'poly_fat_g',         'Polyunsaturated fat',     'g',    '646', 1293, null,  null,   'fat',     44, false),
  (12, 'cholesterol_mg',     'Cholesterol',             'mg',   '601', 1253,  300,  'mg',   'fat',     45, false),
  (13, 'sodium_mg',          'Sodium',                  'mg',   '307', 1093, 2300,  'mg',   'mineral', 50, false),
  (14, 'potassium_mg',       'Potassium',               'mg',   '306', 1092, 4700,  'mg',   'mineral', 51, false),
  (15, 'calcium_mg',         'Calcium',                 'mg',   '301', 1087, 1300,  'mg',   'mineral', 52, false),
  (16, 'iron_mg',            'Iron',                    'mg',   '303', 1089,   18,  'mg',   'mineral', 53, false),
  (17, 'magnesium_mg',       'Magnesium',               'mg',   '304', 1090,  420,  'mg',   'mineral', 54, false),
  (18, 'zinc_mg',            'Zinc',                    'mg',   '309', 1095,   11,  'mg',   'mineral', 55, false),
  (19, 'phosphorus_mg',      'Phosphorus',              'mg',   '305', 1091, 1250,  'mg',   'mineral', 56, false),
  (20, 'selenium_mcg',       'Selenium',                'mcg',  '317', 1103,   55,  'mcg',  'mineral', 57, false),
  (21, 'copper_mg',          'Copper',                  'mg',   '312', 1098,  0.9,  'mg',   'mineral', 58, false),
  (22, 'manganese_mg',       'Manganese',               'mg',   '315', 1101,  2.3,  'mg',   'mineral', 59, false),
  (23, 'vitamin_a_mcg_rae',  'Vitamin A',               'mcg',  '320', 1106,  900,  'mcg',  'vitamin', 60, false),
  (24, 'vitamin_c_mg',       'Vitamin C',               'mg',   '401', 1162,   90,  'mg',   'vitamin', 61, false),
  (25, 'vitamin_d_mcg',      'Vitamin D',               'mcg',  '328', 1114,   20,  'mcg',  'vitamin', 62, false),
  (26, 'vitamin_e_mg',       'Vitamin E',               'mg',   '323', 1109,   15,  'mg',   'vitamin', 63, false),
  (27, 'vitamin_k_mcg',      'Vitamin K',               'mcg',  '430', 1185,  120,  'mcg',  'vitamin', 64, false),
  (28, 'thiamin_mg',         'Thiamin (B1)',            'mg',   '404', 1165,  1.2,  'mg',   'vitamin', 65, false),
  (29, 'riboflavin_mg',      'Riboflavin (B2)',         'mg',   '405', 1166,  1.3,  'mg',   'vitamin', 66, false),
  (30, 'niacin_mg',          'Niacin (B3)',             'mg',   '406', 1167,   16,  'mg',   'vitamin', 67, false),
  (31, 'vitamin_b6_mg',      'Vitamin B6',              'mg',   '415', 1175,  1.7,  'mg',   'vitamin', 68, false),
  (32, 'folate_mcg_dfe',     'Folate',                  'mcg',  '435', 1190,  400,  'mcg',  'vitamin', 69, false),
  (33, 'vitamin_b12_mcg',    'Vitamin B12',             'mcg',  '418', 1178,  2.4,  'mcg',  'vitamin', 70, false),
  (34, 'pantothenic_mg',     'Pantothenic acid (B5)',   'mg',   '410', 1170,    5,  'mg',   'vitamin', 71, false),
  (35, 'choline_mg',         'Choline',                 'mg',   '421', 1180,  550,  'mg',   'vitamin', 72, false),
  -- Source-only rows: never shown, never stored per recipe. Used by nutrient_conversions.
  (90, 'vitamin_d_iu',       'Vitamin D (IU)',          'IU',   '324', 1110, null,  null,   'hidden', 900, false),
  (91, 'energy_atwater_spec','Energy (Atwater specific)','kcal','958', 2048, null,  null,   'hidden', 901, false),
  (92, 'energy_atwater_gen', 'Energy (Atwater general)','kcal', '957', 2047, null,  null,   'hidden', 902, false);

comment on column nutrients.dv_amount is
  'FDA 2016 Daily Values for adults and children 4+. Niacin DV is in mg NE; USDA reports niacin in mg, used as is.';

-- ---------------------------------------------------------------------------
-- nutrient_conversions: one place for unit/representation fallbacks
-- ---------------------------------------------------------------------------
create table nutrient_conversions (
  to_nutrient_id   smallint not null references nutrients(id),
  from_nutrient_id smallint not null references nutrients(id),
  factor           numeric  not null check (factor > 0),
  priority         smallint not null default 1,
  note             text,
  primary key (to_nutrient_id, from_nutrient_id),
  check (to_nutrient_id <> from_nutrient_id)
);
comment on table nutrient_conversions is
  'Used only when a food has no direct row for to_nutrient_id: amount = factor * the from_nutrient_id row, lowest priority first. '
  'Vitamin A IU is deliberately NOT converted to RAE: the factor depends on retinol vs carotenoid, so a food with only IU stays "not reported".';

insert into nutrient_conversions (to_nutrient_id, from_nutrient_id, factor, priority, note) values
  (25, 90, 0.025, 1, '1 IU vitamin D = 0.025 mcg (FDA 21 CFR 101.9)'),
  ( 1, 91, 1,     1, 'Foundation Foods report energy as Atwater specific factors (958) instead of 208'),
  ( 1, 92, 1,     2, 'Atwater general factors (957), used when specific is absent');

-- ---------------------------------------------------------------------------
-- usda_foods: the FoodData Central records we cache (generic and branded)
-- ---------------------------------------------------------------------------
create table usda_foods (
  fdc_id           integer primary key,
  description      text    not null,
  data_type        text    not null check (data_type in ('foundation', 'sr_legacy', 'fndds', 'branded')),
  brand_owner      text,
  brand_name       text,
  serving_size     numeric check (serving_size > 0),
  serving_size_unit text,                        -- 'g' or 'ml' as USDA reports it
  household_serving text,                        -- e.g. '1 Tbsp'
  publication_date date,
  cached_at        timestamptz not null default now()
);
comment on table usda_foods is
  'Cached FoodData Central records (CC0). Cite: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central (fdc.nal.usda.gov).';

-- Type-ahead: trigram GIN so ILIKE '%kikkoman%' and similarity() do not scan.
create index usda_foods_description_trgm_idx on usda_foods using gin (description gin_trgm_ops);
create index usda_foods_brand_name_trgm_idx  on usda_foods using gin (brand_name  gin_trgm_ops) where brand_name  is not null;
create index usda_foods_brand_owner_trgm_idx on usda_foods using gin (brand_owner gin_trgm_ops) where brand_owner is not null;
create index usda_foods_data_type_idx on usda_foods (data_type);

-- ---------------------------------------------------------------------------
-- usda_food_nutrients: long table, per 100 g. Absent row = not reported.
-- real (4 bytes) keeps a branded import small; 6 significant digits is far
-- finer than the data itself.
-- ---------------------------------------------------------------------------
create table usda_food_nutrients (
  fdc_id          integer  not null references usda_foods(fdc_id) on delete cascade,
  nutrient_id     smallint not null references nutrients(id),
  amount_per_100g real     not null check (amount_per_100g >= 0),
  primary key (fdc_id, nutrient_id)
);
comment on table usda_food_nutrients is
  'Per 100 g (USDA''s basis for all datasets, including branded). No row = not reported. 0 = true zero.';
-- No index on nutrient_id: every read is by fdc_id (the primary key), and the extra index costs about 20% of this table.

-- ---------------------------------------------------------------------------
-- ingredient_foods: which foods a canonical ingredient can resolve to
-- ---------------------------------------------------------------------------
create table ingredient_foods (
  ingredient_id integer not null references ingredients(id) on delete cascade,
  form          text    not null default 'default' check (form = lower(form) and length(form) between 1 and 30),
  fdc_id        integer not null references usda_foods(fdc_id) on delete cascade,
  is_default    boolean not null default false,
  primary key (ingredient_id, form, fdc_id)
);
comment on table ingredient_foods is
  'A canonical ingredient links to many foods (generic and branded) across forms (default, cooked, canned, dried, roasted). '
  'Exactly one is_default per (ingredient_id, form): enforced by a unique index plus a deferred constraint trigger. '
  'Not backfilled here (the FK needs usda_foods rows first). After the foods are loaded, the legacy single mapping can be copied: '
  'insert into ingredient_foods select i.id, ''default'', i.fdc_id, true from ingredients i join usda_foods f on f.fdc_id = i.fdc_id on conflict do nothing.';
create unique index ingredient_foods_one_default_idx on ingredient_foods (ingredient_id, form) where is_default;
create index ingredient_foods_fdc_idx on ingredient_foods (fdc_id);

-- Every (ingredient, form) that has any food must have exactly one default.
-- Deferred to commit so a seed can insert the default and the brands in any order.
create function trg_ingredient_foods_one_default() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ing  integer;
  v_form text;
begin
  if tg_op = 'DELETE' then
    v_ing := old.ingredient_id; v_form := old.form;
  else
    v_ing := new.ingredient_id; v_form := new.form;
  end if;
  if exists (select 1 from ingredient_foods f where f.ingredient_id = v_ing and f.form = v_form)
     and not exists (select 1 from ingredient_foods f where f.ingredient_id = v_ing and f.form = v_form and f.is_default) then
    raise exception 'ingredient % form "%" has foods but no default food', v_ing, v_form using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function trg_ingredient_foods_one_default() from public, anon, authenticated;

create constraint trigger ingredient_foods_one_default
  after insert or update or delete on ingredient_foods
  deferrable initially deferred
  for each row execute function trg_ingredient_foods_one_default();

-- ---------------------------------------------------------------------------
-- ingredient_portions: grams for one unit of an ingredient
-- ---------------------------------------------------------------------------
create table ingredient_portions (
  id             integer generated always as identity primary key,
  ingredient_id  integer not null references ingredients(id) on delete cascade,
  form           text    not null default 'default',   -- cooked rice weighs differently per cup than raw
  unit_id        integer references units(id),        -- null = "each" (a line with no unit)
  grams_per_unit numeric not null check (grams_per_unit > 0),
  source         text    not null check (source in ('usda', 'curated', 'us_can_size', 'label')),
  note           text
);
comment on table ingredient_portions is
  'Grams for 1 of unit_id (null = each). Count units need a row here; volume units use a row for that unit, '
  'else ingredients.density_g_per_ml (default form only), else a density derived from another volume row. '
  'The form column is an addition to the wave-10 contract: omit it and it is "default". '
  'Unique per (ingredient_id, form, unit_id) with null unit treated as one value.';
create unique index ingredient_portions_uq on ingredient_portions (ingredient_id, form, (coalesce(unit_id, 0)));

-- ---------------------------------------------------------------------------
-- prep_rules: heuristics that read a line's prep_note (kept as data, one place)
-- ---------------------------------------------------------------------------
create table prep_rules (
  id            integer generated always as identity primary key,
  kind          text    not null check (kind in ('form', 'exclude', 'grams_factor')),
  pattern       text    not null,                       -- Postgres regex, matched case-insensitively against prep_note
  ingredient_id integer references ingredients(id) on delete cascade,  -- null = any ingredient
  form          text,                                   -- kind form: the form to use when an ingredient has that form
  factor        numeric check (factor >= 0),            -- kind grams_factor: multiply the line's grams
  enabled       boolean not null default true,
  note          text,
  check ((kind = 'form') = (form is not null)),
  check ((kind = 'grams_factor') = (factor is not null))
);
comment on table prep_rules is
  'form: use the ingredient''s food for that form when the prep note matches and the form exists. '
  'exclude: the line is listed but not counted (e.g. oil for greasing a pan). '
  'grams_factor: scale grams (e.g. frying-bath oil absorption). Proposed rules, reviewable by the owner.';

insert into prep_rules (kind, pattern, form, note) values
  ('form', '\mcooked\M',  'cooked',  '"1 cup white rice, cooked" must not use the dry-rice food'),
  ('form', '\mcanned\M',  'canned',  null),
  ('form', '\mdried\M',   'dried',   null),
  ('form', '\mroasted\M', 'roasted', null);
insert into prep_rules (kind, pattern, note) values
  ('exclude', '\mfor (greasing|oiling)\M|\mto grease\M|\mfor the pan\M', 'proposed: fat used only to grease a pan is not eaten');

-- ---------------------------------------------------------------------------
-- added_sugar_ingredients: curated list for the "added sugars" estimate
-- ---------------------------------------------------------------------------
create table added_sugar_ingredients (
  ingredient_id integer primary key references ingredients(id) on delete cascade,
  fraction      numeric not null default 1 check (fraction > 0 and fraction <= 1),
  note          text
);
comment on table added_sugar_ingredients is
  'Owner-approved default: added sugars are estimated. A line whose food reports added sugars (FNDDS/Branded) uses that; '
  'else a listed ingredient counts fraction * its total sugars; every other ingredient counts 0. The nutrient is flagged estimated.';

-- Only clear sweeteners and jams, matched by canonical name. Rows appear only for names that exist.
insert into added_sugar_ingredients (ingredient_id, fraction, note)
select i.id, 1, 'proposed: sweetener'
from   ingredients i
where  i.canonical_name::text in ('granulated sugar', 'brown sugar', 'powdered sugar', 'honey', 'maple syrup',
                                  'molasses', 'palm sugar', 'apricot jam', 'strawberry jam', 'grape jelly')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Per-recipe cache + the per-line food override
-- ---------------------------------------------------------------------------
create table recipe_nutrients (
  recipe_id          uuid     not null references recipes(id) on delete cascade,
  nutrient_id        smallint not null references nutrients(id),
  amount_per_serving numeric  not null check (amount_per_serving >= 0),
  coverage           numeric  not null check (coverage > 0 and coverage <= 1),
  computed_at        timestamptz not null default now(),
  primary key (recipe_id, nutrient_id)
);
comment on table recipe_nutrients is
  'Regenerable cache written only by refresh_recipe_nutrients(). A nutrient with no reporting food has NO row. '
  'coverage = share of counted grams whose food reports the nutrient; below 1 the amount is a minimum.';

alter table recipes
  add column nutrition_status text check (nutrition_status in ('complete', 'partial', 'unavailable')),
  add column nutrition_source text check (nutrition_source in ('usda_myplate', 'computed')),
  add column nutrition_gaps   text[];
comment on column recipes.nutrition_status is 'null = never computed. See refresh_recipe_nutrients().';
comment on column recipes.nutrition_source is
  'usda_myplate: recipes.calories..fiber_g are USDA''s published values and stay the displayed macros. '
  'computed: macros come from the recipe_nutrients rows.';

alter table recipe_ingredients
  add column fdc_id integer references usda_foods(fdc_id) on delete set null;
comment on column recipe_ingredients.fdc_id is
  'A specific food or brand chosen for this line. Must be linked to the line''s ingredient in ingredient_foods or it is ignored (and reported as a gap). null = the ingredient''s default food.';
create index recipe_ingredients_fdc_idx on recipe_ingredients (fdc_id) where fdc_id is not null;

-- ---------------------------------------------------------------------------
-- RLS + grants: reference data is read-only to clients
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['nutrients', 'nutrient_conversions', 'usda_foods', 'usda_food_nutrients',
                           'ingredient_foods', 'ingredient_portions', 'prep_rules', 'added_sugar_ingredients'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to anon, authenticated', t);
    execute format('create policy "reference data is public" on %I for select using (true)', t);
  end loop;
end $$;

alter table recipe_nutrients enable row level security;
revoke all on recipe_nutrients from anon, authenticated;
grant select on recipe_nutrients to anon, authenticated;
-- Follows recipe visibility (published, or the author's own draft). The subselect is inlinable (LESSONS: no per-row definer call).
create policy "recipe nutrients follow recipe visibility" on recipe_nutrients
  for select using (recipe_id in (select r.id from recipes r));

-- identity sequence on ingredient_portions / prep_rules is not client-usable
revoke all on sequence ingredient_portions_id_seq from anon, authenticated;
revoke all on sequence prep_rules_id_seq from anon, authenticated;
