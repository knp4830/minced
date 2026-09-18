#!/usr/bin/env bash
# End-to-end check: raw ingredient LINES -> parsed fields -> canonical ids.
#
#   bash scripts/parse-and-resolve.sh fixtures/ingredient-lines.txt
#
# This is the seam between M1.5.2 (parse) and M1.5.1 (resolve), and it is what
# M1.5.3's importer will do for real:
#
#   "2 cloves garlic, minced"  -- parser -->  name="garlic", qty=2, unit=cloves
#   "garlic"                   -- resolve --> ingredient_id 5
#
# It reports three things, because three different things can silently fail:
#
#   1. PARSE REVIEW   lines the model was not confident about
#   2. NAME COVERAGE  names that did not resolve to a canonical ingredient
#   3. UNIT COVERAGE  units the `units` table cannot represent
#
# None of these throw. That is the whole point -- each one degrades the catalog
# quietly, so each one gets a number.
set -euo pipefail
cd "$(dirname "$0")/.."

# An explicitly exported DATABASE_URL wins over .env.local, so this can be
# pointed at a throwaway container for testing without editing the env file.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  set -a && . ./.env.local && set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. See scripts/db-seed.sh." >&2
  exit 1
fi

INPUT="${1:-}"
if [ -z "$INPUT" ] || [ ! -f "$INPUT" ]; then
  echo "usage: bash scripts/parse-and-resolve.sh <file-of-raw-ingredient-lines>" >&2
  exit 1
fi

for tool in jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool is required but not installed." >&2; exit 1; }
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

run_psql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
  else
    docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q
  fi
}

# 1. Raw lines -> JSON array -> parser. Blank lines dropped so a trailing
#    newline is not reported as an unparseable ingredient.
jq -R -s 'split("\n") | map(select(. != ""))' < "$INPUT" > "$WORK/lines.json"
bash scripts/parser/run.sh < "$WORK/lines.json" > "$WORK/parsed.json"

TOTAL=$(jq 'length' "$WORK/parsed.json")
FLAGGED=$(jq '[.[] | select(.needs_review)] | length' "$WORK/parsed.json")

echo ""
echo "=== 1. PARSE ==="
echo "lines parsed: $TOTAL    flagged for review: $FLAGGED"
if [ "$FLAGGED" -gt 0 ]; then
  echo ""
  jq -r '.[] | select(.needs_review)
         | "  [\(.confidence | tostring | .[0:5])] \(.raw)\n      -> \(.review_reasons | join("; "))"' \
     "$WORK/parsed.json"
fi

# 2 + 3. Feed the parsed names and units to the database.
#
# `.names[0].text` on purpose: a line yielding several names is already flagged
# above, and taking only the first keeps this report honest about what an
# importer would actually store.
jq -r '.[] | select(.names | length > 0) | .names[0].text' "$WORK/parsed.json" > "$WORK/names.txt"
jq -r '.[] | select(.unit != null) | .unit' "$WORK/parsed.json" | sort -u > "$WORK/units.txt"

{
  echo "create temp table _name (raw_name text);"
  echo "\\copy _name (raw_name) from stdin"
  cat "$WORK/names.txt"
  echo "\\."
  echo "create temp table _unit (parsed_unit text);"
  echo "\\copy _unit (parsed_unit) from stdin"
  cat "$WORK/units.txt"
  echo "\\."
  cat <<'SQL'

\echo ''
\echo '=== 2. NAME COVERAGE ==='
select
  count(*)                                                    as names,
  count(c.ingredient_id)                                      as resolved,
  count(*) - count(c.ingredient_id)                           as unresolved,
  round(100.0 * count(c.ingredient_id) / nullif(count(*),0),1) as pct,
  count(*) filter (where c.match_kind = 'fuzzy')              as by_fuzzy
from _name n
join lateral ingredient_coverage(array[n.raw_name]) c on true;

\echo ''
\echo '-- unresolved names (an importer must REJECT these recipes) --'
select distinct n.raw_name
from _name n
join lateral ingredient_coverage(array[n.raw_name]) c on true
where c.ingredient_id is null
order by 1;

\echo ''
\echo '-- resolved by guess: add an alias, or block the match --'
select n.raw_name, c.canonical_name, round(c.confidence::numeric,2) as confidence
from _name n
join lateral ingredient_coverage(array[n.raw_name]) c on true
where c.match_kind = 'fuzzy'
order by c.confidence, n.raw_name;

\echo ''
\echo '=== 3. UNIT COVERAGE ==='
\echo '-- parsed units with no row in `units`. Each needs a mapping in M1.5.3 --'
select u.parsed_unit
from _unit u
left join units x on lower(x.name) = lower(u.parsed_unit)
where x.id is null
order by 1;
SQL
} | run_psql
