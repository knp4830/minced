#!/usr/bin/env python3
"""Turn the reviewer's score lines (cache/review/scores_*.txt: `slug score note...`) into
manifest/quality_decisions.json, the committed record of the wave-8 visual review.

    python scripts/photos/import_scores.py

Score scale (one look at every photo, on a contact sheet):
  5  beautiful     4  good      3  acceptable, ordinary      2  poor: replace if a better photo of the same dish exists
  1  bad: blurry / tiny / wrong -- never shown
verdict: 1-2 -> "replace" (the search for a better photo decides whether it later becomes "removed" or "replaced");
         3-5 -> "keep".
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, write_json  # noqa: E402


def main() -> None:
    out = {}
    for f in sorted((CACHE / "review").glob("scores_*.txt")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            parts = line.split(None, 2)
            slug, score = parts[0], int(parts[1])
            note = parts[2] if len(parts) > 2 else ""
            out[slug] = {"score": score, "verdict": "replace" if score <= 2 else "keep", "reason": note or "reviewed: no defect"}
    write_json(MANIFEST_DIR / "quality_decisions.json", dict(sorted(out.items())))
    from collections import Counter
    print(len(out), Counter(v["score"] for v in out.values()))


if __name__ == "__main__":
    main()
