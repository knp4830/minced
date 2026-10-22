#!/usr/bin/env bash
# psql helper against the lane's throwaway container.
#   bash scripts/allergens/q.sh "sql text"          -> tuples-only, unaligned
#   bash scripts/allergens/q.sh -f file.sql          -> run a file (ON_ERROR_STOP)
#   bash scripts/allergens/q.sh -t "sql"             -> aligned table
CT="${CT:-w10c-allergens-db}"
if [ "$1" = "-f" ]; then
  docker exec -i "$CT" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$2"
elif [ "$1" = "-t" ]; then
  docker exec -i "$CT" psql -U postgres -d postgres -c "$2"
else
  docker exec -i "$CT" psql -At -F '|' -U postgres -d postgres -c "$1"
fi
