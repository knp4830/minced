#!/usr/bin/env bash
# Rebuild the NHS seed from the cached pages and dry-run it (rollback) against a throwaway container.
#   bash scripts/nhs/run-dry.sh <container>
set -euo pipefail
cd "$(dirname "$0")/../.."
python -I scripts/nhs/extract.py > scripts/nhs/artifacts/recipes.json
python -I scripts/myplate/w14_build.py scripts/nhs/artifacts/recipes.json scripts/nhs/artifacts/nhs-dry.sql "NHS pilot"
sed 's/^commit;/rollback;/' scripts/nhs/artifacts/nhs-dry.sql | docker exec -i "$1" psql -U postgres -v ON_ERROR_STOP=1 -q
