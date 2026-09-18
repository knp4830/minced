#!/usr/bin/env bash
# Runs supabase/seed.sql against the database in $DATABASE_URL.
#
# Seeding must bypass RLS -- the publishable key has no write policies, by
# design -- so this connects directly to Postgres rather than through the API.
#
# Uses a local psql if you have one, otherwise borrows psql from a throwaway
# Docker container so there's nothing extra to install.
set -euo pipefail
cd "$(dirname "$0")/.."

# An explicitly exported DATABASE_URL wins over .env.local, so this can be
# pointed at a throwaway container for testing without editing the env file.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  set -a && . ./.env.local && set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<'MSG'
DATABASE_URL is not set.

Supabase dashboard -> Connect -> Session pooler -> copy the URI, then add it to
.env.local (which is gitignored):

  DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres

It contains your database password, so it never gets committed.
MSG
  exit 1
fi

# Order matters: seed-ingredients.sql establishes the canonical vocabulary, and
# seed.sql then upserts the mockup's own ingredients on top and hangs recipes off
# them. Running seed.sql alone still works -- it is self-contained -- but it would
# leave the catalog with 30 ingredients instead of 409.
SEEDS="supabase/seed-ingredients.sql supabase/seed.sql"

for seed in $SEEDS; do
  echo "--> $seed" >&2
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$seed"
  else
    echo "no local psql; using docker" >&2
    docker run --rm -i postgres:16-alpine \
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f - < "$seed"
  fi
done

echo "Seeded. 409 ingredients, 273 aliases, 6 recipes."
