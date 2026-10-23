#!/usr/bin/env bash
# Rebuild supabase/seed-recipes-w14-nhs.sql from scripts/nhs/selected.txt and apply it to a THROWAWAY container
# (removing the previous NHS test rows first).   bash scripts/nhs/reload.sh <container>
set -euo pipefail
cd "$(dirname "$0")/../.."
python -I scripts/nhs/extract.py $(tr '\n' ' ' < scripts/nhs/selected.txt) > scripts/nhs/artifacts/selected.json
python -I scripts/myplate/w14_build.py scripts/nhs/artifacts/selected.json supabase/seed-recipes-w14-nhs.sql "NHS Healthier Families pilot (Open Government Licence v3.0)"
docker exec -i "$1" psql -U postgres -q -c "delete from recipes where source_license like 'Contains public sector information%'"
docker exec -i "$1" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/seed-recipes-w14-nhs.sql
docker exec -i "$1" psql -U postgres -At -F'|' < scripts/nhs/check.sql > .w14-nhs-check.txt
python -I scripts/nhs/compare.py scripts/nhs/artifacts/selected.json .w14-nhs-check.txt
