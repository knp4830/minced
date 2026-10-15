-- Wave 7 / shopping list: "add this recipe again" as a second batch.
--
-- add_recipe_to_shopping_list() REPLACED a recipe's earlier lines on every call. The page now
-- asks the cook first ("<Recipe> is already on your list": Add again / Keep one); "Add again"
-- calls it with p_add_batch = true, which keeps the earlier lines so the list shows the
-- summed quantities. The default (false) is unchanged: replace.
--
-- A new trailing parameter changes the signature, so the old function is DROPPED and
-- re-created (otherwise PostgREST sees two overloads). Body copied from the live definition.
-- SECURITY INVOKER as before: RLS on shopping_list_items is the gate.

begin;

drop function add_recipe_to_shopping_list(uuid, integer, boolean, integer[]);

CREATE FUNCTION public.add_recipe_to_shopping_list(p_recipe_id uuid, p_servings integer, p_skip_staples boolean DEFAULT true, p_have_ids integer[] DEFAULT '{}'::integer[], p_add_batch boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid        uuid := (select auth.uid());
  base       integer;
  have       integer[] := coalesce(p_have_ids, '{}');
  n_added    integer := 0;
  n_staples  integer := 0;
  have_names text[] := '{}';
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_servings is null or p_servings < 1 or p_servings > 48 then
    raise exception 'servings must be 1-48' using errcode = '22023';
  end if;
  if cardinality(have) > 200 then
    raise exception 'too many fridge ids' using errcode = '22023';
  end if;

  select r.servings into base from recipes r where r.id = p_recipe_id;
  if base is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;

  -- Default: re-adding a recipe REPLACES its earlier lines (a retry never doubles the list).
  -- p_add_batch = true keeps them and adds another batch, so quantities add up (cooking it twice).
  if not coalesce(p_add_batch, false) then
    delete from shopping_list_items
     where user_id = uid and source_recipe_id = p_recipe_id;
  end if;

  select coalesce(array_agg(i.canonical_name::text order by ri.sort_order), '{}')
    into have_names
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
   where ri.recipe_id = p_recipe_id
     and not (p_skip_staples and i.is_pantry_staple)
     and (ri.ingredient_id = any (have) or coalesce(i.family_id = any (have), false));

  select count(*) into n_staples
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
   where ri.recipe_id = p_recipe_id and p_skip_staples and i.is_pantry_staple;

  insert into shopping_list_items (user_id, ingredient_id, quantity, unit_id, source_recipe_id)
  select uid,
         ri.ingredient_id,
         case when ri.quantity is null then null
              else round(ri.quantity * p_servings / base::numeric, 4) end,
         case when ri.quantity is null then null else ri.unit_id end,
         p_recipe_id
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
   where ri.recipe_id = p_recipe_id
     and not (p_skip_staples and i.is_pantry_staple)
     and not (ri.ingredient_id = any (have) or coalesce(i.family_id = any (have), false))
   order by ri.sort_order;
  get diagnostics n_added = row_count;

  return jsonb_build_object(
    'added', n_added,
    'skipped_staples', n_staples,
    'skipped_have', to_jsonb(have_names)
  );
end;
$function$;

comment on function add_recipe_to_shopping_list(uuid, integer, boolean, integer[], boolean) is
  'Adds a recipe''s ingredients, scaled, to the caller''s list. By default replaces that recipe''s earlier lines; p_add_batch = true keeps them and adds another batch. SECURITY INVOKER: RLS is the gate.';

revoke all on function add_recipe_to_shopping_list(uuid, integer, boolean, integer[], boolean) from public, anon;
grant execute on function add_recipe_to_shopping_list(uuid, integer, boolean, integer[], boolean) to authenticated;

commit;
