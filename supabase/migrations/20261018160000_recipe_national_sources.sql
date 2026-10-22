-- Wave 10c integration: which national composition tables a recipe's label draws on, for the static credit under the label.
--
-- UK CoFID (Open Government Licence v3.0) and the Canadian Nutrient File (Open Government Licence - Canada) both require
-- an attribution statement. The statement lives on /about and under the label of a recipe that uses one of their foods.
-- "Uses" = one of its ingredients links to such a food. That is a superset of "the default food of a line" (national foods
-- are linked as the ingredient's default), so the credit can only be shown when it is due, never withheld.

create or replace function public.recipe_national_sources(p_recipe_id uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct u.data_type order by u.data_type), '{}')
  from   public.recipe_ingredients ri
  join   public.ingredient_foods f on f.ingredient_id = ri.ingredient_id
  join   public.usda_foods u on u.fdc_id = f.fdc_id
  where  ri.recipe_id = p_recipe_id
    and  u.data_type in ('cofid', 'cnf');
$$;

comment on function public.recipe_national_sources(uuid) is
  'The national composition tables (cofid, cnf) a recipe label draws on, for the licence credit. Empty array when none.';

grant execute on function public.recipe_national_sources(uuid) to anon, authenticated, service_role;
