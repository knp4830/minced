#!/usr/bin/env python3
"""Fetch larger renditions (up to 1920 px on the long side) of Commons photos that already have a manifest row.

    python scripts/photos/hires.py fetch slug [slug ...]     # -> cache/hires/<slug>.jpg  (+ cache/hires/index.json)
    python scripts/photos/hires.py apply                      # rewrite manifest rows' image_cache to the hires file

Why: wave 2-7 stored the 1280px rendition, so no photo could ever be shown sharply in a slot wider than
about 640 CSS px on a 2x screen (the landing hero). Wikimedia serves any width up to the original from
its thumbnail service; 1920 is one of its standard steps (they refuse odd widths with HTTP 429).

`apply` only touches rows whose slug has a hires file, and keeps the old cache path as `image_cache_1280`
so the change is reversible. Licence, credit and attribution are untouched: it is the same file.
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons as C  # noqa: E402
from common import CACHE, MANIFEST_DIR, http_get, write_json  # noqa: E402

HI = CACHE / "hires"
WIDTH = 1920


def fetch(slugs: list[str]) -> None:
    rows = {r["slug"]: r for r in json.loads((MANIFEST_DIR / "commons.json").read_text(encoding="utf-8"))}
    HI.mkdir(parents=True, exist_ok=True)
    idx_f = HI / "index.json"
    idx = json.loads(idx_f.read_text(encoding="utf-8")) if idx_f.exists() else {}
    for slug in slugs:
        r = rows.get(slug)
        if not r:
            print(f"{slug}: not a Commons row", file=sys.stderr)
            continue
        data = C.api({"action": "query", "titles": r["file"], "prop": "imageinfo", "iiprop": "url|size|sha1", "iiurlwidth": WIDTH})
        ii = (data["query"]["pages"][0].get("imageinfo") or [None])[0]
        if not ii:
            print(f"{slug}: no imageinfo", file=sys.stderr)
            continue
        url = ii["thumburl"] if ii["width"] > WIDTH else ii["url"]
        st, body, _ = http_get(url)
        time.sleep(C.DELAY)
        if st != 200:
            print(f"{slug}: http {st}", file=sys.stderr)
            continue
        (HI / f"{slug}.jpg").write_bytes(body)
        idx[slug] = {"url": url, "bytes": len(body), "orig": [ii["width"], ii["height"]]}
        print(f"{slug}: {len(body) // 1024} KB", file=sys.stderr, flush=True)
        write_json(idx_f, idx)


def apply() -> None:
    f = MANIFEST_DIR / "commons.json"
    rows = json.loads(f.read_text(encoding="utf-8"))
    idx = json.loads((HI / "index.json").read_text(encoding="utf-8"))
    n = 0
    for r in rows:
        if r["slug"] in idx and (HI / f"{r['slug']}.jpg").exists() and not r["image_cache"].startswith("hires/"):
            r["image_cache_1280"] = r["image_cache"]
            r["image_cache"] = f"hires/{r['slug']}.jpg"
            r["source_image_url"] = idx[r["slug"]]["url"]
            r["sha256"] = hashlib.sha256((HI / f"{r['slug']}.jpg").read_bytes()).hexdigest()
            n += 1
    write_json(f, rows)
    print(f"{n} rows now point at a 1920 px file")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "fetch":
        fetch(sys.argv[2:])
    elif cmd == "apply":
        apply()
    else:
        sys.exit(__doc__)
