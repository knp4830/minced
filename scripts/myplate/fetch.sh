#!/usr/bin/env bash
# Stage 1 of the MyPlate import: download archived recipe pages (M1.5.3).
#
#   bash scripts/myplate/fetch.sh              # everything
#   bash scripts/myplate/fetch.sh 40           # first 40, for a quick sample
#   JOBS=4 bash scripts/myplate/fetch.sh       # 4 at a time
#
# WHERE THIS DATA COMES FROM, AND WHY
# -----------------------------------
# USDA retired myplate.gov/myplate-kitchen on 2026-01-07. The recipes are US
# federal works and therefore PUBLIC DOMAIN -- free to store and use, including
# commercially. We take them from the Internet Archive's capture of the original
# myplate.gov rather than from a third-party mirror, because a mirror's terms of
# service are a CONTRACT that can restrict bulk storage even though the
# underlying content carries no copyright. Going to the archive means we are not
# party to anyone's terms. (docs/BUILD-PLAN.md Phase 1.5 applies the same
# reasoning to Tier 3.)
#
# RESUMABLE: a slug whose file already exists and is big enough is skipped.
# Interrupt with Ctrl-C and re-run; it picks up where it stopped.
#
# POLITE, AND THIS IS NOT ADVICE -- IT IS A MEASUREMENT: at JOBS=4 the Internet
# Archive began refusing connections, and a run failed 953 of 1,201 pages with
# curl exit 000. Not an error page, not a 429 we could read -- the connections
# simply stopped being accepted. At JOBS=2 with a delay it is stable.
#
# The archive is a donation-funded nonprofit serving this for free. Raising JOBS
# does not make the import faster; it makes it fail and makes us a nuisance.
set -euo pipefail
cd "$(dirname "$0")/../.."

SLUGS="scripts/myplate/slugs.txt"
CACHE="scripts/myplate/cache"
DELAY="${FETCH_DELAY:-0.5}"
JOBS="${JOBS:-2}"
LIMIT="${1:-0}"
MIN_BYTES=20000            # anything smaller is an error page, not a recipe

mkdir -p "$CACHE"
FAILED_LOG="$CACHE/_failed.txt"
: > "$FAILED_LOG"

fetch_one() {
  slug="$1"
  [ -z "$slug" ] && return 0
  out="scripts/myplate/cache/$slug.html"

  if [ -f "$out" ] && [ "$(wc -c < "$out")" -ge 20000 ]; then
    return 0
  fi

  url="https://web.archive.org/web/2025id_/https://www.myplate.gov/recipes/$slug"
  # --retry covers the transient refusals that come from asking too fast; a
  # slug that fails three times with a pause between is a real miss.
  code=$(curl -sL --max-time 120 --retry 3 --retry-delay 5 --retry-all-errors \
              -o "$out" -w "%{http_code}" "$url" || echo "000")
  size=$(wc -c < "$out" 2>/dev/null || echo 0)

  if [ "$code" = "200" ] && [ "$size" -ge 20000 ]; then
    printf '.' >&2
  else
    rm -f "$out"
    echo "$slug http=$code size=$size" >> "scripts/myplate/cache/_failed.txt"
    printf 'x' >&2
  fi
  sleep "${FETCH_DELAY:-0.3}"
}
export -f fetch_one
export FETCH_DELAY="$DELAY"

if [ "$LIMIT" -gt 0 ]; then
  head -n "$LIMIT" "$SLUGS"
else
  cat "$SLUGS"
fi | xargs -P "$JOBS" -I{} bash -c 'fetch_one "$@"' _ {}

echo "" >&2
have=$(ls "$CACHE"/*.html 2>/dev/null | wc -l | tr -d ' ')
want=$(wc -l < "$SLUGS" | tr -d ' ')
fail=$(wc -l < "$FAILED_LOG" | tr -d ' ')
echo "cached $have of $want pages; $fail failures this run" >&2
[ "$fail" -gt 0 ] && echo "failures listed in $FAILED_LOG" >&2
exit 0
