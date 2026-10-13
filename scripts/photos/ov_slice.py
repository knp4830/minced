#!/usr/bin/env python3
"""Pick which photo-less recipes to send to Openverse first (its anonymous budget is ~200 requests/day).

    python scripts/photos/ov_slice.py > cache/ov_slice.json

Order: recipes that can never get a USDA photo first (not MyPlate, or the MyPlate page names a third-party source /
a stock credit), then the rest. Within a group, recipes with a two-or-more-word specific title come first because a
one-word generic title ("Salad") matches anything. Recipes that already have a photo in any manifest are skipped.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR  # noqa: E402

GENERIC = set("salad soup sauce dip bread cake cookie cookies muffin muffins stew bowl wrap sandwich sandwiches".split())


def main() -> None:
    rows = json.loads((CACHE / "photoless.json").read_text(encoding="utf-8"))
    dec = {d["slug"]: d for d in json.loads((MANIFEST_DIR / "myplate_decisions.json").read_text(encoding="utf-8"))}
    have = set()
    for n in ("myplate.json", "commons.json", "openverse.json", "pexels.json"):
        f = MANIFEST_DIR / n
        if f.exists():
            have |= {r["slug"] for r in json.loads(f.read_text(encoding="utf-8"))}
    out = []
    for r in rows:
        if r["slug"] in have:
            continue
        d = dec.get(r["slug"])
        permanent = d is None or (not d["include"] and not (d["reason"] or "").startswith("unusable"))
        words = [w for w in r["title"].lower().split() if w not in GENERIC]
        out.append((0 if permanent else 1, 0 if len(words) >= 2 else 1, r))
    out.sort(key=lambda t: (t[0], t[1]))
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    print(json.dumps([t[2] for t in out], ensure_ascii=False, indent=1))
    print(f"{len(out)} candidates; {sum(1 for t in out if t[0] == 0)} permanent (no USDA photo possible)", file=sys.stderr)


if __name__ == "__main__":
    main()
