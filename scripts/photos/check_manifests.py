#!/usr/bin/env python3
"""Consistency gate for the photo manifests. Exit 1 on any problem.

    python scripts/photos/check_manifests.py [--recipes cache/details.json]

Checks (all offline):
  1. one file / one recipe: no source image (sha256, attribution URL, file name) is used by two slugs;
  2. rejected photos never return: no (slug, file) pair from commons_r2_rejected.json is in photos.json or in ANY *picks*.json,
     and no USDA photo whose slug is in myplate_review_excludes.json is in photos.json;
  3. no recipe appears twice;
  4. with --recipes (export_details.py output): every slug in photos.json is a recipe that exists.
"""
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import is_rejected, picks_files, rejected_refs  # noqa: E402

M = Path(__file__).resolve().parent / "manifest"


def load(name):
    return json.loads((M / name).read_text(encoding="utf8"))


def main():
    photos = load("photos.json")
    problems = []

    slugs = collections.Counter(r["slug"] for r in photos)
    problems += [f"slug listed twice: {s}" for s, n in slugs.items() if n > 1]

    for key in ("sha256", "attribution_url", "source_image_url"):
        by = collections.defaultdict(list)
        for r in photos:
            if r.get(key):
                by[r[key]].append(r["slug"])
        problems += [f"same {key} on {v}" for v in by.values() if len(v) > 1]

    rej = rejected_refs()
    for r in photos:
        if is_rejected(r["slug"], r.get("file"), r.get("attribution_url"), r.get("source_image_url"), rejected=rej):
            problems.append(f"rejected photo is back: {r['slug']} {r.get('file') or r.get('attribution_url')}")
    for pf in picks_files():   # a rejected pick left in a picks file is re-added by the next build
        for slug, pick in json.loads(pf.read_text(encoding="utf8")).items():
            if is_rejected(slug, str(pick), rejected=rej):
                problems.append(f"rejected pick still in {pf.name}: {slug} {pick}")
    usda = {r["slug"] for r in photos if r.get("source") == "usda_myplate"}
    for slug in load("myplate_review_excludes.json"):   # only the USDA photo was rejected; another source may fill the slug
        if slug in usda:
            problems.append(f"MyPlate review-excluded photo is back: {slug}")

    if "--recipes" in sys.argv:
        path = Path(sys.argv[sys.argv.index("--recipes") + 1])
        exist = {r["slug"] for r in json.loads(path.read_text(encoding="utf8"))}
        problems += [f"photo for a recipe that does not exist: {s}" for s in slugs if s not in exist]

    for p in problems:
        print("PROBLEM", p)
    print(f"{len(photos)} photos, {len(problems)} problems")
    sys.exit(1 if problems else 0)


main()
