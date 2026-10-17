#!/usr/bin/env python3
"""Look up the ORIGINAL pixel size of every Commons photo in the manifest.

    python scripts/photos/orig_sizes.py        # -> cache/orig_sizes.json  {slug: [w, h]}

Why: the cached copy of a Commons photo is the 1280px rendition Wikimedia served, so it says nothing
about whether a bigger, sharper copy exists. The landing hero needs >= 1600 px on the long side; this
tells us which photos can supply that. Read-only, polite (50 titles per request).
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons as C  # noqa: E402
from common import CACHE, MANIFEST_DIR, write_json  # noqa: E402


def main() -> None:
    rows = json.loads((MANIFEST_DIR / "commons.json").read_text(encoding="utf-8"))
    by_file = {r["file"]: r["slug"] for r in rows if r.get("file")}
    out: dict[str, list[int]] = {}
    files = list(by_file)
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        data = C.api({"action": "query", "titles": "|".join(chunk), "prop": "imageinfo", "iiprop": "size"})
        norm = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
        for p in data["query"]["pages"]:
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                continue
            t = p["title"]
            src = norm.get(t, t)
            slug = by_file.get(t) or by_file.get(src)
            if slug:
                out[slug] = [ii["width"], ii["height"]]
        time.sleep(0.5)
    write_json(CACHE / "orig_sizes.json", out)
    big = sum(1 for w, h in out.values() if max(w, h) >= 1600)
    print(f"{len(out)}/{len(files)} sizes; {big} with long side >= 1600")


if __name__ == "__main__":
    main()
