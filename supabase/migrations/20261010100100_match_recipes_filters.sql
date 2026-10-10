-- Wave 2 / matcher quality -- M3.4 filters + ingredient families inside match_recipes.
--
-- Same function, same call shape, same result columns, same ordering and cursor.
-- Two additions:
--
--   1. FAMILIES. The pantry is expanded with expand_ingredient_family() before
--      anything is compared, so "onion" covers "yellow onion" and vice versa
--      (see 20261010100000_ingredient_families.sql for the rules). must_use ids
--      are expanded per id: "use up this onion" is satisfied by a recipe that
--      lists yellow onion, but every must-use id still has to be satisfied.
--
--   2. FILTERS, as trailing DEFAULT NULL parameters after the cursor args:
--        max_total_min          time
--        cuisine_slugs          any of
--        diet_slugs             recipe must carry ALL
--        exclude_allergen_slugs recipe must carry NONE (NOT EXISTS, correlated)
--        max_spice              spice_level <=
--        min_calories, max_calories, min_protein_g
--      They are ANDed in before the aggregation, so rows a filter rejects are
--      never counted.
--
-- NULL SEMANTICS (the foundation contract): an UNKNOWN value passes a range
-- filter instead of failing it. Unknown time = NULL or 0 (MyPlate rows carry
-- none; 670 of 978 recipes), unknown spice/calories/protein = NULL. Dropping them
-- would make "under 30 minutes" silently hide 70% of the catalog. They sort last
-- on the time axis already (time_key = 2147483647). Categorical filters (cuisine,
-- diet, allergen) are not ranges: a recipe with no cuisine does not match
-- "Italian".
--
-- The old 9-argument function is dropped, not overloaded: with both present,
-- PostgREST cannot choose between them for a call that names only the old
-- arguments ("could not choose the best candidate function").

begin;

drop function match_recipes(integer[], integer, integer[], integer, integer, numeric, integer, integer, uuid);

create function match_recipes(
  pantry_ids       integer[],
  max_missing      integer   default 3,
  must_use_ids     integer[] default '{}',
  min_have         integer   default 1,
  page_size        integer   default 24,
  cursor_coverage  numeric   default null,
  cursor_have      integer   default null,
  cursor_time_key  integer   default null,
  cursor_recipe_id uuid      default null,
  -- M3.4 filters
  max_total_min          integer  default null,
  cuisine_slugs          text[]   default null,
  diet_slugs             text[]   default null,
  exclude_allergen_slugs text[]   default null,
  max_spice              smallint default null,
  min_calories           numeric  default null,
  max_calories           numeric  default null,
  min_protein_g          numeric  default null
)
returns table (
  recipe_id      uuid,
  slug           text,
  title          text,
  image_url      text,
  servings       integer,
  total_time_min integer,
  calories       numeric,
  have_count     integer,
  needed_count   integer,
  missing_count  integer,
  coverage       numeric,
  missing_ids    integer[],
  missing_names  text[],
  time_key       integer
)
language sql
stable
parallel safe
as $$
  with params as (
    select
      expand_ingredient_family(
        coalesce((select array_agg(distinct x)
                  from unnest(coalesce(pantry_ids, '{}') || coalesce(must_use_ids, '{}')) x
                  where x is not null), '{}')) as have_ids
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
                where  rd.recipe_id = r.id and d.slug = want.slug)))
      -- NONE of the allergens. NOT EXISTS, correlated on the recipe: a LEFT
      -- JOIN ... IS NULL or NOT IN over a nullable column both get edge cases
      -- wrong; this form cannot.
      and  (exclude_allergen_slugs is null or not exists (
              select 1
              from   recipe_allergens ra
              join   allergens a on a.id = ra.allergen_id
              where  ra.recipe_id = r.id and a.slug = any (exclude_allergen_slugs)))
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
      coalesce(nullif(r.total_time_min, 0), 2147483647) as time_key
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
  where  cursor_recipe_id is null
     or  k.coverage < cursor_coverage
     or (k.coverage = cursor_coverage and k.have < cursor_have)
     or (k.coverage = cursor_coverage and k.have = cursor_have
         and k.time_key > cursor_time_key)
     or (k.coverage = cursor_coverage and k.have = cursor_have
         and k.time_key = cursor_time_key and k.id > cursor_recipe_id)
  order  by k.coverage desc, k.have desc, k.time_key asc, k.id asc
  limit  least(greatest(page_size, 1), 100);
$$;

comment on function match_recipes(integer[], integer, integer[], integer, integer, numeric, integer, integer, uuid,
                                  integer, text[], text[], text[], smallint, numeric, numeric, numeric) is
  'Pantry matcher with ingredient families and the M3.4 filters. Staples and '
  'optional ingredients never count as missing; a parent ingredient covers its '
  'variants. Unknown time/spice/calories/protein pass range filters. Keyset-'
  'paginated by (coverage desc, have desc, time_key asc, id asc): pass the last '
  'row''s coverage/have_count/time_key/recipe_id back as cursor_*.';

commit;
