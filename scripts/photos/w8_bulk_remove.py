#!/usr/bin/env python3
"""Remove many photos at their source manifests (remove_photo.py, one call each), reasons from the quality review.

    python scripts/photos/w8_bulk_remove.py "replaced by a better photo" slug slug ...
    python scripts/photos/w8_bulk_remove.py --removed slug slug ...      # no replacement exists: the placeholder is better

The reason recorded in commons_r2_rejected.json is "<review note> (<suffix>)" so nobody re-adds the same file.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUCKET = "wave8_quality_2026_10_16"


def main() -> None:
    args = sys.argv[1:]
    if args[0] == "--removed":
        suffix, slugs = "no better free photo of this dish found; the placeholder beats a poor photo", args[1:]
    else:
        suffix, slugs = args[0], args[1:]
    dec = json.loads((HERE / "manifest" / "quality_decisions.json").read_text(encoding="utf-8"))
    for s in slugs:
        note = dec.get(s, {}).get("reason", "quality audit")
        r = subprocess.run([sys.executable, str(HERE / "remove_photo.py"), s, f"{note} ({suffix})", "--bucket", BUCKET],
                           capture_output=True, text=True, encoding="utf-8")
        print((r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr) else s)


if __name__ == "__main__":
    main()
