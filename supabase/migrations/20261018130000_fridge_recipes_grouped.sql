-- Fridge results, grouped by how much is missing (wave 10c, lane fridge).
--
-- Owner decision (2026-10-17): the fridge page shows "Make now" (nothing missing), "Missing 1", "Missing 2"
-- and "Need a few more" (3 or more), with recipes that use soon-to-expire fridge items first inside each
-- group. This file adds two NEW functions and changes nothing that exists; match_recipes (the allergens
-- lane owns it) is left alone.
--
-- 1. fridge_recipes_grouped(...)  the grouped, keyset-paginated matcher. It copies match_recipes'
--    scoring and filter predicates (family-aware have set, staples and optional lines never count as
--    missing, unknown time/calories/protein pass range filters, ALL diets via diet_satisfying, NONE of
--    the allergens, cookware, include, owned cookware). The integrator reconciles the allergen predicate
--    with whatever the allergens lane makes match_recipes do; both mark it with "ALLERGEN PREDICATE".
-- 2. add_missing_to_shopping_list(...)  adds just the named missing ingredients of one recipe, once.
--
-- Written to run as a non-superuser: no SET pg_trgm.*, no superuser-only statements.

begin;

-- ---------------------------------------------------------------------------
-- 1. fridge_recipes_grouped
--
-- group_filter NULL: the first per_group rows of EACH group (cursor ignored), each row carrying its
--   group's full size in group_total.
-- group_filter 'now' | 'missing1' | 'missing2' | 'more': one group, keyset-paginated (page_size rows after
--   the cursor).
--
-- Order inside a group: recipes using the soonest-expiring fridge item first (soon_ids/soon_days are the
-- fridge items due within a few days, with their days-until-expiry; expired is negative), then the
-- matcher's order (coverage, more items used, has a photo, shorter, id).
-- The cursor is that whole key: (soon_key, coverage, have, time_key, recipe id); the photo flag is read
-- from the cursor recipe, exactly as match_recipes does.
-- ---------------------------------------------------------------------------

create function public.fridge_recipes_grouped(
  pantry_ids            integer[],
  group_filter          text      default null,
  per_group             integer   default 12,
  page_size             integer   default 24,
  soon_ids              integer[] default '{}',
  soon_days             integer[] default '{}',
  cursor_soon           integer   default null,
  cursor_coverage       numeric   default null,
  cursor_have           integer   default null,
  cursor_time_key       integer   default null,
  cursor_recipe_id      uuid      default null,
  max_total_min         integer   default null,
  min_total_min         integer   default null,
  cuisine_slugs         text[]    default null,
  diet_slugs            text[]    default null,
  exclude_allergen_slugs text[]   default null,
  max_spice             smallint  default null,
  min_calories          numeric   default null,
  max_calories          numeric   default null,
  min_protein_g         numeric   default null,
  cookware_slugs        text[]    default null,
  owned_cookware_slugs  text[]    default null,
  include_ingredient_ids integer[] default null
)
returns table (
  recipe_id     uuid,
  slug          text,
  title         text,
  image_url     text,
  servings      integer,
  total_time_min integer,
  calories      numeric,
  have_count    integer,
  needed_count  integer,
  missing_count integer,
  coverage      numeric,
  missing_ids   integer[],
  missing_names text[],
  time_key      integer,
  grp           text,
  group_total   integer,
  soon_day      integer,
  soon_key      integer
)
language sql
stable
parallel safe
set jit = off
as $$
  with params as (
    select
      expand_ingredient_family(
        coalesce((select array_agg(distinct x) from unnest(coalesce(pantry_ids, '{}')) x
                  where x is not null), '{}')) as have_ids
  ),
  inc as materialized (
    select w.id, expand_ingredient_family(array[w.id]) as cov
    from   (select distinct x as id from unnest(coalesce(include_ingredient_ids, '{}')) x
            where x is not null) w
  ),
  -- Only recipes touching the (expanded) fridge can have anything on hand.
  candidates as (
    select distinct ri.recipe_id
    from   params p
    join   recipe_ingredients ri on ri.ingredient_id = any (p.have_ids)
  ),
  scored as (
    select
      r.id,
      count(distinct i.id) filter (
        where not i.is_pantry_staple and not ri.is_optional)             as needed,
      count(distinct i.id) filter (
        where not i.is_pantry_staple and not ri.is_optional
          and i.id = any (p.have_ids))                                   as have,
      array_agg(distinct i.id) filter (
        where not i.is_pantry_staple and not ri.is_optional
          and i.id <> all (p.have_ids))                                  as miss_ids
    from   params p
    cross  join candidates c
    join   recipes r             on r.id = c.recipe_id and r.status = 'published'
    join   recipe_ingredients ri on ri.recipe_id = r.id
    join   ingredients i         on i.id = ri.ingredient_id
    where  (fridge_recipes_grouped.max_total_min is null or r.total_time_min is null or r.total_time_min = 0
                                   or r.total_time_min <= fridge_recipes_grouped.max_total_min)
      and  (fridge_recipes_grouped.min_total_min is null or r.total_time_min is null or r.total_time_min = 0
                                   or r.total_time_min >= fridge_recipes_grouped.min_total_min)
      and  (max_spice      is null or r.spice_level is null or r.spice_level <= max_spice)
      and  (min_calories   is null or r.calories  is null or r.calories  >= min_calories)
      and  (max_calories   is null or r.calories  is null or r.calories  <= max_calories)
      and  (min_protein_g  is null or r.protein_g is null or r.protein_g >= min_protein_g)
      and  (cuisine_slugs  is null or r.cuisine_id in (
              select cu.id from cuisines cu where cu.slug = any (cuisine_slugs)))
      and  (fridge_recipes_grouped.diet_slugs is null or not exists (
              select 1 from unnest(fridge_recipes_grouped.diet_slugs) as want(slug)
              where not exists (
                select 1
                from   recipe_diets rd
                join   diets d on d.id = rd.diet_id
                where  rd.recipe_id = r.id and d.slug = any (public.diet_satisfying(want.slug)))))
      -- ALLERGEN PREDICATE: copied from match_recipes (NONE of the allergens). Keep in step with it.
      and  (exclude_allergen_slugs is null or not exists (
              select 1
              from   recipe_allergens ra
              join   allergens a on a.id = ra.allergen_id
              where  ra.recipe_id = r.id and a.slug = any (exclude_allergen_slugs)))
      and  (cookware_slugs is null or cardinality(cookware_slugs) = 0 or exists (
              select 1
              from   recipe_cookware rk
              join   cookware cw on cw.id = rk.cookware_id
              where  rk.recipe_id = r.id and cw.slug = any (cookware_slugs)))
      and  not exists (
              select 1 from inc
              where not exists (
                select 1 from recipe_ingredients x
                where  x.recipe_id = r.id and not x.is_optional
                  and  x.ingredient_id = any (inc.cov)))
      and  (owned_cookware_slugs is null or not exists (
              select 1
              from   recipe_cookware rk
              join   cookware cw on cw.id = rk.cookware_id
              where  rk.recipe_id = r.id
              group  by coalesce(rk.alt_group::integer, -rk.cookware_id)
              having bool_and(cw.slug <> all (owned_cookware_slugs))))
    group  by r.id
  ),
  -- Fridge items that expire soon, each with everything that satisfies it (itself, parent, children).
  soon as (
    select s.d, unnest(expand_ingredient_family(array[s.id])) as ing
    from   unnest(coalesce(fridge_recipes_grouped.soon_ids, '{}'),
                  coalesce(fridge_recipes_grouped.soon_days, '{}')) as s(id, d)
    where  s.id is not null and s.d is not null
  ),
  rec_soon as (
    select ri.recipe_id, min(so.d)::integer as d
    from   recipe_ingredients ri
    join   soon so on so.ing = ri.ingredient_id
    where  not ri.is_optional
      and  ri.recipe_id in (select sc.id from scored sc)
    group  by ri.recipe_id
  ),
  ranked as (
    select
      r.id, r.slug, r.title, r.image_url, r.servings, r.total_time_min, r.calories,
      s.have::integer                              as have,
      s.needed::integer                            as needed,
      (s.needed - s.have)::integer                 as missing,
      case when s.needed = 0 then 1::numeric
           else round(s.have::numeric / s.needed, 4) end as coverage,
      coalesce(s.miss_ids, '{}')                   as miss_ids,
      coalesce(nullif(r.total_time_min, 0), 2147483647) as time_key,
      r.has_photo                                  as has_photo,
      rs.d                                         as soon_d,
      coalesce(rs.d, 1000000)                      as soon_k
    from   scored s
    join   recipes r on r.id = s.id
    left   join rec_soon rs on rs.recipe_id = s.id
    where  s.have >= 1
  ),
  grouped as (
    select k.*,
           case when k.missing <= 0 then 'now'
                when k.missing = 1  then 'missing1'
                when k.missing = 2  then 'missing2'
                else 'more' end as g
    from   ranked k
  ),
  counted as (
    select g.*,
           (count(*) over (partition by g.g))::integer as g_total,
           row_number() over (
             partition by g.g
             order by g.soon_k asc, g.coverage desc, g.have desc, g.has_photo desc, g.time_key asc, g.id asc
           ) as g_pos
    from   grouped g
  )
  select
    k.id, k.slug, k.title, k.image_url, k.servings, k.total_time_min, k.calories,
    k.have, k.needed, k.missing, k.coverage,
    -- ids and names in the SAME order (by name), so position n of one is position n of the other.
    coalesce((select array_agg(i.id order by i.canonical_name, i.id)
              from ingredients i where i.id = any (k.miss_ids)), '{}'),
    coalesce((select array_agg(i.canonical_name::text order by i.canonical_name, i.id)
              from ingredients i where i.id = any (k.miss_ids)), '{}'),
    k.time_key, k.g, k.g_total, k.soon_d, k.soon_k
  from   counted k
  left   join recipes cr on cr.id = fridge_recipes_grouped.cursor_recipe_id
  where  case
           when group_filter is null then k.g_pos <= greatest(per_group, 1)
           else k.g = group_filter
                and (cursor_recipe_id is null
                  or k.soon_k > cursor_soon
                  or (k.soon_k = cursor_soon and k.coverage < cursor_coverage)
                  or (k.soon_k = cursor_soon and k.coverage = cursor_coverage and k.have < cursor_have)
                  or (k.soon_k = cursor_soon and k.coverage = cursor_coverage and k.have = cursor_have
                      and k.has_photo < coalesce(cr.has_photo, false))
                  or (k.soon_k = cursor_soon and k.coverage = cursor_coverage and k.have = cursor_have
                      and k.has_photo = coalesce(cr.has_photo, false) and k.time_key > cursor_time_key)
                  or (k.soon_k = cursor_soon and k.coverage = cursor_coverage and k.have = cursor_have
                      and k.has_photo = coalesce(cr.has_photo, false) and k.time_key = cursor_time_key
                      and k.id > cursor_recipe_id))
         end
  order  by case k.g when 'now' then 0 when 'missing1' then 1 when 'missing2' then 2 else 3 end,
            k.g_pos
  limit  case when group_filter is null then 400 else least(greatest(page_size, 1), 100) end;
$$;

comment on function public.fridge_recipes_grouped is
  'Fridge results grouped by missing count (now / missing1 / missing2 / more), soonest-expiring fridge items first inside each group, keyset-paginated per group. Same scoring and filters as match_recipes; staples and optional lines never count as missing. group_total is the group''s full size.';

grant execute on function public.fridge_recipes_grouped(
  integer[], text, integer, integer, integer[], integer[], integer, numeric, integer, integer, uuid,
  integer, integer, text[], text[], text[], smallint, numeric, numeric, numeric, text[], text[], integer[])
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. add_missing_to_shopping_list: one tap on a missing ingredient.
--
-- Adds the named ingredients of one recipe at the recipe's own servings. An ingredient already on the
-- list from that recipe (any state) is left alone, so a double tap or a retry never doubles a line.
-- SECURITY INVOKER: the RLS policies on shopping_list_items are the gate (own rows, readable recipe).
-- ---------------------------------------------------------------------------

create function public.add_missing_to_shopping_list(
  p_recipe_id      uuid,
  p_ingredient_ids integer[]
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  uid      uuid := (select auth.uid());
  ids      integer[] := coalesce(p_ingredient_ids, '{}');
  n_added  integer := 0;
  n_have   integer := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if cardinality(ids) = 0 or cardinality(ids) > 60 then
    raise exception 'between 1 and 60 ingredients' using errcode = '22023';
  end if;
  if not exists (select 1 from recipes r where r.id = p_recipe_id) then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;

  select count(distinct ri.ingredient_id) into n_have
    from recipe_ingredients ri
   where ri.recipe_id = p_recipe_id
     and ri.ingredient_id = any (ids)
     and exists (select 1 from shopping_list_items s
                  where s.user_id = uid and s.source_recipe_id = p_recipe_id
                    and s.ingredient_id = ri.ingredient_id);

  insert into shopping_list_items (user_id, ingredient_id, quantity, unit_id, source_recipe_id)
  select uid, ri.ingredient_id, ri.quantity, case when ri.quantity is null then null else ri.unit_id end,
         p_recipe_id
    from recipe_ingredients ri
   where ri.recipe_id = p_recipe_id
     and ri.ingredient_id = any (ids)
     and not exists (select 1 from shopping_list_items s
                      where s.user_id = uid and s.source_recipe_id = p_recipe_id
                        and s.ingredient_id = ri.ingredient_id)
   order  by ri.sort_order;
  get diagnostics n_added = row_count;

  return jsonb_build_object('added', n_added, 'already', n_have);
end;
$$;

comment on function public.add_missing_to_shopping_list(uuid, integer[]) is
  'Adds the named ingredients of one recipe (at its own servings) to the caller''s shopping list, skipping any already there from that recipe. SECURITY INVOKER: RLS is the gate.';

revoke all on function public.add_missing_to_shopping_list(uuid, integer[]) from public, anon;
grant execute on function public.add_missing_to_shopping_list(uuid, integer[]) to authenticated;

commit;
