#!/usr/bin/env bash
# Load the compact FDC CSVs into a scratch database "fdc" inside a throwaway
# Postgres container. Usage: bash load_scratch.sh <container>
set -euo pipefail
CT="${1:?container}"
HERE="$(cd "$(dirname "$0")" && pwd)"
C="$HERE/cache/compact"
docker exec "$CT" psql -U postgres -q -c "drop database if exists fdc" -c "create database fdc"
docker exec -i "$CT" psql -U postgres -d fdc -q < "$HERE/scratch_schema.sql"
for t in foods portions branded; do
  docker exec -i "$CT" psql -U postgres -d fdc -q -c "\\copy $t from stdin csv" < "$C/$t.csv"
done
docker exec -i "$CT" psql -U postgres -d fdc -q -c "\\copy nut from stdin csv" < "$C/nutrients.csv"
docker exec "$CT" psql -U postgres -d fdc -q -c "create index on nut(fdc_id)" -c "analyze"
docker exec "$CT" psql -U postgres -d fdc -c "select (select count(*) from foods) foods, (select count(*) from branded) branded, (select count(*) from nut) nut_rows, (select count(*) from portions) portions"
