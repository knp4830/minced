#!/usr/bin/env bash
# Apply the world seeds twice (idempotency) to the "seedtest" database and run checks.sql. Usage: bash run_seed_test.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
DB_CT="${W10_CONTAINER:-w10-world-db}"
run() { docker exec -i "$DB_CT" psql -U postgres -d seedtest -q -v ON_ERROR_STOP=1 "$@"; }
before="$(docker exec "$DB_CT" psql -U postgres -d seedtest -At -c "select pg_database_size('seedtest')")"
run < "$ROOT/supabase/seed-ingredients-world.sql"
run < "$ROOT/supabase/seed-nutrition-world.sql"
c1="$(docker exec "$DB_CT" psql -U postgres -d seedtest -At -c "select (select count(*) from ingredients)||'/'||(select count(*) from ingredient_aliases)||'/'||(select count(*) from usda_foods)||'/'||(select count(*) from usda_food_nutrients)||'/'||(select count(*) from ingredient_foods)||'/'||(select count(*) from ingredient_portions)")"
run < "$ROOT/supabase/seed-ingredients-world.sql"
run < "$ROOT/supabase/seed-nutrition-world.sql"
c2="$(docker exec "$DB_CT" psql -U postgres -d seedtest -At -c "select (select count(*) from ingredients)||'/'||(select count(*) from ingredient_aliases)||'/'||(select count(*) from usda_foods)||'/'||(select count(*) from usda_food_nutrients)||'/'||(select count(*) from ingredient_foods)||'/'||(select count(*) from ingredient_portions)")"
echo "counts after run 1: $c1"
echo "counts after run 2: $c2"
[ "$c1" = "$c2" ] && echo "IDEMPOTENT: yes" || { echo "IDEMPOTENT: NO"; exit 1; }
after="$(docker exec "$DB_CT" psql -U postgres -d seedtest -At -c "select pg_database_size('seedtest')")"
echo "database size: $before -> $after bytes (added $(( (after - before) / 1024 )) KB)"
docker exec -i "$DB_CT" psql -U postgres -d seedtest -v ON_ERROR_STOP=0 -P pager=off < "$HERE/checks.sql"
