#!/usr/bin/env bash
# Rescue dry-run: build the seed for the not-yet-imported MyPlate pages and run it with rollback.
#   bash scripts/myplate/w14-rescue-dry.sh <container>
set -euo pipefail
cd "$(dirname "$0")/../.."
python -I scripts/myplate/w14_build.py ${RESCUE_JSON:-scripts/myplate/artifacts/rescue-federal.json} scripts/myplate/artifacts/rescue-dry.sql "USDA MyPlate rescue" scripts/myplate/w14_rules.py
sed 's/^commit;/rollback;/' scripts/myplate/artifacts/rescue-dry.sql | docker exec -i "$1" psql -U postgres -v ON_ERROR_STOP=1 -q
