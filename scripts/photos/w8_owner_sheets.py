#!/usr/bin/env python3
"""Contact sheets for the owner: what wave 8 removed, and what it swapped (old | new, side by side).

    python scripts/photos/w8_owner_sheets.py        # -> cache/w8/owner_sheets/{removed,replaced}_NN.jpg

Old photos come from the manifests as committed in origin/main (their images are still in cache/). Each tile says
the recipe, the old file's size and sharpness number, and why it went. Artefacts only; never committed.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import quality_audit as Q  # noqa: E402
from common import CACHE, MANIFEST_DIR  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = CACHE / "w8" / "owner_sheets"


def old_rows() -> dict[str, dict]:
    rows = {}
    for n in ("commons.json", "openverse.json", "myplate.json"):
        txt = subprocess.run(["git", "show", f"origin/main:scripts/photos/manifest/{n}"], cwd=ROOT, capture_output=True,
                             text=True, encoding="utf-8", check=True).stdout
        for r in json.loads(txt):
            rows[r["slug"]] = r
    return rows


def fit(path: Path, w: int, h: int) -> Image.Image:
    im = Image.open(path).convert("RGB")
    im.thumbnail((w, h))
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()
    rej = json.loads((MANIFEST_DIR / "commons_r2_rejected.json").read_text(encoding="utf-8"))["wave8_quality_2026_10_16"]
    dec = json.loads((MANIFEST_DIR / "quality_decisions.json").read_text(encoding="utf-8"))
    metrics = json.loads(Q.METRICS.read_text(encoding="utf-8"))
    old = old_rows()
    new = {r["slug"]: r for r in Q.load_rows(strict=False)}
    f = Q.font(14)
    removed = sorted(s for s in rej if s not in new)
    replaced = sorted(s for s in rej if s in new)

    def sheet(slugs: list[str], name: str, pair: bool, per: int, cols: int) -> None:
        tw, th = (420, 315) if not pair else (330, 250)
        cell_w = tw if not pair else tw * 2 + 6
        for n in range(0, len(slugs), per):
            ch = slugs[n:n + per]
            sh = Image.new("RGB", (cols * cell_w, ((len(ch) + cols - 1) // cols) * (th + 40)), "white")
            d = ImageDraw.Draw(sh)
            for j, s in enumerate(ch):
                x, y = (j % cols) * cell_w, (j // cols) * (th + 40)
                try:
                    sh.paste(fit(CACHE / old[s]["image_cache"], tw - 4, th - 4), (x + 2, y + 2))
                except Exception:  # noqa: BLE001
                    d.text((x + 6, y + 6), "old image not cached", fill=(200, 0, 0), font=f)
                if pair:
                    sh.paste(fit(CACHE / new[s]["image_cache"], tw - 4, th - 4), (x + tw + 8, y + 2))
                m = metrics.get(s, {})
                d.text((x + 3, y + th), f"{s}  OLD {m.get('w')}x{m.get('h')} lap{m.get('sharpness')}" + ("   ->   NEW" if pair else ""), fill=(0, 0, 0), font=f)
                d.text((x + 3, y + th + 18), (dec.get(s, {}).get("reason") or "")[:90], fill=(120, 0, 0), font=f)
            sh.save(OUT / f"{name}_{n // per + 1:02d}.jpg", quality=90)

    sheet(removed, "removed", False, 12, 4)
    sheet(replaced, "replaced", True, 6, 2)
    print(f"{len(removed)} removed, {len(replaced)} replaced -> {OUT}")


if __name__ == "__main__":
    main()
