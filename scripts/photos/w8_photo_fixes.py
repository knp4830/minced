#!/usr/bin/env python3
"""Wave 8 photo regressions (verifier round 2). One-off, idempotent record of the manifest edits.

 - revert 4 slugs to their old USDA MyPlate photo (the wave-8 Commons swap was a regression);
 - revert menemen to its previous Commons file (the swap shows no egg);
 - remove 4 slugs whose wave-8 replacement is not acceptable (placeholder beats it);
 - fish-spinach: the file rejected in wave 3 had returned; the rejection now names the file.
Run from the repo root, then process_images.py, apply_manifest.py, check_manifests.py.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
M = HERE / "manifest"
sys.path.insert(0, str(HERE))
from common import write_json  # noqa: E402

BUCKET = "wave8_photo_fixes_2026_10_16"


def git_show(name):
    return json.loads(subprocess.check_output(["git", "show", f"origin/main:scripts/photos/manifest/{name}"], text=True, encoding="utf-8"))


def load(name):
    return json.loads((M / name).read_text(encoding="utf-8"))


def reject(rej, slug, file, why):
    rej.setdefault(BUCKET, {})[slug] = f"{file}: {why}"


def main():
    rej, commons, myplate, excl = load("commons_r2_rejected.json"), load("commons.json"), load("myplate.json"), load("myplate_review_excludes.json")
    old_my = {r["slug"]: r for r in git_show("myplate.json")}
    old_commons = {r["slug"]: r for r in git_show("commons.json")}
    cur = {r["slug"]: r for r in commons}
    picks_w8 = load("commons_picks_w8.json")

    # 1/2. back to the old USDA photo
    for slug, why in {
        "fish-spinach": "returned after being rejected in wave 3 ('no visible fish'); USDA photo restored",
        "tofu-broccoli": "wave 8 swap was worse than the USDA photo; USDA photo restored",
        "stir-fried-beef": "wave 8 swap was worse than the USDA photo; USDA photo restored",
        "baked-trout": "wave 8 swap was worse than the USDA photo; USDA photo restored",
    }.items():
        if slug in cur:
            reject(rej, slug, cur[slug]["file"], why)
            commons = [r for r in commons if r["slug"] != slug]
        picks_w8.pop(slug, None)
        excl.pop(slug, None)
        if not any(r["slug"] == slug for r in myplate):
            myplate.append(old_my[slug])
    myplate.sort(key=lambda r: r["slug"])

    # menemen: previous Commons file back (the new one shows no egg)
    if "menemen" in cur and cur["menemen"]["file"] != old_commons["menemen"]["file"]:
        reject(rej, "menemen", cur["menemen"]["file"], "no egg visible, phone snapshot; the previous photo is restored")
        commons = [r for r in commons if r["slug"] != "menemen"] + [old_commons["menemen"]]
        picks_w8.pop("menemen", None)
        for bucket in rej.values():   # un-reject the old file (owner instruction: previous photo beats the new one)
            if isinstance(bucket, dict) and str(bucket.get("menemen", "")).startswith("File:Turkish egg dish Menemen.jpg") and bucket is not rej[BUCKET]:
                del bucket["menemen"]
        picks = json.loads((M / "commons_picks.json").read_text(encoding="utf-8"))
        picks["menemen"] = old_commons["menemen"]["file"]
        write_json(M / "commons_picks.json", dict(sorted(picks.items())))
        src = HERE / "cache" / "commons" / "images" / "menemen.bin"
        for wt in HERE.parents[2].glob("*/scripts/photos/cache/commons/images/menemen.bin"):
            import hashlib
            if hashlib.sha256(wt.read_bytes()).hexdigest() == old_commons["menemen"]["sha256"]:
                shutil.copyfile(wt, src)
                break

    # remove: no acceptable photo
    for slug, why in {
        "shepherds-pie": "gas stove with a visible brand in the frame",
        "rice-pudding1": "scribbled napkin in the frame",
        "cafe-mocha": "beer bottle in the frame; not clearly a mocha",
        "banh-mi": "bottle and paper clutter around the sandwich",
    }.items():
        if slug in {r["slug"] for r in commons}:
            row = next(r for r in commons if r["slug"] == slug)
            reject(rej, slug, row["file"], why)
            commons = [r for r in commons if r["slug"] != slug]
        picks_w8.pop(slug, None)
    excl.setdefault("cafe-mocha", "newspaper and napkin in frame, harsh light")

    write_json(M / "commons.json", commons)
    write_json(M / "myplate.json", myplate)
    write_json(M / "myplate_review_excludes.json", excl)
    write_json(M / "commons_picks_w8.json", picks_w8)
    write_json(M / "commons_r2_rejected.json", rej)

    # note-only reject entries: put the file name in front so a rebuild can match it
    rej = load("commons_r2_rejected.json")
    rej["fish-spinach"] = "File:Oriental oven Fish on spinach.jpg: verifier r1: no visible fish"
    for b in ("wave3_fixer_dropped",):
        if "fish-spinach" in rej[b]:
            rej[b]["fish-spinach"] = "File:Oriental oven Fish on spinach.jpg: photo reads as egg/frittata gratin, no visible fish"
    write_json(M / "commons_r2_rejected.json", rej)


main()
