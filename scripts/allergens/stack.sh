#!/usr/bin/env bash
# A private local Supabase stack for signed-in checks (docs/LESSONS.md section 10), unique project id and ports.
#   bash scripts/allergens/stack.sh start     # starts the stack in $SBW (default: scratch dir), loads the snapshot
#   bash scripts/allergens/stack.sh stop      # supabase stop --no-backup for THIS project id only
# Ports 55440-55449 and project id w10c-allergens, so it never touches another lane's stack.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SBW="${SBW:-${TMPDIR:-/tmp}/w10c-allergens-sbw}"
PID=w10c-allergens
cmd="${1:-start}"
if [ "$cmd" = stop ]; then
  pnpm exec supabase stop --no-backup --workdir "$SBW" --project-id "$PID" 2>&1 | tail -3
  exit 0
fi
mkdir -p "$SBW/supabase/migrations"
cp -r "$ROOT/supabase/templates" "$SBW/supabase/" 2>/dev/null
sed -e "s/^project_id = .*/project_id = \"$PID\"/" \
    -e 's/^port = 54321/port = 55441/' -e 's/^port = 54322/port = 55442/' -e 's/^port = 54323/port = 55443/' \
    -e 's/^port = 54324/port = 55444/' -e 's/^port = 54327/port = 55447/' -e 's/^port = 54329/port = 55449/' \
    "$ROOT/supabase/config.toml" > "$SBW/supabase/config.toml"
cd "$ROOT" && pnpm exec supabase start -x vector,logflare,imgproxy,edge-runtime,studio,realtime,storage-api,supavisor,postgres-meta --workdir "$SBW" 2>&1 | tail -25
