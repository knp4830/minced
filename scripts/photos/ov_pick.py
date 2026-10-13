#!/usr/bin/env python3
"""Turn review-sheet tile numbers into picks.

    python scripts/photos/ov_pick.py 1 11 15 ...      # tile numbers printed on cache/openverse/sheets/*.png
    python scripts/photos/ov_pick.py --show 1 11      # just print who/licence, change nothing
    python scripts/photos/ov_pick.py 15=other-slug    # use tile 15's photo for a DIFFERENT recipe that fits it better

Writes/merges manifest/openverse_picks.json ({slug: candidate id}); then run `openverse.py build manifest/openverse_picks.json`.
One pick per recipe (a later tile for the same slug replaces the earlier one).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, write_json  # noqa: E402

OV = CACHE / "openverse"


def main() -> None:
    show = "--show" in sys.argv
    tiles = [a for a in sys.argv[1:] if not a.startswith("--")]
    cands = {}
    for f in sorted(OV.glob("cand_ov_*.json")):
        cands.update(json.loads(f.read_text(encoding="utf-8")))
    idx = {t["n"]: t for t in json.loads((OV / "sheets" / "index.json").read_text(encoding="utf-8"))}
    pf = MANIFEST_DIR / "openverse_picks.json"
    picks = json.loads(pf.read_text(encoding="utf-8")) if pf.exists() else {}
    photoless = {r["slug"]: r for r in json.loads((CACHE / "photoless.json").read_text(encoding="utf-8"))}
    remap_f = OV / "remap_ov.json"
    remap = json.loads(remap_f.read_text(encoding="utf-8")) if remap_f.exists() else {}
    for arg in tiles:
        n, _, target = arg.partition("=")
        n = int(n)
        t = idx[n]
        c = cands[t["slug"]]["cands"][t["i"]]
        if target:
            r = photoless[target]
            remap[target] = {"title": r["title"], "ingredients": r["ingredients"] or [], "cands": [c]}
            t = {"slug": target}
            if not show:
                write_json(remap_f, remap)
        print(f"{n:4d} {t['slug']:45s} {c['id'][:12]} {c['license']:12s} {c['provider']:10s} {c['creator']!r} {c['landing'][:60]}")
        picks[t["slug"]] = c["id"]
    if not show:
        write_json(pf, picks)
        print(f"{len(picks)} picks in {pf.name}")


if __name__ == "__main__":
    main()
