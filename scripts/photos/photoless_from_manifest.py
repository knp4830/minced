#!/usr/bin/env python3
"""Recipes that have no photo in manifest/photos.json (the snapshot of live lags the manifest).

    python scripts/photos/photoless_from_manifest.py > cache/photoless.json

Needs cache/details.json (export_details.py). Same row shape as export_photoless.py: {slug, title, source_name, ingredients}.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
have = {r["slug"] for r in json.loads((HERE / "manifest" / "photos.json").read_text(encoding="utf8"))}
rows = json.loads((HERE / "cache" / "details.json").read_text(encoding="utf8"))
out = [
    {"slug": r["slug"], "title": r["title"], "source_name": r.get("source_name"), "ingredients": r.get("ingredients") or []}
    for r in sorted(rows, key=lambda r: r["slug"])
    if r["slug"] not in have
]
sys.stdout.write(json.dumps(out, ensure_ascii=False, indent=1))
print(f"{len(out)} recipes without a photo", file=sys.stderr)
