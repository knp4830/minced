-- Wave 10 fixer (audit-recipes): data for the compute rules in migration 20261017180000_nutrition_recipe_audit.sql.
-- IDEMPOTENT. Run LAST, after seed-nutrition-zzz-corrections.sql and BEFORE refresh_all_recipe_nutrients().
--
-- What is here and why (each block names the audit finding it answers):
--   1. to_taste_ingredients       a missing amount is "to taste" only for these (plus staples, spices, herbs)
--   2. prep_rules                 canned/cans, "cook rice", optional-free forms, skinless/bone-in chicken, size words,
--                                 "ingredients above" restatements, light mayonnaise
--   3. cooked forms and portions  lentils, beans, grains: "cooked, drained" must not count the dry food
--   4. other weights and foods    cup weights that 14+ recipes were missing, leaves/florets/halves instead of whole heads
--   5. recipe line corrections    where the recipe's own steps prove what the parsed line meant (each one is listed in
--                                 scripts/nutrition/review/recipe-line-fixes.csv for the owner)
--   6. is_optional                lines whose prep note says "optional" get the flag the matcher and the page use
--
-- Every number that is an estimate rather than a USDA household weight says so in its source/note column.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. to_taste_ingredients
-- ---------------------------------------------------------------------------------------------------------------
insert into to_taste_ingredients (ingredient_id, note)
select i.id, 'curated: a squeeze, dash or splash; no amount means to taste (energy under about 5 kcal)'
from   ingredients i
where  i.canonical_name::text in ('lemon', 'lime', 'soy sauce', 'hot sauce', 'dijon mustard', 'yellow mustard',
                                  'whole grain mustard', 'rice vinegar', 'ginger', 'active dry yeast')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. cooked forms (foods) and cup weights
-- ---------------------------------------------------------------------------------------------------------------
create temp table _cooked (ing text, fdc integer, cup numeric, note text) on commit drop;
insert into _cooked values
  ('lentils',              172421, 198, 'SR 11 cooked lentils; 1 cup = 198 g'),
  ('red lentils',          172421, 198, 'cooked lentils stand in for cooked red lentils (same SR record family; within a few kcal)'),
  ('pinto beans',          175200, 171, 'SR cooked pinto beans; 1 cup = 171 g'),
  ('kidney beans',         173740, 177, 'SR cooked kidney beans; 1 cup = 177 g'),
  ('chickpeas',            173757, 164, 'SR cooked chickpeas; 1 cup = 164 g'),
  ('white beans',          175203, 179, 'SR cooked white beans; 1 cup = 179 g'),
  ('cannellini beans',     175203, 179, 'cooked white beans stand in for cooked cannellini'),
  ('great northern beans', 175191, 177, 'SR cooked great northern beans; 1 cup = 177 g'),
  ('navy beans',           173746, 182, 'SR cooked navy beans; 1 cup = 182 g'),
  ('lima beans',           174253, 188, 'SR cooked large lima beans; 1 cup = 188 g'),
  ('split peas',           172429, 196, 'SR cooked split peas; 1 cup = 196 g'),
  ('toor dal',             172437, 168, 'SR cooked pigeon peas; 1 cup = 168 g'),
  ('barley',               170285, 157, 'SR cooked pearled barley; 1 cup = 157 g'),
  ('bulgur',               170287, 182, 'SR cooked bulgur; 1 cup = 182 g'),
  ('couscous',             169700, 157, 'SR cooked couscous; 1 cup = 157 g'),
  ('quinoa',               168917, 185, 'SR cooked quinoa; 1 cup = 185 g'),
  ('spaghetti',            169737, 140, 'SR cooked pasta; 1 cup spaghetti = 140 g'),
  ('lasagna noodles',      169737, 140, 'SR cooked pasta');

insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, 'cooked', c.fdc, true
from   _cooked c
join   ingredients i on i.canonical_name = c.ing
where  exists (select 1 from usda_foods u where u.fdc_id = c.fdc)
  and  not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'cooked' and f.is_default)
on conflict do nothing;

insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select i.id, 'cooked', u.id, c.cup, 'usda', c.note
from   _cooked c
join   ingredients i on i.canonical_name = c.ing
join   units u on u.name = 'cup'
where  exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'cooked')
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

-- A can of legumes with no canned food of its own is the cooked food (canned beans are cooked beans, drained).
create temp table _can_to_cooked (ing text) on commit drop;
insert into _can_to_cooked
select i.canonical_name::text
from   ingredients i
where  i.canonical_name::text in ('lentils', 'red lentils', 'great northern beans', 'navy beans', 'lima beans',
                                  'split peas', 'toor dal', 'black-eyed peas', 'barley', 'quinoa')
  and  exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'cooked')
  and  not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'canned');

-- ---------------------------------------------------------------------------------------------------------------
-- 4. chicken: skinless forms (the default thigh record is meat AND SKIN), and leaves / florets / halves
-- ---------------------------------------------------------------------------------------------------------------
-- 'chicken thighs' and 'whole chicken' written "boneless" / "skinless" / "skin removed" mean meat only. The meat-only raw
-- broiler record (SR 171052, 119 kcal/100 g) is the proxy: raw thigh meat only is about 121 kcal/100 g.
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, 'skinless', 171052, true
from   ingredients i
where  i.canonical_name::text in ('chicken thighs', 'whole chicken', 'chicken drumsticks')
  and  exists (select 1 from usda_foods u where u.fdc_id = 171052)
  and  not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'skinless' and f.is_default)
on conflict do nothing;

-- weights of the skinless form follow the default form's (a count of thighs weighs the same with the skin off)
insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select p.ingredient_id, 'skinless', p.unit_id, p.grams_per_unit, p.source, 'copied from the default form'
from   ingredient_portions p
join   ingredients i on i.id = p.ingredient_id
where  i.canonical_name::text in ('chicken thighs', 'whole chicken', 'chicken drumsticks') and p.form = 'default'
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

-- Lettuce leaves, florets and fruit halves: same food as the whole thing, own count weight.
-- 'leaf'   : romaine / iceberg lettuce (a head is 250 g / 539 g; recipes counting 4-16 of them mean leaves)
-- 'floret' : cauliflower / broccoli
-- 'half'   : pear / peach halves = half the whole fruit's weight already in the table
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select f.ingredient_id, v.form, f.fdc_id, true
from   (values ('romaine lettuce', 'leaf'), ('iceberg lettuce', 'leaf'), ('cauliflower', 'floret'), ('broccoli', 'floret'),
               ('pear', 'half'), ('peach', 'half')) v(ing, form)
join   ingredients i on i.canonical_name = v.ing
join   ingredient_foods f on f.ingredient_id = i.id and f.form = 'default' and f.is_default
on conflict do nothing;

insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select i.id, v.form, null, v.g, 'curated', v.note
from   (values ('romaine lettuce', 'leaf',   20, 'curated: one large outer leaf is about 20 g (a whole head is 250 g); estimate, owner review'),
               ('iceberg lettuce', 'leaf',   20, 'curated: one large leaf is about 20 g; estimate, owner review'),
               ('cauliflower',     'floret', 25, 'curated: one medium floret is about 25 g (a head is 588 g); estimate, owner review'),
               ('broccoli',        'floret', 20, 'curated: one medium floret is about 20 g; estimate, owner review')) v(ing, form, g, note)
join   ingredients i on i.canonical_name = v.ing
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select p.ingredient_id, 'half', null, round(p.grams_per_unit / 2, 1), 'curated', 'half of the whole fruit''s weight'
from   ingredient_portions p
join   ingredients i on i.id = p.ingredient_id
where  i.canonical_name::text in ('pear', 'peach') and p.form = 'default' and p.unit_id is null
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- light / reduced-fat mayonnaise
-- ---------------------------------------------------------------------------------------------------------------
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, 'light', 173594, true
from   ingredients i
where  i.canonical_name = 'mayonnaise'
  and  exists (select 1 from usda_foods u where u.fdc_id = 173594)
  and  not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'light' and f.is_default)
on conflict do nothing;

insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select p.ingredient_id, 'light', p.unit_id, p.grams_per_unit, p.source, 'copied from the default form (light mayonnaise is about the same density)'
from   ingredient_portions p
join   ingredients i on i.id = p.ingredient_id
where  i.canonical_name = 'mayonnaise' and p.form = 'default'
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- other weights that 14+ recipes were missing (cup of shredded cheese, cup of cooked chicken, canned fruit and beans)
-- ---------------------------------------------------------------------------------------------------------------
insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select i.id, v.form, u.id, v.g, v.src, v.note
from   (values
  ('shredded cheese',  'default', 'cup',  113.0,  'usda',    'USDA household weight: 1 cup shredded cheddar'),
  ('shredded cheese',  'default', 'tbsp',   7.0,  'usda',    'USDA household weight: 1 tbsp shredded cheddar'),
  ('chicken',          'cooked',  'cup',  140.0,  'usda',    'USDA household weight: 1 cup chopped or diced cooked chicken'),
  ('chicken',          'default', 'cup',  140.0,  'curated', 'a cup of diced raw chicken meat weighs about what the cooked cup does; estimate, owner review'),
  ('chicken breast',   'default', 'cup',  140.0,  'curated', 'a cup of diced raw chicken breast; estimate, owner review'),
  ('chicken breast',   'cooked',  'cup',  140.0,  'usda',    'USDA household weight: 1 cup chopped or diced cooked chicken'),
  ('mandarin orange',  'canned',  'cup',  249.0,  'usda',    'USDA household weight: 1 cup canned mandarin segments, juice pack'),
  ('kidney beans',     'canned',  'cup',  177.0,  'usda',    'cooked kidney beans, 1 cup (canned drained beans weigh within about 5 percent)'),
  ('white beans',      'canned',  'cup',  179.0,  'usda',    'cooked white beans, 1 cup'),
  ('chickpeas',        'canned',  'cup',  164.0,  'usda',    'cooked chickpeas, 1 cup'),
  ('canned pears',     'canned',  'cup',  244.0,  'usda',    'USDA household weight: 1 cup canned pear halves, juice pack'),
  ('black beans',      'cooked',  'can',  255.0,  'us_can_size', '15 oz can drained solids (same convention as the canned form)')
) v(ing, form, unit, g, src, note)
join   ingredients i on i.canonical_name = v.ing
join   units u on u.name = v.unit
where  exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = v.form)
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. prep_rules
-- ---------------------------------------------------------------------------------------------------------------
-- (a) "(2 cans)" is the canned product; "dried, rinsed" / "sorted and rinsed" is NOT (rinsing dry beans is not canning)
update prep_rules set pattern = '\m(canned|cans?)\M'
 where kind = 'form' and form = 'canned' and ingredient_id is null and pattern = '\mcanned\M';
update prep_rules set pattern = '\mdrained\M',
                      note = 'proposed: a drained line is the canned product; only applies to ingredients that have a canned form. '
                             '"rinsed" alone is not enough: "dried, rinsed" and "sorted and rinsed" are dry beans'
 where kind = 'form' and form = 'canned' and ingredient_id is null and pattern = '\m(drained|rinsed)\M';

create temp table _rules (kind text, pattern text, ing text, form text, factor numeric, note text) on commit drop;
insert into _rules values
  -- (b) "cook rice in unsalted water" as the prep note means cooked rice went into the recipe
  ('form', '\mcook (the )?(rice|pasta|noodles|couscous|quinoa|bulgur|barley|lentils)\M', null, 'cooked', null,
   'proposed: "cook rice in unsalted water" in the prep note is cooked rice (5 cups of raw rice for 5 servings is not a recipe)'),
  -- (b2) roasted / grilled / baked / poached meat is cooked meat (used only for ingredients that have a cooked form and no form of that name)
  ('form', '\m(roasted|rotisserie|grilled|baked|poached|boiled)\M', null, 'cooked', null,
   'proposed: "roasted chicken" is the cooked chicken food when the ingredient has no roasted form'),
  -- (c) a line that restates cooked ingredients listed above is not a second ingredient
  ('exclude', '\mingredients above\M', null, null, null,
   'proposed: "ingredients above, step 1 in directions" restates the rice already counted in the line above'),
  -- (d) light / reduced-fat mayonnaise
  ('form', '\m(light|lite|low[- ]?fat|reduced[- ]?(fat|calorie)|fat[- ]?free|nonfat|non-fat)\M', 'mayonnaise', 'light', null,
   'proposed: a light or reduced-fat mayonnaise line uses the light mayonnaise food (238 vs 680 kcal/100 g)'),
  -- (e) boneless / skinless poultry is meat only; bone-in poultry loses its bone (USDA SR refuse: thigh 21 percent)
  ('form', '^(?!.*skin[- ]on).*\m(boneless|skinless|skin removed|skinned|skin off)\M', 'chicken thighs', 'skinless', null,
   'proposed: boneless / skin-removed thighs are meat only'),
  ('form', '\m(skinned|skin removed|skinless|skin off)\M', 'whole chicken', 'skinless', null,
   'proposed: a skinned whole chicken counts meat only'),
  ('form', '\m(skinned|skin removed|skinless|skin off)\M', 'chicken drumsticks', 'skinless', null,
   'proposed: skin-removed drumsticks count meat only'),
  ('grams_factor', '^(?=.*bone[- ]in)(?=.*(skin removed|skinned|skinless|skin off))', 'chicken thighs', null, 0.70,
   'proposed: bone-in thigh, skin removed: about 70 percent of the purchased weight is meat (USDA SR thigh refuse 21 percent bone, then the skin)'),
  ('grams_factor', '\mbone[- ]in\M(?! or boneless)', 'chicken thighs', null, 0.79,
   'proposed: USDA SR "thigh, meat and skin, raw" refuse is 21 percent bone'),
  ('grams_factor', '^(?=.*(skinned|skin removed|skinless|skin off))', 'whole chicken', null, 0.55,
   'proposed: whole chicken, skin removed: about 55 percent of the weight is meat (bones, skin and giblets are not eaten)'),
  ('grams_factor', '^(cut|raw)', 'whole chicken', null, 0.68,
   'proposed: USDA SR "meat and skin, raw" refuse for a whole broiler is about 32 percent'),
  -- (f) size words scale an "each" weight (medium is the table''s weight)
  ('each_factor', '^small\M', null, null, 0.75, 'proposed: a small onion/potato/zucchini is about 75 percent of the medium weight'),
  ('each_factor', '^large\M', null, null, 1.30, 'proposed: a large one is about 130 percent of the medium weight'),
  ('each_factor', '^(extra[- ]large|jumbo)\M', null, null, 1.50, 'proposed: extra large / jumbo'),
  -- (g) leaves, florets, halves
  ('form', '\m(leaf|leaves)\M',   'romaine lettuce', 'leaf',   null, 'proposed: a count of leaves'),
  ('form', '\m(leaf|leaves)\M',   'iceberg lettuce', 'leaf',   null, 'proposed: a count of leaves'),
  ('form', '\mflorets?\M',        'cauliflower',     'floret', null, 'proposed: a count of florets'),
  ('form', '\mflorets?\M',        'broccoli',        'floret', null, 'proposed: a count of florets'),
  ('form', '\mhalves\M',          'pear',            'half',   null, 'proposed: a count of halves'),
  ('form', '\mhalves\M',          'peach',           'half',   null, 'proposed: a count of halves');

insert into prep_rules (kind, pattern, ingredient_id, form, factor, note)
select r.kind, r.pattern, i.id, r.form, r.factor, r.note
from   _rules r
left   join ingredients i on i.canonical_name = r.ing
where  (r.ing is null or i.id is not null)
  and  not exists (select 1 from prep_rules p
                   where p.kind = r.kind and p.pattern = r.pattern and p.ingredient_id is not distinct from i.id);

-- canned legumes without a canned food of their own: the cooked food
insert into prep_rules (kind, pattern, ingredient_id, form, note)
select 'form', '\m(canned|cans?|drained)\M', i.id, 'cooked',
       'proposed: this legume has no canned food of its own; canned beans are cooked beans, drained'
from   _can_to_cooked c
join   ingredients i on i.canonical_name::text = c.ing
where  not exists (select 1 from prep_rules p
                   where p.kind = 'form' and p.pattern = '\m(canned|cans?|drained)\M' and p.ingredient_id = i.id);

-- US chili sauce (the ketchup-like bottled sauce) was one of the 254 ingredients with no food
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, 'default', 171595, true
from   ingredients i
where  i.canonical_name = 'chili sauce' and exists (select 1 from usda_foods u where u.fdc_id = 171595)
  and  not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'default' and f.is_default)
on conflict do nothing;
insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select i.id, 'default', u.id, v.g, 'usda', v.note
from   ingredients i
cross  join (values ('cup', 273::numeric, 'USDA household weight: 1 cup bottled chili sauce'),
                    ('tbsp', 17::numeric, 'USDA household weight: 1 tbsp bottled chili sauce')) v(unit, g, note)
join   units u on u.name = v.unit
where  i.canonical_name = 'chili sauce'
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

-- dry kidney beans (the default kidney beans food is the canned product)
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, 'dried', 175193, true
from   ingredients i
where  i.canonical_name = 'kidney beans' and exists (select 1 from usda_foods u where u.fdc_id = 175193)
  and  not exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'dried' and f.is_default)
on conflict do nothing;
insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select i.id, 'dried', u.id, 184, 'usda', 'USDA household weight: 1 cup raw kidney beans'
from   ingredients i join units u on u.name = 'cup'
where  i.canonical_name = 'kidney beans'
on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. recipe line corrections where the recipe's own steps decide (listed in review/recipe-line-fixes.csv)
-- ---------------------------------------------------------------------------------------------------------------
create temp table _fix (title text, ing text, old_note text, new_note text, new_ing text, new_fdc integer) on commit drop;
insert into _fix values
  -- the step says "Serve with cooked rice"
  ('Chicken Stir-Fry',            'white rice',      'or brown rice',  'cooked, or brown rice',  null, null),
  -- the steps: "place cauliflower florets on ends of each log"
  ('Hiding Rabbits',              'cauliflower',     '(cut in half)',  'florets (cut in half)',  null, null),
  -- the steps: "place 2 pear halves ... a tail, ears and feet from another pear half" = 3 halves
  ('Pear Rabbit',                 'pear',            null,             'halves',                 null, null),
  -- the steps: "place one peach half, cut side up" (servings = 1)
  ('Eagle Nest',                  'peach',           null,             'halves',                 null, null),
  -- the steps: "Lay lettuce leaves ... top each leaf"
  ('Leaf Finger Salad',           'iceberg lettuce', 'large',          'large leaves',           null, null),
  -- the step: "light mayonnaise"; the title: "Low Fat Creamy Dressing"
  ('Tuna Melt Burger',            'mayonnaise',      null,             'light',                  null, null),
  ('Low Fat Creamy Dressing',     'mayonnaise',      null,             'low fat',                null, null),
  -- imported as yellow mustard by mistake: a pound of mustard greens beside collards and cabbage
  ('Delicious Greens',            'yellow mustard',  null,             null,                     'mustard greens', null),
  -- fresh (frozen) cranberries cooked down into a sauce / baked in a pie, imported as dried sweetened cranberries
  ('Homemade Cranberry Sauce',    'dried cranberries', '12 ounces, can also use frozen', '12 ounces, can also use frozen', 'fresh cranberries', null),
  ('Deep Dish Apple Cranberry Pie', 'dried cranberries', null,         null,                     'fresh cranberries', null),
  -- imported as refried beans by mistake: the steps sort, soak and simmer dry beans for 1.5 hours in 8-10 cups of water
  ('Cooked Beans',                'refried beans',   null,             null,                     'pinto beans', null),
  ('Simmered Beans',              'refried beans',   'pinto, black, or pink', null,              'pinto beans', null),
  ('New Orleans Red Beans',       'refried beans',   null,             null,                     'kidney beans', 175193);

update recipe_ingredients ri
   set prep_note     = coalesce(f.new_note, ri.prep_note),
       ingredient_id = coalesce(ni.id, ri.ingredient_id),
       fdc_id        = coalesce(f.new_fdc, ri.fdc_id)
  from _fix f
  join recipes r on r.title = f.title and r.source_name like 'USDA MyPlate%'
  join ingredients i on i.canonical_name = f.ing
  left join ingredients ni on ni.canonical_name = f.new_ing
 where ri.recipe_id = r.id and ri.ingredient_id = i.id
   and ri.prep_note is not distinct from f.old_note
   and (f.new_note is not null or ni.id is not null)
   and (f.new_fdc is null or exists (select 1 from ingredient_foods lf where lf.ingredient_id = coalesce(ni.id, ri.ingredient_id) and lf.fdc_id = f.new_fdc));

-- romaine lettuce counted 4-16 times can only be leaves
update recipe_ingredients ri
   set prep_note = case when ri.prep_note is null then 'leaves' else ri.prep_note || ', leaves' end
  from ingredients i
 where ri.ingredient_id = i.id and i.canonical_name = 'romaine lettuce'
   and ri.unit_id is null and ri.quantity >= 4
   and coalesce(ri.prep_note, '') !~* '\m(leaf|leaves)\M';

-- A recipe whose steps never cook, bake, heat or boil anything (a cold salad, a wrap, a dip) cannot be using raw rice,
-- dry couscous or raw chicken: the line is the cooked food. Applies to chicken / turkey (any unit) and to dry-default grains
-- and legumes measured by VOLUME (a box weight in ounces is a dry weight, so mass lines are left alone).
update recipe_ingredients ri
   set prep_note = case when ri.prep_note is null then 'cooked' else 'cooked, ' || ri.prep_note end
  from recipes r, ingredients i
 where ri.recipe_id = r.id and ri.ingredient_id = i.id
   and r.source_name like 'USDA MyPlate%'
   and coalesce(ri.prep_note, '') !~* '\m(cooked|uncooked|raw|dry|dried|canned|roasted|frozen)\M'
   and exists (select 1 from ingredient_foods f where f.ingredient_id = i.id and f.form = 'cooked')
   and ( i.canonical_name::text in ('chicken', 'chicken breast', 'turkey', 'turkey breast')
         or ( i.filter_group in ('grains', 'legumes')
              and exists (select 1 from units u where u.id = ri.unit_id and u.kind = 'volume')
              and exists (select 1 from ingredient_foods f join usda_foods d on d.fdc_id = f.fdc_id
                          where f.ingredient_id = i.id and f.form = 'default' and f.is_default
                            and d.description ~* '(\mraw\M|\mdry\M|uncooked)') ) )
   and not exists (select 1 from recipe_steps s where s.recipe_id = r.id
                   and s.instruction ~* '\m(cook|boil|simmer|bake|heat|microwave|saute|sauté|fry|steam|stove|oven|pressure|soak|toast|brown)');

-- ---------------------------------------------------------------------------------------------------------------
-- 6. optional lines
-- ---------------------------------------------------------------------------------------------------------------
update recipe_ingredients
   set is_optional = true
 where not is_optional and prep_note ~* '\moptional\M';

commit;
