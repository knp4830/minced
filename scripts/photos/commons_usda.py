#!/usr/bin/env python3
"""USDA's own recipe photos on Wikimedia Commons (uploaded from the USDA Flickr stream, public domain federal works).

    python scripts/photos/commons_usda.py list               # enumerate files by prefix -> cache/commons/usda_files.json
    python scripts/photos/commons_usda.py match              # match descriptions to photo-less recipe titles -> cache/commons/usda_cands.json

Prefixes (File: namespace) are the upload series names; the description starts with the dish name
("Tabbouleh. Find this Team Nutrition child care recipe ..."). A human still looks at every match
(review_sheets.py) against the recipe's ingredients before a pick is built with commons_w4.py build.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons as C  # noqa: E402
from common import CACHE, http_get, write_json  # noqa: E402

PREFIXES = ["Child Care Recipes (Team Nutiriton)", "Child Care Recipes (Team Nutrition)", "MyPlate gov", "Cultural Foods",
            "Team Nutrition", "USDA FNS", "Recipes ("]
OUT = CACHE / "commons" / "usda_files.json"


def cmd_list() -> None:
    rows = {}
    for pre in PREFIXES:
        cont = None
        while True:
            params = {"action": "query", "generator": "allimages", "gaiprefix": pre, "gailimit": 50,
                      "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 480}
            if cont:
                params.update(cont)
            data = C.api(params)
            for p in data.get("query", {}).get("pages", []):
                ii = (p.get("imageinfo") or [{}])[0]
                md = ii.get("extmetadata", {})
                rows[p["title"]] = {
                    "file": p["title"], "width": ii.get("width"), "height": ii.get("height"),
                    "thumb_url": ii.get("thumburl"), "original_url": ii.get("url"),
                    "description": re.sub(r"<[^>]+>", "", md.get("ImageDescription", {}).get("value", "")),
                    "license": md.get("LicenseShortName", {}).get("value"),
                    "author": re.sub(r"<[^>]+>", "", md.get("Artist", {}).get("value", "")),
                }
            cont = data.get("continue")
            if not cont:
                break
        print(pre, len(rows), file=sys.stderr, flush=True)
    write_json(OUT, rows)


def norm(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", s.lower()) if len(w) > 2 and w not in {"and", "the", "with", "for"}}


def cmd_match() -> None:
    files = json.loads(OUT.read_text(encoding="utf-8"))
    details = {r["slug"]: r for r in json.loads((CACHE / "details.json").read_text(encoding="utf-8"))}
    have = {r["slug"] for r in json.loads((Path(__file__).resolve().parent / "manifest" / "photos.json").read_text(encoding="utf-8"))}
    out: dict[str, dict] = {}
    for f in files.values():
        dish = re.split(r"\.\s|\sFind this| - ", f["description"])[0].strip()
        dn = norm(dish)
        if not dn:
            continue
        for slug, r in details.items():
            if slug in have:
                continue
            tn = norm(r["title"])
            if not tn:
                continue
            inter = len(dn & tn) / max(len(dn), len(tn))
            if inter >= 0.6:
                out.setdefault(slug, {"title": r["title"], "cands": []})["cands"].append({**f, "score": round(inter, 2), "dish": dish})
    for v in out.values():
        v["cands"].sort(key=lambda c: -c["score"])
    for slug, v in out.items():
        d = CACHE / "commons" / "review4" / slug
        d.mkdir(parents=True, exist_ok=True)
        for i, c in enumerate(v["cands"][:4]):
            if not (d / f"{i}.jpg").exists() and c["thumb_url"]:
                st, body, _ = http_get(c["thumb_url"])
                time.sleep(C.DELAY)
                if st == 200:
                    (d / f"{i}.jpg").write_bytes(body)
    write_json(CACHE / "commons" / "cand_w7_usda.json", out)
    print(f"{len(files)} files, {len(out)} photo-less recipes with a title match")
    for s, v in out.items():
        print(s, "<-", [c["dish"] for c in v["cands"]][:3])


if __name__ == "__main__":
    {"list": cmd_list, "match": cmd_match}[sys.argv[1]]()
