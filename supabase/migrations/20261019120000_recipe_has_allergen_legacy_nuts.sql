-- Wave 10c fixer: the legacy 'nuts' slug (split into peanuts + tree-nuts by 20261018120000) silently matched nothing in
-- the database predicate; the expansion lived only in TypeScript. Make the single predicate expand it too, so an old
-- cookie, link or client that still sends 'nuts' keeps protecting people. Same signature, no new objects.
create or replace function public.recipe_has_allergen(p_recipe_id uuid, p_slugs text[])
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from   public.recipe_allergens ra
    join   public.allergens a on a.id = ra.allergen_id
    where  ra.recipe_id = p_recipe_id
      and  a.slug = any (
             case when 'nuts' = any (p_slugs)
                  then p_slugs || array['peanuts', 'tree-nuts']
                  else p_slugs end)
  );
$$;

comment on function public.recipe_has_allergen(uuid, text[]) is
  'True when the recipe carries ANY of the allergen slugs through a required ingredient line (the legacy slug nuts means peanuts + tree-nuts). The only allergen-exclusion predicate: match_recipes, search_recipes, filtered_recipes and fridge_recipes_grouped all call it.';

grant execute on function public.recipe_has_allergen(uuid, text[]) to anon, authenticated, service_role;
