-- Wave 10 (UI lane): remember WHICH food (a brand, say) an author picked for a recipe line.
--
-- The ingredient picker in the recipe form lets a cook choose "Kikkoman soy sauce" for a line that is, for
-- every domain rule, still the canonical ingredient "soy sauce" (a brand is a FOOD linked to a canonical
-- ingredient, never a separate ingredient). The canonical row is saved by save_my_recipe as before; this
-- pair of functions stores and reads the optional food choice, recipe_ingredients.fdc_id, which the
-- nutrition tables (schema lane) add.
--
-- Why separate functions and not a new save_my_recipe: that function is replaced wholesale by whichever
-- migration redefines it last, so a second author of it would silently erase the first one's changes.
-- These two touch only fdc_id.
--
-- Safety, in the same shape as the other author RPCs (20261014160000_user_recipes_hardening.sql):
--   - signed in, user_recipes switch on, and the recipe is the caller's own;
--   - a food can only be attached when ingredient_foods says it is a food of that line's ingredient, so
--     a client cannot attach an unrelated food to a line;
--   - refresh_recipe_nutrients(recipe) is called if the schema lane's function exists, so the stored
--     nutrition follows the choice; if it does not exist yet, nothing breaks.
-- The bodies are plpgsql, which does not check table names when the function is created, so this migration
-- applies cleanly whichever order it meets the nutrition tables in (it only WORKS once they exist).

begin;

create or replace function public.set_my_recipe_foods(p_recipe_id uuid, p_picks jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid  uuid := auth.uid();
  pick jsonb;
  pos  integer;
  fdc  integer;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  if not exists (select 1 from recipes where id = p_recipe_id and author_id = uid) then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) > 60 then
    raise exception 'bad food picks' using errcode = '22023';
  end if;

  -- save_my_recipe rebuilds the lines on every save, so start from a clean slate for this recipe.
  update recipe_ingredients set fdc_id = null where recipe_id = p_recipe_id and fdc_id is not null;

  for pick in select * from jsonb_array_elements(p_picks) loop
    if jsonb_typeof(pick) <> 'object' then
      raise exception 'bad food pick' using errcode = '22023';
    end if;
    begin
      pos := (pick ->> 'pos')::integer;
      fdc := (pick ->> 'fdc_id')::integer;
    exception when others then
      raise exception 'bad food pick' using errcode = '22023';
    end;
    update recipe_ingredients ri
       set fdc_id = fdc
     where ri.recipe_id = p_recipe_id
       and ri.sort_order = pos
       and exists (
             select 1 from ingredient_foods f
              where f.ingredient_id = ri.ingredient_id and f.fdc_id = fdc
           );
  end loop;

  if to_regprocedure('public.refresh_recipe_nutrients(uuid)') is not null then
    execute 'select public.refresh_recipe_nutrients($1)' using p_recipe_id;
  end if;
end;
$$;

create or replace function public.my_recipe_foods(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  out jsonb;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  if not exists (select 1 from recipes where id = p_recipe_id and author_id = uid) then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'pos', ri.sort_order,
           'fdc_id', ri.fdc_id,
           'label', f.description,
           'brand', coalesce(f.brand_name, f.brand_owner)
         ) order by ri.sort_order), '[]'::jsonb)
    into out
    from recipe_ingredients ri
    left join usda_foods f on f.fdc_id = ri.fdc_id
   where ri.recipe_id = p_recipe_id and ri.fdc_id is not null;
  return out;
end;
$$;

revoke all on function public.set_my_recipe_foods(uuid, jsonb) from public, anon;
revoke all on function public.my_recipe_foods(uuid)            from public, anon;
grant execute on function public.set_my_recipe_foods(uuid, jsonb) to authenticated;
grant execute on function public.my_recipe_foods(uuid)            to authenticated;

commit;
