#!/usr/bin/env bash
# Build the wave 10/11 state on a snapshot container, then (optionally) this lane's migrations and seeds.
#   bash scripts/allergens/build-db.sh <container> base      # wave 10+11 migrations and seeds (LIVE-STEPS order)
#   bash scripts/allergens/build-db.sh <container> lane       # this lane's migrations and seeds on top
set -u
N="${1:?container}"; MODE="${2:-base}"
LOG="${TMPDIR:-/tmp}/allergens-build"; mkdir -p "$LOG"
run() { docker exec -i "$N" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1" > "$LOG/$(basename "$1").log" 2>&1 || { echo "FAIL $1"; tail -8 "$LOG/$(basename "$1").log"; return 1; }; echo "ok $1"; }
if [ "$MODE" = base ]; then
  for m in 20261017120000 20261017120100 20261017120200 20261017150000 20261017150100 20261017160000 20261017160100 20261017170000 20261017180000 20261017190000; do
    run supabase/migrations/${m}_*.sql || exit 1
  done
  for s in seed-nutrition-usda-1-foods seed-nutrition-usda-2-nutrients-01 seed-nutrition-usda-3-links seed-ingredients-world seed-nutrition-world seed-nutrition-branded-extra seed-nutrition-zz-integration seed-nutrition-zy-replacements seed-nutrition-zzz-corrections seed-nutrition-zzzz-recipe-audit; do
    run supabase/$s.sql || exit 1
  done
else
  for f in supabase/migrations/2026101812*.sql; do run "$f" || exit 1; done
  for f in supabase/seed-allergens-split.sql supabase/seed-allergen-tags.sql supabase/seed-diet-tags.sql; do [ -f "$f" ] && { run "$f" || exit 1; }; done
fi
