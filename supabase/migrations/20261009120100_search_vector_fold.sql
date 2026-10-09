-- M3.5 -- the search document: accent-folded, and a trigram index for typos.
--
-- Two changes to what is indexed, nothing about how results are ranked (that is
-- search_recipes, next migration).
--
-- 1. FOLD ACCENTS in the tsvector. The catalog has "Chickpeas and Spinach
--    Sauté" and "Curtido Salvadoreño". Nobody types the accent, and Postgres's
--    'english' text-search config does not fold it, so "saute" would find
--    nothing. Folding on both sides (document here, query in search_tsquery)
--    makes accent a non-issue. Same translate() table as
--    normalize_ingredient_name, for the same reason it is not unaccent():
--    unaccent() is STABLE, and an index expression must be IMMUTABLE.
--
-- 2. A TRIGRAM index on the folded title. This is the typo fallback: when no
--    recipe contains the query's words, we compare the query's 3-letter chunks
--    against titles. "shakshouka" shares most trigrams with "shakshuka"; a
--    full-text index (which compares whole stemmed words) sees no relation at
--    all. See search_recipes for the tradeoff.

begin;

create or replace function search_fold(raw text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select translate(
    lower(raw),
    'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿšžœæ',
    'aaaaaaaeeeeeiiiiiooooooouuuuuncyyszoa'
  );
$$;

comment on function search_fold(text) is
  'Lowercase and fold accents. IMMUTABLE via translate() so it can sit inside '
  'an index expression (unaccent() is STABLE and cannot). Applied to both the '
  'indexed document and the user''s query -- only consistency matters.';

-- The document. Pulled out of the trigger so the backfill below and the trigger
-- cannot drift apart.
--
--   A (1.0)  title                       "cacio" -> Cacio e Pepe beats everything
--   B (0.4)  canonical ingredient names  "chickpea" -> recipes that USE chickpeas
--   C (0.2)  cuisine + diet tags         "korean", "vegan"
--
-- The numbers are ts_rank's default weights, spelled out in search_recipes.
create or replace function compute_recipe_search_vector(
  p_recipe_id  uuid,
  p_title      text,
  p_cuisine_id integer
)
returns tsvector
language sql
stable
as $$
  select
       setweight(to_tsvector('english', search_fold(coalesce(p_title, ''))), 'A')
    || setweight(to_tsvector('english', search_fold(coalesce((
         -- ORDER BY is not decoration: without it the aggregation order is
         -- whatever the plan produces, so two calls can store different
         -- word positions for identical data.
         select string_agg(i.canonical_name::text, ' ' order by ri.sort_order, ri.id)
         from   recipe_ingredients ri
         join   ingredients i on i.id = ri.ingredient_id
         where  ri.recipe_id = p_recipe_id
       ), ''))), 'B')
    || setweight(to_tsvector('english', search_fold(concat_ws(' ',
         (select c.name from cuisines c where c.id = p_cuisine_id),
         (select string_agg(d.name, ' ' order by d.name)
          from   recipe_diets rd
          join   diets d on d.id = rd.diet_id
          where  rd.recipe_id = p_recipe_id)
       ))), 'C');
$$;

-- Same behaviour as M1.2 (updated_at, published_at, search_vector); only the
-- vector expression moved into compute_recipe_search_vector.
create or replace function trg_recipes_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  new.search_vector :=
    compute_recipe_search_vector(new.id, new.title, new.cuisine_id);

  return new;
end;
$$;

-- Rebuild every stored vector with the folded definition. The BEFORE trigger is
-- switched off for this one statement: with it on, the backfill would also
-- stamp updated_at = now() on every recipe, claiming all 878 were edited today.
alter table recipes disable trigger recipes_before_write;

update recipes
   set search_vector = compute_recipe_search_vector(id, title, cuisine_id);

alter table recipes enable trigger recipes_before_write;

-- Typo fallback. Expression index on the FOLDED title so the query side
-- (search_fold(q) <% search_fold(title)) can use it.
create index recipes_title_trgm_idx
  on recipes using gin (search_fold(title) gin_trgm_ops);

commit;
