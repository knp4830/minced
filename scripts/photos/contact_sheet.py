#!/usr/bin/env python3
"""Build numbered contact sheets so a human/agent can review candidates fast.

    python scripts/photos/contact_sheet.py                 # Commons candidates
    python scripts/photos/contact_sheet.py --myplate a b   # MyPlate cached images by slug

Needs Pillow (a review aid only -- the pipeline itself degrades without it).
Output: scripts/photos/cache/commons/review/<slug>_sheet.png
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE  # noqa: E402

W, H, COLS = 360, 284, 3


def sheet(items: list[tuple[str, Path]], out: Path) -> None:
    rows = (len(items) + COLS - 1) // COLS
    img = Image.new("RGB", (W * COLS, H * rows), "white")
    d = ImageDraw.Draw(img)
    for i, (label, p) in enumerate(items):
        x, y = (i % COLS) * W, (i // COLS) * H
        d.text((x + 3, y + 1), f"{i}: {label}"[:60], fill="red")
        try:
            im = Image.open(p).convert("RGB")
            im.thumbnail((W - 4, H - 16))
            img.paste(im, (x + 2, y + 14))
        except Exception as e:  # noqa: BLE001
            d.text((x + 3, y + 30), f"unreadable: {e}"[:50], fill="black")
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--myplate", nargs="*")
    ap.add_argument("--out", default=None)
    ap.add_argument("--only", nargs="*", help="limit Commons sheets to these slugs")
    a = ap.parse_args()
    if a.myplate is not None:
        items = [(s, CACHE / "myplate" / "images" / f"{s}.bin") for s in a.myplate]
        sheet(items, Path(a.out or CACHE / "myplate" / "sheet.png"))
        return
    cands: dict = {}
    for f in sorted((CACHE / "commons").glob("cand*.json")):   # candidates.json and cand_<n>.json (parallel searches)
        cands.update(json.loads(f.read_text(encoding="utf-8")))
    only = set(a.only or [])
    for slug, rows in cands.items():
        if only and slug not in only:
            continue
        items = [(r["file"].removeprefix("File:"), CACHE / "commons" / "review" / slug / f"{i}.jpg") for i, r in enumerate(rows)]
        if items:
            sheet(items, CACHE / "commons" / "review" / f"{slug}_sheet.png")


if __name__ == "__main__":
    main()
