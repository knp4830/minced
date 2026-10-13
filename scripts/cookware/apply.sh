#!/usr/bin/env bash
# Applies the cookware backfill data file to $DATABASE_URL.
#
#   bash scripts/cookware/apply.sh
#
# Prerequisite: migration 20261013100000_cookware_vocabulary.sql is applied
# (`supabase db push`). The seed file is idempotent: a second run changes nothing.
# It writes to whatever database $DATABASE_URL names -- point it at a throwaway
# container first, and at live only at integration.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  set -a && . ./.env.local && set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. See scripts/db-seed.sh." >&2
  exit 1
fi

FILE=supabase/seed-cookware.sql
if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$FILE"
else
  docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f - < "$FILE"
fi
