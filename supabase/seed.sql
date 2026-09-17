-- Minced — seed data (M1.4)
--
-- The six recipes from the RECIPES array in design/Minced.dc.html.
--
-- IDEMPOTENT: safe to run repeatedly. Ingredients and aliases upsert by natural
-- key; each recipe upserts by slug and has its children deleted and rebuilt, so
-- re-running never duplicates and always converges on this file's contents.
--
-- Allergens are NOT inserted. recipe_allergens is a derived cache, rebuilt by
-- trigger from ingredient_allergens. Writing it by hand is exactly the mistake
-- SCHEMA-NOTES.md Decision 2 exists to prevent.

begin;

-- ---------------------------------------------------------------------------
-- Canonical ingredients
--
-- 34 ingredient lines in the mockup collapse to 30 canonical rows: "garlic",
-- "garlic, grated" and "garlic, minced" are one ingredient with three prep
-- notes. That collapse is the entire point of the ingredients table -- without
-- it, a pantry containing "garlic" would match one recipe out of three.
-- ---------------------------------------------------------------------------

insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('salmon',             'salmon',             'Protein', false),
  ('gochujang',          'gochujang',          'Pantry',  false),
  ('soy sauce',          'soy-sauce',          'Pantry',  false),
  ('honey',              'honey',              'Pantry',  false),
  ('toasted sesame oil', 'toasted-sesame-oil', 'Pantry',  false),
  ('garlic',             'garlic',             'Produce', false),
  ('scallion',           'scallion',           'Produce', false),
  ('sesame seeds',       'sesame-seeds',       'Spices',  false),
  ('chickpeas',          'chickpeas',          'Pantry',  false),
  ('crushed tomatoes',   'crushed-tomatoes',   'Pantry',  false),
  ('whole tomatoes',     'whole-tomatoes',     'Pantry',  false),
  ('yellow onion',       'yellow-onion',       'Produce', false),
  ('ginger',             'ginger',             'Produce', false),
  ('garam masala',       'garam-masala',       'Spices',  false),
  ('ground cumin',       'ground-cumin',       'Spices',  false),
  ('cayenne',            'cayenne',            'Spices',  false),
  ('spaghetti',          'spaghetti',          'Pantry',  false),
  ('pecorino romano',    'pecorino-romano',    'Dairy',   false),
  ('egg',                'egg',                'Protein', false),
  ('red bell pepper',    'red-bell-pepper',    'Produce', false),
  ('smoked paprika',     'smoked-paprika',     'Spices',  false),
  ('ramen noodles',      'ramen-noodles',      'Pantry',  false),
  ('white miso',         'white-miso',         'Pantry',  false),
  ('mushrooms',          'mushrooms',          'Produce', false),
  ('cauliflower',        'cauliflower',        'Produce', false),
  ('harissa paste',      'harissa-paste',      'Pantry',  false),
  ('lemon',              'lemon',              'Produce', false),
  ('ground coriander',   'ground-coriander',   'Spices',  false),
  -- Pantry staples: never counted as "missing" by the matcher.
  ('olive oil',          'olive-oil',          'Pantry',  true),
  ('black pepper',       'black-pepper',       'Spices',  true)
on conflict (canonical_name) do update
  set aisle_category   = excluded.aisle_category,
      is_pantry_staple = excluded.is_pantry_staple;

-- Aliases. "Typing 'green oni' must offer scallion" (M3.3) is this table.
insert into ingredient_aliases (ingredient_id, alias)
select i.id, a.alias
from (values
  ('scallion',        'green onion'),
  ('scallion',        'green onions'),
  ('scallion',        'spring onion'),
  ('chickpeas',       'garbanzo beans'),
  ('chickpeas',       'garbanzo'),
  ('yellow onion',    'onion'),
  ('spaghetti',       'tonnarelli'),
  ('pecorino romano', 'pecorino'),
  ('egg',             'eggs'),
  ('mushrooms',       'mixed mushrooms'),
  ('harissa paste',   'harissa'),
  ('white miso',      'miso'),
  ('ground cumin',    'cumin'),
  ('cayenne',         'cayenne pepper'),
  ('toasted sesame oil', 'sesame oil'),
  ('red bell pepper', 'bell pepper')
) as a(canonical, alias)
join ingredients i on i.canonical_name = a.canonical
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- Ingredient-level allergens -- the source of truth.
--
-- Note what this catches that per-recipe tagging does not: soy sauce and
-- gochujang both contain WHEAT, so any recipe using them carries gluten even
-- when nobody remembered to tag the recipe that way.
-- ---------------------------------------------------------------------------

insert into ingredient_allergens (ingredient_id, allergen_id)
select i.id, al.id
from (values
  ('salmon',             'Fish'),
  ('soy sauce',          'Soy'),
  ('soy sauce',          'Gluten'),
  ('gochujang',          'Soy'),
  ('gochujang',          'Gluten'),
  ('white miso',         'Soy'),
  ('spaghetti',          'Gluten'),
  ('ramen noodles',      'Gluten'),
  ('pecorino romano',    'Dairy'),
  ('egg',                'Egg'),
  ('sesame seeds',       'Sesame'),
  ('toasted sesame oil', 'Sesame')
) as x(ingredient, allergen)
join ingredients i  on i.canonical_name = x.ingredient
join allergens   al on al.name          = x.allergen
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Recipes
--
-- author_id stays NULL: these are imported from the design mockup, not authored
-- by a user. RLS then makes them uneditable through the API by construction.
-- Nutrition is PER SERVING, matching the mockup's own numbers.
-- ---------------------------------------------------------------------------

insert into recipes (
  slug, title, cuisine_id, status, prep_time_min, cook_time_min, servings,
  spice_level, cost_per_serving, calories, protein_g, carbs_g, fat_g,
  sodium_mg, fiber_g, notes, source_name, source_license
)
select
  x.slug, x.title, c.id, 'published', x.prep, x.cook, x.servings,
  x.spice, x.cost, x.cal, x.protein, x.carbs, x.fat, x.sodium, x.fiber,
  x.notes, 'Minced design mockup (design/Minced.dc.html)',
  'Original work authored for this project'
from (values
  ('gochujang-glazed-salmon','Gochujang-Glazed Salmon','Korean',
   10,14,4,3,4.60, 520,38,22,30,680,2,
   'Broil the last 90 seconds for a darker, stickier crust. Halibut works too.'),
  ('chana-masala','Chana Masala','Indian',
   10,25,4,3,1.90, 390,16,58,11,540,14,
   'Better the next day. Serve with rice or warm flatbread.'),
  ('cacio-e-pepe','Cacio e Pepe','Italian',
   5,13,2,1,2.10, 640,24,82,24,590,3,
   'Pull the pan off the heat before the cheese goes in, or it seizes.'),
  ('shakshuka','Shakshuka','North African',
   10,20,3,2,2.40, 340,18,24,20,620,6,
   'Make wells for the eggs and cover the pan so the tops set.'),
  ('miso-mushroom-ramen','Miso Mushroom Ramen','Japanese',
   8,20,2,2,3.50, 560,22,74,20,980,5,
   'Never boil miso -- it goes flat. Stir it in off the heat.'),
  ('harissa-roast-cauliflower','Harissa Roast Cauliflower','Tunisian',
   10,30,4,3,2.20, 300,9,28,18,470,9,
   'Crowding steams instead of roasting -- use two pans if needed.')
) as x(slug,title,cuisine,prep,cook,servings,spice,cost,
       cal,protein,carbs,fat,sodium,fiber,notes)
join cuisines c on c.name = x.cuisine
on conflict (slug) do update set
  title = excluded.title, cuisine_id = excluded.cuisine_id,
  status = excluded.status, prep_time_min = excluded.prep_time_min,
  cook_time_min = excluded.cook_time_min, servings = excluded.servings,
  spice_level = excluded.spice_level, cost_per_serving = excluded.cost_per_serving,
  calories = excluded.calories, protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
  sodium_mg = excluded.sodium_mg, fiber_g = excluded.fiber_g,
  notes = excluded.notes,
  -- Rewritten on every run: the deletes below key on this prefix, so rows
  -- seeded under the old "Mise" name must be renamed before they run.
  source_name = excluded.source_name;

-- Children are rebuilt rather than upserted: simpler, and it means removing a
-- line from this file actually removes it from the database.
delete from recipe_ingredients where recipe_id in (select id from recipes where source_name like 'Minced design mockup%');
delete from recipe_steps       where recipe_id in (select id from recipes where source_name like 'Minced design mockup%');
delete from recipe_diets       where recipe_id in (select id from recipes where source_name like 'Minced design mockup%');
delete from recipe_cookware    where recipe_id in (select id from recipes where source_name like 'Minced design mockup%');

insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, prep_note, is_optional, sort_order)
select r.id, i.id, x.qty, u.id, nullif(x.prep,''), x.optional, x.ord
from (values
  -- Gochujang-Glazed Salmon
  ('gochujang-glazed-salmon','salmon',            4,   'fillet','6 oz each',false,1),
  ('gochujang-glazed-salmon','gochujang',         2,   'tbsp',  '',         false,2),
  ('gochujang-glazed-salmon','soy sauce',         1,   'tbsp',  '',         false,3),
  ('gochujang-glazed-salmon','honey',             1,   'tbsp',  '',         false,4),
  ('gochujang-glazed-salmon','toasted sesame oil',2,   'tsp',   '',         false,5),
  ('gochujang-glazed-salmon','garlic',            2,   'clove', 'grated',   false,6),
  ('gochujang-glazed-salmon','scallion',          3,   'stalk', 'sliced',   false,7),
  ('gochujang-glazed-salmon','sesame seeds',      1,   'tsp',   'toasted',  false,8),
  -- Chana Masala
  ('chana-masala','chickpeas',        2,   'can',  'drained', false,1),
  ('chana-masala','crushed tomatoes', 1,   'can',  '',        false,2),
  ('chana-masala','yellow onion',     1,   null,   'diced',   false,3),
  ('chana-masala','garlic',           3,   'clove','minced',  false,4),
  ('chana-masala','ginger',           1,   'tbsp', 'grated',  false,5),
  ('chana-masala','garam masala',     2,   'tsp',  '',        false,6),
  ('chana-masala','ground cumin',     1,   'tsp',  '',        false,7),
  ('chana-masala','cayenne',          0.5, 'tsp',  '',        false,8),
  -- Cacio e Pepe
  ('cacio-e-pepe','spaghetti',       200, 'g',   'or tonnarelli', false,1),
  ('cacio-e-pepe','pecorino romano',  80, 'g',   'grated',        false,2),
  ('cacio-e-pepe','black pepper',      2, 'tsp', 'coarse',        false,3),
  -- Shakshuka
  ('shakshuka','egg',             5, null,  '',       false,1),
  ('shakshuka','whole tomatoes',  1, 'can', '',       false,2),
  ('shakshuka','red bell pepper', 1, null,  'sliced', false,3),
  ('shakshuka','yellow onion',    1, null,  'sliced', false,4),
  ('shakshuka','smoked paprika',  1, 'tsp', '',       false,5),
  ('shakshuka','ground cumin',    1, 'tsp', '',       false,6),
  -- Miso Mushroom Ramen
  ('miso-mushroom-ramen','ramen noodles',2,  'portion','fresh',       false,1),
  ('miso-mushroom-ramen','white miso',   3,  'tbsp',   '',            false,2),
  ('miso-mushroom-ramen','mushrooms',    200,'g',      'mixed',       false,3),
  ('miso-mushroom-ramen','garlic',       2,  'clove',  '',            false,4),
  ('miso-mushroom-ramen','soy sauce',    1,  'tbsp',   '',            false,5),
  ('miso-mushroom-ramen','egg',          2,  null,     'soft-boiled', true, 6),
  -- Harissa Roast Cauliflower
  ('harissa-roast-cauliflower','cauliflower',     1,'head','in florets',false,1),
  ('harissa-roast-cauliflower','harissa paste',   2,'tbsp','',          false,2),
  ('harissa-roast-cauliflower','olive oil',       3,'tbsp','',          false,3),
  ('harissa-roast-cauliflower','chickpeas',       1,'can', 'drained',   false,4),
  ('harissa-roast-cauliflower','lemon',           1,null,  '',          false,5),
  ('harissa-roast-cauliflower','ground coriander',1,'tsp', '',          false,6)
) as x(recipe, ingredient, qty, unit, prep, optional, ord)
join recipes     r on r.slug           = x.recipe
join ingredients i on i.canonical_name = x.ingredient
left join units  u on u.name           = x.unit;

insert into recipe_steps (recipe_id, sort_order, instruction)
select r.id, x.ord, x.instruction
from (values
  ('gochujang-glazed-salmon',1,'Heat oven to 425°F. Line a sheet pan.'),
  ('gochujang-glazed-salmon',2,'Whisk gochujang, soy, honey, sesame oil, and garlic into a glaze.'),
  ('gochujang-glazed-salmon',3,'Pat salmon dry, set on the pan, and brush thickly with glaze.'),
  ('gochujang-glazed-salmon',4,'Roast 11–13 min until the glaze caramelizes and fish flakes.'),
  ('gochujang-glazed-salmon',5,'Top with scallion and sesame; serve over rice.'),
  ('chana-masala',1,'Soften onion in oil over medium heat, 6–7 min.'),
  ('chana-masala',2,'Add garlic, ginger, and spices; toast 1 min until fragrant.'),
  ('chana-masala',3,'Stir in tomatoes and chickpeas; simmer 18–20 min.'),
  ('chana-masala',4,'Mash a few chickpeas to thicken; season and finish with lemon.'),
  ('cacio-e-pepe',1,'Boil pasta in well-salted water until very al dente.'),
  ('cacio-e-pepe',2,'Toast cracked pepper in a dry skillet, then add a ladle of pasta water.'),
  ('cacio-e-pepe',3,'Off heat, toss pasta with pecorino and water until glossy.'),
  ('cacio-e-pepe',4,'Loosen with more pasta water as needed; serve immediately.'),
  ('shakshuka',1,'Soften onion and pepper in oil, 8–10 min.'),
  ('shakshuka',2,'Add spices, then crushed tomatoes; simmer 10 min.'),
  ('shakshuka',3,'Make wells and crack in the eggs.'),
  ('shakshuka',4,'Cover and cook 6–8 min until whites set but yolks stay soft.'),
  ('miso-mushroom-ramen',1,'Sear mushrooms in a dry pot until browned, then add garlic.'),
  ('miso-mushroom-ramen',2,'Add 700 ml water and soy sauce; simmer 10 min.'),
  ('miso-mushroom-ramen',3,'Cook noodles separately so the broth stays clear.'),
  ('miso-mushroom-ramen',4,'Off heat, whisk in miso. Never boil it. Ladle over noodles.'),
  ('harissa-roast-cauliflower',1,'Heat oven to 450°F.'),
  ('harissa-roast-cauliflower',2,'Toss cauliflower and chickpeas with harissa, oil, and coriander.'),
  ('harissa-roast-cauliflower',3,'Roast 28–32 min, turning once, until charred at the edges.'),
  ('harissa-roast-cauliflower',4,'Finish with lemon and herbs; great over yogurt or grains.')
) as x(recipe, ord, instruction)
join recipes r on r.slug = x.recipe;

insert into recipe_diets (recipe_id, diet_id)
select r.id, d.id
from (values
  ('gochujang-glazed-salmon','Pescatarian'),
  ('chana-masala','Vegan'), ('chana-masala','Gluten-free'),
  ('cacio-e-pepe','Vegetarian'),
  ('shakshuka','Vegetarian'), ('shakshuka','Gluten-free'),
  ('miso-mushroom-ramen','Vegetarian'),
  ('harissa-roast-cauliflower','Vegan'), ('harissa-roast-cauliflower','Gluten-free')
) as x(recipe, diet)
join recipes r on r.slug = x.recipe
join diets   d on d.name = x.diet;

insert into recipe_cookware (recipe_id, cookware_id)
select r.id, cw.id
from (values
  ('gochujang-glazed-salmon','Sheet pan'), ('gochujang-glazed-salmon','Small saucepan'),
  ('chana-masala','Dutch oven'),
  ('cacio-e-pepe','Pot'), ('cacio-e-pepe','Skillet'),
  ('shakshuka','Skillet'),
  ('miso-mushroom-ramen','Pot'),
  ('harissa-roast-cauliflower','Sheet pan')
) as x(recipe, cookware)
join recipes  r on r.slug = x.recipe
join cookware cw on cw.name = x.cookware;

commit;
