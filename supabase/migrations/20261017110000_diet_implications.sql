-- Diet implications (owner decision, wave 9): pescatarians eat vegetarian and vegan food,
-- and vegetarians eat vegan food. So the diet filter treats the diets as nested:
--   vegan       is satisfied by  vegan
--   vegetarian               by  vegetarian or vegan
--   pescatarian              by  pescatarian, vegetarian or vegan
-- The rule lives in ONE place, diet_satisfying(), and match_recipes, search_recipes and
-- filtered_recipes (the browse list) all call it. No recipe is re-tagged: recipe_diets still
-- records what the recipe IS, the query records what a diet ACCEPTS. Other diets
-- (gluten-free, ...) map to themselves, so multi-diet "ALL of" semantics are unchanged.

-- Load pg_trgm in THIS session before CREATE FUNCTION ... SET "pg_trgm.*" (non-superuser safe).
select similarity('a', 'a');

create or replace function public.diet_satisfying(diet_slug text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case diet_slug
    when 'vegan'       then array['vegan']
    when 'vegetarian'  then array['vegetarian', 'vegan']
    when 'pescatarian' then array['pescatarian', 'vegetarian', 'vegan']
    else array[diet_slug]
  end;
$$;
grant execute on function public.diet_satisfying(text) to anon, authenticated, service_role;

-- match_recipes and search_recipes: bodies copied from the live database; only the diet
-- predicate changed (d.slug = want.slug  ->  d.slug = any (diet_satisfying(want.slug))).
CREATE OR REPLACE FUNCTION public.match_recipes(pantry_ids integer[], max_missing integer DEFAULT 3, must_use_ids integer[] DEFAULT '{}'::integer[], min_have integer DEFAULT 1, page_size integer DEFAULT 24, cursor_coverage numeric DEFAULT NULL::numeric, cursor_have integer DEFAULT NULL::integer, cursor_time_key integer DEFAULT NULL::integer, cursor_recipe_id uuid DEFAULT NULL::uuid, max_total_min integer DEFAULT NULL::integer, cuisine_slugs text[] DEFAULT NULL::text[], diet_slugs text[] DEFAULT NULL::text[], exclude_allergen_slugs text[] DEFAULT NULL::text[], max_spice smallint DEFAULT NULL::smallint, min_calories numeric DEFAULT NULL::numeric, max_calories numeric DEFAULT NULL::numeric, min_protein_g numeric DEFAULT NULL::numeric, cookware_slugs text[] DEFAULT NULL::text[], owned_cookware_slugs text[] DEFAULT NULL::text[], min_total_min integer DEFAULT NULL::integer, include_ingredient_ids integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(recipe_id uuid, slug text, title text, image_url text, servings integer, total_time_min integer, calories numeric, have_count integer, needed_count integer, missing_count integer, coverage numeric, missing_ids integer[], missing_names text[], time_key integer)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET jit TO 'off'
AS $function$
  with params as (
    select
      expand_ingredient_family(
        coalesce((select array_agg(distinct x)
                  from unnest(coalesce(pantry_ids, '{}') || coalesce(must_use_ids, '{}')) x
                  where x is not null), '{}')) as have_ids
  ),
  -- INCLUDE filter (wave 8): a recipe must contain EVERY requested ingredient (as a
  -- non-optional line). Each requested id is satisfied by itself, its parent or its
  -- children (expand_ingredient_family), the same rule the pantry uses. Computed once.
  inc as materialized (
    select w.id, expand_ingredient_family(array[w.id]) as cov
    from   (select distinct x as id from unnest(coalesce(include_ingredient_ids, '{}')) x
            where x is not null) w
  ),
  -- One row per must-use id, with everything that satisfies it (itself, its
  -- parent, its children).
  must_cover as (
    select m, expand_ingredient_family(array[m]) as cov
    from   (select distinct x as m from unnest(coalesce(must_use_ids, '{}')) x
            where x is not null) u
  ),
  -- Only recipes touching the (expanded) pantry can score above zero, so start
  -- from the ingredient_id index instead of aggregating the whole table.
  candidates as (
    select c.recipe_id
    from (
      select ri.recipe_id, array_agg(ri.ingredient_id) as present
      from   params p
      join   recipe_ingredients ri on ri.ingredient_id = any (p.have_ids)
      group  by ri.recipe_id
    ) c
    where not exists (select 1 from must_cover mc where not (mc.cov && c.present))
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
    where  -- unknown (NULL / 0) time, spice, calories, protein PASS range filters
           (max_total_min  is null or r.total_time_min is null or r.total_time_min = 0
                                   or r.total_time_min <= max_total_min)
      and  (min_total_min  is null or r.total_time_min is null or r.total_time_min = 0
                                   or r.total_time_min >= min_total_min)
      and  (max_spice      is null or r.spice_level is null or r.spice_level <= max_spice)
      and  (min_calories   is null or r.calories  is null or r.calories  >= min_calories)
      and  (max_calories   is null or r.calories  is null or r.calories  <= max_calories)
      and  (min_protein_g  is null or r.protein_g is null or r.protein_g >= min_protein_g)
      and  (cuisine_slugs  is null or r.cuisine_id in (
              select cu.id from cuisines cu where cu.slug = any (cuisine_slugs)))
      -- ALL requested diets: there is no requested diet the recipe lacks.
      and  (diet_slugs is null or not exists (
              select 1 from unnest(diet_slugs) as want(slug)
              where not exists (
                select 1
                from   recipe_diets rd
                join   diets d on d.id = rd.diet_id
                where  rd.recipe_id = r.id and d.slug = any (public.diet_satisfying(want.slug)))))
      -- NONE of the allergens. NOT EXISTS, correlated on the recipe: a LEFT
      -- JOIN ... IS NULL or NOT IN over a nullable column both get edge cases
      -- wrong; this form cannot.
      and  (exclude_allergen_slugs is null or not exists (
              select 1
              from   recipe_allergens ra
              join   allergens a on a.id = ra.allergen_id
              where  ra.recipe_id = r.id and a.slug = any (exclude_allergen_slugs)))
      -- COOKWARE (wave 4): the recipe uses ANY of the requested cookware. A recipe
      -- with no recipe_cookware rows does not match; NULL / empty array = no filter.
      and  (cookware_slugs is null or cardinality(cookware_slugs) = 0 or exists (
              select 1
              from   recipe_cookware rk
              join   cookware cw on cw.id = rk.cookware_id
              where  rk.recipe_id = r.id and cw.slug = any (cookware_slugs)))
      -- INCLUDE (wave 8): ALL requested ingredients appear in the recipe. No `inc` rows = no filter.
      and  not exists (
              select 1 from inc
              where not exists (
                select 1 from recipe_ingredients x
                where  x.recipe_id = r.id and not x.is_optional
                  and  x.ingredient_id = any (inc.cov)))
      -- OWNED COOKWARE (wave 5, alternatives wave 7): every cookware REQUIREMENT must be met by
      -- something the cook owns. A requirement is an ungrouped row on its own, or one alt_group
      -- ("X or Y"), met by owning ANY member. The recipe fails when some requirement has no
      -- owned member. The recipe needs NO cookware the cook lacks. A recipe
      -- with no recipe_cookware rows needs nothing, so it passes. NULL = no filter;
      -- an empty array means "I own none", so every recipe that needs any cookware drops.
      and  (owned_cookware_slugs is null or not exists (
              select 1
              from   recipe_cookware rk
              join   cookware cw on cw.id = rk.cookware_id
              where  rk.recipe_id = r.id
              group  by coalesce(rk.alt_group::integer, -rk.cookware_id)
              having bool_and(cw.slug <> all (owned_cookware_slugs))))
    group  by r.id
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
      r.has_photo                                  as has_photo
    from   scored s
    join   recipes r on r.id = s.id
    where  s.have >= greatest(min_have, 1)
      and  (s.needed - s.have) <= greatest(max_missing, 0)
  )
  select
    k.id, k.slug, k.title, k.image_url, k.servings, k.total_time_min, k.calories,
    k.have, k.needed, k.missing, k.coverage, k.miss_ids,
    coalesce((select array_agg(i.canonical_name::text order by i.canonical_name)
              from ingredients i where i.id = any (k.miss_ids)), '{}'),
    k.time_key
  from   ranked k
  left   join recipes cr on cr.id = cursor_recipe_id   -- the cursor row's photo flag (see header)
  where  cursor_recipe_id is null
     or  k.coverage < cursor_coverage
     or (k.coverage = cursor_coverage and k.have < cursor_have)
     or (k.coverage = cursor_coverage and k.have = cursor_have
         and k.has_photo < coalesce(cr.has_photo, false))
     or (k.coverage = cursor_coverage and k.have = cursor_have
         and k.has_photo = coalesce(cr.has_photo, false)
         and k.time_key > cursor_time_key)
     or (k.coverage = cursor_coverage and k.have = cursor_have
         and k.has_photo = coalesce(cr.has_photo, false)
         and k.time_key = cursor_time_key and k.id > cursor_recipe_id)
  order  by k.coverage desc, k.have desc, k.has_photo desc, k.time_key asc, k.id asc
  limit  least(greatest(page_size, 1), 100);
$function$

;

CREATE OR REPLACE FUNCTION public.search_recipes(q text, max_total_min integer DEFAULT NULL::integer, max_prep_min integer DEFAULT NULL::integer, cuisine_slugs text[] DEFAULT NULL::text[], diet_slugs text[] DEFAULT NULL::text[], exclude_allergen_slugs text[] DEFAULT NULL::text[], max_spice smallint DEFAULT NULL::smallint, min_calories numeric DEFAULT NULL::numeric, max_calories numeric DEFAULT NULL::numeric, min_protein_g numeric DEFAULT NULL::numeric, max_protein_g numeric DEFAULT NULL::numeric, min_carbs_g numeric DEFAULT NULL::numeric, max_carbs_g numeric DEFAULT NULL::numeric, min_fat_g numeric DEFAULT NULL::numeric, max_fat_g numeric DEFAULT NULL::numeric, result_limit integer DEFAULT 24, cursor_score double precision DEFAULT NULL::double precision, cursor_id uuid DEFAULT NULL::uuid, cookware_slugs text[] DEFAULT NULL::text[], owned_cookware_slugs text[] DEFAULT NULL::text[], min_total_min integer DEFAULT NULL::integer, include_ingredient_ids integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(id uuid, slug text, title text, servings integer, total_time_min integer, calories numeric, image_url text, score double precision, match_kind text)
 LANGUAGE plpgsql
 STABLE
 SET "pg_trgm.word_similarity_threshold" TO '0.4'
 SET jit TO 'off'
AS $function$
#variable_conflict use_column
declare
  v_fold  text := btrim(regexp_replace(search_fold(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
  v_tsq   tsquery;
  v_mode  text;
  v_limit integer := least(greatest(coalesce(result_limit, 24), 1), 100);
begin
  if v_fold = '' then
    return;
  end if;

  v_tsq := search_tsquery(q);
  if v_tsq is null then
    return;
  end if;

  if exists (select 1 from recipes r where r.search_vector @@ v_tsq) then
    v_mode := 'text';
  else
    v_mode := 'fuzzy';
  end if;

  return query
  with inc as materialized (
    select w.id, expand_ingredient_family(array[w.id]) as cov
    from   (select distinct x as id from unnest(coalesce(include_ingredient_ids, '{}')) x
            where x is not null) w
  ),
  cand as (
    select
      r.id, r.slug, r.title, r.servings, r.total_time_min, r.calories, r.image_url,
      r.has_photo,
      ((case when v_mode = 'text'
        then ts_rank('{0.1, 0.2, 0.4, 1.0}'::real[], r.search_vector, v_tsq, 1 | 32)::double precision
        else word_similarity(v_fold, search_fold(r.title))::double precision
      end)
      -- Known-fit rows first: unknown on an active range filter => offset into [-1,0).
      - (case when
             ((max_total_min is not null or min_total_min is not null) and (r.total_time_min is null or r.total_time_min = 0))
          or (max_prep_min  is not null and r.prep_time_min is null)
          or (max_spice     is not null and r.spice_level   is null)
          or ((min_calories is not null or max_calories is not null) and r.calories  is null)
          or ((min_protein_g is not null or max_protein_g is not null) and r.protein_g is null)
          or ((min_carbs_g  is not null or max_carbs_g  is not null) and r.carbs_g   is null)
          or ((min_fat_g    is not null or max_fat_g    is not null) and r.fat_g     is null)
         then 1.0 else 0.0 end))::real::double precision as score
    from recipes r
    where (
            (v_mode = 'text'  and r.search_vector @@ v_tsq)
         or (v_mode = 'fuzzy' and v_fold <% search_fold(r.title))
          )
      and (max_total_min is null or r.total_time_min is null or r.total_time_min = 0
                                  or r.total_time_min <= max_total_min)
      and (min_total_min is null or r.total_time_min is null or r.total_time_min = 0
                                  or r.total_time_min >= min_total_min)
      and (max_prep_min  is null or r.prep_time_min is null or r.prep_time_min <= max_prep_min)
      and (max_spice     is null or r.spice_level   is null or r.spice_level   <= max_spice)
      and (min_calories  is null or r.calories  is null or r.calories  >= min_calories)
      and (max_calories  is null or r.calories  is null or r.calories  <= max_calories)
      and (min_protein_g is null or r.protein_g is null or r.protein_g >= min_protein_g)
      and (max_protein_g is null or r.protein_g is null or r.protein_g <= max_protein_g)
      and (min_carbs_g   is null or r.carbs_g   is null or r.carbs_g   >= min_carbs_g)
      and (max_carbs_g   is null or r.carbs_g   is null or r.carbs_g   <= max_carbs_g)
      and (min_fat_g     is null or r.fat_g     is null or r.fat_g     >= min_fat_g)
      and (max_fat_g     is null or r.fat_g     is null or r.fat_g     <= max_fat_g)
      and (cuisine_slugs is null or r.cuisine_id in (
             select c.id from cuisines c where c.slug = any (cuisine_slugs)))
      and (diet_slugs is null or not exists (
             select 1 from unnest(diet_slugs) as want(slug)
             where not exists (
               select 1
               from   recipe_diets rd
               join   diets d on d.id = rd.diet_id
               where  rd.recipe_id = r.id and d.slug = any (public.diet_satisfying(want.slug)))))
      and (cookware_slugs is null or cardinality(cookware_slugs) = 0 or exists (
             select 1
             from   recipe_cookware rk
             join   cookware cw on cw.id = rk.cookware_id
             where  rk.recipe_id = r.id and cw.slug = any (cookware_slugs)))
      -- OWNED COOKWARE (wave 5, alternatives wave 7): every cookware REQUIREMENT must be met by
      -- something the cook owns. A requirement is an ungrouped row on its own, or one alt_group
      -- ("X or Y"), met by owning ANY member. The recipe fails when some requirement has no
      -- owned member. The recipe needs NO cookware the cook lacks. A recipe
      -- with no recipe_cookware rows needs nothing, so it passes. NULL = no filter;
      -- an empty array means "I own none", so every recipe that needs any cookware drops.
      -- INCLUDE (wave 8): ALL requested ingredients appear in the recipe (non-optional lines,
      -- family-expanded). No `inc` rows = no filter.
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
      and (exclude_allergen_slugs is null or not exists (
             select 1
             from   recipe_allergens ra
             join   allergens a on a.id = ra.allergen_id
             where  ra.recipe_id = r.id and a.slug = any (exclude_allergen_slugs)))
  )
  select c.id, c.slug, c.title, c.servings, c.total_time_min, c.calories,
         c.image_url, c.score, v_mode
  from   cand c
  left   join recipes cr on cr.id = cursor_id          -- the cursor row's photo flag (see header)
  where  cursor_score is null
      or (c.score, c.has_photo, c.id) < (cursor_score, coalesce(cr.has_photo, false), cursor_id)
  order  by c.score desc, c.has_photo desc, c.id desc
  limit  v_limit;
end;
$function$

;


-- filtered_recipes gains diet_slugs so the browse list (PostgREST) uses the same rule.
-- The signature changes, so the old two-argument form is dropped (a second overload would
-- make PostgREST calls ambiguous). Positional callers keep working: the new argument has
-- a default.
drop function if exists public.filtered_recipes(text[], integer[]);

create function public.filtered_recipes(
  owned       text[]    default null,
  include_ids integer[] default null,
  diet_slugs  text[]    default null)
returns setof recipes
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
                and  d.slug = any (public.diet_satisfying(want.slug)))));
$$;
grant execute on function public.filtered_recipes(text[], integer[], text[]) to anon, authenticated, service_role;
