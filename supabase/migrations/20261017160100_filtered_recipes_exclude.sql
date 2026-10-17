-- filtered_recipes() learns to leave out allergens (wave 11).
--
-- Why: the browse list reads filtered_recipes() whenever "only my cookware", "contains these ingredients" or a diet
-- is set. Leaving out an allergen was done with a PostgREST embed filter on top of the RPC
-- (`ex:recipe_allergens(...)` with `ex=is.null`), and PostgREST cannot apply a to-many embed filter to an RPC
-- result: it answers 42703 "column pgrst_call.recipes_ex_1 does not exist" and the page shows "Something went
-- wrong". So "vegetarian + no nuts" (and "contains X + no dairy") 500ed. Saved defaults make that the COMMON
-- combination, so the allergen rule now lives in the function, next to the diet rule, like
-- LESSONS says ("a diet rule belongs in one query-level function").
--
-- A new trailing parameter changes the signature: DROP the old overload first, or PostgREST rpc calls become
-- ambiguous. The body is the live one (pg_get_functiondef), plus the allergen test. Written to run as a
-- non-superuser; nothing here edits an applied migration.

drop function if exists public.filtered_recipes(text[], integer[], text[]);

create function public.filtered_recipes(
  owned          text[]    default null,
  include_ids    integer[] default null,
  diet_slugs     text[]    default null,
  exclude_slugs  text[]    default null
)
returns setof public.recipes
language sql
stable
set jit = off
as $$
  with inc as materialized (
    select w.id, expand_ingredient_family(array[w.id]) as cov
    from   (select distinct x as id from unnest(coalesce(include_ids, '{}')) x
            where x is not null) w
  )
  select r.*
  from   recipes r
  where  (owned is null or not exists (
            select 1
            from   recipe_cookware rk
            join   cookware cw on cw.id = rk.cookware_id
            where  rk.recipe_id = r.id
            group  by coalesce(rk.alt_group::integer, -rk.cookware_id)
            having bool_and(cw.slug <> all (owned))))
    and  not exists (
            select 1 from inc
            where not exists (
              select 1 from recipe_ingredients x
              where  x.recipe_id = r.id and not x.is_optional
                and  x.ingredient_id = any (inc.cov)))
    -- ALL requested diets, each satisfied by itself or a stricter diet.
    and  (filtered_recipes.diet_slugs is null or not exists (
            select 1 from unnest(filtered_recipes.diet_slugs) as want(slug)
            where not exists (
              select 1
              from   recipe_diets rd
              join   diets d on d.id = rd.diet_id
              where  rd.recipe_id = r.id
                and  d.slug = any (public.diet_satisfying(want.slug)))))
    -- NONE of the requested allergens.
    and  (filtered_recipes.exclude_slugs is null or not exists (
            select 1
            from   recipe_allergens ra
            join   allergens a on a.id = ra.allergen_id
            where  ra.recipe_id = r.id
              and  a.slug = any (filtered_recipes.exclude_slugs)));
$$;

grant execute on function public.filtered_recipes(text[], integer[], text[], text[]) to anon, authenticated, service_role;
