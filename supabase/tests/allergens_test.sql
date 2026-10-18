-- Wave 10c: allergen split, optional-only allergens, ingredient tags and derived diets
-- (migration 20261018120000 + supabase/seed-allergen-tags.sql).
--
-- RUNS ON: a throwaway database only, AFTER the migration and the seed. It creates a recipe and rolls back.
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f supabase/tests/allergens_test.sql
-- Any failed assertion raises and aborts the run; success prints "ALL PASSED".

begin;

create function t_has(p_ing text, p_slug text) returns boolean language sql as $$
  select exists (select 1 from ingredient_allergens ia
                 join ingredients i on i.id = ia.ingredient_id
                 join allergens a on a.id = ia.allergen_id
                 where i.canonical_name = p_ing and a.slug = p_slug)
$$;

create function t_check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
end $$;

-- 1. Vocabulary ------------------------------------------------------------------------------------------------------
select t_check((select count(*) from allergens) = 11, 'eleven allergens');
select t_check(not exists (select 1 from allergens where slug = 'nuts'), 'legacy nuts slug is gone');
select t_check((select array_agg(slug order by slug) from allergens) =
  array['dairy','egg','fish','gluten','mollusks','peanuts','sesame','shellfish','soy','tree-nuts','wheat'], 'slug set');

-- 2. Every ingredient reviewed, every tag explained -------------------------------------------------------------------
select t_check(not exists (select 1 from ingredients where diet_class is null), 'every ingredient has a diet_class');
select t_check(not exists (select 1 from ingredient_allergens where reason is null or reason = ''), 'every tag has a reason');
select t_check(not exists (select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id
                           where a.slug = 'wheat' and not exists (
                             select 1 from ingredient_allergens g join allergens ga on ga.id = g.allergen_id
                             where g.ingredient_id = ia.ingredient_id and ga.slug = 'gluten')), 'wheat implies gluten');

-- 3. Ingredient facts that were easy to get wrong ---------------------------------------------------------------------
select t_check(t_has('peanut butter','peanuts') and not t_has('peanut butter','tree-nuts'), 'peanut butter is peanuts only');
select t_check(t_has('peanut oil','peanuts'), 'peanut oil is peanuts (owner decision)');
select t_check(t_has('satay sauce','peanuts'), 'satay sauce is peanuts');
select t_check(t_has('almond milk','tree-nuts') and not t_has('almond milk','peanuts'), 'almond milk is tree nuts only');
select t_check(t_has('pesto','tree-nuts') and t_has('pesto','dairy'), 'pesto is tree nuts and dairy');
select t_check(not exists (select 1 from ingredient_allergens ia join ingredients i on i.id = ia.ingredient_id
                           where i.canonical_name in ('coconut milk','coconut cream','shredded coconut','coconut oil','coconut flour','fresh coconut','coconut aminos','water chestnuts','ground nutmeg','butternut squash')),
               'coconut, nutmeg, water chestnut and butternut squash carry no allergen');
select t_check(t_has('worcestershire sauce','fish'), 'worcestershire is fish');
select t_check(t_has('shrimp','shellfish') and not t_has('shrimp','mollusks'), 'shrimp is a crustacean');
select t_check(t_has('oysters','mollusks') and not t_has('oysters','shellfish'), 'oysters are mollusks');
select t_check(t_has('oyster sauce','mollusks'), 'oyster sauce is mollusks');
select t_check(t_has('tahini','sesame') and t_has('toasted sesame oil','sesame'), 'tahini and sesame oil are sesame');
select t_check(t_has('soy sauce','soy') and t_has('soy sauce','wheat') and t_has('soy sauce','gluten'), 'soy sauce is soy and wheat');
select t_check(t_has('tamari','soy'), 'tamari is soy');
select t_check(t_has('barley','gluten') and not t_has('barley','wheat'), 'barley is gluten, not wheat');
select t_check(t_has('all-purpose flour','wheat') and t_has('all-purpose flour','gluten'), 'flour is wheat and gluten');
select t_check(t_has('mayonnaise','egg'), 'mayonnaise is egg');
select t_check(t_has('ghee','dairy'), 'ghee is dairy');
select t_check(t_has('hoisin sauce','soy'), 'hoisin is soy');
select t_check((select diet_class from ingredients where canonical_name = 'chicken broth') = 'meat', 'chicken broth is meat');
select t_check((select diet_class from ingredients where canonical_name = 'gelatin') = 'meat', 'gelatin is meat');
select t_check((select diet_class from ingredients where canonical_name = 'honey') = 'honey', 'honey is honey');
select t_check((select diet_class from ingredients where canonical_name = 'tempeh') = 'plant', 'tempeh is plant');
select t_check((select diet_class from ingredients where canonical_name = 'shrimp') = 'seafood', 'shrimp is seafood');
select t_check((select diet_class from ingredients where canonical_name = 'egg') = 'dairy_egg', 'egg is dairy_egg');
select t_check((select diet_class from ingredients where canonical_name = 'fish sauce') = 'seafood', 'fish sauce is seafood');

-- 4. line_is_optional ---------------------------------------------------------------------------------------------------
select t_check(line_is_optional(true, null), 'flag wins');
select t_check(line_is_optional(false, 'chopped, optional'), 'note says optional');
select t_check(line_is_optional(false, 'for garnish'), 'garnish is optional');
select t_check(not line_is_optional(false, 'toasted if desired'), '"toasted if desired" does not make the nut optional');
select t_check(not line_is_optional(false, null), 'no note, no flag: required');

-- 5. Recipe derivation: required vs optional allergens -----------------------------------------------------------------
insert into recipes (slug, title, servings) values ('t-allergen-recipe', 'T allergen recipe', 2);
create temp table _r on commit drop as select id from recipes where slug = 't-allergen-recipe';
create function t_line(ing text, optional boolean, note text default null) returns void language sql as $$
  insert into recipe_ingredients (recipe_id, ingredient_id, quantity, is_optional, prep_note, sort_order)
  select (select id from _r), i.id, 1, optional, note,
         coalesce((select max(sort_order) + 1 from recipe_ingredients where recipe_id = (select id from _r)), 1)
  from ingredients i where i.canonical_name = ing
$$;
create function t_rid() returns uuid language sql as $$ select id from _r $$;
create function t_req(p_slug text) returns boolean language sql as $$
  select exists (select 1 from recipe_allergens ra join allergens a on a.id = ra.allergen_id where ra.recipe_id = t_rid() and a.slug = p_slug) $$;
create function t_opt(p_slug text) returns boolean language sql as $$
  select exists (select 1 from recipe_optional_allergens ra join allergens a on a.id = ra.allergen_id where ra.recipe_id = t_rid() and a.slug = p_slug) $$;
create function t_listed(excl text[]) returns boolean language sql as $$
  select exists (select 1 from filtered_recipes(null, null, null, excl) r where r.id = t_rid()) $$;
create function t_diet(p_slug text) returns boolean language sql as $$
  select exists (select 1 from recipe_diets rd join diets d on d.id = rd.diet_id where rd.recipe_id = t_rid() and d.slug = p_slug) $$;

select t_line('peanuts', true, 'chopped, optional garnish');
select t_line('walnuts', false);
select t_line('olive oil', false);
select t_check(not t_req('peanuts') and t_opt('peanuts'), 'optional-only peanuts go to recipe_optional_allergens');
select t_check(t_req('tree-nuts') and not t_opt('tree-nuts'), 'required walnuts go to recipe_allergens');
select t_check(t_listed(array['peanuts']), 'a peanut-free filter KEEPS a recipe whose peanuts are optional');
select t_check(not t_listed(array['tree-nuts']), 'a tree-nut-free filter drops a recipe with required walnuts');
select t_check(not t_listed(array['peanuts','tree-nuts']), 'excluding both drops it (walnuts)');

select t_line('peanut butter', false);
select t_check(t_req('peanuts') and not t_opt('peanuts'), 'a required peanut line beats the optional one');
select t_check(not t_listed(array['peanuts']), 'now the peanut-free filter drops it');

-- 6. Diet derivation ----------------------------------------------------------------------------------------------------
delete from recipe_ingredients where recipe_id = t_rid();
select t_line('yellow onion', false); select t_line('lentils', false); select t_line('olive oil', false);
select t_check(t_diet('vegan') and t_diet('gluten-free') and not t_diet('vegetarian'), 'plant recipe is vegan and gluten-free (only the strictest of the three is stored)');
select t_line('egg', false);
select t_check(t_diet('vegetarian') and not t_diet('vegan'), 'adding egg makes it vegetarian');
select t_line('honey', true, 'optional');
select t_check(t_diet('vegetarian'), 'honey keeps it vegetarian');
select t_line('shrimp', false);
select t_check(t_diet('pescatarian') and not t_diet('vegetarian') and not t_diet('vegan'), 'adding shrimp makes it pescatarian');
select t_line('chicken breast', false);
select t_check(not t_diet('pescatarian') and not t_diet('vegetarian') and not t_diet('vegan'), 'chicken removes all three');
select t_check(t_diet('gluten-free'), 'chicken does not affect gluten-free');
select t_line('spaghetti', false);
select t_check(not t_diet('gluten-free'), 'wheat removes gluten-free');
select t_line('rolled oats', true, 'optional');
-- an OPTIONAL gluten line still counts for the diet label (it describes the recipe as written)
delete from recipe_ingredients where recipe_id = t_rid() and ingredient_id = (select id from ingredients where canonical_name = 'spaghetti');
select t_check(not t_diet('gluten-free'), 'oats (gluten varies) keep gluten-free off, optional or not');

-- exception table
insert into recipe_diet_exceptions (recipe_id, diet_id, action, reason)
  select t_rid(), id, 'add', 'test' from diets where slug = 'gluten-free';
select refresh_recipe_diets(t_rid());
select t_check(t_diet('gluten-free'), 'a reviewed exception adds a diet');
delete from recipe_diet_exceptions where recipe_id = t_rid();

-- changing an ingredient's class re-derives diets through the trigger
delete from recipe_ingredients where recipe_id = t_rid();
select t_line('yellow onion', false); select t_line('lentils', false);
select t_check(t_diet('vegan'), 'baseline vegan');
update ingredients set diet_class = 'meat' where canonical_name = 'lentils';
select t_check(not t_diet('vegan') and not t_diet('vegetarian'), 'trigger: lentils reclassified as meat');
update ingredients set diet_class = 'plant' where canonical_name = 'lentils';
select t_check(t_diet('vegan'), 'trigger: and back');

-- an unreviewed ingredient means no tag at all (a gap shown honestly)
update ingredients set diet_class = null where canonical_name = 'lentils';
select t_check(not t_diet('vegan') and not t_diet('gluten-free'), 'unreviewed ingredient: no vegan or gluten-free claim');
update ingredients set diet_class = 'plant' where canonical_name = 'lentils';

-- 7. Catalog-wide sanity ------------------------------------------------------------------------------------------------
select t_check(not exists (
  select 1 from recipe_diets rd join diets d on d.id = rd.diet_id and d.slug = 'vegan'
  join recipe_ingredients ri on ri.recipe_id = rd.recipe_id join ingredients i on i.id = ri.ingredient_id
  where i.diet_class <> 'plant' and not exists (select 1 from recipe_diet_exceptions e where e.recipe_id = rd.recipe_id and e.action = 'add')), 'no vegan recipe has a non-plant ingredient');
select t_check(not exists (
  select 1 from recipe_diets rd join diets d on d.id = rd.diet_id and d.slug in ('vegan','vegetarian')
  join recipe_ingredients ri on ri.recipe_id = rd.recipe_id join ingredients i on i.id = ri.ingredient_id
  where i.diet_class in ('meat','seafood') and not exists (select 1 from recipe_diet_exceptions e where e.recipe_id = rd.recipe_id and e.action = 'add')), 'no vegan/vegetarian recipe has meat or seafood');
select t_check(not exists (
  select 1 from recipe_diets rd join diets d on d.id = rd.diet_id and d.slug = 'gluten-free'
  join recipe_ingredients ri on ri.recipe_id = rd.recipe_id join ingredient_allergens ia on ia.ingredient_id = ri.ingredient_id
  join allergens a on a.id = ia.allergen_id and a.slug = 'gluten'), 'no gluten-free recipe has a gluten ingredient');
select t_check(not exists (
  select 1 from recipe_allergens ra join recipe_optional_allergens o using (recipe_id, allergen_id)), 'an allergen is never both required and optional');
select t_check(not exists (
  select 1 from recipe_ingredients ri join ingredient_allergens ia on ia.ingredient_id = ri.ingredient_id
  where not line_is_optional(ri.is_optional, ri.prep_note)
    and not exists (select 1 from recipe_allergens ra where ra.recipe_id = ri.recipe_id and ra.allergen_id = ia.allergen_id)),
  'every required allergen line is in recipe_allergens');

-- 8. Clients cannot write the new tables ---------------------------------------------------------------------------------
select t_check(not has_table_privilege('anon', 'recipe_optional_allergens', 'insert'), 'anon cannot write recipe_optional_allergens');
select t_check(not has_table_privilege('authenticated', 'recipe_optional_allergens', 'insert'), 'authenticated cannot write recipe_optional_allergens');
select t_check(not has_table_privilege('authenticated', 'recipe_diet_exceptions', 'select'), 'authenticated cannot read recipe_diet_exceptions');
select t_check((select relrowsecurity from pg_class where relname = 'recipe_optional_allergens'), 'RLS on recipe_optional_allergens');
select t_check((select relrowsecurity from pg_class where relname = 'recipe_diet_exceptions'), 'RLS on recipe_diet_exceptions');

select 'ALL PASSED' as result;
rollback;
