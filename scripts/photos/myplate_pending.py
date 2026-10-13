#!/usr/bin/env python3
"""Slug lists for the MyPlate fetch, so a stopped run can be resumed without guessing.

    python scripts/photos/myplate_pending.py cached     # slugs whose archived page is already on disk
    python scripts/photos/myplate_pending.py missing    # slugs with no archived page yet
    python scripts/photos/myplate_pending.py need-image # audit-included slugs whose photo is not downloaded

`myplate_fetch.py` writes found.json only every 25 slugs, so after a killed run feed `cached` back through
`myplate_fetch.py --stage pages` (no network: cached pages are re-read) to rebuild found.json before `myplate_audit.py audit`.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR  # noqa: E402

PAGES = CACHE / "myplate" / "pages"
IMAGES = CACHE / "myplate" / "images"


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    titles = [l.split("\t")[0] for l in (CACHE / "titles.tsv").read_text(encoding="utf-8").splitlines() if "\t" in l]
    if mode == "cached":
        out = [s for s in titles if (PAGES / f"{s}.html").exists() and (PAGES / f"{s}.html").stat().st_size > 20000]
    elif mode == "missing":
        out = [s for s in titles if not ((PAGES / f"{s}.html").exists() and (PAGES / f"{s}.html").stat().st_size > 20000)]
    elif mode == "need-image":
        dec = json.loads((MANIFEST_DIR / "myplate_decisions.json").read_text(encoding="utf-8"))
        out = [d["slug"] for d in dec if d["include"] and not (IMAGES / f"{d['slug']}.bin").exists()]
    else:
        sys.exit(__doc__)
    sys.stdout.reconfigure(newline="\n")
    print("\n".join(out))
    print(f"{len(out)} slugs", file=sys.stderr)


if __name__ == "__main__":
    main()
