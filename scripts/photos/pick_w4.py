#!/usr/bin/env python3
"""Turn reviewed contact-sheet tile numbers into picks.

    python scripts/photos/pick_w4.py 9 22 31 [--target other-slug=47]

Reads cache/commons/sheets4/index.json (written by `commons_w4.py sheets`), appends {slug: "File:..."} to
manifest/commons_picks_r15.json, and records EVERY slug that was on the sheets in cache/commons/reviewed_slugs.txt so the
next `sheets` round only shows new recipes. Then: commons_w4.py build manifest/commons_picks_r15.json cache/photoless.json
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
idx = json.loads((HERE / "cache" / "commons" / "sheets4" / "index.json").read_text(encoding="utf8"))
picks_f = HERE / "manifest" / "commons_picks_r15.json"
picks = json.loads(picks_f.read_text(encoding="utf8")) if picks_f.exists() else {}
for a in sys.argv[1:]:
    slug_override = None
    if "=" in a:
        a, slug_override = a.split("=", 1)       # tile=other-slug: the photo fits another recipe better
    t = idx[int(a)]
    picks[slug_override or t["slug"]] = "File:" + t["file"]
    print(f"{slug_override or t['slug']}: {t['file']}")
picks_f.write_text(json.dumps(picks, ensure_ascii=False, indent=1), encoding="utf8", newline="\n")
done_f = HERE / "cache" / "commons" / "reviewed_slugs.txt"
done = set(done_f.read_text(encoding="utf8").split()) if done_f.exists() else set()
done |= {t["slug"] for t in idx}
done_f.write_text("\n".join(sorted(done)), encoding="utf8")
print(len(picks), "picks;", len(done), "slugs reviewed so far")
