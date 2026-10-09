-- Minced -- ingredient -> allergen map (wave 1, content lane)
--
-- Until this file, ingredient_allergens held 12 rows (the six mockup recipes'
-- worth), so 872 imported recipes carried almost no allergen data and any
-- "gluten-free" or "dairy-free" filter built on them would have been wrong in
-- the dangerous direction: silently permissive. The triggers on
-- ingredient_allergens fan every row below out to recipe_allergens for every
-- recipe that uses the ingredient, so this one file corrects the whole catalog.
--
-- IDEMPOTENT: inserts with on conflict do nothing. Safe to re-run; it only adds.
--
-- ONE RULE, STATED PLAINLY: this map is CONSERVATIVE. If an ingredient commonly
-- contains an allergen, it is marked, because a false "contains" costs a user a
-- recipe and a false "safe" costs a user a trip to the hospital. Examples:
-- oyster sauce is marked Gluten (most brands use wheat), curry pastes are marked
-- Shellfish (shrimp paste is standard), Worcestershire is marked Fish (anchovy).
--
-- Allergens are the eight in the `allergens` table. Two honest gaps:
--   * There is no separate Peanuts row, so peanuts live under Nuts with the tree
--     nuts. Peanuts are legumes and tree-nut-allergic people often tolerate
--     them; splitting the allergen is a decision for the allergen-filter
--     milestone (M3.4), not for a data file.
--   * Gluten is marked for wheat, barley and rye products only. Oats are not
--     marked, though cross-contact is common.
--
-- Runs after seed-ingredients.sql (it names rows that file creates) and before
-- seed-original-recipes.sql (which refuses to run without it).

begin;

create temp table _a (ingredient citext, allergen text) on commit drop;

insert into _a (ingredient, allergen) values
  -- Gluten: wheat, barley, rye
  ('all-purpose flour','Gluten'), ('bread flour','Gluten'), ('whole wheat flour','Gluten'),
  ('baking mix','Gluten'), ('biscuit mix','Gluten'), ('pancake mix','Gluten'), ('cake mix','Gluten'),
  ('cornbread mix','Gluten'), ('bran cereal','Gluten'), ('raisin bran','Gluten'), ('corn flakes','Gluten'),
  ('graham crackers','Gluten'), ('saltine crackers','Gluten'), ('pretzels','Gluten'),
  ('breadcrumbs','Gluten'), ('panko breadcrumbs','Gluten'), ('seasoned breadcrumbs','Gluten'),
  ('croutons','Gluten'), ('pasta','Gluten'), ('spaghetti','Gluten'), ('angel hair','Gluten'),
  ('fettuccine','Gluten'), ('fusilli','Gluten'), ('lasagna noodles','Gluten'), ('linguine','Gluten'),
  ('macaroni','Gluten'), ('orzo','Gluten'), ('penne','Gluten'), ('rigatoni','Gluten'),
  ('egg noodles','Gluten'), ('ramen noodles','Gluten'), ('udon noodles','Gluten'), ('soba noodles','Gluten'),
  ('couscous','Gluten'), ('bulgur','Gluten'), ('farro','Gluten'), ('barley','Gluten'), ('seitan','Gluten'),
  ('bagel','Gluten'), ('baguette','Gluten'), ('bread dough','Gluten'), ('crescent rolls','Gluten'),
  ('dinner rolls','Gluten'), ('english muffin','Gluten'), ('flour tortillas','Gluten'),
  ('hamburger buns','Gluten'), ('hot dog buns','Gluten'), ('italian bread','Gluten'), ('naan','Gluten'),
  ('phyllo dough','Gluten'), ('pie crust','Gluten'), ('pita bread','Gluten'), ('pizza dough','Gluten'),
  ('puff pastry','Gluten'), ('sandwich bread','Gluten'), ('sourdough bread','Gluten'),
  ('wonton wrappers','Gluten'), ('spring roll wrappers','Gluten'), ('matzo meal','Gluten'),
  ('soy sauce','Gluten'), ('hoisin sauce','Gluten'), ('oyster sauce','Gluten'), ('gochujang','Gluten'),
  ('cream of chicken soup','Gluten'), ('cream of mushroom soup','Gluten'),
  ('yakisoba noodles','Gluten'), ('chinese wheat noodles','Gluten'), ('japanese curry roux','Gluten'),
  ('okonomiyaki sauce','Gluten'), ('black vinegar','Gluten'), ('shaoxing wine','Gluten'),
  ('doubanjiang','Gluten'), ('fish cakes','Gluten'), ('imitation crab','Gluten'),
  -- Egg
  ('egg','Egg'), ('egg whites','Egg'), ('egg substitute','Egg'), ('mayonnaise','Egg'), ('egg noodles','Egg'),
  -- Fish
  ('salmon','Fish'), ('canned tuna','Fish'), ('catfish','Fish'), ('cod','Fish'), ('halibut','Fish'),
  ('pollock','Fish'), ('sardines','Fish'), ('snapper','Fish'), ('tilapia','Fish'), ('trout','Fish'),
  ('tuna steak','Fish'), ('walleye','Fish'), ('smoked salmon','Fish'), ('anchovies','Fish'),
  ('fish sauce','Fish'), ('imitation crab','Fish'), ('bonito flakes','Fish'), ('dashi','Fish'),
  ('worcestershire sauce','Fish'), ('kimchi','Fish'), ('fish cakes','Fish'), ('furikake','Fish'),
  -- Shellfish (crustaceans and molluscs, conservatively)
  ('shrimp','Shellfish'), ('crab','Shellfish'), ('lobster','Shellfish'), ('clams','Shellfish'),
  ('mussels','Shellfish'), ('scallops','Shellfish'), ('squid','Shellfish'), ('dried shrimp','Shellfish'),
  ('oyster sauce','Shellfish'), ('nam prik pao','Shellfish'), ('green curry paste','Shellfish'),
  ('red curry paste','Shellfish'), ('massaman curry paste','Shellfish'),
  -- Soy
  ('soy sauce','Soy'), ('tamari','Soy'), ('gochujang','Soy'), ('white miso','Soy'), ('firm tofu','Soy'),
  ('silken tofu','Soy'), ('tempeh','Soy'), ('edamame','Soy'), ('soy milk','Soy'), ('hoisin sauce','Soy'),
  ('oyster sauce','Soy'), ('okonomiyaki sauce','Soy'), ('doubanjiang','Soy'),
  ('fermented black beans','Soy'), ('soybean sprouts','Soy'),
  -- Nuts: tree nuts, plus peanuts (see the header on why they share a row)
  ('almonds','Nuts'), ('almond butter','Nuts'), ('almond milk','Nuts'), ('cashews','Nuts'),
  ('hazelnuts','Nuts'), ('pecans','Nuts'), ('pine nuts','Nuts'), ('pistachios','Nuts'), ('walnuts','Nuts'),
  ('peanuts','Nuts'), ('peanut butter','Nuts'), ('peanut butter chips','Nuts'), ('peanut oil','Nuts'),
  ('pesto','Nuts'),
  -- Sesame
  ('sesame seeds','Sesame'), ('toasted sesame oil','Sesame'), ('tahini','Sesame'), ('furikake','Sesame'),
  ('chinese sesame paste','Sesame'), ('everything bagel seasoning','Sesame'), ('za''atar','Sesame'),
  -- Dairy: the non-aisle items. The Dairy aisle itself is added below.
  ('evaporated milk','Dairy'), ('evaporated skim milk','Dairy'), ('sweetened condensed milk','Dairy'),
  ('dry milk powder','Dairy'), ('cream of chicken soup','Dairy'), ('cream of mushroom soup','Dairy'),
  ('naan','Dairy'), ('pesto','Dairy');

-- The whole Dairy aisle, except the plant milks and whipped topping. Deriving it
-- from aisle_category means a dairy ingredient added to the vocabulary later is
-- covered by re-running this file instead of by someone remembering.
insert into _a (ingredient, allergen)
select canonical_name, 'Dairy'
from ingredients
where aisle_category = 'Dairy'
  and canonical_name not in ('almond milk','oat milk','soy milk','whipped topping','margarine');

do $guard$
declare
  bad text;
begin
  -- A typo here would silently mark nothing. That is exactly the failure this
  -- file exists to prevent, so check every name resolves to a real row.
  select string_agg(distinct a.ingredient::text, ', ') into bad
  from _a a left join ingredients i on i.canonical_name = a.ingredient
  where i.id is null;
  if bad is not null then
    raise exception 'allergen map names unknown ingredients: %', bad;
  end if;

  select string_agg(distinct a.allergen, ', ') into bad
  from _a a left join allergens al on al.name = a.allergen
  where al.id is null;
  if bad is not null then
    raise exception 'allergen map names unknown allergens: %', bad;
  end if;
end
$guard$;

insert into ingredient_allergens (ingredient_id, allergen_id)
select distinct i.id, al.id
from _a a
join ingredients i  on i.canonical_name = a.ingredient
join allergens   al on al.name = a.allergen
on conflict do nothing;

select al.name as allergen, count(*) as ingredients
from ingredient_allergens ia join allergens al on al.id = ia.allergen_id
group by al.name order by al.name;

commit;
