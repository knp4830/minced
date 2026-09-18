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

# Report what is actually in the database, not a hardcoded sentence that goes
# stale the first time someone adds an ingredient. A summary line that lies is
# worse than no summary line.
SUMMARY_SQL="select 'Seeded. ' || (select count(*) from ingredients) || ' ingredients, ' || (select count(*) from ingredient_aliases) || ' aliases, ' || (select count(*) from recipes) || ' recipes.'"

if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -tAq -c "$SUMMARY_SQL"
else
  docker run --rm -i postgres:16-alpine psql "$DATABASE_URL" -tAq -c "$SUMMARY_SQL"
fi
