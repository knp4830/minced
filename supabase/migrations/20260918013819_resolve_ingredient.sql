-- M1.5.1 -- ingredient resolution.
--
-- The tables (ingredients, ingredient_aliases) and their trigram indexes were
-- created in M1.2. This migration adds the thing that reads them: a resolver
-- that turns whatever a human or an importer typed into a canonical id.
--
-- Why this lives in Postgres and not in TypeScript:
--
--   Fuzzy matching in JS means SELECT every ingredient, ship ~400 rows over the
--   wire, and score them in Node -- per keystroke, per user. pg_trgm scores them
--   against a GIN index next to the data, and returns one row. CLAUDE.md's "never
--   fetch all rows and filter in JavaScript" is exactly this case.
--
-- What a trigram is: pg_trgm chops a string into overlapping 3-character runs.
--   "scallion" -> {"  s"," sc","sca","cal","all","lli","lio","ion","on "}
-- Similarity is the overlap between two strings' trigram sets, 0.0 to 1.0. That
-- is why it survives typos, plurals and transposed letters -- a wrong character
-- damages three trigrams, not the whole string. The GIN index stores the
-- trigrams, so Postgres never has to score rows that share none.

begin;

-- ---------------------------------------------------------------------------
-- How a match was made. Callers need this: an importer may accept 'exact' and
-- 'alias' silently but must queue 'fuzzy' for human review, and CLAUDE.md
-- requires a recipe with unresolved lines to be REJECTED, not warned about.
-- ---------------------------------------------------------------------------
create type ingredient_match_kind as enum ('exact', 'alias', 'fuzzy');

-- ---------------------------------------------------------------------------
-- Normalisation. Runs on both sides of every comparison, so the rules only have
-- to be consistent, not clever.
--
--   "  Garlic Cloves! " -> "garlic cloves"
--   "half-and-half"     -> "half and half"
--
-- IMMUTABLE is not decoration: it is what lets us index the expression below.
-- Postgres will only cache a function's result in an index if the function
-- promises the same input always yields the same output.
-- ---------------------------------------------------------------------------
create or replace function normalize_ingredient_name(raw text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(lower(raw), '[^a-z0-9]+', ' ', 'g'),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function normalize_ingredient_name(text) is
  'Lowercase, strip punctuation to spaces, collapse whitespace. Applied to both '
  'the probe and the stored name so equality means "the same words".';

-- ---------------------------------------------------------------------------
-- Crude singulariser. Deliberately crude: it only has to catch the plurals that
-- recipe writers actually produce ("tomatoes", "berries", "eggs"). Anything
-- irregular -- leaf/leaves, of which the kitchen has few -- is handled by an
-- explicit alias row instead, where it is visible and reviewable.
--
-- Guard: never shorten below 4 characters. Aggressive folding is safe here
-- because every exact pass probes BOTH the raw and the singularised form -- a
-- bad fold ("peas" -> "pea") simply matches nothing, while the raw probe still
-- matches "peas". The guard only stops the rule from eating short words whole.
-- ---------------------------------------------------------------------------
create or replace function singularize_ingredient_name(raw text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select case
    when length(raw) < 4                    then raw
    when raw ~ 'ies$'                       then left(raw, -3) || 'y'
    when raw ~ '(ch|sh|s|x|z)es$'           then left(raw, -2)
    when raw ~ 'oes$'                       then left(raw, -2)
    when raw ~ '[^s]s$'                     then left(raw, -1)
    else raw
  end;
$$;

comment on function singularize_ingredient_name(text) is
  'Best-effort plural fold for the exact-match pass. Irregular plurals belong in '
  'ingredient_aliases, not here.';

-- Expression indexes so the normalised exact-match passes stay index lookups
-- rather than scans of every ingredient. At 400 rows this is invisible; at the
-- vocabulary size a 1,500-recipe catalog needs, it is not.
create index ingredients_normalized_name_idx
  on ingredients (normalize_ingredient_name(canonical_name::text));

create index ingredient_aliases_normalized_idx
  on ingredient_aliases (normalize_ingredient_name(alias::text));

-- ---------------------------------------------------------------------------
-- resolve_ingredient(raw_name) -- the function M1.5.1 exists to deliver.
--
-- Four passes, most-trustworthy first, returning on the first hit:
--
--   1. exact   canonical_name, normalised
--   2. exact   canonical_name, normalised + singularised
--   3. alias   same two probes against ingredient_aliases
--   4. fuzzy   best trigram similarity across BOTH tables, if above threshold
--
-- Returns zero rows when nothing clears the bar. Zero rows is the "unresolved"
-- signal, and callers must treat it as a rejection -- an unresolved ingredient
-- does not error, it silently shrinks the match rate.
--
-- min_similarity defaults to 0.45. Lower admits nonsense ("garlic" ~ "garlic
-- powder" ~ "gherkin"); higher rejects real typos. It is a parameter so the
-- importer can demand more confidence than the autocomplete does.
-- ---------------------------------------------------------------------------
create or replace function resolve_ingredient(
  raw_name       text,
  min_similarity real default 0.45
)
returns table (
  ingredient_id  integer,
  canonical_name citext,
  match_kind     ingredient_match_kind,
  confidence     real
)
language plpgsql
stable
parallel safe
as $$
declare
  probe    text := normalize_ingredient_name(raw_name);
  probe_s  text;
begin
  if probe is null then
    return;
  end if;

  probe_s := singularize_ingredient_name(probe);

  -- 1 + 2. Exact on the canonical name. Confidence 1.0: this is not a guess.
  return query
    select i.id, i.canonical_name, 'exact'::ingredient_match_kind, 1.0::real
    from ingredients i
    where normalize_ingredient_name(i.canonical_name::text) in (probe, probe_s)
    order by (normalize_ingredient_name(i.canonical_name::text) = probe) desc
    limit 1;
  if found then return; end if;

  -- 3. Exact on a curated alias. Also 1.0 -- a human asserted this equivalence.
  return query
    select i.id, i.canonical_name, 'alias'::ingredient_match_kind, 1.0::real
    from ingredient_aliases a
    join ingredients i on i.id = a.ingredient_id
    where normalize_ingredient_name(a.alias::text) in (probe, probe_s)
    order by (normalize_ingredient_name(a.alias::text) = probe) desc
    limit 1;
  if found then return; end if;

  -- 4. Trigram. Both tables compete; the best score anywhere wins.
  return query
    select c.id, c.canonical_name, 'fuzzy'::ingredient_match_kind, c.sim
    from (
      select i.id, i.canonical_name, similarity(i.canonical_name::text, probe) as sim
      from ingredients i
      union all
      select i.id, i.canonical_name, similarity(a.alias::text, probe) as sim
      from ingredient_aliases a
      join ingredients i on i.id = a.ingredient_id
    ) c
    where c.sim >= min_similarity
    order by c.sim desc, c.canonical_name
    limit 1;
end;
$$;

comment on function resolve_ingredient(text, real) is
  'Resolve free text to a canonical ingredient. Returns zero rows when '
  'unresolved -- callers must reject, not warn. See CLAUDE.md, import rule.';

-- ---------------------------------------------------------------------------
-- The coverage metric.
--
-- This is the other half of M1.5.1, and the half that is easy to skip. An
-- unresolved ingredient throws no error; it just quietly fails to match. Without
-- a way to ask "what fraction of these lines resolved, and which ones did not",
-- there is no way to know whether the vocabulary is any good.
--
-- Same function serves two callers: the import gate (reject any recipe with an
-- unresolved line) and the vocabulary report (which misses are worth curating).
-- ---------------------------------------------------------------------------
create or replace function ingredient_coverage(
  raw_names      text[],
  min_similarity real default 0.45
)
returns table (
  raw_name       text,
  ingredient_id  integer,
  canonical_name citext,
  match_kind     ingredient_match_kind,
  confidence     real
)
language sql
stable
parallel safe
as $$
  select n.raw_name, r.ingredient_id, r.canonical_name, r.match_kind, r.confidence
  from unnest(raw_names) as n(raw_name)
  left join lateral resolve_ingredient(n.raw_name, min_similarity) r on true;
$$;

comment on function ingredient_coverage(text[], real) is
  'Resolve a batch and keep the misses. LEFT JOIN LATERAL is load-bearing: an '
  'unresolved name must come back as a NULL row, not vanish from the result.';

commit;
