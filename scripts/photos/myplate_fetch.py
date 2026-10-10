#!/usr/bin/env python3
"""USDA MyPlate photos, stage 1: download each recipe's own photo from the archive.

    python scripts/photos/myplate_fetch.py slugs.txt          # one slug per line
    python scripts/photos/myplate_fetch.py slugs.txt --limit 20

For each slug: archived page (Wayback `id_` form) -> the recipe's main <img>
(`image-style-recipe`, 600x400) -> the image itself via Wayback `im_`.
The live host (myplate-prod.azureedge.us) died with the site, so the archive is
the only source. 2 workers + delay: archive.org drops connections from faster
clients (measured, see docs/TERMINAL-LOG.md). Resumable -- cached files skipped.

Writes scripts/photos/cache/myplate/{pages,images}/ and cache/myplate/found.json
(per-slug src, alt, width, height, content hash) for myplate_audit.py.
"""

from __future__ import annotations

import argparse
import hashlib
import html as H
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, http_get, write_json  # noqa: E402

PAGES = CACHE / "myplate" / "pages"
IMAGES = CACHE / "myplate" / "images"
PAGE_URL = "https://web.archive.org/web/2025id_/https://www.myplate.gov/recipes/{slug}"
IMG_URL = "https://web.archive.org/web/2025im_/{src}"

ATTR_RE = re.compile(r'([\w:-]+)="([^"]*)"')
lock = threading.Lock()


def recipe_img(page: str) -> dict | None:
    """The recipe's main photo tag. Matched by the Drupal image style, so the
    related-recipe thumbnails further down the page (style `large`) are ignored."""
    for t in re.finditer(r"<img\b[^>]*>", page, re.I):
        tag = t.group(0)
        if "image-style-recipe" in tag:
            attrs = {k.lower(): H.unescape(v) for k, v in ATTR_RE.findall(tag)}
            return attrs if attrs.get("src") else None
    return None


def one(slug: str, delay: float, stage: str) -> dict:
    page_f = PAGES / f"{slug}.html"
    if not (page_f.exists() and page_f.stat().st_size > 20000):
        st, body, _ = http_get(PAGE_URL.format(slug=slug))
        time.sleep(delay)
        if st != 200 or len(body) < 20000:
            return {"slug": slug, "error": f"page http={st}"}
        page_f.write_bytes(body)
    attrs = recipe_img(page_f.read_text(encoding="utf-8", errors="replace"))
    if not attrs:
        return {"slug": slug, "error": "no recipe image on page"}
    src = attrs["src"]
    if src.startswith("/"):
        src = "https://myplate-prod.azureedge.us" + src  # some pages use site-relative URLs
    attrs["src"] = src
    img_f = IMAGES / f"{slug}.bin"
    if stage == "pages":
        return {"slug": slug, "src": src, "alt": attrs.get("alt", ""), "width": attrs.get("width"), "height": attrs.get("height")}
    if not (img_f.exists() and img_f.stat().st_size > 1000):
        # Candidates, best first: the page's own 600x400 tag, the same file with
        # the cache-busting ?itok stripped, then the JSON-LD image (a smaller
        # style) which the archive sometimes captured when it missed the first.
        cands = [src, src.split("?")[0]]
        ld = re.search(r'"image":\s*\{[^}]*?"url":\s*"([^"]+)"', page_f.read_text(encoding="utf-8", errors="replace"))
        if ld:
            cands.append(ld.group(1).replace("\\/", "/"))
        err = ""
        for c in dict.fromkeys(cands):
            st, body, hdr = http_get(IMG_URL.format(src=c), retries=3)
            time.sleep(delay)
            ctype = hdr.get("Content-Type", "")
            if st == 200 and ctype.startswith("image/"):
                img_f.write_bytes(body)
                attrs["src"] = c
                if c != cands[0]:
                    attrs["width"] = attrs["height"] = None  # not the page's declared size
                break
            err = f"image http={st} type={ctype}"
        else:
            return {"slug": slug, "src": src, "error": err}
    data = img_f.read_bytes()
    return {
        "slug": slug,
        "src": attrs["src"],
        "alt": attrs.get("alt", ""),
        "width": attrs.get("width"),
        "height": attrs.get("height"),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slugs")
    ap.add_argument("--stage", choices=["pages", "images"], default="pages",
                    help="pages: archived HTML only (audit decides who gets a photo). images: also download the photo.")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--delay", type=float, default=0.4)
    a = ap.parse_args()
    PAGES.mkdir(parents=True, exist_ok=True)
    IMAGES.mkdir(parents=True, exist_ok=True)
    slugs = [s.strip() for s in Path(a.slugs).read_text().splitlines() if s.strip()]
    if a.limit:
        slugs = slugs[: a.limit]
    found_f = CACHE / "myplate" / "found.json"
    done = {r["slug"]: r for r in json.loads(found_f.read_text(encoding="utf-8"))} if found_f.exists() else {}
    todo = [s for s in slugs if s not in done or "error" in done[s] or (a.stage == "images" and "sha256" not in done[s])]
    print(f"{len(slugs)} slugs, {len(todo)} to fetch", file=sys.stderr)

    def work(s: str) -> None:
        r = one(s, a.delay, a.stage)
        with lock:
            done[s] = r
            sys.stderr.write("x" if "error" in r else ".")
            sys.stderr.flush()
            if len(done) % 25 == 0:
                write_json(found_f, list(done.values()))

    with ThreadPoolExecutor(max_workers=a.jobs) as ex:
        list(ex.map(work, todo))
    write_json(found_f, list(done.values()))
    bad = [r for r in done.values() if "error" in r]
    print(f"\n{len(done) - len(bad)} ok, {len(bad)} failed", file=sys.stderr)
    for r in bad[:20]:
        print(r["slug"], r["error"], file=sys.stderr)


if __name__ == "__main__":
    main()
