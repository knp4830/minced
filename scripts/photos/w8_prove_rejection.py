#!/usr/bin/env python3
"""Prove that photos removed in wave 8 cannot come back from a rebuild.

    python scripts/photos/w8_prove_rejection.py

Takes the manifests as committed in origin/main (before wave 8) and appends EVERY old row of a slug that wave 8
removed or replaced to the working manifests (commons.json, openverse.json, myplate.json) - the blurry file
next to its replacement, or alone for a removed recipe. Runs process_images.py, then checks that photos.json
equals the wave-8 result and that none of the old files is in it. Restores the working manifests byte for byte.
Exit 1 if anything came back.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
M = HERE / "manifest"
ROOT = HERE.parents[1]
NAMES = ("commons.json", "openverse.json", "myplate.json", "photos.json")


def old(name: str) -> list[dict]:
    out = subprocess.run(["git", "show", f"origin/main:scripts/photos/manifest/{name}"], cwd=ROOT,
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return json.loads(out)


def main() -> None:
    rej = json.loads((M / "commons_r2_rejected.json").read_text(encoding="utf-8")).get("wave8_quality_2026_10_16", {})
    ex = json.loads((M / "myplate_review_excludes.json").read_text(encoding="utf-8"))
    backup = {n: (M / n).read_bytes() for n in NAMES}
    before = json.loads(backup["photos.json"])
    rc = 1
    try:
        injected, old_files = 0, set()
        for name in ("commons.json", "openverse.json", "myplate.json"):
            cur = json.loads((M / name).read_text(encoding="utf-8"))
            for r in old(name):
                # MyPlate rows are kept out by myplate_review_excludes.json (all waves); Commons/Openverse rows by the wave-8 bucket
                if (r["slug"] in ex) if name == "myplate.json" else (r["slug"] in rej):
                    cur.append(r)
                    injected += 1
                    old_files.add((r["slug"], r.get("file") or r.get("attribution_url")))
            (M / name).write_text(json.dumps(cur, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        r = subprocess.run([sys.executable, str(HERE / "process_images.py")], capture_output=True, text=True, encoding="utf-8")
        dropped = [l for l in r.stderr.splitlines() if l.startswith("DROPPED")]
        after = json.loads((M / "photos.json").read_text(encoding="utf-8"))
        back = sorted({x["slug"] for x in after} - {x["slug"] for x in before})
        stale = sorted(x["slug"] for x in after if (x["slug"], x.get("file") or x.get("attribution_url")) in old_files)
        same = [(x["slug"], x["storage_path"]) for x in after] == [(x["slug"], x["storage_path"]) for x in before]
        print(f"injected {injected} old rows; DROPPED {len(dropped)}; photos.json {len(after)} rows (wave-8 result: {len(before)}); "
              f"slugs back: {back}; old files still present: {stale}; identical to the wave-8 result: {same}")
        rc = 0 if (not back and not stale and same) else 1
        print("PASS" if rc == 0 else "FAIL")
    finally:
        for n, b in backup.items():
            (M / n).write_bytes(b)
    sys.exit(rc)


if __name__ == "__main__":
    main()
