#!/usr/bin/env python3
"""Remove a Commons photo at its SOURCE so process_images.py cannot bring it back.

    python scripts/photos/remove_photo.py <slug> "reason" [--bucket wave4_review_2026_10_12]

process_images.py rebuilds manifest/photos.json from myplate.json + commons.json, so editing
photos.json alone is undone on the next run. This drops the row from commons.json and from the
picks files (so a rebuild does not re-add it) and records WHY in commons_r2_rejected.json, so nobody
re-reviews the same file. Regenerate afterwards:
    python scripts/photos/process_images.py && python scripts/photos/apply_manifest.py > supabase/seed-photos.sql
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import MANIFEST_DIR, write_json  # noqa: E402


def load(name: str):
    return json.loads((MANIFEST_DIR / name).read_text(encoding="utf-8"))


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    bucket = "wave4_review_2026_10_12"
    if "--bucket" in sys.argv:
        bucket = sys.argv[sys.argv.index("--bucket") + 1]
        args = [a for a in args if a != bucket]
    slug, reason = args[0], args[1]
    commons = load("commons.json")
    kept = [r for r in commons if r["slug"] != slug]
    if len(kept) == len(commons):
        sys.exit(f"{slug}: not in commons.json")
    removed = next(r for r in commons if r["slug"] == slug)
    write_json(MANIFEST_DIR / "commons.json", kept)
    for name in ("commons_picks.json", "commons_picks_r2.json", "commons_picks_w4.json"):
        picks = load(name)
        if slug in picks:
            del picks[slug]
            write_json(MANIFEST_DIR / name, picks)
    rej = load("commons_r2_rejected.json")
    rej.setdefault(bucket, {})[slug] = f"{removed['file']}: {reason}"
    write_json(MANIFEST_DIR / "commons_r2_rejected.json", rej)
    print(f"removed {slug} ({removed['file']})")


if __name__ == "__main__":
    main()
