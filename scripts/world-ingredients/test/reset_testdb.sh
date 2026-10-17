#!/usr/bin/env bash
# Rebuild database "seedtest" inside the scratch container from the PRISTINE reference container
# (snapshot + wave 9 migrations), then add the contract stub. Seeds are applied on top by run_seed_test.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DB_CT="${W10_CONTAINER:-w10-world-db}"
REF_CT="${W10_REF_CONTAINER:-w10-world-ref}"
docker exec "$DB_CT" psql -U postgres -q -c "drop database if exists seedtest" -c "create database seedtest"
docker exec "$REF_CT" pg_dump -U postgres --no-owner --no-privileges postgres | docker exec -i "$DB_CT" psql -U postgres -d seedtest -q -v ON_ERROR_STOP=0 > /dev/null 2>&1 || true
docker exec -i "$DB_CT" psql -U postgres -d seedtest -q -v ON_ERROR_STOP=1 < "$HERE/contract_stub.sql"
docker exec "$DB_CT" psql -U postgres -d seedtest -q -c "create table _baseline as select max(id) as max_ing from ingredients"
docker exec "$DB_CT" psql -U postgres -d seedtest -At -c "select count(*) from ingredients"
