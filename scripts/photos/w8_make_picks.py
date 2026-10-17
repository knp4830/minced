#!/usr/bin/env python3
"""Turn review-sheet tile numbers into a picks file: python scripts/photos/w8_make_picks.py <sheets-dir-name> <out-picks.json> n n n ...

The sheet index (cache/w8/<sheets dir>/index.json) maps a tile number to (slug, Commons file name); picks are
{slug: "File:..."} for `w8_search.py build`. One tile per recipe: a second tile for the same slug is refused.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, write_json  # noqa: E402


def main() -> None:
    sheets, out, nums = sys.argv[1], Path(sys.argv[2]), [int(x) for x in sys.argv[3:]]
    idx = {r["n"]: r for r in json.loads((CACHE / "w8" / sheets / "index.json").read_text(encoding="utf-8"))}
    picks = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    for n in nums:
        r = idx[n]
        if r["slug"] in picks and picks[r["slug"]] != r["file"]:
            sys.exit(f"{r['slug']}: two tiles picked")
        picks[r["slug"]] = r["file"]
        print(n, r["slug"], r["file"][:70])
    write_json(out, picks)


if __name__ == "__main__":
    main()
