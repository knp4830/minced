-- Wave 2 / matcher quality -- search_recipes adopts the contract's NULL semantics.
--
-- Same signature as 20261009120200 (so CREATE OR REPLACE, no overload), same
-- ranking, same cursor. What changes is the range filters:
--
--   BEFORE  r.total_time_min <= x          NULL fails; 0 ("unknown") passes as "instant"
--   AFTER   unknown (NULL, or 0 for time) PASSES
--
-- 670 of 978 recipes have no time, 100 no calories/protein, 872 no spice level.
-- Under the old comparison "under 30 minutes" silently deleted 70% of the
-- catalog, and "0 minutes" was treated as faster than everything.
--
-- SORT-AFTER: a recipe that passes ONLY because a value is unknown must not
-- outrank one that verifiably fits. Within the keyset ordering (score desc,
-- id desc) that is done by subtracting 1 from the score of any row that is
-- unknown on an ACTIVE range filter: relevance scores live in [0,1), so unknown
-- rows land in [-1,0) -- strictly after every known row, still ordered among
-- themselves by relevance, and the (score, id) cursor keeps working unchanged
-- (it compares doubles; negatives are fine). With no range filter active no
-- row is offset and scores are byte-identical to before.
--
-- Categorical filters (cuisine, diet, allergen) are unchanged: a recipe with no
-- cuisine does not match "Italian".

begin;

create or replace function search_recipes(
  q                      text,
  max_total_min          integer  default null,
  max_prep_min           integer  default null,
  cuisine_slugs          text[]   default null,
  diet_slugs             text[]   default null,
  exclude_allergen_slugs text[]   default null,
  max_spice              smallint default null,
  min_calories           numeric  default null,
  max_calories           numeric  default null,
  min_protein_g          numeric  default null,
  max_protein_g          numeric  default null,
  min_carbs_g            numeric  default null,
  max_carbs_g            numeric  default null,
  min_fat_g              numeric  default null,
  max_fat_g              numeric  default null,
  result_limit           integer  default 24,
  cursor_score           double precision default null,
  cursor_id              uuid     default null
)
returns table (
  id             uuid,
  slug           text,
  title          text,
  servings       integer,
  total_time_min integer,
  calories       numeric,
  image_url      text,
  score          double precision,
  match_kind     text
)
language plpgsql
stable
set pg_trgm.word_similarity_threshold = '0.4'
as $$
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
      (case when v_mode = 'text'
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
         then 1.0 else 0.0 end)::double precision as score
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
  where  cursor_score is null
      or (c.score, c.id) < (cursor_score, cursor_id)
  order  by c.score desc, c.id desc
  limit  v_limit;
end;
$$;

comment on function search_recipes is
  'Ranked recipe search. Weighted full-text (title > ingredients > cuisine/diet) '
  'with a title-only trigram fallback. Cursor = last row (score, id). Range '
  'filters pass unknown values and rank them after known fits (score offset by '
  '-1). RLS applies.';

commit;
