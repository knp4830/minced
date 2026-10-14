#!/usr/bin/env python3
"""Review sheets: each tile shows the candidate photo next to the recipe's description, ingredients and steps.

    python scripts/photos/review_sheets.py audit  [slug ...]      # photos already in the manifests
    python scripts/photos/review_sheets.py cand <cand.json> [slug ...]   # candidate images (see cand format below)

Output: cache/review7/<name>_<n>.png (4 tiles per sheet). Needs cache/details.json (export_details.py).
cand.json: [{"slug":..., "label":..., "path": "<path relative to cache/>"}]  (a recipe may appear several times)
"""
from __future__ import annotations

import json
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR  # noqa: E402

W, H = 1000, 560
IMG_W = 520


def font(size: int):
    for f in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


F, FB = font(14), font(17)


def tile(rec: dict, label: str, path: Path) -> Image.Image:
    t = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(t)
    try:
        im = Image.open(path).convert("RGB")
        im.thumbnail((IMG_W, H - 4))
        t.paste(im, (2, 2))
    except Exception as e:  # noqa: BLE001
        d.text((10, 10), f"cannot open {path}: {e}", fill="red", font=F)
    x, y = IMG_W + 14, 6
    d.text((x, y), f"{rec['slug']}  [{label}]", fill="black", font=FB)
    y += 24
    desc = (rec.get("description") or "")
    for line in textwrap.wrap("DESC: " + desc, 62)[:4]:
        d.text((x, y), line, fill=(60, 60, 60), font=F); y += 17
    y += 4
    ing = ", ".join(rec.get("ingredients") or [])
    for line in textwrap.wrap("ING: " + ing, 62)[:7]:
        d.text((x, y), line, fill=(0, 70, 140), font=F); y += 17
    y += 4
    steps = " | ".join((s or "").strip() for s in (rec.get("steps") or []))
    for line in textwrap.wrap("STEPS: " + steps, 62)[:14]:
        d.text((x, y), line, fill=(20, 100, 20), font=F); y += 17
    return t


def sheets(items: list[tuple[dict, str, Path]], name: str) -> None:
    out = CACHE / "review7"
    out.mkdir(parents=True, exist_ok=True)
    for n in range(0, len(items), 2):
        chunk = items[n:n + 2]
        sheet = Image.new("RGB", (W, H * len(chunk)), "white")
        for i, (rec, label, path) in enumerate(chunk):
            sheet.paste(tile(rec, label, path), (0, i * H))
        sheet.save(out / f"{name}_{n // 2:03d}.png")
    print(f"{len(items)} tiles -> {out}")


def grid(items: list[tuple[dict, str, Path]], name: str) -> None:
    """Compact first-pass sheets: 3x2 tiles, each with the photo, number, title, ingredients and candidate label."""
    out = CACHE / "review7"
    out.mkdir(parents=True, exist_ok=True)
    TW, TH, COLS, ROWS = (420, 400, 3, 2) if not __import__("os").environ.get("DENSE") else (330, 330, 4, 3)
    per = COLS * ROWS
    for n in range(0, len(items), per):
        chunk = items[n:n + per]
        sheet = Image.new("RGB", (TW * COLS, TH * ROWS), "white")
        d = ImageDraw.Draw(sheet)
        for j, (rec, label, path) in enumerate(chunk):
            x, y = (j % COLS) * TW, (j // COLS) * TH
            d.text((x + 3, y + 2), f"[{n + j}] {rec['title']}"[:60], fill="red", font=FB)
            yy = y + 24
            for line in textwrap.wrap(", ".join(rec.get("ingredients") or []), 46)[:2]:
                d.text((x + 3, yy), line, fill=(0, 110, 0), font=F); yy += 16
            for line in textwrap.wrap(label, 46)[:2]:
                d.text((x + 3, yy), line, fill=(0, 0, 200), font=F); yy += 16
            try:
                im = Image.open(path).convert("RGB")
                im.thumbnail((TW - 4, TH - (yy - y) - 4))
                sheet.paste(im, (x + 2, yy + 2))
            except Exception:  # noqa: BLE001
                d.text((x + 5, yy + 5), "cannot open", fill="red", font=F)
        sheet.save(out / f"{name}_g{n // per:03d}.png")
    json.dump([{"n": k, "slug": r["slug"], "label": lab, "path": str(p)} for k, (r, lab, p) in enumerate(items)],
              open(out / f"{name}_gindex.json", "w", encoding="utf8"), ensure_ascii=False, indent=0)
    print(f"{len(items)} tiles -> {out} ({(len(items) + per - 1) // per} sheets)")


def main() -> None:
    details = {r["slug"]: r for r in json.loads((CACHE / "details.json").read_text(encoding="utf8"))}
    mode = sys.argv[1]
    if mode == "agrid":   # compact audit of photos already in the manifests
        rows = {}
        for f in ("commons", "myplate", "openverse", "pexels"):
            p = MANIFEST_DIR / f"{f}.json"
            if p.exists():
                for r in json.loads(p.read_text(encoding="utf8")):
                    rows[r["slug"]] = r
        want = [s for s in sys.argv[2:] if s in rows and s in details]
        grid([(details[s], f"{rows[s]['source']} {rows[s].get('file', '')}"[:90], CACHE / rows[s]["image_cache"]) for s in want], "agrid")
        return
    if mode == "grid":
        cands = json.loads(Path(sys.argv[2]).read_text(encoding="utf8"))
        grid([(details[c["slug"]], c["label"], CACHE / c["path"]) for c in cands if c["slug"] in details], Path(sys.argv[2]).stem)
        return
    if mode == "audit":
        want = sys.argv[2:]
        rows = {}
        for f in ("commons", "myplate", "openverse", "pexels"):
            p = MANIFEST_DIR / f"{f}.json"
            if p.exists():
                for r in json.loads(p.read_text(encoding="utf8")):
                    rows[r["slug"]] = r
        items = [(details[s], rows[s]["source"], CACHE / rows[s]["image_cache"]) for s in (want or sorted(rows)) if s in rows and s in details]
        print("no recipe in snapshot:", [s for s in (want or sorted(rows)) if s in rows and s not in details])
        sheets(items, "audit")
    else:
        cands = json.loads(Path(sys.argv[2]).read_text(encoding="utf8"))
        want = set(sys.argv[3:])
        items = [(details[c["slug"]], c["label"], CACHE / c["path"]) for c in cands if not want or c["slug"] in want]
        sheets(items, Path(sys.argv[2]).stem)


if __name__ == "__main__":
    main()
