#!/usr/bin/env python3
"""Review sheets for USDA MyPlate photos: recipe title + ingredients above each photo.

    python scripts/photos/myplate_sheets.py [--reviewed cache/myplate/reviewed.txt] [--per 12]

Reads manifest/myplate.json (audit-included recipes with a downloaded image) and writes numbered sheets to
cache/myplate/sheets/. Slugs listed in the --reviewed file are skipped, so a later fetch only shows new photos.
A reject goes through `remove_photo.py <slug> "reason"` (recorded in myplate_review_excludes.json so the audit keeps it out).
Review rule: the photo must show THIS dish (compare with the ingredients), nothing doubtful about who made it.
A MyPlate/USDA logo on a USDA photo is fine (owner decision); a third-party credit, brand, stock look or a different dish is not.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, write_json  # noqa: E402

W, H, COLS = 420, 340, 3


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reviewed")
    ap.add_argument("--per", type=int, default=12)
    a = ap.parse_args()
    skip = set(Path(a.reviewed).read_text(encoding="utf-8").split()) if a.reviewed and Path(a.reviewed).exists() else set()
    rows = [r for r in json.loads((MANIFEST_DIR / "myplate.json").read_text(encoding="utf-8")) if r["slug"] not in skip]
    ing = {r["slug"]: r.get("ingredients") or [] for r in json.loads((CACHE / "photoless.json").read_text(encoding="utf-8"))}
    outd = CACHE / "myplate" / "sheets"
    outd.mkdir(parents=True, exist_ok=True)
    for old in outd.glob("*.png"):
        old.unlink()
    for k in range(0, len(rows), a.per):
        chunk = rows[k : k + a.per]
        img = Image.new("RGB", (W * COLS, H * ((len(chunk) + COLS - 1) // COLS)), "white")
        d = ImageDraw.Draw(img)
        for j, r in enumerate(chunk):
            x, y = (j % COLS) * W, (j // COLS) * H
            d.text((x + 3, y + 1), f"[{k + j}] {r['recipe_title']}"[:66], fill="red")
            d.text((x + 3, y + 12), ", ".join(ing.get(r["slug"], []))[:72], fill="green")
            d.text((x + 3, y + 23), r["slug"][:66], fill="blue")
            try:
                im = Image.open(CACHE / r["image_cache"]).convert("RGB")
                im.thumbnail((W - 4, H - 38))
                img.paste(im, (x + 2, y + 36))
            except Exception:  # noqa: BLE001
                d.text((x + 10, y + 60), "UNREADABLE", fill="red")
        img.save(outd / f"m{k // a.per:03d}.png")
    write_json(outd / "index.json", [{"n": i, "slug": r["slug"]} for i, r in enumerate(rows)])
    print(f"{len(rows)} photos on {(len(rows) + a.per - 1) // a.per} sheets in {outd}")


if __name__ == "__main__":
    main()
