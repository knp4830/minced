-- M1.5.3 -- fold accented characters in ingredient normalisation.
--
-- THE BUG
--
--   normalize_ingredient_name('Jalapeño Chilies')  ->  'jalape o chilies'
--   normalize_ingredient_name('crème fraîche')     ->  'cr me fra che'
--
-- The normaliser replaced everything outside [a-z0-9] with a space, which turns
-- an accented letter into a word break. The name does not fail to match -- it
-- matches a DIFFERENT, nonsense string, and the trigram tier may then resolve it
-- to something confidently wrong.
--
-- It matters beyond jalapeños: USDA MyPlate carries Spanish-language recipes,
-- and Tier 2 content will be full of crème, jalapeño, piña and açaí.
--
-- WHY translate() AND NOT unaccent()
--
-- The unaccent extension is the obvious tool and cannot be used here: it is
-- STABLE, not IMMUTABLE, because its behaviour depends on a loadable rules file.
-- Postgres will not build an expression index on a non-IMMUTABLE function, and
-- `ingredients_normalized_name_idx` depends on this one. translate() is a pure
-- character mapping, so it stays IMMUTABLE and the indexes keep working.
--
-- REINDEX BELOW IS NOT OPTIONAL. Changing the body of a function used in an
-- expression index leaves that index holding values computed by the OLD
-- definition. Postgres does not notice and does not rebuild it -- lookups would
-- silently miss. Any future change to this function must reindex too.

begin;

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
        regexp_replace(
          translate(
            lower(raw),
            'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿšžœæ',
            'aaaaaaaeeeeeiiiiiooooooouuuuuncyyszoa'
          ),
          '[^a-z0-9]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function normalize_ingredient_name(text) is
  'Lowercase, fold accents, strip punctuation to spaces, collapse whitespace. '
  'Applied to both the probe and the stored name so equality means "the same '
  'words". IMMUTABLE via translate() rather than unaccent() so expression '
  'indexes on it remain legal.';

-- Rebuild everything computed by the old definition.
reindex index ingredients_normalized_name_idx;
reindex index ingredient_aliases_normalized_idx;

commit;
