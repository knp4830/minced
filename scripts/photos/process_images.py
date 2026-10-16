#!/usr/bin/env python3
"""Resize chosen photos to web sizes and write the final manifest.

    python scripts/photos/process_images.py

Reads  scripts/photos/manifest/{myplate,commons}.json  (rows from the audit /
       commons build, each pointing at a cached original)
Writes scripts/photos/out/<source>/<slug>/{md,sm}.webp      (NOT committed)
       scripts/photos/manifest/photos.json                  (committed; the
       single source of truth the SQL and the uploader are generated from)

Sizes: md = max 1200px wide (recipe page, landing hero @2x), sm = max 640px (cards / grid /
pantry results @2x). Never upscaled -- MyPlate's archived photos are 600x400 and stay
600x400 at md. WebP q82 is ~35% smaller than JPEG at the same look.

Re-encoding through Pillow also drops EXIF, which matters for Commons photos:
phone photos routinely carry GPS coordinates of someone's kitchen.

Pillow is used because it is already installed on the dev machine; it is NOT in
package.json or requirements and this script is never deployed. Without Pillow
the script stops with a clear message rather than silently shipping originals.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, OUT, is_rejected, myplate_excluded, rejected_refs, write_json  # noqa: E402

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required (pip install pillow). It is a dev-machine tool, not a project dependency.")

# Wave 8: md 800 -> 1200 and sm 400 -> 640. The recipe page shows the photo ~590 CSS px wide and a card is ~255 px wide;
# on a 2x screen that needs 1180 and 510 pixels. At 800/400 every photo was upscaled (the soft hero the owner saw).
SIZES = {"md": 1200, "sm": 640}
QUALITY = 82
SOURCE_DIR = {"usda_myplate": "usda", "wikimedia_commons": "commons", "openverse": "openverse", "pexels": "pexels"}


def load_rows() -> list[dict]:
    rows: list[dict] = []
    for name in ("myplate.json", "commons.json", "openverse.json", "pexels.json"):
        f = MANIFEST_DIR / name
        if f.exists():
            rows += json.loads(f.read_text(encoding="utf-8"))
    return rows


def drop_rejected(rows: list[dict]) -> tuple[list[dict], list[str]]:
    """A rejected photo must never come back from a rebuild, whichever manifest or picks file produced the row."""
    rej, excl = rejected_refs(), myplate_excluded()
    keep, dropped = [], []
    for r in rows:
        why = None
        if r.get("source") == "usda_myplate" and r["slug"] in excl:
            why = "myplate_review_excludes.json"
        elif is_rejected(r["slug"], r.get("file"), r.get("attribution_url"), r.get("source_image_url"), rejected=rej):
            why = "commons_r2_rejected.json"
        if why:
            dropped.append(f"{r['slug']} ({r.get('file') or r.get('attribution_url')}): listed in {why}")
        else:
            keep.append(r)
    return keep, dropped


def main() -> None:
    rows, dropped = drop_rejected(load_rows())
    for d in dropped:
        print("DROPPED (rejected)", d, file=sys.stderr)
    final, problems = [], []
    seen = set()
    for r in rows:
        slug = r["slug"]
        if slug in seen:
            problems.append(f"{slug}: appears in more than one manifest (one photo per recipe)")
            continue
        seen.add(slug)
        src = CACHE / r["image_cache"]
        try:
            im = Image.open(src)
            im.load()
        except Exception as e:  # noqa: BLE001
            problems.append(f"{slug}: cannot decode {src.name}: {e}")
            continue
        im = im.convert("RGB")
        base = f"{SOURCE_DIR[r['source']]}/{slug}"
        sizes = {}
        for label, maxw in SIZES.items():
            out_im = im
            if im.width > maxw:
                out_im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
            buf = io.BytesIO()
            out_im.save(buf, "WEBP", quality=QUALITY, method=6)
            data = buf.getvalue()
            # Content hash in the name => an existing object is the same bytes,
            # so uploads are idempotent and the CDN may cache them forever.
            rel = f"{base}/{label}.{hashlib.sha256(data).hexdigest()[:8]}.webp"
            dest = OUT / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            sizes[label] = (out_im.width, out_im.height, len(data), rel)
        row = {k: v for k, v in r.items() if k not in ("image_cache",)}
        row.update({
            "storage_path": sizes["md"][3],
            "thumb_path": sizes["sm"][3],
            "width": sizes["md"][0],
            "height": sizes["md"][1],
            "bytes_md": sizes["md"][2],
            "bytes_sm": sizes["sm"][2],
            "original_width": im.width,
            "original_height": im.height,
        })
        final.append(row)
    final.sort(key=lambda x: x["slug"])
    write_json(MANIFEST_DIR / "photos.json", final)
    total = sum(x["bytes_md"] + x["bytes_sm"] for x in final)
    print(f"{len(final)} photos processed, {total / 1e6:.1f} MB total ({total / max(len(final), 1) / 1e3:.0f} KB avg incl. thumb)", file=sys.stderr)
    for p in problems:
        print("PROBLEM", p, file=sys.stderr)
    if problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
