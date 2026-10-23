#!/usr/bin/env bash
# usage: apply.sh container file...
c=$1; shift
for f in "$@"; do
  docker exec -i "$c" psql -q -U postgres -v ON_ERROR_STOP=1 < "$f" 2>&1 | tail -3
  echo "== $f done (${PIPESTATUS[0]})"
done
