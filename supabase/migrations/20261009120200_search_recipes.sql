-- M3.5 -- search_recipes: ranked full-text search with a typo fallback.
--
-- Door 2 of the product. The user knows the dish and types its name.
--
-- WHAT A tsvector IS
--   to_tsvector('english', 'Pasta with Chickpeas') ->  'chickpea':3 'pasta':1
--   Words are lowercased, stop-words ("with") dropped, and reduced to a stem
--   ("chickpeas" -> "chickpea"), each with its position. A tsquery is the same
--   treatment applied to what the user typed. Matching is `vector @@ query`.
--   That is why plurals work for free: both sides are stemmed.
--
-- WHAT THE WEIGHTS DO
--   setweight(..., 'A'|'B'|'C') labels every word in the vector with where it
--   came from (see compute_recipe_search_vector). ts_rank multiplies each match
--   by its label's weight, so a title hit (A, 1.0) outranks an ingredient hit
--   (B, 0.4) outranks a cuisine/diet hit (C, 0.2).
--
-- WHY GIN
--   A GIN (generalised inverted) index is a book index: word -> list of rows
--   containing it. "chickpea" is looked up directly instead of scanning every
--   recipe's vector. A B-tree can order whole values but cannot answer "which
--   rows contain this ELEMENT of a set", which is what a tsvector is.
--
-- THE TWO MODES, AND THE TRADEOFF
--   1. 'text'  - stemmed full-text match, ranked by ts_rank. Used whenever at
--                least one recipe in the catalog contains the query's words.
--   2. 'fuzzy' - pg_trgm word_similarity against the title, used ONLY when
--                mode 1 finds nothing anywhere in the catalog. "shakshouka"
--                -> Shakshuka.
--
--   The tradeoff: the fallback is TITLE-ONLY and all-or-nothing per query.
--     + Cheap and predictable: a correctly spelled query never gets fuzzy
--       noise mixed into good results, and the common path stays a pure
--       index lookup.
--     - A typo in a word that only appears in ingredients ("chikpeas") is
--       corrected only if some title is also similar. A query where one word
--       is right and one is misspelled ("chicken soupp") works only because
--       the title as a whole is similar enough.
--     - We did not do per-word correction against a vocabulary table (the
--       "did you mean" approach); it handles more typos but needs its own
--       table kept in sync with the catalog. Worth revisiting if search logs
--       show title-only fuzziness missing real queries.
--   The mode is decided against the WHOLE catalog, not the filtered set, so
--   "pasta" + "under 5 minutes" returns an honest empty list instead of
--   quietly switching to look-alike spellings of "pasta".
--
-- PARTIAL WORDS
--   The LAST word of the query is a prefix match ("cac" -> cacio), the earlier
--   words are whole stems. That is typeahead semantics: a finished word is
--   finished, the word being typed is not.
--
-- CURSOR PAGINATION
--   Ordered by (score DESC, id DESC); the cursor is the last row's (score, id).
--   `score` alone is not unique, and ties are common, so id is the tiebreak
--   (SCHEMA-NOTES.md, gotcha 4).
--
-- RLS
--   SECURITY INVOKER (the default): the caller sees exactly the recipes RLS
--   lets them read -- published ones, plus their own drafts. There is
--   deliberately no `status = 'published'` here; see recipes.ts for why a
--   second copy of that rule would drift.

begin;

-- Turn what a human typed into a tsquery that cannot raise a syntax error.
--
-- to_tsquery() throws on input like "mac & cheese (" or "a:b"; passing user
-- text straight to it is a 500 waiting to happen. websearch_to_tsquery() is
-- safe but has no prefix operator. So: tokenise ourselves to [a-z0-9] words
-- and build the query from quoted literals.
create or replace function search_tsquery(q text)
returns tsquery
language plpgsql
stable
strict
parallel safe
as $$
declare
  toks   text[];
  n      integer;
  i      integer;
  part   tsquery;
  result tsquery;
begin
  toks := regexp_split_to_array(
            btrim(regexp_replace(search_fold(q), '[^a-z0-9]+', ' ', 'g')),
            '\s+'
          );
  n := coalesce(array_length(toks, 1), 0);

  for i in 1 .. n loop
    -- Stop-words ("the", "with") stem to nothing; to_tsquery would NOTICE and
    -- return an empty query. Skip them quietly. Checked via to_tsvector.
    continue when toks[i] = '' or to_tsvector('english', toks[i]) = ''::tsvector;

    part := to_tsquery(
      'english',
      quote_literal(toks[i]) ||
        case when i = n and length(toks[i]) >= 2 then ':*' else '' end
    );
    result := case when result is null then part else result && part end;
  end loop;

  return result;   -- NULL when the query is empty or all stop-words
end;
$$;

comment on function search_tsquery(text) is
  'User text -> safe AND-ed tsquery; last word is a prefix match. NULL when '
  'nothing searchable remains (empty or only stop-words).';

create or replace function search_recipes(
  q                      text,
  -- Filters. Same names and semantics are intended for match_recipes (M3.4).
  max_total_min          integer  default null,   -- total_time_min <=
  max_prep_min           integer  default null,   -- prep_time_min  <=
  cuisine_slugs          text[]   default null,   -- any of
  diet_slugs             text[]   default null,   -- recipe must carry ALL
  exclude_allergen_slugs text[]   default null,   -- recipe must carry NONE
  max_spice              smallint default null,   -- spice_level <=
  min_calories           numeric  default null,
  max_calories           numeric  default null,
  min_protein_g          numeric  default null,
  max_protein_g          numeric  default null,
  min_carbs_g            numeric  default null,
  max_carbs_g            numeric  default null,
  min_fat_g              numeric  default null,
  max_fat_g              numeric  default null,
  -- Paging.
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
  match_kind     text            -- 'text' or 'fuzzy'
)
language plpgsql
stable
-- A trigram match needs a threshold. 0.4 (default 0.6) was chosen by running
-- the typo cases against the real catalog; see the wave-1 search report.
set pg_trgm.word_similarity_threshold = '0.4'
as $$
#variable_conflict use_column
declare
  v_fold  text := btrim(regexp_replace(search_fold(coalesce(q, '')), '[^a-z0-9]+', ' ', 'g'));
  v_tsq   tsquery;
  v_mode  text;
  v_limit integer := least(greatest(coalesce(result_limit, 24), 1), 100);
begin
  -- Empty search is browse's job (M3.1), not search's.
  if v_fold = '' then
    return;
  end if;

  v_tsq := search_tsquery(q);

  -- Only stop-words ("the", "with"): nothing meaningful to search for. Without
  -- this guard the trigram fallback would return look-alike titles.
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
      case when v_mode = 'text'
        -- {D,C,B,A}. 1 = divide by 1+log(document length), so a three-
        -- ingredient "Chickpea Dip" is not buried under a thirty-ingredient
        -- recipe that mentions chickpeas once; 32 = rank/(rank+1), which keeps
        -- scores in [0,1) and the cursor well-behaved.
        then ts_rank('{0.1, 0.2, 0.4, 1.0}'::real[], r.search_vector, v_tsq, 1 | 32)::double precision
        else word_similarity(v_fold, search_fold(r.title))::double precision
      end as score
    from recipes r
    where (
            (v_mode = 'text'  and r.search_vector @@ v_tsq)
         or (v_mode = 'fuzzy' and v_fold <% search_fold(r.title))
          )
      and (max_total_min is null or r.total_time_min <= max_total_min)
      and (max_prep_min  is null or r.prep_time_min  <= max_prep_min)
      and (max_spice     is null or r.spice_level    <= max_spice)
      and (min_calories  is null or r.calories  >= min_calories)
      and (max_calories  is null or r.calories  <= max_calories)
      and (min_protein_g is null or r.protein_g >= min_protein_g)
      and (max_protein_g is null or r.protein_g <= max_protein_g)
      and (min_carbs_g   is null or r.carbs_g   >= min_carbs_g)
      and (max_carbs_g   is null or r.carbs_g   <= max_carbs_g)
      and (min_fat_g     is null or r.fat_g     >= min_fat_g)
      and (max_fat_g     is null or r.fat_g     <= max_fat_g)
      and (cuisine_slugs is null or r.cuisine_id in (
             select c.id from cuisines c where c.slug = any (cuisine_slugs)))
      -- ALL diets: there must be no requested diet the recipe lacks.
      and (diet_slugs is null or not exists (
             select 1 from unnest(diet_slugs) as want(slug)
             where not exists (
               select 1
               from   recipe_diets rd
               join   diets d on d.id = rd.diet_id
               where  rd.recipe_id = r.id and d.slug = want.slug)))
      -- NONE of the allergens: NOT EXISTS, correlated on the recipe. A
      -- LEFT JOIN ... IS NULL or `NOT IN` over a nullable column both get this
      -- wrong in edge cases; NOT EXISTS is the form that cannot.
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
  'with a title-only trigram fallback when nothing matches by words. Cursor = '
  'last row (score, id). Composes with the M3.4 filter set. RLS applies.';

commit;
