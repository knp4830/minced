#!/usr/bin/env python3
"""Write the two work lists for the wave-8 search: recipes whose photo is to be replaced, and recipes with no photo.

    python scripts/photos/w8_lists.py       # -> cache/w8_replace.json, cache/w8_photoless.json

Needs cache/details.json (export_details.py <snapshot container>) and manifest/quality_decisions.json.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, write_json  # noqa: E402


def main() -> None:
    dec = json.loads((MANIFEST_DIR / "quality_decisions.json").read_text(encoding="utf-8"))
    det = {r["slug"]: r for r in json.loads((CACHE / "details.json").read_text(encoding="utf-8"))}
    rep = [s for s, v in dec.items() if v["verdict"] == "replace" and s in det]
    write_json(CACHE / "w8_replace.json", [{"slug": s, "title": det[s]["title"], "ingredients": (det[s]["ingredients"] or [])[:10]} for s in rep])
    no = [r for r in det.values() if not r["has_photo"]]
    write_json(CACHE / "w8_photoless.json", [{"slug": r["slug"], "title": r["title"], "ingredients": (r["ingredients"] or [])[:10]} for r in no])
    print(len(rep), "to replace;", len(no), "without a photo;", Counter(r["source_name"] for r in no))


if __name__ == "__main__":
    main()
