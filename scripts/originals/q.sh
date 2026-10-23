#!/usr/bin/env bash
# usage: bash scripts/originals/q.sh <container> "<sql>"   (unaligned, tuples only)
docker exec "$1" psql -U postgres -At -c "$2"
