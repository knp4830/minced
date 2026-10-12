#!/usr/bin/env python3
"""Round-2 Commons search: score candidates by how well the FILE NAME matches the dish.

    python scripts/photos/commons_r2.py search slice.json --out cand_r2_0.json
    python scripts/photos/commons_r2.py sheets            # batched review sheets
    python scripts/photos/commons_r2.py build picks_r2.json recipes.json

Reuses commons.py (licence allowlist, API etiquette, metadata). Differences from
`commons.py search`: (1) a name-overlap gate so we only download thumbnails that
plausibly show the dish -- USDA titles are often generic and most Commons hits for
them are wrong; (2) `build` MERGES into manifest/commons.json instead of replacing it.
A human still looks at every thumbnail before a pick is recorded.
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
from common import CACHE, MANIFEST_DIR, http_get, write_json  # noqa: E402

STOP = set("a an and with the of in on for to or from your my our style easy quick simple fresh homemade baked roasted sauteed no bake light low fat free".split())
BAD_NAME = re.compile(
    r"menu|sign\b|logo|label|poster|shop|market|store|map\b|chart|diagram|ingredients?\b|packag|plant\b|tree\b|field|farm|seeds?\b|stamp|book|cover|advert|vending|truck|stall|sale|vendor|illustration|drawing|painting|cartoon|\.svg",
    re.I,
)


def stem(w: str) -> str:
    w = w.lower()
    for suf in ("ies", "es", "s"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def tokens(s: str) -> list[str]:
    s = re.sub(r"\(.*?\)", " ", s)
    ws = [stem(w) for w in re.findall(r"[a-zA-Z]+", s)]
    return [w for w in ws if w not in STOP and len(w) > 2]


def queries(title: str) -> list[str]:
    t = re.sub(r"\(.*?\)", " ", title).replace("’", "'")
    t = re.sub(r"\s+", " ", t).strip()
    qs = [t]
    head = re.split(r"\s+(?:with|and|in|on)\s+", t, maxsplit=1)[0].strip()
    if head and head.lower() != t.lower() and len(tokens(head)) >= 1:
        qs.append(head)
    return qs


def score(title: str, r: dict) -> float:
    tt = set(tokens(title))
    if not tt:
        return 0
    fn = set(tokens(r["file"].removeprefix("File:").rsplit(".", 1)[0]))
    desc = set(tokens(r["description"] or ""))
    in_name = len(tt & fn) / len(tt)
    in_both = len(tt & (fn | desc)) / len(tt)
    return max(in_name, 0.85 * in_both)


def cmd_search(path: str, out: str, thr: float, keep: int) -> None:
    recs = json.loads(Path(path).read_text(encoding="utf-8"))
    res = {}
    for rec in recs:
        slug, title = rec["slug"], rec["title"]
        seen, cands = set(), []
        for q in queries(title):
            try:
                rows = C.search_one(q, 15)
            except Exception as e:  # noqa: BLE001
                print("ERR", slug, e, file=sys.stderr)
                continue
            for r in rows:
                if r["file"] in seen:
                    continue
                seen.add(r["file"])
                if r["license"] is None or not r["author"] or (r["width"] or 0) < 500:
                    continue
                if BAD_NAME.search(r["file"]):
                    continue
                s = score(title, r)
                if s >= thr:
                    r["score"] = round(s, 2)
                    cands.append(r)
        cands.sort(key=lambda r: -r["score"])
        cands = cands[:keep]
        d = CACHE / "commons" / "review2" / slug
        d.mkdir(parents=True, exist_ok=True)
        for i, r in enumerate(cands):
            st, body, _ = http_get(r["thumb_url"] or r["original_url"])
            time.sleep(C.DELAY)
            if st == 200:
                (d / f"{i}.jpg").write_bytes(body)
        res[slug] = {"title": title, "cands": cands}
        print(f"{slug}: {len(cands)}", file=sys.stderr, flush=True)
        write_json(CACHE / "commons" / out, res)


def cmd_sheets(per: int, top: int = 3) -> None:
    from PIL import Image, ImageDraw

    cands = {}
    for f in sorted((CACHE / "commons").glob("cand_r2_*.json")):
        cands.update(json.loads(f.read_text(encoding="utf-8")))
    tiles = []
    for slug, v in cands.items():
        for i, r in enumerate(v["cands"][:top]):
            p = CACHE / "commons" / "review2" / slug / f"{i}.jpg"
            if p.exists():
                tiles.append((slug, i, v["title"], r["file"].removeprefix("File:"), p))
    W, H, COLS = 400, 330, 3
    outd = CACHE / "commons" / "sheets2"
    outd.mkdir(parents=True, exist_ok=True)
    for old in outd.glob("*.png"):
        old.unlink()
    n = 0
    for k in range(0, len(tiles), per):
        chunk = tiles[k : k + per]
        rows = (len(chunk) + COLS - 1) // COLS
        img = Image.new("RGB", (W * COLS, H * rows), "white")
        d = ImageDraw.Draw(img)
        for j, (slug, i, title, fn, p) in enumerate(chunk):
            x, y = (j % COLS) * W, (j // COLS) * H
            d.text((x + 3, y + 1), f"[{k + j}] {title}"[:62], fill="red")
            d.text((x + 3, y + 12), fn[:62], fill="blue")
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


def short_credit(author: str, limit: int = 48) -> str:
    """Commons 'Artist' is sometimes a sentence. The on-photo credit must stay short;
    the full author string stays in the manifest as `author`."""
    a = re.sub(r"\s+", " ", author).strip()
    if len(a) <= limit:
        return a
    for sep in (" from ", " at ", " (", ", ", " - ", ": "):
        head = a.split(sep)[0].strip()
        if 3 <= len(head) <= limit:
            return head
    return a[: limit - 1].rstrip() + "…"


def cmd_build(picks_file: str, recipes_file: str) -> None:
    """Like commons.cmd_build but merges into manifest/commons.json."""
    target = MANIFEST_DIR / "commons.json"
    existing = json.loads(target.read_text(encoding="utf-8")) if target.exists() else []
    have = {r["slug"] for r in existing}
    picks = {k: v for k, v in json.loads(Path(picks_file).read_text(encoding="utf-8")).items() if k not in have}
    tmp = Path(picks_file).with_suffix(".tmp.json")
    tmp.write_text(json.dumps(picks), encoding="utf-8")
    try:
        C.cmd_build(str(tmp), recipes_file)  # writes manifest/commons.json with ONLY the new rows
    except SystemExit:
        pass  # rows that built are kept; errors were printed
    new = json.loads(target.read_text(encoding="utf-8"))
    for r in new:
        r["credit"] = short_credit(r["author"])   # recipe_photos.credit is shown over the photo corner
    write_json(target, existing + new)
    tmp.unlink(missing_ok=True)
    print(f"manifest/commons.json: {len(existing)} + {len(new)} = {len(existing) + len(new)}", file=sys.stderr)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("recipes")
    s.add_argument("--out", required=True)
    s.add_argument("--thr", type=float, default=0.67)
    s.add_argument("--keep", type=int, default=3)
    h = sub.add_parser("sheets")
    h.add_argument("--per", type=int, default=12)
    h.add_argument("--top", type=int, default=3)
    b = sub.add_parser("build")
    b.add_argument("picks")
    b.add_argument("recipes")
    a = ap.parse_args()
    if a.cmd == "search":
        cmd_search(a.recipes, a.out, a.thr, a.keep)
    elif a.cmd == "sheets":
        cmd_sheets(a.per, a.top)
    else:
        cmd_build(a.picks, a.recipes)
