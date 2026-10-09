#!/usr/bin/env bash
# USDA MyPlate Kitchen import, end to end (M1.5.3).
#
#   bash scripts/myplate/fetch.sh          # once: download the archived pages
#   bash scripts/myplate/import.sh         # extract -> parse -> resolve -> load
#
# Stages, each leaving an artifact you can inspect:
#
#   extract.py       cached HTML      -> artifacts/recipes.json
#   build_import.py  + parsed lines   -> artifacts/import.sql
#   psql             resolve + gate   -> the database, plus two CSV queues
#
# The gate lives in SQL because resolve_ingredient() and resolve_unit() do.
# A recipe with any unresolved ingredient is REJECTED into
# artifacts/rejected-recipes.csv rather than imported broken (CLAUDE.md).
#
# Idempotent and resumable: recipes upsert by slug, children are rebuilt.
set -euo pipefail
cd "$(dirname "$0")/../.."

# An explicitly exported DATABASE_URL wins over .env.local, so this can be
# pointed at a throwaway container for testing without editing the env file.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  set -a && . ./.env.local && set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. See scripts/db-seed.sh." >&2
  exit 1
fi

if [ ! -d scripts/myplate/cache ] || [ -z "$(ls -A scripts/myplate/cache/*.html 2>/dev/null)" ]; then
  echo "No cached pages. Run: bash scripts/myplate/fetch.sh" >&2
  exit 1
fi

mkdir -p scripts/myplate/artifacts

echo "--> extracting" >&2
python3 scripts/myplate/extract.py > scripts/myplate/artifacts/recipes.json

echo "--> parsing and building SQL" >&2
python3 scripts/myplate/build_import.py

echo "--> loading" >&2
if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/myplate/artifacts/import.sql
else
  # Piping the SQL in on stdin cannot work here: it contains \copy, which psql
  # resolves against the CLIENT's filesystem. So the repo is mounted and the
  # container's working directory is set to match, keeping every relative path
  # in the generated SQL valid inside the container.
  docker run --rm -i \
    -v "$PWD:/repo" \
    -w /repo \
    postgres:16-alpine \
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/myplate/artifacts/import.sql
fi

echo "" >&2
echo "Queues written to scripts/myplate/artifacts/:" >&2
echo "  rejected-recipes.csv      recipes not imported, with reasons" >&2
echo "  unresolved-ingredients.csv  names to add aliases for, by frequency" >&2
