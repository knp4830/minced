#!/usr/bin/env python3
"""Contact sheet of every photo the review rated 1-2 that is still in the manifests (i.e. no replacement was found).

    python scripts/photos/w8_lowlist.py [out_dir]       # default cache/w8/lowsheets/
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import quality_audit as Q  # noqa: E402
from common import CACHE, MANIFEST_DIR  # noqa: E402


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else CACHE / "w8" / "lowsheets"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.jpg"):
        old.unlink()
    dec = json.loads((MANIFEST_DIR / "quality_decisions.json").read_text(encoding="utf-8"))
    rows = {r["slug"]: r for r in Q.load_rows(strict=False)}
    replaced = {s for f in MANIFEST_DIR.glob("*picks_w8*.json") for s in json.loads(f.read_text(encoding="utf-8"))}
    slugs = sorted(s for s, v in dec.items() if v["score"] <= 2 and s in rows and s not in replaced)
    tw, th, cols, per = 500, 375, 3, 9
    f = Q.font(14)
    for n in range(0, len(slugs), per):
        ch = slugs[n:n + per]
        sh = Image.new("RGB", (cols * tw, ((len(ch) + cols - 1) // cols) * (th + 36)), "white")
        d = ImageDraw.Draw(sh)
        for j, s in enumerate(ch):
            x, y = (j % cols) * tw, (j // cols) * (th + 36)
            im = Image.open(CACHE / rows[s]["image_cache"]).convert("RGB")
            w, h = im.size
            im.thumbnail((tw - 4, th - 4))
            sh.paste(im, (x + 2, y + 2))
            d.text((x + 3, y + th), f"{n + j + 1}. {s} ({dec[s]['score']}) {w}x{h}", fill=(0, 0, 0), font=f)
            d.text((x + 3, y + th + 16), dec[s]["reason"][:70], fill=(120, 0, 0), font=f)
        sh.save(out / f"low_{n // per + 1:02d}.jpg", quality=90)
    print(len(slugs), "photos ->", out)


if __name__ == "__main__":
    main()
