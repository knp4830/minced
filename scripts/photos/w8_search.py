#!/usr/bin/env python3
"""Wave-8 Commons search for BETTER photos: same gates as commons_w4.py, plus a size floor and a sharpness floor.

    python scripts/photos/w8_search.py search cache/w8_replace.json --out cand_w8_rep.json [--keep 5]
    python scripts/photos/w8_search.py sheets cand_w8_rep.json            # review sheets in cache/w8/sheets_<name>/
    python scripts/photos/w8_search.py build picks.json recipes.json      # = commons_r2.build (merges manifest/commons.json)

Extra gates on top of commons_w4 (a candidate failing any is never shown to the reviewer):
  * original >= 1000 px on the long side (a bigger source than most of what we hold)
  * the 480 px review thumbnail has a Laplacian variance >= SHARP_MIN (blurry sources are the whole problem)
  * the file is not already used by a recipe and not on a reject list (commons_r2_rejected.json)
The reviewer still looks at every thumbnail next to the recipe's ingredients. Licences: CC0 / PDM / CC BY /
CC BY-SA only (commons.classify_license). Wikimedia asks for polite use: one request at a time, 0.6 s apart.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons as C  # noqa: E402
import commons_r2 as R2  # noqa: E402
import commons_w4 as W4  # noqa: E402
from common import CACHE, http_get, write_json  # noqa: E402

W8 = CACHE / "w8"
SHARP_MIN = 90          # variance of the Laplacian at 480 px (our kept photos have a median of about 300 at that size)
LONG_MIN = 1000


def lap480(path: Path) -> float | None:
    try:
        im = Image.open(path).convert("L")
    except Exception:  # noqa: BLE001
        return None
    s = 480 / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float64)
    lap = a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
    return float(lap.var())


def cmd_search(path: str, out: str, thr: float, keep: int) -> None:
    recs = json.loads(Path(path).read_text(encoding="utf-8"))
    outp = W8 / out
    outp.parent.mkdir(parents=True, exist_ok=True)
    res = json.loads(outp.read_text(encoding="utf-8")) if outp.exists() else {}
    skip = W4.excluded_files()
    for rec in recs:
        slug, title = rec["slug"], rec["title"]
        if slug in res:
            continue
        qs = list(dict.fromkeys(rec.get("queries", []) + R2.queries(title)))
        seen, cands = set(), []
        for q in qs:
            try:
                rows = C.search_one(q, 25)
            except Exception as e:  # noqa: BLE001
                print("ERR", slug, e, file=sys.stderr)
                continue
            for r in rows:
                if r["file"] in seen or r["file"] in skip:
                    continue
                seen.add(r["file"])
                if r["license"] is None or not r["author"]:
                    continue
                if max(r["width"] or 0, r["height"] or 0) < LONG_MIN:
                    continue
                if R2.BAD_NAME.search(r["file"]) or W4.RISKY.search(r["file"]):
                    continue
                best = max([R2.score(title, r)] + [R2.score(q2, r) for q2 in rec.get("queries", [])])
                if best >= thr:
                    r["score"] = round(best, 2)
                    r["risky_desc"] = bool(W4.RISKY.search(r["file"] + " " + (r["description"] or "")))
                    cands.append(r)
        cands.sort(key=lambda r: -r["score"])
        d = W8 / "review" / slug
        d.mkdir(parents=True, exist_ok=True)
        good = []
        for r in cands[: keep * 2]:
            st, body, _ = http_get(r["thumb_url"] or r["original_url"])
            time.sleep(C.DELAY)
            if st != 200:
                continue
            p = d / f"{len(good)}.jpg"
            p.write_bytes(body)
            lv = lap480(p)
            if lv is None or lv < SHARP_MIN:
                p.unlink()
                continue
            r["lap480"] = round(lv)
            good.append(r)
            if len(good) >= keep:
                break
        res[slug] = {"title": title, "ingredients": rec.get("ingredients") or [], "cands": good}
        print(f"{slug}: {len(good)}", file=sys.stderr, flush=True)
        write_json(outp, res)


def font(sz: int):
    for n in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(n, sz)
        except OSError:
            pass
    return ImageFont.load_default()


def cmd_sheets(name: str, per: int, cols: int) -> None:
    cands = json.loads((W8 / name).read_text(encoding="utf-8"))
    tiles = []
    for slug, v in cands.items():
        for i, r in enumerate(v["cands"]):
            p = W8 / "review" / slug / f"{i}.jpg"
            if p.exists():
                tiles.append((slug, i, v["title"], ", ".join(v.get("ingredients", [])[:7]), r, p))
    outd = W8 / f"sheets_{name.removesuffix('.json')}"
    outd.mkdir(parents=True, exist_ok=True)
    for old in outd.glob("*.jpg"):
        old.unlink()
    W, H = 500, 400
    f = font(13)
    n = 0
    index = []
    for k in range(0, len(tiles), per):
        chunk = tiles[k:k + per]
        rws = (len(chunk) + cols - 1) // cols
        sh = Image.new("RGB", (cols * W, rws * H), "white")
        d = ImageDraw.Draw(sh)
        for j, (slug, i, title, ing, r, p) in enumerate(chunk):
            x, y = (j % cols) * W, (j // cols) * H
            d.text((x + 3, y + 1), f"[{k + j}] {title}"[:70], fill="red", font=f)
            d.text((x + 3, y + 16), ing[:78], fill=(0, 110, 0), font=f)
            d.text((x + 3, y + 31), f"{r['file'].removeprefix('File:')[:48]} | {r['license']} | {r['width']}x{r['height']} lap{r.get('lap480')}", fill="blue", font=f)
            try:
                im = Image.open(p).convert("RGB")
                im.thumbnail((W - 4, H - 52))
                sh.paste(im, (x + 2, y + 48))
            except Exception:  # noqa: BLE001
                pass
            index.append({"n": k + j, "slug": slug, "i": i, "file": r["file"]})
        sh.save(outd / f"s{n:03d}.jpg", quality=88)
        n += 1
    write_json(outd / "index.json", index)
    print(f"{len(tiles)} tiles, {n} sheets in {outd}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("recipes")
    s.add_argument("--out", required=True)
    s.add_argument("--thr", type=float, default=0.67)
    s.add_argument("--keep", type=int, default=4)
    h = sub.add_parser("sheets")
    h.add_argument("name")
    h.add_argument("--per", type=int, default=9)
    h.add_argument("--cols", type=int, default=3)
    b = sub.add_parser("build")
    b.add_argument("picks")
    b.add_argument("recipes")
    a = ap.parse_args()
    if a.cmd == "search":
        cmd_search(a.recipes, a.out, a.thr, a.keep)
    elif a.cmd == "sheets":
        cmd_sheets(a.name, a.per, a.cols)
    else:
        R2.cmd_build(a.picks, a.recipes)
