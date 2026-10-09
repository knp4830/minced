#!/usr/bin/env bash
# Applies the wave-1 content data files, in dependency order, to $DATABASE_URL.
#
#   bash scripts/content/apply.sh
#
# Order matters, and the later files refuse to run without the earlier ones:
#
#   1. seed-ingredients.sql        the vocabulary (adds ~90 world-cuisine rows)
#   2. seed-allergens.sql          ingredient -> allergen; fans out to every recipe
#   3. seed-cuisines.sql           cuisine rows, and cuisine tags on 130 USDA recipes
#   4. seed-original-recipes.sql   the 100 original recipes + their diet tags
#
# Every file is idempotent, so running this twice changes nothing the second time.
# It writes to whatever database $DATABASE_URL names -- point it at a throwaway
# container first and at live only at
# integration.
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

FILES="supabase/seed-ingredients.sql supabase/seed-allergens.sql supabase/seed-cuisines.sql supabase/seed-original-recipes.sql"

run_sql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$1"
  else
    # Piping on stdin: none of these files use client-side \copy.
    docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f - < "$1"
  fi
}

for f in $FILES; do
  echo "--> $f" >&2
  run_sql "$f"
done
