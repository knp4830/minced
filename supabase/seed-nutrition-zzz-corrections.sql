-- Wave 10 fixer: data corrections found by the independent nutrition audit (audit-foods). IDEMPOTENT.
--
-- Run LAST, after seed-nutrition-zz-integration.sql and BEFORE refresh_all_recipe_nutrients():
--   usda-1-foods, usda-2-nutrients-01, usda-3-links, seed-ingredients-world, seed-nutrition-world,
--   seed-nutrition-branded-extra, seed-nutrition-zz-integration, seed-nutrition-zzz-corrections (this file).
--
-- Sources of truth (edit THESE, not the generated seeds):
--   scripts/nutrition/corrections/link_corrections.tsv    wrong brand links, wrong defaults, proxies to leave unmapped
--   scripts/nutrition/corrections/build_corrections.py    splices that TSV into the marked block below
--   scripts/world-ingredients/quality.py                  the same energy gate, applied at generation time
-- Everything else in this file is a RULE (a gate over all rows), so a regenerated seed is repaired the same way.
--
-- Rules never touch live user data: nothing here writes a table a user owns. Nutrient rows are deleted, never zeroed:
-- absent means "not reported", and a food with an impossible value is missing that value, not wrong.

begin;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Explicit link corrections (generated from link_corrections.tsv)
-- ---------------------------------------------------------------------------------------------------------------
create temp table _link_actions (action text, ingredient text, form text, fdc_id integer, reason text) on commit drop;

-- BEGIN LINK ACTIONS (generated; edit scripts/nutrition/corrections/link_corrections.tsv)
insert into _link_actions (action, ingredient, form, fdc_id, reason) values
  ('drop_link', 'chicken breast', 'default', 398834, 'probable: breaded chicken breast tenders'),
  ('drop_link', 'chili crisp', 'default', 2655519, 'probable: variety pack incl. spice mix'),
  ('drop_link', 'dosa batter', 'default', 472155, 'probable: IDLI MIX is a dry mix, not batter (default)'),
  ('drop_link', 'dried tofu', 'default', 583846, 'probable: seasoned baked tofu cubes (default)'),
  ('drop_link', 'herbes de provence', 'default', 2014105, 'probable: roasted chicken-and-potatoes recipe seasoning mix'),
  ('drop_link', 'maple syrup', 'default', 1953571, 'probable: honey-maple syrup blend'),
  ('drop_link', 'panko breadcrumbs', 'default', 2434060, 'probable: PANKO BREADED product (190 kcal vs 349)'),
  ('drop_link', 'plain yogurt', 'default', 2190137, 'probable: non-dairy plain blend'),
  ('drop_link', 'rice vinegar', 'default', 2580460, 'probable: SEASONED rice vinegar, mango (sugar added)'),
  ('drop_link', 'rice vinegar', 'default', 2084128, 'probable: seasoned rice vinegar'),
  ('drop_link', 'rice vinegar', 'default', 2580461, 'probable: seasoned rice vinegar (sugar and salt added)'),
  ('drop_link', 'rice vinegar', 'default', 2493047, 'probable: lite seasoned rice vinegar'),
  ('drop_link', 'rice vinegar', 'default', 2569854, 'probable: seasoned rice vinegar'),
  ('drop_link', 'rice vinegar', 'default', 2084989, 'probable: seasoned rice vinegar'),
  ('drop_link', 'rice vinegar', 'default', 2084516, 'probable: rice vinegar dressing'),
  ('drop_link', 'sour cream', 'default', 380785, 'probable: sour cream DIP'),
  ('drop_link', 'soy sauce', 'default', 2339759, 'probable: Liquid Aminos soy-sauce ALTERNATIVE'),
  ('drop_link', 'soy sauce', 'default', 2422260, 'probable: Liquid Aminos soy protein seasoning'),
  ('drop_link', 'wild rice', 'default', 2117216, 'probable: Minnesota quick cooking wild rice at 567 kcal/100 g (about 357 expected)'),
  ('drop_link', 'adobo seasoning', 'default', 2673787, 'wrong: chipotle peppers in adobo sauce (canned peppers)'),
  ('drop_link', 'bacon', 'default', 1601794, 'wrong: BACON DOGS (hot dogs)'),
  ('drop_link', 'brown sugar', 'default', 2127483, 'wrong: maple brown sugar seasoned BUTTER'),
  ('drop_link', 'canned clams', 'default', 171977, 'wrong: SR "canned, liquid" is the clam juice (about 2 kcal/100 g), not the clams; use the SR "canned, drained solids" record'),
  ('drop_link', 'chili oil', 'default', 2655544, 'wrong: spicy chili NOODLES'),
  ('drop_link', 'chili oil', 'default', 2304756, 'wrong: chili crisp VINAIGRETTE'),
  ('drop_link', 'chipotle in adobo', 'default', 2673788, 'wrong: refried beans, chipotle'),
  ('drop_link', 'chorizo', 'default', 1927470, 'wrong: SPAM with chorizo seasoning'),
  ('drop_link', 'coffee', 'default', 1641706, 'wrong: mocha + salted caramel drink mix'),
  ('drop_link', 'coffee', 'default', 1874578, 'wrong: latte coffee beverage mix (sweetened)'),
  ('drop_link', 'coffee', 'default', 1641719, 'wrong: mocha coffee drink mix'),
  ('drop_link', 'coffee', 'default', 1663676, 'wrong: cafe con leche instant beverage mix'),
  ('drop_link', 'coffee', 'default', 2552992, 'wrong: vanilla coffee beverage mix pods'),
  ('drop_link', 'cumin seeds', 'default', 2144058, 'wrong: chicken-and-vegetables skillet seasoning'),
  ('drop_link', 'deli ham', 'default', 2630463, 'wrong: ham and cheddar egg scramble kit'),
  ('drop_link', 'dried basil', 'default', 2571642, 'wrong: pesto sauce mix'),
  ('drop_link', 'dried basil', 'default', 2117204, 'wrong: slow-cooker recipe seasoning mix'),
  ('drop_link', 'dried basil', 'default', 2034585, 'wrong: salmon recipe seasoning mix'),
  ('drop_link', 'dried basil', 'default', 2540958, 'wrong: veggie marinade mix'),
  ('drop_link', 'dried oregano', 'default', 2144493, 'wrong: sheet-pan seasoning mix'),
  ('drop_link', 'dried oregano', 'default', 2034887, 'wrong: bruschetta seasoning mix'),
  ('drop_link', 'dried oregano', 'default', 2543097, 'wrong: savory tomato seasoning mix'),
  ('drop_link', 'dried oregano', 'default', 2014042, 'wrong: bruschetta chicken recipe seasoning mix'),
  ('drop_link', 'dried parsley', 'default', 2297581, 'wrong: minced garlic and parsley blend (kcal 0 vs 146 median)'),
  ('drop_link', 'dried rosemary', 'default', 2021379, 'wrong: potato seasoning'),
  ('drop_link', 'dried rosemary', 'default', 2566829, 'wrong: rosemary chicken seasoning mix'),
  ('drop_link', 'dried thyme', 'default', 2270468, 'wrong: creamy chicken skillet seasoning mix'),
  ('drop_link', 'everything bagel seasoning', 'default', 1937052, 'wrong: topped hummus is not a seasoning (default food)'),
  ('drop_link', 'everything bagel seasoning', 'default', 2640451, 'wrong: Everything Butter (nut butter, 600 kcal)'),
  ('drop_link', 'fonio', 'default', 1022379, 'wrong: FONIO at 20 kcal/100 g with 82 g carbohydrate (FDC label error; about 356 expected)'),
  ('drop_link', 'gochujang', 'default', 2088925, 'wrong: ketchup sauce, gochujang'),
  ('drop_link', 'ground cinnamon', 'default', 1903053, 'wrong: vegetable seasoning mix'),
  ('drop_link', 'ground cinnamon', 'default', 2316310, 'wrong: cocoa-cinnamon smoothie drink mix'),
  ('drop_link', 'ground cinnamon', 'default', 2034415, 'wrong: CINNAMON SUGAR (mostly sugar)'),
  ('drop_link', 'ground cinnamon', 'default', 2210352, 'wrong: cinnamon sugar blend'),
  ('drop_link', 'ground coriander', 'default', 2563568, 'wrong: coriander and annatto marinade and dressing'),
  ('drop_link', 'ground ginger', 'default', 2664288, 'wrong: ginger sesame vinaigrette'),
  ('drop_link', 'ground ginger', 'default', 1872754, 'wrong: chili lime ginger pork marinade mix'),
  ('drop_link', 'ground ginger', 'default', 2210494, 'wrong: sesame ginger vegetable seasoning mix'),
  ('drop_link', 'hibiscus flowers', 'default', 394043, 'wrong: flowers in syrup (sweetened, 205 kcal/100 g) as the default for dried or fresh flowers (jamaica)'),
  ('drop_link', 'lemon pepper', 'default', 2540794, 'wrong: FISH FRY MIX, lemon pepper (default)'),
  ('drop_link', 'matcha', 'default', 718136, 'wrong: RAW HONEY + MATCHA blend as the default matcha'),
  ('drop_link', 'matcha', 'default', 2391951, 'wrong: matcha latte stick'),
  ('drop_link', 'matcha', 'default', 2138294, 'wrong: vegan matcha latte drink mix'),
  ('drop_link', 'matcha', 'default', 806803, 'wrong: matcha latte infusion (sweetened mix)'),
  ('drop_link', 'matcha', 'default', 2373332, 'wrong: matcha latte mix'),
  ('drop_link', 'old bay seasoning', 'default', 2043843, 'wrong: Old Bay seasoned popcorn'),
  ('drop_link', 'old bay seasoning', 'default', 404284, 'wrong: Old Bay tuna classic CAKE MIX (default)'),
  ('drop_link', 'olive oil', 'default', 405755, 'wrong: "EXTRA VIRGIN OLIVE OIL" by StarKist at 243 kcal/100 g (a tuna record; about 882 expected)'),
  ('drop_link', 'paprika', 'default', 2155189, 'wrong: paprika + garlic seasoning mix'),
  ('drop_link', 'popcorn', 'default', 516569, 'wrong: popcorn CAKES'),
  ('drop_link', 'pumpkin seeds', 'default', 2609449, 'wrong: trail mix (soybeans, sunflower, pumpkin, cranberries)'),
  ('drop_link', 'raisins', 'default', 2236660, 'wrong: chocolate yogurt-covered raisins'),
  ('drop_link', 'raisins', 'default', 2721165, 'wrong: yogurt-covered raisins'),
  ('drop_link', 'semisweet chocolate', 'default', 1728013, 'wrong: WHITE chocolate chips'),
  ('drop_link', 'semisweet chocolate', 'default', 2574272, 'wrong: mint chocolate chips'),
  ('drop_link', 'semisweet chocolate', 'default', 2574292, 'wrong: MILK chocolate chips'),
  ('drop_link', 'semisweet chocolate', 'default', 2703457, 'wrong: milk chocolate chips'),
  ('drop_link', 'semisweet chocolate', 'default', 2574289, 'wrong: zero-sugar chips (sweetener, different energy)'),
  ('drop_link', 'sunflower seeds', 'default', 2672515, 'wrong: nuts-seeds-cranberries mix'),
  ('drop_link', 'tahini', 'default', 2285063, 'wrong: hummus mix with tahini'),
  ('drop_link', 'teriyaki sauce', 'default', 2565205, 'wrong: teriyaki seasoning MIX (dry)'),
  ('drop_link', 'tilapia', 'default', 2545894, 'wrong: breaded fillets'),
  ('drop_link', 'tortilla chips', 'default', 2471402, 'wrong: guacamole with Tostitos Rolls'),
  ('drop_link', 'whipped topping', 'default', 1930210, 'wrong: whipped dressing (mayonnaise-type)'),
  ('drop_link', 'whipped topping', 'default', 2668737, 'wrong: whipped cheesecake'),
  ('drop_link', 'whole grain mustard', 'default', 2568861, 'wrong: sweet honey mustard'),
  ('drop_link', 'chicken bouillon', 'default', 2103757, 'fixer: shrimp bouillon'),
  ('drop_link', 'chicken bouillon', 'default', 2055351, 'fixer: ham flavor bouillon'),
  ('drop_link', 'chicken bouillon', 'default', 2658084, 'fixer: beef flavor bouillon'),
  ('drop_link', 'chicken bouillon', 'default', 2272625, 'fixer: beef flavor bouillon'),
  ('drop_link', 'chicken bouillon', 'default', 2703459, 'fixer: flavor not stated'),
  ('drop_link', 'chicken bouillon', 'default', 1470206, 'fixer: flavor not stated'),
  ('drop_link', 'maple syrup', 'default', 2563134, 'fixer: ORIGINAL SYRUP is a pancake syrup, not maple'),
  ('drop_link', 'maple syrup', 'default', 2273347, 'fixer: ORIGINAL SYRUP is a pancake syrup, not maple'),
  ('drop_link', 'maple syrup', 'default', 1628085, 'fixer: ORIGINAL SYRUP is a pancake syrup, not maple'),
  ('drop_link', 'maple syrup', 'default', 2039980, 'fixer: TABLE SYRUP is not maple'),
  ('drop_link', 'maple syrup', 'default', 1628093, 'fixer: LITE SYRUP is not maple'),
  ('drop_link', 'dried cranberries', 'default', 362358, 'fixer: cheese with cranberries'),
  ('drop_link', 'cheddar cheese', 'default', 1620090, 'fixer: beef and cheddar franks'),
  ('drop_link', 'granulated sugar', 'default', 2170013, 'fixer: powdered sugar'),
  ('drop_link', 'kalamata olives', 'default', 2550776, 'fixer: olive spread'),
  ('drop_link', 'jerk seasoning', 'default', 1178660, 'fixer: hot pepper sauce'),
  ('drop_link', 'pickled ginger', 'default', 1923417, 'fixer: honey and ginger fruit juice'),
  ('drop_link', 'strawberry yogurt', 'default', 2109486, 'fixer: strawberry cheese tubes'),
  ('drop_link', 'sweet pickle relish', 'default', 1592845, 'fixer: dill relish is not sweet relish'),
  ('drop_link', 'sweet pickle relish', 'default', 1601925, 'fixer: dill relish is not sweet relish'),
  ('drop_link', 'sweet pickle relish', 'default', 2541457, 'fixer: dill relish is not sweet relish'),
  ('drop_link', 'sweet pickle relish', 'default', 2601817, 'fixer: dill relish is not sweet relish'),
  ('drop_link', 'sweet pickle relish', 'default', 2155383, 'fixer: dill relish is not sweet relish'),
  ('drop_link', 'ramen noodles', 'default', 623428, 'fixer: ramen wakame miso soup'),
  ('drop_link', 'soba noodles', 'default', 1774211, 'fixer: chilli miso ramen meal'),
  ('drop_link', 'pita bread', 'default', 2426842, 'fixer: toasted pita bits'),
  ('drop_link', 'phyllo dough', 'default', 1857691, 'fixer: baklava'),
  ('drop_link', 'whole wheat flour', 'default', 2404971, 'fixer: whole wheat pearl couscous'),
  ('drop_link', 'whole grain mustard', 'default', 2037615, 'fixer: honey dijon mustard'),
  ('drop_link', 'sichuan peppercorns', 'default', 1981171, 'fixer: stir fry sauce'),
  ('drop_link', 'greek yogurt', 'default', 1215240, 'fixer: chocolate topped dessert'),
  ('drop_link', 'chipotle in adobo', 'default', 1869021, 'fixer: chipotle sauce, no adobo'),
  ('drop_link', 'chipotle in adobo', 'default', 2592860, 'fixer: chipotle sauce, no adobo'),
  ('drop_link', 'longganisa', 'default', 458222, 'fixer: a vegan longanisa as the default'),
  ('drop_link', 'old bay seasoning', 'default', 2533994, 'fixer: energy label-rounded to 0 on a 0.6 g serving; the earlier mapping lane skipped this ingredient for the same reason'),
  ('drop_link', 'matcha', 'default', 1940857, 'fixer: matcha booster beverage mixer'),
  ('set_default', 'canned clams', 'default', 171976, 'SR canned clams, drained solids (the clams, 142 kcal/100 g)'),
  ('set_default', 'matcha', 'default', 2465824, 'plain matcha powder (label: 1/2 tsp = 1.5 g, 333 kcal/100 g)'),
  ('set_default', 'bresaola', 'default', 2305175, 'dry-cured bresaola, 179 kcal/100 g with protein 35.7 g (the old default read 250 vs 161 expected); added by add_foods.py'),
  ('set_default', 'chicken', 'default', 171052, 'raw is the usual recipe state; cooked roasted overstated raw-weight lines by about 40 percent'),
  ('set_default', 'chicken', 'cooked', 171054, 'prep notes saying cooked/shredded/roasted route to this form'),
  ('unmap', 'garlic scapes', '*', null, 'proxy: bulb garlic is 149 vs about 43 kcal/100 g for scapes; unmapped rather than overstate 3x'),
  ('unmap', 'fenugreek leaves', '*', null, 'proxy: spinach is 23 vs about 49 kcal/100 g for fresh methi'),
  ('unmap', 'suya spice', '*', null, 'proxy: curry powder is 325 vs about 500 kcal/100 g (ground peanut based)'),
  ('unmap', 'hilsa', '*', null, 'proxy: Atlantic herring is 158 vs about 270 kcal/100 g (hilsa is much fattier)'),
  ('unmap', 'guanciale', '*', null, 'proxy: bacon is 417 vs about 650 kcal/100 g (jowl is almost pure fat)'),
  ('unmap', 'everything bagel seasoning', '*', null, 'labels disagree 0 to 714 kcal (tiny servings round to 0); the earlier mapping lane skipped it'),
  ('unmap', 'old bay seasoning', '*', null, 'salt-based blend; branded labels round to 0; the earlier mapping lane skipped it'),
  ('unmap', 'lemon pepper', '*', null, 'labels round to 0 kcal per serving and salt varies; the earlier mapping lane skipped it'),
  ('unmap', 'dosa batter', '*', null, 'only a dry idli/dosa mix exists in the data, not batter'),
  ('unmap', 'dried tofu', '*', null, 'pressed/baked tofu: only seasoned baked cubes exist in the data'),
  ('unmap', 'hibiscus flowers', '*', null, 'only flowers in syrup exist in the data; dried calyces are not sweetened'),
  ('unmap', 'fonio', '*', null, 'the only plain fonio record has 20 kcal/100 g beside 82 g carbohydrate (about 356 expected) and a corrupt serving'),
  ('unmap', 'kaffir lime leaves', '*', null, 'the only link was fresh basil (23 kcal/100 g) as a stand-in; leaves are a different plant, so the line is a gap rather than a made-up number'),
  ('set_default', 'blue cheese dressing', 'default', 173562, 'wave 10c: the default was the LIGHT dressing (86 kcal/100 g); regular blue cheese dressing is 484'),
  ('set_default', 'pumpkin pie filling', 'default', 169273, 'wave 10c: pumpkin pie filling is "Pumpkin pie mix, canned" (104 kcal/100 g), not plain pumpkin (34)'),
  ('set_default', 'pork sausage', 'default', 172934, 'wave 10c: pork sausage is pork only (288 kcal/100 g raw); the default was pork AND BEEF, cooked'),
  ('set_default', 'pork sausage', 'cooked', 174578, 'wave 10c: pork sausage, link/patty, cooked, pan-fried'),
  ('unmap', 'doubanjiang', '*', null, 'wave 10c: fermented broad-bean chili paste has no USDA record; sriracha is a different sauce (93 kcal, far less sodium)'),
  ('unmap', 'dashi', '*', null, 'wave 10c: dashi (kombu and bonito stock) has no USDA record; vegetable broth is a different liquid. The dashi base powders are not the prepared stock.'),
  ('unmap', 'kombu', '*', null, 'wave 10c: kombu is sold dried; the only plain records are RAW kelp (43 kcal/100 g, dried is several times that)'),
  ('unmap', 'wakame', '*', null, 'wave 10c: wakame is sold dried; the only plain record is RAW wakame (45 kcal/100 g)'),
  ('set_default', 'sirloin steak', 'default', 168726, 'wave 10c: the default was a COOKED sirloin while every sibling cut is raw; raw top sirloin, 1/8 in fat, all grades'),
  ('set_default', 'black beans', 'default', 175188, 'owner decision 2026-10-17: black beans default is the canned full-panel SR record (Foundation record had 12 of 35 nutrients)'),
  ('set_default', 'black beans', 'canned', 175188, 'owner decision 2026-10-17: canned black beans were a branded record'),
  ('set_default', 'shredded cheese', 'default', 328637, 'owner decision 2026-10-17: a bare cheese is cheddar (the default was a branded "SHREDDED CHEESE" of unknown cheeses)'),
  ('set_default', 'veal stock', 'default', 172883, 'wave 10c proxy: the default was a DEMI-GLACE CONCENTRATE (500 kcal/100 g); home-prepared beef stock (13 kcal) stands in for veal stock'),
  ('drop_link', 'mirin', 'default', 2084844, 'wave 10c: the ml to g conversion of this record used density 1.0 while the five other mirin records use 1.2, so every value is 20 percent high'),
  ('set_default', 'mirin', 'default', 2039206, 'wave 10c: Kikkoman Aji-Mirin (194 kcal/100 g), consistent with the other mirin records'),
  ('unmap', 'plantain', '*', null, 'wave 10c: the only link was a fried plantain-chip product (500 kcal/100 g); green and ripe plantain are separate ingredients');
-- END LINK ACTIONS

-- unmap: the ingredient keeps existing (a user can still pick it), it just has no nutrition. Household weights go too:
-- a gram weight without a food would be meaningless, and "never guess" beats a wrong number.
delete from ingredient_portions p using _link_actions a, ingredients i
 where a.action = 'unmap' and i.canonical_name = a.ingredient and p.ingredient_id = i.id;
delete from ingredient_foods f using _link_actions a, ingredients i
 where a.action = 'unmap' and i.canonical_name = a.ingredient and f.ingredient_id = i.id and (a.form = '*' or f.form = a.form);

delete from ingredient_foods f using _link_actions a, ingredients i
 where a.action = 'drop_link' and i.canonical_name = a.ingredient and f.ingredient_id = i.id
   and f.form = a.form and f.fdc_id = a.fdc_id;

-- set_default: link it when missing, demote the current default, promote this one. Skipped when the food is not loaded.
insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)
select i.id, a.form, a.fdc_id, false
from _link_actions a join ingredients i on i.canonical_name = a.ingredient
where a.action = 'set_default' and exists (select 1 from usda_foods u where u.fdc_id = a.fdc_id)
on conflict (ingredient_id, form, fdc_id) do nothing;
update ingredient_foods f set is_default = false
from _link_actions a join ingredients i on i.canonical_name = a.ingredient
where a.action = 'set_default' and f.ingredient_id = i.id and f.form = a.form and f.fdc_id <> a.fdc_id and f.is_default
  and exists (select 1 from ingredient_foods g where g.ingredient_id = i.id and g.form = a.form and g.fdc_id = a.fdc_id);
update ingredient_foods f set is_default = true
from _link_actions a join ingredients i on i.canonical_name = a.ingredient
where a.action = 'set_default' and f.ingredient_id = i.id and f.form = a.form and f.fdc_id = a.fdc_id and not f.is_default;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Impossible or inconsistent nutrient values (FDC's own, loaded unchecked). Delete = "not reported".
--    ids: 1 kcal, 2 protein, 3 carbs, 4 fiber, 5 sugars, 6 added sugars, 7 fat, 8 sat, 9 trans, 10 mono, 11 poly,
--         12 cholesterol, 33 B12, 25 vitamin D mcg, 90 vitamin D IU
-- ---------------------------------------------------------------------------------------------------------------
-- Cholesterol above 3,500 mg/100 g (butter 214,286; anchovy paste 166,667) and B12 above 120 mcg/100 g (3 enriched pastas)
-- are unit mistakes in the source. Real maxima: egg yolk about 1,200 mg, beef liver about 83 mcg.
delete from usda_food_nutrients where nutrient_id = 12 and amount_per_100g > 3500;
delete from usda_food_nutrients where nutrient_id = 33 and amount_per_100g > 120;
-- A sub-nutrient cannot exceed its parent (5 percent + 0.5 g of label rounding allowed). The SUB row goes, never the parent.
delete from usda_food_nutrients s using usda_food_nutrients p
 where s.nutrient_id = 5 and p.fdc_id = s.fdc_id and p.nutrient_id = 3 and s.amount_per_100g > p.amount_per_100g * 1.05 + 0.5;
delete from usda_food_nutrients s using usda_food_nutrients p
 where s.nutrient_id = 4 and p.fdc_id = s.fdc_id and p.nutrient_id = 3 and s.amount_per_100g > p.amount_per_100g * 1.05 + 0.5;
delete from usda_food_nutrients s using usda_food_nutrients p
 where s.nutrient_id = 6 and p.fdc_id = s.fdc_id and p.nutrient_id = 3 and s.amount_per_100g > p.amount_per_100g * 1.05 + 0.5;
delete from usda_food_nutrients s using usda_food_nutrients p
 where s.nutrient_id = 6 and p.fdc_id = s.fdc_id and p.nutrient_id = 5 and s.amount_per_100g > p.amount_per_100g * 1.05 + 0.5;
delete from usda_food_nutrients s using usda_food_nutrients p
 where s.nutrient_id in (8, 9, 10, 11) and p.fdc_id = s.fdc_id and p.nutrient_id = 7 and s.amount_per_100g > p.amount_per_100g * 1.05 + 0.5;
-- SR margarine 171415: vitamin D 17.5 mcg beside 0 IU (FDC's own contradiction). Neither is trustworthy; leave both unreported.
delete from usda_food_nutrients where fdc_id = 171415 and nutrient_id in (25, 90);

-- Synthetic energy rows: the first lane copied Atwater GENERAL into energy_kcal for 7 Foundation foods that FDC reports
-- no energy for, although Atwater SPECIFIC exists and the schema's own fallback prefers it (nutrient_conversions priority 1).
-- Overstated energy up to 21 percent. Delete the stored row so the fallback applies.
delete from usda_food_nutrients
 where nutrient_id = 1
   and fdc_id in (2003603, 2003599, 1999626, 2003587, 2684440, 2710835, 2747660)
   and exists (select 1 from usda_food_nutrients a where a.fdc_id = usda_food_nutrients.fdc_id and a.nutrient_id in (91, 92));

-- Branded oils and fats: label rounding (14 g fat in a 13.6 g serving) gave up to 929 kcal/100 g. Nothing exceeds
-- 9 kcal per g of pure fat = 900. Cap at 900.
update usda_food_nutrients n set amount_per_100g = 900
 from usda_foods u
 where u.fdc_id = n.fdc_id and u.data_type = 'branded' and n.nutrient_id = 1 and n.amount_per_100g > 902;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Branded energy gate. Applies to BRANDED foods only (SR/Foundation deviations are FDC's own and explained:
--    alcohol, acetic acid, polyols and fibre-heavy foods lack their own nutrient in the 38 we track).
--    Reject a food whose stored energy disagrees with 4P + 4C + 9F by more than 25 percent AND 15 kcal AND the label
--    rounding allowance for its serving (675 / serving_g per 100 g), or that reports 0 kcal beside macros worth 40+ kcal.
--    Polyol sweeteners (energy legitimately below the estimate) and alcohol or vinegar foods (above it) are exempt by
--    ingredient name, because polyols and alcohol are not tracked.
-- ---------------------------------------------------------------------------------------------------------------
create temp table _energy on commit drop as
with m as (
  select u.fdc_id, u.serving_size s,
         max(case when n.nutrient_id = 1 then n.amount_per_100g end) k,
         max(case when n.nutrient_id = 2 then n.amount_per_100g end) p,
         max(case when n.nutrient_id = 3 then n.amount_per_100g end) c,
         max(case when n.nutrient_id = 7 then n.amount_per_100g end) f
  from usda_foods u join usda_food_nutrients n on n.fdc_id = u.fdc_id
  where u.data_type = 'branded'
  group by u.fdc_id, u.serving_size
)
select m.fdc_id, m.s, m.k, 4 * m.p + 4 * m.c + 9 * m.f as est,
       ( exists (
           select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id
           where f.fdc_id = m.fdc_id
             and i.canonical_name::text ~* '(sweetener|stevia|erythritol|monk ?fruit|xylitol|allulose|sugar substitute|wine|beer|sake|mirin|liqueur|\mrum\M|vodka|whisk|brandy|cognac|vermouth|sherry|bourbon|tequila|vanilla|extract|bitters|amaretto|marsala|vinegar)')
         -- the audit confirmed these three as legitimate zero-energy polyol sweeteners (erythritol, monk fruit, stevia)
         or m.fdc_id in (370129, 552224, 372176) ) as exempt
from m
where m.k is not null and m.p is not null and m.c is not null and m.f is not null;

-- Rejected outright: 0 kcal beside macros worth 40+ kcal, or a deviation over 25 percent and 15 kcal that the label-rounding
-- allowance (675 / serving_g per 100 g) cannot explain.
create temp table _bad_branded on commit drop as
select fdc_id, k, est from _energy
where not exempt
  and ( (k = 0 and est > 40)
     or (abs(k - est) > 0.25 * est and abs(k - est) > 15 and abs(k - est) > 675.0 / s) );

-- Stricter for DEFAULT foods, which feed every recipe that does not name a brand: over 25 percent AND over 30 kcal/100 g
-- (the audit's own "severe" size) with NO rounding allowance. A food that only passes because its tiny serving hides the
-- error may stay as a brand a person picks, but is never the default. Smaller gaps (cocktail onions 36 vs 14 kcal) stay:
-- an unmapped ingredient makes every recipe using it partial, which is worse than a 20 kcal/100 g rounding error.
create temp table _strict_fail on commit drop as
select fdc_id from _energy
where not exempt and abs(k - est) > 0.25 * est and abs(k - est) > 30;

delete from usda_foods u using _bad_branded b
 where u.fdc_id = b.fdc_id
   and not exists (select 1 from recipe_ingredients r where r.fdc_id = u.fdc_id);
delete from ingredient_foods f using _strict_fail x
 where f.fdc_id = x.fdc_id and f.is_default;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Duplicates. A type-ahead must not list the same product four times. For each (ingredient, form, description,
--    owner) keep the NEWEST fdc_id (latest publication date, then highest id) and drop the rest: two rows with the same
--    description and owner cannot be told apart in a list, and 50 of the 51 audited groups had identical macros anyway.
--    The keeper inherits is_default, so the one-default invariant holds.
-- ---------------------------------------------------------------------------------------------------------------
create temp table _dups on commit drop as
with b as (
  select f.ingredient_id, f.form, f.fdc_id, f.is_default, lower(u.description) d, lower(coalesce(u.brand_owner, '')) o,
         u.publication_date pd
  from ingredient_foods f join usda_foods u on u.fdc_id = f.fdc_id
  where u.data_type = 'branded'
), r as (
  select b.*, row_number() over (partition by ingredient_id, form, d, o order by pd desc nulls last, fdc_id desc) rn,
         first_value(fdc_id) over (partition by ingredient_id, form, d, o order by pd desc nulls last, fdc_id desc) keeper
  from b
)
select ingredient_id, form, fdc_id, keeper, is_default from r where rn > 1;

-- remember which keepers must inherit the default BEFORE the losers go (the unique one-default index is immediate)
create temp table _dup_default on commit drop as
  select distinct ingredient_id, form, keeper from _dups where is_default;
delete from ingredient_foods f using _dups d
 where f.ingredient_id = d.ingredient_id and f.form = d.form and f.fdc_id = d.fdc_id;
update ingredient_foods f set is_default = true
 from _dup_default d
 where f.ingredient_id = d.ingredient_id and f.form = d.form and f.fdc_id = d.keeper
   and not exists (select 1 from ingredient_foods g where g.ingredient_id = d.ingredient_id and g.form = d.form and g.is_default);

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Repair defaults: every (ingredient, form) that still has foods but lost its default gets one.
--    Preference: a generic USDA food, then a branded one with a usable serving (2.5 g or more), then the one whose
--    energy is closest to the median of what remains (the typical product, never an outlier), then the lowest id.
-- ---------------------------------------------------------------------------------------------------------------
with grp as (
  select ingredient_id, form from ingredient_foods group by ingredient_id, form having not bool_or(is_default)
), med as (
  select g.ingredient_id, g.form,
         percentile_cont(0.5) within group (order by coalesce(k.amount_per_100g, 0)) m
  from grp g join ingredient_foods f on f.ingredient_id = g.ingredient_id and f.form = g.form
  left join usda_food_nutrients k on k.fdc_id = f.fdc_id and k.nutrient_id = 1
  group by g.ingredient_id, g.form
), ranked as (
  select f.ingredient_id, f.form, f.fdc_id,
         row_number() over (partition by f.ingredient_id, f.form
                            order by (u.data_type = 'branded'), (coalesce(u.serving_size, 0) < 2.5),
                                     abs(coalesce(k.amount_per_100g, 0) - md.m), f.fdc_id) rn
  from ingredient_foods f
  join grp g on g.ingredient_id = f.ingredient_id and g.form = f.form
  join med md on md.ingredient_id = f.ingredient_id and md.form = f.form
  join usda_foods u on u.fdc_id = f.fdc_id
  left join usda_food_nutrients k on k.fdc_id = f.fdc_id and k.nutrient_id = 1
  where f.fdc_id not in (select fdc_id from _strict_fail)
)
update ingredient_foods f set is_default = true
 from ranked r
 where r.rn = 1 and f.ingredient_id = r.ingredient_id and f.form = r.form and f.fdc_id = r.fdc_id;
-- A form whose only remaining foods are strict failures has no acceptable default: leave it unmapped.
delete from ingredient_foods f
 where not exists (select 1 from ingredient_foods d where d.ingredient_id = f.ingredient_id and d.form = f.form and d.is_default);

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Household weights that were wrong (source rows kept; only the value or the row changes)
-- ---------------------------------------------------------------------------------------------------------------
-- carrot, canned form, cup: 187 g matched no USDA portion of SR 170396 (146 g sliced, 228 g mashed). Use sliced.
update ingredient_portions p set grams_per_unit = 146, source = 'usda', note = 'USDA household weight: cup, sliced (SR 170396 drained solids)'
 from ingredients i, units u
 where i.id = p.ingredient_id and u.id = p.unit_id and i.canonical_name = 'carrot' and p.form = 'canned' and u.name = 'cup' and p.grams_per_unit = 187;
-- canned clams cup 240 g described the clam LIQUID. SR 171976 drained solids: 1 cup = 160 g.
update ingredient_portions p set grams_per_unit = 160, source = 'usda', note = 'USDA household weight: cup (SR 171976 canned clams, drained solids)'
 from ingredients i, units u
 where i.id = p.ingredient_id and u.id = p.unit_id and i.canonical_name = 'canned clams' and p.form = 'default' and u.name = 'cup' and p.grams_per_unit = 240;
-- fonio cup 11.25 g: FDC's household text '4 cup' is a typo for 1/4 cup (45 g serving), so 1 cup = 4 x 45 = 180 g.
update ingredient_portions p set grams_per_unit = 180, note = 'label: 45 g serving = 1/4 cup (FDC text says "4 cup", a typo)'
 from ingredients i, units u
 where i.id = p.ingredient_id and u.id = p.unit_id and i.canonical_name = 'fonio' and u.name = 'cup' and p.grams_per_unit = 11.25;
-- matcha tbsp 21 g came from a latte-mix link. Label of a plain matcha: 1 tsp = 2 g (ITO EN, fdc 2509923), so 1 tbsp = 6 g.
update ingredient_portions p set grams_per_unit = 6, source = 'label', note = 'label: 1 tsp = 2 g (ITO EN plain matcha, fdc 2509923) x 3'
 from ingredients i, units u
 where i.id = p.ingredient_id and u.id = p.unit_id and i.canonical_name = 'matcha' and u.name = 'tbsp' and p.grams_per_unit = 21;
-- moose patty: 85 g is the COOKED weight of a patty made from 4 oz raw, but the linked record is RAW deer. 4 oz = 113.4 g.
update ingredient_portions p set grams_per_unit = 113.4, note = 'USDA household weight: patty made from 4 oz raw (raw weight, matching the raw record)'
 from ingredients i
 where i.id = p.ingredient_id and i.canonical_name = 'moose' and p.unit_id is null and p.grams_per_unit = 85;
-- Removed: label weights that are not what the unit name says.
--   kimchi base tsp 20 g (4.06 g/ml; the label meant a serving), oolong tea cup 5 g and mulling spices cup 8 g (per-serving weights).
delete from ingredient_portions p using ingredients i, units u
 where i.id = p.ingredient_id and u.id = p.unit_id
   and ((i.canonical_name = 'kimchi base' and u.name = 'tsp' and p.grams_per_unit = 20)
     or (i.canonical_name = 'oolong tea' and u.name = 'cup' and p.grams_per_unit = 5)
     or (i.canonical_name = 'mulling spices' and u.name = 'cup' and p.grams_per_unit = 8));

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Vocabulary (CLAUDE.md rules: no simple-plural aliases, canonical = what a cook types, an alias must be the same thing)
-- ---------------------------------------------------------------------------------------------------------------
-- singularize_ingredient_name() already folds simple plurals, so these aliases only add noise.
delete from ingredient_aliases a using ingredients i
 where i.id = a.ingredient_id
   and (i.canonical_name, a.alias::text) in (('quail egg', 'quail eggs'), ('chicken liver', 'chicken livers'), ('lamb shank', 'lamb shanks'),
        ('vanilla bean', 'vanilla beans'), ('guasca', 'guascas'), ('croissant', 'croissants'), ('egg', 'eggs'),
        ('mandarin orange', 'mandarin oranges'));
-- Wrong aliases: a different food hiding behind a canonical name (fresh vs dried longan differ about 4x in energy, a
-- ginger-garlic paste is not garlic paste, a substitute is not the thing, savory varieties differ) ...
delete from ingredient_aliases a using ingredients i
 where i.id = a.ingredient_id
   and (i.canonical_name, a.alias::text) in (('garlic paste', 'ginger garlic paste'), ('kaymak', 'mascarpone substitute'),
        ('longan', 'dried longan'), ('khoya', 'dried whole milk'), ('digestive biscuits', 'graham cracker substitute'),
        ('lassi', 'mango lassi'), ('reduced fat milk', '1% milk'), ('winter savory', 'summer savory'), ('paratha', 'aloo paratha'));

-- Singular and plural canonicals for the same thing: keep the singular (the resolver singularises what a cook types).
do $$
declare
  pair text[];
  v_keep integer;
  v_drop integer;
begin
  foreach pair slice 1 in array array[array['razor clam', 'razor clams'], array['jerusalem artichoke', 'jerusalem artichokes']] loop
    select id into v_keep from ingredients where canonical_name = pair[1];
    select id into v_drop from ingredients where canonical_name = pair[2];
    if v_keep is not null and v_drop is not null then
      -- move the plural's aliases, then the plural itself (foods, portions, allergens cascade away)
      update ingredient_aliases set ingredient_id = v_keep
       where ingredient_id = v_drop and not exists (select 1 from ingredient_aliases k where k.ingredient_id = v_keep and k.alias = ingredient_aliases.alias);
      update recipe_ingredients set ingredient_id = v_keep where ingredient_id = v_drop;
      update shopping_list_items set ingredient_id = v_keep where ingredient_id = v_drop;
      update fridge_items set ingredient_id = v_keep where ingredient_id = v_drop;
      delete from ingredients where id = v_drop;
    end if;
  end loop;
end $$;

-- 'drumsticks' (moringa pods) collides with how a cook types chicken drumsticks. Canonical becomes 'moringa pods'.
do $$
declare
  v_id integer;
begin
  select id into v_id from ingredients where canonical_name = 'drumsticks' and aisle_category = 'Produce';
  if v_id is not null and not exists (select 1 from ingredients where canonical_name = 'moringa pods') then
    delete from ingredient_aliases where ingredient_id = v_id and alias in ('moringa pods', 'drumsticks');
    update ingredients set canonical_name = 'moringa pods', slug = 'moringa-pods' where id = v_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Orphans: branded foods that nothing links to any more are dead weight (type-ahead only reaches foods through
--    ingredient_foods). Nothing user-owned references them at this point, so remove them.
-- ---------------------------------------------------------------------------------------------------------------
delete from usda_foods u
 where u.data_type = 'branded'
   and not exists (select 1 from ingredient_foods f where f.fdc_id = u.fdc_id)
   and not exists (select 1 from recipe_ingredients r where r.fdc_id = u.fdc_id)
   and not exists (select 1 from ingredients i where i.fdc_id = u.fdc_id);

commit;
