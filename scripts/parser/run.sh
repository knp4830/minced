#!/usr/bin/env bash
# Run the ingredient parser without needing to know where the venv lives.
#
#   echo '["2 cloves garlic, minced"]' | bash scripts/parser/run.sh --pretty
#   jq -R -s 'split("\n")[:-1]' lines.txt | bash scripts/parser/run.sh > parsed.json
#
# stdout is JSON and nothing else -- the library's NLTK download notices go to
# stderr, so piping stdout into jq stays safe.
set -euo pipefail
cd "$(dirname "$0")/../.."

VENV="scripts/parser/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  echo "Parser venv missing. Run: bash scripts/parser/setup.sh" >&2
  exit 1
fi

exec "$VENV/bin/python" scripts/parser/parse_ingredients.py "$@"
