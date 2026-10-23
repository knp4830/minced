#!/usr/bin/env bash
# Full backup of the Minced live project into .snapshot/backups/<date>-<label>/.
#
#   bash scripts/backup/backup-live.sh --dry-run [--db-url URL]   # rehearsal: local database only, no network to live
#   bash scripts/backup/backup-live.sh --live [label]             # the real thing (read-only on live)
#
# What it saves (READ-ONLY on the source; it never writes live):
#   database.sql          pg_dump of schema public + supabase_migrations (as the 2026-10-23 backup did)
#   auth-users.csv        auth.users id, email, created_at (no password hashes, no tokens)
#   storage-manifest.csv  every object in the recipe-photos bucket
#   recipe-photos/        the files themselves (live run only)
#   RESTORE.md            how to restore each piece
#
# Needs: docker (postgres:17-alpine image), python 3 (standard library only).
# Live run reads DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local
# and never prints them. Dry run REFUSES any database that is not on localhost / host.docker.internal.
set -euo pipefail

MODE=""; LABEL="manual"; DB_URL_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE=dry ;;
    --live) MODE=live ;;
    --db-url) shift; DB_URL_ARG="${1:-}" ;;
    *) LABEL="$1" ;;
  esac
  shift
done
[ -n "$MODE" ] || { echo "Say --dry-run or --live."; exit 2; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="${MINCED_MAIN:-$(cd "$(git -C "$ROOT" rev-parse --git-common-dir)/.." && pwd)}"  # the main checkout, even from a worktree
STAMP="$(date +%Y-%m-%d)"
OUT="$MAIN/.snapshot/backups/$STAMP-$LABEL"
[ "$MODE" = dry ] && OUT="$MAIN/.snapshot/backups/DRYRUN-$STAMP"

if [ "$MODE" = live ]; then
  ENVFILE="$ROOT/.env.local"; [ -f "$ENVFILE" ] || ENVFILE="$MAIN/.env.local"
  [ -f "$ENVFILE" ] || { echo "No .env.local found."; exit 2; }
  set -a; . "$ENVFILE"; set +a
  DB_URL="${DATABASE_URL:?DATABASE_URL missing in .env.local}"
else
  DB_URL="${DB_URL_ARG:?--dry-run needs --db-url (a throwaway local database)}"
  # Parse the real host (text after the LAST "@" in the authority, before any path or query), not a substring.
  AUTH="${DB_URL#*://}"; AUTH="${AUTH%%[/?#]*}"; HOSTPORT="${AUTH##*@}"; HOST="${HOSTPORT%%:*}"
  case "$HOST" in
    localhost|127.0.0.1|host.docker.internal) ;;
    *) echo "Refusing: a dry run only works against a local database."; exit 2 ;;
  esac
fi

# Inside the container "localhost" is the container itself; reach the host's published port instead.
DOCKER_URL="$(printf '%s' "$DB_URL" | sed -E 's#@(localhost|127\.0\.0\.1):#@host.docker.internal:#')"
PG="docker run --rm -e PGURL=$(printf '%q' "$DOCKER_URL") postgres:17-alpine"
export MSYS_NO_PATHCONV=1

mkdir -p "$OUT"
echo "Backing up to $OUT ($MODE)"

echo "1/4 database dump"
$PG sh -c 'pg_dump "$PGURL" --schema=public --schema=supabase_migrations --no-owner --no-privileges' > "$OUT/database.sql"

echo "2/4 auth users (ids, emails, created_at)"
# The local test stub of auth.users has no created_at column, so a dry run saves ids and emails only.
if [ "$MODE" = live ]; then COLS="id, email, created_at"; ORDER="created_at"; else COLS="id, email"; ORDER="id"; fi
$PG sh -c "psql \"\$PGURL\" -v ON_ERROR_STOP=1 -c \"\copy (select $COLS from auth.users order by $ORDER) to stdout with csv header\"" > "$OUT/auth-users.csv"

echo "3/4 storage manifest and files"
if [ "$MODE" = live ]; then
  PY=python; command -v python >/dev/null 2>&1 || PY=python3
  # Windows Python needs Windows paths: MSYS_NO_PATHCONV (set above for docker) stops Git Bash converting "/c/...".
  winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
  "$PY" "$(winpath "$ROOT/scripts/backup/storage_backup.py")" --out "$(winpath "$OUT")"
else
  echo "    skipped in a dry run (no network to live). A live run lists and downloads the recipe-photos bucket."
fi

echo "4/4 restore note"
cat > "$OUT/RESTORE.md" <<'EOF'
# Restoring this backup

- **Database** (`database.sql`): a plain-SQL dump of schema `public` and `supabase_migrations`.
  Restore into a Supabase project (or a throwaway Postgres 17 with the Supabase roles and an `auth.users`
  table stubbed, see `.snapshot/restore.sh`) with `psql "$URL" -v ON_ERROR_STOP=1 -f database.sql`.
  The dump re-creates `public`, so drop it first or strip the `CREATE SCHEMA public;` line.
- **Accounts** (`auth-users.csv`): ids, emails and sign-up dates only. Password hashes are NOT included.
  Rows in `public` that point at `auth.users` need those ids to exist. To rebuild accounts in a new project,
  invite or create each user with the same id through the Auth admin API, then ask people to reset their password.
- **Photos** (`recipe-photos/`, `storage-manifest.csv`): upload each file back to the `recipe-photos` bucket
  at the same path (`scripts/photos/upload_photos.py` shows the API). The manifest lists what should be there.
- Not covered: Auth settings and templates, Vercel environment variables, DNS. Those live in their dashboards.
EOF

echo "Done. $(du -sh "$OUT" | cut -f1) in $OUT"
