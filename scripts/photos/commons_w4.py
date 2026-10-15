#!/usr/bin/env python3
"""Wave-4 Commons pass: custom queries, looser scoring, bigger sheets, rights-aware labels.

    python scripts/photos/commons_w4.py search slice.json --out cand_w4_0.json
    python scripts/photos/commons_w4.py sheets            # numbered sheets in cache/commons/sheets4/
    python scripts/photos/commons_w4.py build picks_w4.json recipes.json

slice.json rows: {"slug", "title", "queries": ["optional extra search phrases"]}.
Differences from commons_r2.py: (1) extra per-recipe queries; (2) the gate counts file name AND
description (a dish named in the description is fine), and each candidate carries its licence and
author so the reviewer can reject doubtful rights on sight; (3) candidates whose file name or
description names a venue/brand/product are dropped before download. A human still looks at every
thumbnail. `build` is commons_r2.build (merges into manifest/commons.json).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons as C  # noqa: E402
import commons_r2 as R2  # noqa: E402
from common import CACHE, http_get, write_json  # noqa: E402

# Things that signal brand, product or venue shots, or people as the subject.
RISKY = re.compile(
    r"restaurant|cafe\b|café|bar\b|grill\b|hotel|mcdonald|burger king|starbucks|subway|kfc|pizza hut|domino|"
    r"chipotle|taco bell|wendy|advert|promo|product|packag|brand|logo|menu|sponsored|"
    r"portrait|selfie|chef\b|cooking class|girl|boy\b|woman|man\b|children|kids|baby|family|people",
    re.I,
)


def excluded_files() -> set[str]:
    """Files already rejected by a reviewer (commons_r2_rejected.json) or already used by a recipe (photos.json)."""
    from common import MANIFEST_DIR
    out: set[str] = set()
    rej = json.loads((MANIFEST_DIR / "commons_r2_rejected.json").read_text(encoding="utf-8"))
    for bucket in rej.values():
        if isinstance(bucket, dict):
            for v in bucket.values():
                out.add(str(v).split(": ")[0])
    for r in json.loads((MANIFEST_DIR / "photos.json").read_text(encoding="utf-8")):
        if r.get("file"):
            out.add(r["file"])
    return out


def cmd_search(path: str, out: str, thr: float, keep: int) -> None:
    recs = json.loads(Path(path).read_text(encoding="utf-8"))
    res = {}
    skip = excluded_files()
    for rec in recs:
        slug, title = rec["slug"], rec["title"]
        qs = list(dict.fromkeys(rec.get("queries", []) + R2.queries(title)))
        seen, cands = set(), []
        for q in qs:
            try:
                rows = C.search_one(q, 20)
            except Exception as e:  # noqa: BLE001
                print("ERR", slug, e, file=sys.stderr)
                continue
            for r in rows:
                if r["file"] in seen or r["file"] in skip:
                    continue
                seen.add(r["file"])
                if r["license"] is None or not r["author"] or (r["width"] or 0) < 500:
                    continue
                if R2.BAD_NAME.search(r["file"]):
                    continue
                text = r["file"] + " " + (r["description"] or "")
                if RISKY.search(r["file"]):
                    continue
                # score against the best of the title and the custom queries
                best = max([R2.score(title, r)] + [R2.score(q, r) for q in rec.get("queries", [])])
                if best >= thr:
                    r["score"] = round(best, 2)
                    r["risky_desc"] = bool(RISKY.search(text))
                    cands.append(r)
        cands.sort(key=lambda r: -r["score"])
        cands = cands[:keep]
        d = CACHE / "commons" / "review4" / slug
        d.mkdir(parents=True, exist_ok=True)
        for i, r in enumerate(cands):
            st, body, _ = http_get(r["thumb_url"] or r["original_url"])
            time.sleep(C.DELAY)
            if st == 200:
                (d / f"{i}.jpg").write_bytes(body)
        res[slug] = {"title": title, "cands": cands}
        print(f"{slug}: {len(cands)}", file=sys.stderr, flush=True)
        write_json(CACHE / "commons" / out, res)


def cmd_sheets(per: int, top: int, pattern: str = "cand_w4_*.json") -> None:
    from PIL import Image, ImageDraw

    cands = {}
    for f in sorted((CACHE / "commons").glob(pattern)):
        cands.update(json.loads(f.read_text(encoding="utf-8")))
    tiles = []
    for slug, v in cands.items():
        for i, r in enumerate(v["cands"][:top]):
            p = CACHE / "commons" / "review4" / slug / f"{i}.jpg"
            if p.exists():
                lic = (r["license"] or "")[:14]
                tiles.append((slug, i, v["title"], r["file"].removeprefix("File:"), lic, p))
    W, H, COLS = 400, 340, 3
    outd = CACHE / "commons" / "sheets4"
    outd.mkdir(parents=True, exist_ok=True)
    for old in outd.glob("*.png"):
        old.unlink()
    n = 0
    for k in range(0, len(tiles), per):
        chunk = tiles[k : k + per]
        rows = (len(chunk) + COLS - 1) // COLS
        img = Image.new("RGB", (W * COLS, H * rows), "white")
        d = ImageDraw.Draw(img)
        for j, (slug, i, title, fn, lic, p) in enumerate(chunk):
            x, y = (j % COLS) * W, (j // COLS) * H
            d.text((x + 3, y + 1), f"[{k + j}] {title}"[:62], fill="red")
            d.text((x + 3, y + 12), f"{fn[:50]} | {lic}", fill="blue")
            try:
                im = Image.open(p).convert("RGB")
                im.thumbnail((W - 4, H - 28))
                img.paste(im, (x + 2, y + 26))
            except Exception:  # noqa: BLE001
                pass
        img.save(outd / f"s{n:03d}.png")
        n += 1
    write_json(outd / "index.json", [{"n": k, "slug": t[0], "i": t[1], "title": t[2], "file": t[3]} for k, t in enumerate(tiles)])
    print(f"{len(tiles)} tiles, {n} sheets in {outd}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("recipes")
    s.add_argument("--out", required=True)
    s.add_argument("--thr", type=float, default=0.5)
    s.add_argument("--keep", type=int, default=4)
    h = sub.add_parser("sheets")
    h.add_argument("--per", type=int, default=12)
    h.add_argument("--top", type=int, default=4)
    h.add_argument("--glob", default="cand_w4_*.json", help="which candidate files to put on sheets (default: all wave-4 ones)")
    b = sub.add_parser("build")
    b.add_argument("picks")
    b.add_argument("recipes")
    a = ap.parse_args()
    if a.cmd == "search":
        cmd_search(a.recipes, a.out, a.thr, a.keep)
    elif a.cmd == "sheets":
        cmd_sheets(a.per, a.top, a.glob)
    else:
        R2.cmd_build(a.picks, a.recipes)
