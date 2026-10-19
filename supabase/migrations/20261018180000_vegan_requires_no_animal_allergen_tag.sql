-- Wave 10c fixer: a "vegan" tag may not sit beside a "may contain dairy / egg / fish / shellfish" note.
--
-- recipe_diet_rows() (20261018120000) called a recipe vegan when every ingredient's diet_class was plant. But a plant
-- class does not mean the common product is animal-free: margarine and chocolate chips are tagged "dairy: varies"
-- (milkfat, whey), a veggie burger "egg: varies", barbecue sauce "fish: varies" (Worcestershire). Ten catalog recipes
-- carried the vegan tag AND a may-contain-dairy note. A positive vegan claim must not contradict a tag that says some
-- brands carry an animal product, so vegan now also requires that NO ingredient carries a dairy, egg, fish, shellfish
-- or mollusks allergen tag of any basis. Vegetarian and pescatarian still follow the diet class.
--
-- Only the vegan branch changes. Non-superuser safe (no SET of extension parameters). Takes effect when the diets are
-- next refreshed; seed-allergen-tags.sql ends with refresh_all_recipe_diets().

create or replace function public.recipe_diet_rows(p_recipe uuid default null)
returns table (recipe_id uuid, diet_id integer)
language sql
stable
set search_path = public, pg_temp
as $$
  with facts as (
    select r.id as recipe_id,
           count(ri.id)                                           as n,
           count(*) filter (where i.diet_class is null)           as unreviewed,
           coalesce(bool_or(i.diet_class = 'meat'), false)        as has_meat,
           coalesce(bool_or(i.diet_class = 'seafood'), false)     as has_seafood,
           coalesce(bool_or(i.diet_class in ('honey', 'dairy_egg')), false) as has_animal_product,
           coalesce(bool_or(exists (
             select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id
             where  ia.ingredient_id = ri.ingredient_id
               and  a.slug in ('dairy', 'egg', 'fish', 'shellfish', 'mollusks'))), false) as has_animal_tag,
           coalesce(bool_or(exists (
             select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id
             where  ia.ingredient_id = ri.ingredient_id and a.slug = 'gluten')), false) as has_gluten
    from   recipes r
    join   recipe_ingredients ri on ri.recipe_id = r.id
    join   ingredients i on i.id = ri.ingredient_id
    where  r.author_id is null and (p_recipe is null or r.id = p_recipe)
    group  by r.id
  )
  select f.recipe_id, d.id
  from   facts f
  join   diets d on d.slug = case
           when f.unreviewed > 0 then null
           when not f.has_meat and not f.has_seafood and not f.has_animal_product and not f.has_animal_tag then 'vegan'
           when not f.has_meat and not f.has_seafood then 'vegetarian'
           when not f.has_meat then 'pescatarian'
         end
  union all
  select f.recipe_id, d.id
  from   facts f
  join   diets d on d.slug = 'gluten-free'
  where  f.unreviewed = 0 and not f.has_gluten;
$$;
