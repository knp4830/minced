#!/usr/bin/env python3
"""Is every landing photo stored sharp enough for the slot it fills, on a 2x screen?

    python scripts/photos/landing_check.py [css_width_of_hero_tile ...]     # default: 379 (1920 px wide page), 426 (2560)

Reads manifest/photos.json + out/ (after process_images.py). For each curated slot it prints the file actually
served to that slot (md 1200 px for slots 0 and 6, sm 640 px for the rest), the CSS size the slot has on the real
page (measured with the browser at 1920 and 2560 px), the pixels a 2x screen needs, and OK / SOFT. Also writes
cache/review/hero_sim.jpg: the hero tile at 2x, as a screen would draw it, for a human look at 100%.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, OUT  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
# CSS pixel size of each slot, measured on the real page: (1920 wide, 2560 wide). Slot 0 and 6 are the large ones.
CSS = {0: (379, 426), 1: (183, 206), 2: (183, 206), 3: (183, 206), 4: (183, 206), 5: (183, 206),
       6: (553, 553), 7: (242, 270), 8: (242, 270)}   # slot 6 is limited by its HEIGHT (object-cover of a square)


def curated() -> list[str]:
    src = (ROOT / "src" / "lib" / "queries" / "landing.ts").read_text(encoding="utf-8")
    body = re.search(r"CURATED_SLUGS = \[(.*?)\] as const", src, re.S).group(1)
    return re.findall(r'"([a-z0-9-]+)"', body)


def main() -> None:
    photos = {r["slug"]: r for r in json.loads((MANIFEST_DIR / "photos.json").read_text(encoding="utf-8"))}
    bad = 0
    for slot, slug in enumerate(curated()):
        r = photos[slug]
        path = r["storage_path"] if slot in (0, 6, 7, 8) else r["thumb_path"]   # keep in step with LARGE_SLOTS in landing.ts
        im = Image.open(OUT / path)
        short = min(im.size)
        for label, css in zip(("1920", "2560"), CSS[slot]):
            need = css * 2
            # object-cover scales the image until BOTH sides cover the tile, so the limiting side is the shorter one
            ok = short >= need
            bad += not ok
            print(f"slot {slot} {slug:20s} {path.split('/')[-1]:14s} {im.size[0]}x{im.size[1]}  tile {css}px @{label}: needs {need}  {'OK' if ok else 'SOFT'}")
    r = photos[curated()[0]]
    a = Image.open(OUT / r["storage_path"]).convert("RGB")
    w, h = a.size
    m = min(w, h)
    c = a.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2)).resize((852, 852), Image.LANCZOS)
    c.save(CACHE / "review" / "hero_sim.jpg", quality=92)
    print("SOFT slots:", bad)


if __name__ == "__main__":
    main()
