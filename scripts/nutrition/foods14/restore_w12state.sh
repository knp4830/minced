#!/usr/bin/env bash
# Wave 14 test database: a throwaway restore of the 2026-10-22 snapshot with the "Wave 12" ordered steps of scripts/nutrition/LIVE-STEPS.md applied,
# so it matches live (the snapshot predates them). Never touches live. Prints the connection string.
#   bash scripts/nutrition/foods14/restore_w12state.sh <container-name> [repo-root]
# Steps: restore .snapshot/live.sql; migration 20261022140000_me_day_log; seed-allergen-tags; seed-nutrition-w12-foods; seed-ingredients-w12;
#        seed-originals-w12; seed-cuisine-backfill-w12; ANALYZE; SET jit = off; refresh_all_recipe_nutrients() (about 4 minutes).
set -euo pipefail
NAME="${1:?container name required}"
ROOT="${2:-$(cd "$(dirname "$0")/../../.." && pwd)}"
SNAP="${W14_SNAPSHOT_DIR:-/c/Users/Kevin Pham/minced/.snapshot}"
URL="$(bash "$SNAP/restore.sh" "$NAME")"
apply() { docker exec -i "$NAME" psql -q -U postgres -v ON_ERROR_STOP=1 < "$1" >/dev/null; echo "applied $1"; }
cd "$ROOT"
apply supabase/migrations/20261022140000_me_day_log.sql
apply supabase/seed-allergen-tags.sql
apply supabase/seed-nutrition-w12-foods.sql
apply supabase/seed-ingredients-w12.sql
apply supabase/seed-originals-w12.sql
apply supabase/seed-cuisine-backfill-w12.sql
printf 'ANALYZE;\nSET jit = off;\nSELECT refresh_all_recipe_nutrients();\nANALYZE;\n' | docker exec -i "$NAME" psql -q -U postgres -v ON_ERROR_STOP=1 >/dev/null
echo "$URL"
