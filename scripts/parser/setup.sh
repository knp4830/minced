#!/usr/bin/env bash
# Create the parser's virtualenv and install pinned dependencies.
#
#   bash scripts/parser/setup.sh
#
# The venv lives at scripts/parser/.venv and is gitignored. It is a few hundred
# MB (a CRF model and its numpy/nltk stack), which is why it is not committed.
# Delete the folder to undo this completely.
#
# ingredient-parser-nlp also downloads an NLTK tagger to ~/nltk_data on first
# use -- OUTSIDE the repo, in your home directory. Deleting the venv leaves that
# behind; `rm -rf ~/nltk_data` removes it if you want the machine clean.
set -euo pipefail
cd "$(dirname "$0")/../.."

VENV="scripts/parser/.venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. Install Python 3.9+ and re-run." >&2
  exit 1
fi

if [ ! -d "$VENV" ]; then
  echo "creating venv at $VENV" >&2
  python3 -m venv "$VENV"
fi

"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r scripts/parser/requirements.txt

echo "Parser ready. Test it with:" >&2
echo "  echo '[\"2 cloves garlic, minced\"]' | bash scripts/parser/run.sh --pretty" >&2
