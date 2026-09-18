#!/usr/bin/env bash
# Ingredient coverage report (M1.5.1).
#
#   ./scripts/ingredient-coverage.sh path/to/raw-ingredient-names.txt
#   cat names.txt | ./scripts/ingredient-coverage.sh
#
# One raw ingredient NAME per line -- not a whole ingredient line. Parsing
# "2 cloves garlic, minced" down to "garlic" is M1.5.2's job; this measures
# whether the vocabulary can resolve the names once you have them.
#
# WHY THIS EXISTS: an unresolved ingredient does not error. It just silently
# fails to match, and the pantry matcher quietly gets worse. Without a number,
# "did M1.5.1 work?" is unanswerable. This is also the import gate -- CLAUDE.md
# requires a recipe with any unresolved ingredient to be REJECTED, not warned
# about, so an importer runs this same function and refuses the recipe.
set -euo pipefail
cd "$(dirname "$0")/.."

# An explicitly exported DATABASE_URL wins over .env.local, so this can be
# pointed at a throwaway container for testing without editing the env file.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  set -a && . ./.env.local && set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. See scripts/db-seed.sh for where to get it." >&2
  exit 1
fi

INPUT="${1:--}"

run_psql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
  else
    docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
  fi
}

{
  cat <<'SQL'
create temp table _probe (raw_name text);
\copy _probe (raw_name) from stdin
SQL
  # Strip blank lines and surrounding whitespace so a stray newline is not
  # reported as an unresolved ingredient.
  sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^$/d' "$INPUT"
  cat <<'SQL'
\.

\echo ''
\echo '=== COVERAGE ==='
with resolved as (
  select p.raw_name, c.ingredient_id, c.canonical_name, c.match_kind, c.confidence
  from _probe p
  join lateral ingredient_coverage(array[p.raw_name]) c on true
)
select
  count(*)                                                   as names,
  count(ingredient_id)                                       as resolved,
  count(*) - count(ingredient_id)                            as unresolved,
  round(100.0 * count(ingredient_id) / nullif(count(*),0), 1) as pct_resolved,
  count(*) filter (where match_kind = 'exact')               as by_exact,
  count(*) filter (where match_kind = 'alias')               as by_alias,
  count(*) filter (where match_kind = 'fuzzy')               as by_fuzzy
from resolved;

\echo ''
\echo '=== UNRESOLVED -- every one of these is a recipe an importer must reject ==='
select distinct p.raw_name
from _probe p
join lateral ingredient_coverage(array[p.raw_name]) c on true
where c.ingredient_id is null
order by 1;

\echo ''
\echo '=== FUZZY -- resolved, but by guess. Review before trusting; each one is'
\echo '    either a missing alias to add, or a wrong match to block. ==='
select p.raw_name, c.canonical_name, round(c.confidence::numeric, 2) as confidence
from _probe p
join lateral ingredient_coverage(array[p.raw_name]) c on true
where c.match_kind = 'fuzzy'
order by c.confidence asc, p.raw_name;
SQL
} | run_psql
