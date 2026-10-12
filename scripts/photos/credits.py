#!/usr/bin/env python3
"""Clean on-photo credit strings (recipe_photos.credit is shown in the photo corner).

    python scripts/photos/credits.py            # rewrite `credit` in manifest/commons.json, print changes
    python scripts/photos/credits.py --check    # exit 1 if any credit is still long/junk (CI-style)

Rules (the licence link and the full `author` stay untouched in the manifest):
  * strip Commons boilerplate: "No machine-readable author provided", "(photographer)", "by ", "User:",
    "(a flickr user)", "w:", "en:", wiki file names, "Uploaded by ...", ellipsis fragments;
  * strip the Flickr-import ' from <City, Country>' suffix;
  * a raw Flickr URL becomes the user name in its path;
  * append " / Flickr" only when the manifest itself says the photo came from Flickr;
  * hard cap 40 characters.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from common import write_json  # noqa: E402
MANIFEST = ROOT / "manifest" / "commons.json"
LIMIT = 40

# Hand fixes where the Commons metadata has no usable name. Keyed by slug; reason in the comment.
OVERRIDES = {
    # Artist is literally "??? ???" on Commons (Flickr import lost a non-Latin name); the page link carries attribution.
    "curried-chicken-salad": "Evan Joshua Swigart / Flickr",
    "canh-chua": "Phương Huy",
    "sinigang-na-baboy": "Flickr user",
    # Artist is "File:Rice and Peas.png : Whispyhistory conversion to jpg: Hike395": the author is Whispyhistory.
    "jamaican-rice-and-peas": "Whispyhistory",
    # "No machine-readable author provided. J.P.Lon~commonswiki assumed (based on copyright claims)."
    "buttermilk-scones": "J.P.Lon",
    # Artist "Original uploader was <name> at zh.wikipedia" (Chinese-wiki transfer)
    "spaghetti-quick-meat-sauce": "酒池肉林",
    # "No machine-readable author provided. Interiot~commonswiki assumed (based on copyright claims)."
    "basic-custard": "Interiot",
    # "Photo made by Daniel Spils and uploaded to flickr.com"
    "oven-baked-potato-pancakes": "Daniel Spils",
}

FLICKR_URL = re.compile(r"flickr\.com/photos/([^/\s]+)", re.I)


def is_flickr(row: dict) -> bool:
    blob = " ".join(str(row.get(k) or "") for k in ("author", "credit_line", "description", "source_image_url"))
    return bool(re.search(r"flickr", blob, re.I))


def clean_credit(row: dict) -> str:
    slug = row["slug"]
    if slug in OVERRIDES:
        return OVERRIDES[slug]
    a = re.sub(r"\s+", " ", row.get("author") or "").strip()
    flickr = is_flickr(row) and "agriculture" not in a.lower()   # USDA's own Flickr stream: the agency is the credit
    m = FLICKR_URL.search(a)
    if m:
        a, flickr = m.group(1), True
    a = re.sub(r"^(Photographer:|Photo by|by)\s+", "", a, flags=re.I)
    a = re.sub(r"^(User:|w:User:|en:User:|User)\s*", "", a, flags=re.I) if re.match(r"(User:|w:User:|en:User:|User )", a, re.I) else a
    a = re.sub(r"\s*\((a flickr user|photographer|flickr)\)", "", a, flags=re.I)
    a = re.sub(r"\s+on (en\.wikipedia|flickr)$", "", a, flags=re.I)
    a = re.sub(r"\s+at English Wikipedia$", "", a, flags=re.I)
    a = re.sub(r",?\s*(Original uploader|edited by|Uploaded by|Transferred).*$", "", a, flags=re.I)
    a = re.sub(r";\s.*$", "", a)
    a = re.sub(r"\s+--.*$", "", a)                       # "CityMama --Stefania Pomponi Butler"
    pm = re.search(r"\(([^()]{3,30})\)$", a)
    if pm and len(a) > LIMIT - 10:                         # "Evan Joshua Swigart (TheCulinaryGeek)"
        a = pm.group(1)
    a = re.sub(r"\s+from\s+[A-Z][^()]*$", "", a)          # Flickr-import "Name from City, Country"
    a = re.sub(r"\s*\.{2,}$|…$", "", a).strip(" ,;:")
    if re.match(r"No machine-readable", a, re.I) or not a:
        a = "Unknown"
    a = a.replace("tomatoes and friendstomatoes and friends", "tomatoes and friends")
    suffix = " / Flickr" if flickr and "flickr" not in a.lower() else ""
    if len(a) + len(suffix) > LIMIT:
        a = a[: LIMIT - len(suffix) - 1].rstrip() + "…"
    return a + suffix


def junk(c: str) -> bool:
    return len(c) > LIMIT or bool(re.search(r"File:|machine-readable|https?://|\?\?\?|Uploaded by|Photographer:", c))


def main() -> None:
    rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    changed = 0
    for r in rows:
        new = clean_credit(r)
        if new != r["credit"]:
            changed += 1
            print(f"{r['slug']:40s} {r['credit'][:50]!r:54s} -> {new!r}")
            r["credit"] = new
    bad = [r["slug"] for r in rows if junk(r["credit"])]
    if "--check" in sys.argv:
        sys.exit(1 if bad or changed else 0)
    MANIFEST.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{changed} credits changed; still junk: {bad}")


if __name__ == "__main__":
    main()
