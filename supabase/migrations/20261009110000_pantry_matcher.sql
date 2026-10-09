-- M3.3 -- the pantry matcher.
--
--   match_recipes(...)       rank published recipes by how little the pantry lacks
--   suggest_ingredients(...) top-N autocomplete over canonical names AND aliases
--
-- Both are plain SQL/plpgsql functions called through supabase.rpc(). Ranking
-- belongs next to the data: the alternative is shipping ~7,000 recipe_ingredient
-- rows to Node to count them there.
--
-- Both are SECURITY INVOKER (the default), so RLS still applies underneath.

begin;

-- ---------------------------------------------------------------------------
-- match_recipes
-- ---------------------------------------------------------------------------
--
-- Definitions (all per recipe, counted over DISTINCT ingredient_id, because a
-- recipe may list the same ingredient twice -- once in the sauce, once to
-- garnish -- and that must not count as two things to buy):
--
--   needed   ingredients that are NOT a pantry staple and NOT optional
--   have     needed ingredients present in the pantry (pantry U must_use)
--   missing  needed - have
--   coverage have / needed, rounded to 4 dp (the rounding makes the keyset
--            cursor comparison exact -- a float round-trips through JSON badly)
--
-- A recipe is returned only if
--   * have >= min_have (default 1) -- a recipe sharing nothing with the pantry is
--                                noise, even if it is only "2 missing". The UI can
--                                raise it once the pantry is large.
--   * missing <= max_missing
--   * it uses EVERY ingredient in must_use_ids ("use it up": the leftover
--     cilantro must be in the dish). must_use_ids are implicitly in the pantry.
--     A staple may be must-use too ("I have to use up this butter"); it just
--     does not change coverage.
--
-- Order: coverage desc, then MORE pantry ingredients used (have desc), then
-- shorter total time, then id. The `have desc` step is not in the original
-- sketch: without it a 1-ingredient "Lemonade" ties a 5-of-5 dinner at 100%
-- and wins on the (mostly unknown) time. It only reorders ties. Time is NULL (sorted
-- last) when unknown: USDA MyPlate rows carry no time at all (670 of 878 recipes
-- have total_time_min = 0, which here means "unknown", not "instant").
--
-- Pagination is keyset, not offset. The cursor is the last row's
-- (coverage, have_count, time_key, recipe_id) -- pass the four cursor_* args back
-- verbatim. Note what keyset buys here: stable pages when the catalog changes
-- between requests, and no OFFSET skip-and-discard. It does NOT avoid the
-- aggregation, because the sort key is computed, not stored; at ~1,500 recipes
-- that is a few milliseconds.
--
-- Extensibility (M3.4): add trailing DEFAULT NULL parameters and AND them into
-- the `eligible` CTE. Appending defaulted parameters keeps existing callers
-- working; do NOT reorder or insert before the cursor/page arguments.

create or replace function match_recipes(
  pantry_ids       integer[],
  max_missing      integer   default 3,
  must_use_ids     integer[] default '{}',
  min_have         integer   default 1,
  page_size        integer   default 24,
  cursor_coverage  numeric   default null,
  cursor_have      integer   default null,
  cursor_time_key  integer   default null,
  cursor_recipe_id uuid      default null
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
      coalesce((select array_agg(distinct x)
                from unnest(coalesce(pantry_ids, '{}') || coalesce(must_use_ids, '{}')) x
                where x is not null), '{}') as have_ids,
      coalesce((select array_agg(distinct x)
                from unnest(coalesce(must_use_ids, '{}')) x
                where x is not null), '{}') as must_ids
  ),
  -- Only recipes touching the pantry can score above zero, so start from the
  -- ingredient_id index instead of aggregating the whole table. With must-use
  -- ids, every one of them has to be present.
  candidates as (
    select ri.recipe_id
    from   params p
    join   recipe_ingredients ri on ri.ingredient_id = any (p.have_ids)
    group  by ri.recipe_id, p.must_ids
    having cardinality(p.must_ids) = 0
        or p.must_ids <@ array_agg(ri.ingredient_id)
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

comment on function match_recipes(integer[], integer, integer[], integer, integer, numeric, integer, integer, uuid) is
  'Pantry matcher. Staples and optional ingredients never count as missing. '
  'Keyset-paginated by (coverage desc, have desc, time_key asc, id asc): pass the '
  'last row''s coverage/have_count/time_key/recipe_id back as cursor_*.';

-- ---------------------------------------------------------------------------
-- suggest_ingredients -- the pantry input's autocomplete
-- ---------------------------------------------------------------------------
--
-- resolve_ingredient() answers "what does this import line mean?" -- one row,
-- high confidence, reject otherwise. An autocomplete needs the opposite: the
-- top N plausible candidates for a half-typed word. They are different
-- questions, which is why this is a separate function.
--
-- Every canonical name AND every alias is a candidate. Each candidate lands in
-- a tier, and the best candidate per ingredient wins (so "scallion" appears
-- once, annotated with the alias the user's text matched):
--
--   0  the text equals the name/alias        "chicken"  -> chicken
--   1  the name/alias starts with the text   "chick"    -> chicken, chicken breast
--   2  some word in it starts with the text  "onion"    -> red onion
--   3  trigram similarity >= 0.3             "scalion"  -> scallion  (typos)
--
-- Inside tiers 0-2: canonical name before alias, shorter before longer (so the
-- bare "chicken" outranks "chicken broth"). Inside tier 3: most similar first.
-- Then alphabetical. `score` is a coarse per-tier number, not a probability.
-- The text is plural-folded too, so "onions" behaves like "onion".
--
-- ~800 candidate strings: a sequential scan is cheaper than any index here and
-- the planner knows it. The existing GIN trigram indexes take over if the
-- vocabulary grows by orders of magnitude.

create or replace function suggest_ingredients(
  prefix      text,
  max_results integer default 8
)
returns table (
  ingredient_id  integer,
  canonical_name citext,
  matched_text   text,
  match_kind     text,
  score          real
)
language sql
stable
parallel safe
as $$
  with q as (
    select normalize_ingredient_name(prefix)                             as p,
           singularize_ingredient_name(normalize_ingredient_name(prefix)) as ps
  ),
  cand as (
    select i.id, i.canonical_name, i.canonical_name::text as txt, 'name'::text as kind
    from   ingredients i
    union all
    select i.id, i.canonical_name, a.alias::text, 'alias'
    from   ingredient_aliases a
    join   ingredients i on i.id = a.ingredient_id
  ),
  tiered as (
    select c.id, c.canonical_name, c.txt, c.kind, n.norm,
           similarity(n.norm, q.p) as sim,
           case
             when n.norm in (q.p, q.ps)                                   then 0
             when n.norm like q.p || '%' or n.norm like q.ps || '%'       then 1
             when n.norm like '% ' || q.p || '%'
               or n.norm like '% ' || q.ps || '%'                         then 2
             when similarity(n.norm, q.p) >= 0.3                          then 3
           end as tier
    from   q
    cross  join cand c
    cross  join lateral (select normalize_ingredient_name(c.txt) as norm) n
    where  q.p is not null
  ),
  best as (
    select distinct on (t.id)
           t.id, t.canonical_name, t.txt, t.kind, t.tier, t.sim, t.norm
    from   tiered t
    where  t.tier is not null
    order  by t.id, t.tier, case when t.tier = 3 then -t.sim else 0 end,
              (t.kind = 'alias'), length(t.norm), t.sim desc
  )
  select b.id, b.canonical_name, b.txt, b.kind,
         (1.0 - b.tier * 0.2)::real
  from   best b
  order  by b.tier,
            case when b.tier = 3 then -b.sim else 0 end,   -- typos: closest first
            (b.kind = 'alias'), length(b.norm), b.sim desc, b.canonical_name
  limit  least(greatest(max_results, 1), 25);
$$;

comment on function suggest_ingredients(text, integer) is
  'Pantry autocomplete: top-N ingredients whose name or alias matches the typed '
  'text (exact > prefix > word-prefix > trigram). One row per ingredient; '
  'matched_text is the name or alias that matched.';

commit;
