-- Photos first (wave 3, lane "photos").
--
-- A recipe with a photo should win a TIE against one without, on every door:
--   * browse (/recipes default)  -> order by has_photo desc, title, id   (PostgREST, see browse.ts)
--   * search_recipes             -> order by score desc, has_photo desc, id desc
--   * match_recipes              -> order by coverage desc, have desc, has_photo desc, time_key, id
-- A photo NEVER outranks a better relevance / coverage score: has_photo sits
-- after the real keys, so it only orders rows the real keys call equal.
--
-- recipes.has_photo
-- A denormalised flag, kept by a trigger on recipe_photos. It exists so browse
-- (a PostgREST list, which cannot ORDER BY "exists in another table") and the
-- two ranking functions can sort on a plain column instead of joining. The
-- trigger is SECURITY DEFINER because recipe_photos has no client write policy
-- (loaded with the secret key) and the flag lives on recipes; nothing here
-- widens an RLS policy.
--
-- CURSORS
-- match_recipes and search_recipes keep their signatures. The cursor row's
-- has_photo is looked up from its id (cursor_recipe_id / cursor_id), so the id
-- IS the photo key: the page boundary is (primary keys, has_photo of the last
-- row, remaining keys). The only way that can disagree with the page the user
-- saw is a photo being added/removed between two page loads, which happens in
-- an operator-run import and costs at most one repeated or skipped row.
-- Changing the signature instead would leave two overloads of the same name
-- and make every named-argument RPC call ambiguous.
--
-- Test with supabase/tests/photos_first_test.sql.

begin;

alter table recipes add column has_photo boolean not null default false;

comment on column recipes.has_photo is
  'True when recipe_photos has a row for this recipe. Maintained by trigger; used only to break ranking ties.';

update recipes r set has_photo = true
where exists (select 1 from recipe_photos p where p.recipe_id = r.id);

create or replace function trg_sync_recipe_has_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update recipes set has_photo = true where id = new.recipe_id and not has_photo;
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.recipe_id <> new.recipe_id) then
    update recipes set has_photo = exists (select 1 from recipe_photos p where p.recipe_id = old.recipe_id)
    where id = old.recipe_id;
  end if;
  return null;
end;
$$;

create trigger recipe_photos_sync_has_photo
after insert or update or delete on recipe_photos
for each row execute function trg_sync_recipe_has_photo();

-- Browse order: photo first, then A-Z. Covers the default /recipes listing.
create index recipes_browse_photo_idx on recipes (has_photo desc, title, id)
where status = 'published';

CREATE OR REPLACE FUNCTION public.match_recipes(pantry_ids integer[], max_missing integer DEFAULT 3, must_use_ids integer[] DEFAULT '{}'::integer[], min_have integer DEFAULT 1, page_size integer DEFAULT 24, cursor_coverage numeric DEFAULT NULL::numeric, cursor_have integer DEFAULT NULL::integer, cursor_time_key integer DEFAULT NULL::integer, cursor_recipe_id uuid DEFAULT NULL::uuid, max_total_min integer DEFAULT NULL::integer, cuisine_slugs text[] DEFAULT NULL::text[], diet_slugs text[] DEFAULT NULL::text[], exclude_allergen_slugs text[] DEFAULT NULL::text[], max_spice smallint DEFAULT NULL::smallint, min_calories numeric DEFAULT NULL::numeric, max_calories numeric DEFAULT NULL::numeric, min_protein_g numeric DEFAULT NULL::numeric)
 RETURNS TABLE(recipe_id uuid, slug text, title text, image_url text, servings integer, total_time_min integer, calories numeric, have_count integer, needed_count integer, missing_count integer, coverage numeric, missing_ids integer[], missing_names text[], time_key integer)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.search_recipes(q text, max_total_min integer DEFAULT NULL::integer, max_prep_min integer DEFAULT NULL::integer, cuisine_slugs text[] DEFAULT NULL::text[], diet_slugs text[] DEFAULT NULL::text[], exclude_allergen_slugs text[] DEFAULT NULL::text[], max_spice smallint DEFAULT NULL::smallint, min_calories numeric DEFAULT NULL::numeric, max_calories numeric DEFAULT NULL::numeric, min_protein_g numeric DEFAULT NULL::numeric, max_protein_g numeric DEFAULT NULL::numeric, min_carbs_g numeric DEFAULT NULL::numeric, max_carbs_g numeric DEFAULT NULL::numeric, min_fat_g numeric DEFAULT NULL::numeric, max_fat_g numeric DEFAULT NULL::numeric, result_limit integer DEFAULT 24, cursor_score double precision DEFAULT NULL::double precision, cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, slug text, title text, servings integer, total_time_min integer, calories numeric, image_url text, score double precision, match_kind text)
 LANGUAGE plpgsql
 STABLE
 SET "pg_trgm.word_similarity_threshold" TO '0.4'
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
  with cand as (
    select
      r.id, r.slug, r.title, r.servings, r.total_time_min, r.calories, r.image_url,
      r.has_photo,
      ((case when v_mode = 'text'
        then ts_rank('{0.1, 0.2, 0.4, 1.0}'::real[], r.search_vector, v_tsq, 1 | 32)::double precision
        else word_similarity(v_fold, search_fold(r.title))::double precision
      end)
      -- Known-fit rows first: unknown on an active range filter => offset into [-1,0).
      - (case when
             (max_total_min is not null and (r.total_time_min is null or r.total_time_min = 0))
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
               where  rd.recipe_id = r.id and d.slug = want.slug)))
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
$function$;

commit;
