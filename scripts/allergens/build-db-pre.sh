#!/usr/bin/env bash
# Applies the migrations a stale snapshot lacks (wave 7-9) before build-db.sh base. Each is skipped if it already applies badly.
#   bash scripts/allergens/build-db-pre.sh <container>
set -u
N="${1:?container}"
LOG="${TMPDIR:-/tmp}/allergens-build"; mkdir -p "$LOG"
for m in 20261014100100 20261014120000 20261014160000 20261015120000 20261016100000 20261017100000 20261017110000; do
  f=$(ls supabase/migrations/${m}_*.sql)
  if docker exec -i "$N" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$f" > "$LOG/pre-$m.log" 2>&1; then echo "ok $m"; else echo "FAIL $m"; tail -3 "$LOG/pre-$m.log"; fi
done
