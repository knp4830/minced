#!/usr/bin/env python3
"""Wikimedia Commons photos for recipes that have no USDA photo.

Works on ANY recipe list -- nothing here knows about specific slugs.

    # 1. find candidates (license-filtered) and download review thumbnails
    python scripts/photos/commons.py search recipes.json
    #    recipes.json: [{"slug": "shakshuka", "title": "Shakshuka", "queries": ["shakshuka"]}, ...]
    #    "queries" is optional; the title is used when absent.
    #    -> scripts/photos/cache/commons/candidates.json  +  cache/commons/review/<slug>/<n>.jpg

    # 2. a human (or agent) LOOKS at the thumbnails and records the picks
    #    picks.json: {"shakshuka": "File:Shakshuka_in_a_pan.jpg", ...}
    #    A pick means "this image genuinely shows this dish". No pick = placeholder.

    # 3. build manifest rows: re-fetches licence data for each pick, REFUSES any
    #    licence outside the allowlist, downloads the web-size original.
    python scripts/photos/commons.py build picks.json recipes.json

LICENCE ALLOWLIST: Public Domain, CC0, CC BY, CC BY-SA. Nothing else -- not NC,
not ND, not GFDL-only, not "fair use", not "no known restrictions" guesses.
Attribution (author + licence + file page URL) is recorded for every row because
CC BY and CC BY-SA require it and public domain makes it good practice.

API etiquette: identified User-Agent, serial requests, small delay. Commons asks
for exactly this (https://www.mediawiki.org/wiki/API:Etiquette).
"""

from __future__ import annotations

import argparse
import hashlib
import html as H
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, http_get, write_json  # noqa: E402

API = "https://commons.wikimedia.org/w/api.php"
DELAY = 0.6
REVIEW_WIDTH = 480
WEB_WIDTH = 1200  # we never store more than this; see process_images.py


# --------------------------------------------------------------------------
# Licence gate. One function, tested below, used by both search and build.
# --------------------------------------------------------------------------

def classify_license(short_name: str, usage_terms: str = "") -> str | None:
    """Return a normalised licence id if allowed, else None.

    Matches on the LicenseShortName Commons derives from the file's licence
    template ("CC BY-SA 4.0", "CC0", "Public domain", "PD-self" ...). Anything
    that does not match an allowed pattern is rejected -- the default is NO.
    """
    s = f"{short_name} {usage_terms}".strip().lower()
    if not s:
        return None
    # Hard rejects first: a string like "CC BY-NC-SA" contains "cc by".
    if re.search(r"\b(nc|nd)\b|noncommercial|non-commercial|noderiv|no derivat|gfdl|fair use|all rights reserved|copyrighted free use|non-free", s):
        return None
    m = re.search(r"cc[ -]by[ -]sa[ -]?(\d\.\d)?", s)
    if m:
        return "CC BY-SA " + (m.group(1) or "").strip()
    m = re.search(r"cc[ -]by[ -]?(\d\.\d)?", s)
    if m:
        return "CC BY " + (m.group(1) or "").strip()
    if re.search(r"\bcc0\b|cc-zero|cc zero|public domain dedication", s):
        return "CC0"
    if re.search(r"public domain|\bpd[- ]|\bpd$", s):
        return "Public domain"
    return None


def selftest() -> None:
    ok = {
        "CC BY-SA 4.0": "CC BY-SA 4.0",
        "CC BY 2.0": "CC BY 2.0",
        "CC0": "CC0",
        "Public domain": "Public domain",
        "PD-USGov": "Public domain",
        "CC BY-SA 3.0": "CC BY-SA 3.0",
    }
    no = ["CC BY-NC 2.0", "CC BY-NC-SA 3.0", "CC BY-ND 2.0", "GFDL", "Fair use", "", "Copyrighted free use", "Attribution", "CC BY-SA 3.0 and GFDL"]
    for k, v in ok.items():
        assert classify_license(k) == v, (k, classify_license(k))
    for k in no:
        assert classify_license(k) is None, (k, classify_license(k))
    print("licence classifier: ok")


# --------------------------------------------------------------------------

def api(params: dict) -> dict:
    q = {"format": "json", "formatversion": "2", **params}
    st, body, _ = http_get(API + "?" + urllib.parse.urlencode(q))
    time.sleep(DELAY)
    if st != 200:
        raise RuntimeError(f"commons api http={st}")
    return json.loads(body)


def clean(s: str | None) -> str:
    """extmetadata values are HTML fragments; reduce to plain text."""
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", H.unescape(s)).strip()


def meta_row(page: dict) -> dict | None:
    ii = (page.get("imageinfo") or [None])[0]
    if not ii:
        return None
    em = ii.get("extmetadata") or {}
    mv = lambda k: clean((em.get(k) or {}).get("value"))
    lic_short = mv("LicenseShortName")
    lic = classify_license(lic_short, mv("UsageTerms"))
    return {
        "file": page["title"],
        "page_url": ii.get("descriptionurl"),
        "original_url": ii.get("url"),
        "thumb_url": ii.get("thumburl"),
        "width": ii.get("width"),
        "height": ii.get("height"),
        "mime": ii.get("mime"),
        "license_raw": lic_short,
        "license": lic,
        "license_url": mv("LicenseUrl") or None,
        "author": mv("Artist"),
        "credit": mv("Credit"),
        "description": mv("ImageDescription"),
        "restrictions": mv("Restrictions"),
        "attribution_required": mv("AttributionRequired"),
    }


IIPROP = "url|size|mime|extmetadata"


def search_one(query: str, limit: int = 12) -> list[dict]:
    data = api({
        "action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": limit,
        "gsrsearch": f"{query} filetype:bitmap",
        "prop": "imageinfo", "iiprop": IIPROP, "iiurlwidth": REVIEW_WIDTH,
    })
    rows = []
    for p in data.get("query", {}).get("pages", []):
        r = meta_row(p)
        if r and r["mime"] in ("image/jpeg", "image/png", "image/webp"):
            rows.append(r)
    rows.sort(key=lambda r: 0)  # keep API relevance order (stable)
    return rows


def cmd_search(recipes_file: str, per_recipe: int, out_name: str = "candidates.json") -> None:
    recipes = json.loads(Path(recipes_file).read_text(encoding="utf-8"))
    out: dict[str, list] = {}
    for rec in recipes:
        slug = rec["slug"]
        seen, keep, rejected = set(), [], 0
        for q in rec.get("queries") or [rec["title"]]:
            for r in search_one(q):
                if r["file"] in seen:
                    continue
                seen.add(r["file"])
                if r["license"] is None:
                    rejected += 1
                    continue
                keep.append(r)
        keep = keep[:per_recipe]
        out[slug] = keep
        d = CACHE / "commons" / "review" / slug
        d.mkdir(parents=True, exist_ok=True)
        for i, r in enumerate(keep):
            st, body, _ = http_get(r["thumb_url"] or r["original_url"])
            time.sleep(DELAY)
            if st == 200:
                (d / f"{i}.jpg").write_bytes(body)
        print(f"{slug}: {len(keep)} licence-ok candidates ({rejected} rejected on licence)", file=sys.stderr)
    write_json(CACHE / "commons" / out_name, out)
    print(f"wrote {CACHE / 'commons' / out_name}; review images in {CACHE / 'commons' / 'review'}", file=sys.stderr)


def cmd_build(picks_file: str, recipes_file: str) -> None:
    picks: dict[str, str] = json.loads(Path(picks_file).read_text(encoding="utf-8"))
    titles = {r["slug"]: r["title"] for r in json.loads(Path(recipes_file).read_text(encoding="utf-8"))}
    rows, errors = [], []
    for slug, fname in picks.items():
        if fname.startswith("_"):
            continue
        data = api({
            "action": "query", "titles": fname, "prop": "imageinfo",
            "iiprop": IIPROP, "iiurlwidth": WEB_WIDTH,
        })
        page = data["query"]["pages"][0]
        r = meta_row(page)
        if not r:
            errors.append(f"{slug}: {fname} not found")
            continue
        if r["license"] is None:
            errors.append(f"{slug}: {fname} licence '{r['license_raw']}' is not on the allowlist -- REFUSED")
            continue
        if not r["author"]:
            errors.append(f"{slug}: {fname} has no author in metadata -- cannot attribute, REFUSED")
            continue
        # Download the web-size rendition (Commons generates it; never the 20 MB original).
        url = r["thumb_url"] if (r["width"] or 0) > WEB_WIDTH else r["original_url"]
        st, body, _ = http_get(url)
        time.sleep(DELAY)
        if st != 200:
            errors.append(f"{slug}: download http={st}")
            continue
        d = CACHE / "commons" / "images"
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{slug}.bin").write_bytes(body)
        rows.append({
            "slug": slug,
            "recipe_title": titles.get(slug, ""),
            "source": "wikimedia_commons",
            "license": r["license"],
            "license_raw": r["license_raw"],
            "license_url": r["license_url"],
            "author": r["author"],
            "credit": r["author"],            # what recipe_photos.credit shows
            "alt_text": titles.get(slug, "") or None,
            "credit_line": r["credit"],
            "attribution_url": r["page_url"],
            "source_image_url": url,
            "file": r["file"],
            "description": r["description"],
            "sha256": hashlib.sha256(body).hexdigest(),
            "evidence": f"Commons file page {r['page_url']} reports licence '{r['license_raw']}' via the MediaWiki API (extmetadata.LicenseShortName); image reviewed by a human/agent as showing this dish.",
            "image_cache": f"commons/images/{slug}.bin",
        })
        print(f"{slug}: {r['license']} by {r['author'][:50]!r}", file=sys.stderr)
    write_json(MANIFEST_DIR / "commons.json", rows)
    for e in errors:
        print("ERROR", e, file=sys.stderr)
    print(f"{len(rows)} manifest rows, {len(errors)} errors", file=sys.stderr)
    if errors:
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("recipes")
    s.add_argument("--per-recipe", type=int, default=6)
    s.add_argument("--out", default="candidates.json", help="file name under cache/commons (lets several searches run side by side)")
    b = sub.add_parser("build")
    b.add_argument("picks")
    b.add_argument("recipes")
    sub.add_parser("selftest")
    a = ap.parse_args()
    if a.cmd == "selftest":
        selftest()
    elif a.cmd == "search":
        cmd_search(a.recipes, a.per_recipe, a.out)
    else:
        cmd_build(a.picks, a.recipes)


if __name__ == "__main__":
    main()
