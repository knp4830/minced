#!/usr/bin/env bash
# Fetch NHS Healthier Families recipe pages, politely (3 s between requests).
#   bash scripts/nhs/fetch.sh scripts/nhs/slugs.txt
# NHS terms cl. 3.3-3.4: website content is released under the Open Government
# Licence v3.0 (commercial use allowed). robots.txt does not disallow
# /healthier-families/. We take TEXT only (ingredients, method); never images.
set -uo pipefail
cd "$(dirname "$0")/../.."
mkdir -p scripts/nhs/cache
while read -r s; do
  [ -z "$s" ] && continue
  f="scripts/nhs/cache/$s.html"
  if [ -f "$f" ] && [ "$(wc -c < "$f")" -gt 20000 ]; then continue; fi
  curl -sL --max-time 60 --retry 2 -A "Mozilla/5.0 (Minced recipe import; contact kevinpham4830@gmail.com)" \
    -o "$f" -w "$s %{http_code} %{size_download}\n" "https://www.nhs.uk/healthier-families/recipes/$s/"
  sleep 3
done < "$1"
