#!/usr/bin/env bash
# Rebuild the seeds and reload the wave-12 originals into a SNAPSHOT container (never live).
#   bash scripts/originals/reload.sh <container>
set -euo pipefail
C="${1:?container}"
cd "$(dirname "$0")/../.."
python -I scripts/originals/build_ingredients.py
python -I scripts/originals/build.py
docker exec "$C" psql -U postgres -q -c "delete from recipes where source_name='Minced original' and status='in_review' and author_id is null" >/dev/null
docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/seed-ingredients-w12.sql
docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/seed-originals-w12.sql
