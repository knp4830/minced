#!/usr/bin/env python3
"""Upload processed photos to the Supabase Storage bucket `recipe-photos`.

    # dry run (default): lists what WOULD be uploaded, touches nothing
    python scripts/photos/upload_photos.py

    # real upload -- LIVE. Run only after the wave is merged (see the report's
    # post_merge_live_steps). Needs the secret key in the environment:
    set -a; . .env.local; set +a
    python scripts/photos/upload_photos.py --apply

    # point at anything else (used by test_upload.py against a local mock)
    python scripts/photos/upload_photos.py --apply --base-url http://localhost:8099

Why this is safe to re-run: object paths contain a hash of their bytes
(`usda/corn-bread/md.3fa9c1d2.webp`). An existing path therefore IS the same
file, so it is skipped, and the files can be cached for a year as `immutable`.
Replacing a photo means a new hash, hence a new URL -- no stale-cache problem.

The secret key bypasses RLS and must never reach a browser; this script reads it
from the environment only and never prints it. The bucket is public-READ (photos
are public pages' content) and has no write policy, so only the secret key can
write -- matching the "no client writes" rule on recipe_photos.

Standard library only (urllib), like the rest of scripts/photos.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import MANIFEST_DIR, OUT, USER_AGENT  # noqa: E402

BUCKET = "recipe-photos"
CACHE_CONTROL = "public, max-age=31536000, immutable"


def req(method: str, url: str, key: str, body: bytes | None = None, headers: dict | None = None):
    h = {"Authorization": f"Bearer {key}", "apikey": key, "User-Agent": USER_AGENT, **(headers or {})}
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ensure_bucket(base: str, key: str) -> None:
    payload = json.dumps({
        "id": BUCKET, "name": BUCKET, "public": True,
        "file_size_limit": 1_048_576,                # 1 MB per object: our largest is ~100 KB
        "allowed_mime_types": ["image/webp"],
    }).encode()
    st, body = req("POST", f"{base}/storage/v1/bucket", key, payload, {"Content-Type": "application/json"})
    if st in (200, 201):
        print(f"bucket {BUCKET}: created (public read)")
    elif st in (400, 409) and b"already exists" in body.lower():
        print(f"bucket {BUCKET}: already exists")
    else:
        sys.exit(f"bucket create failed: http {st} {body[:200]!r}")


def exists(base: str, path: str) -> bool:
    r = urllib.request.Request(f"{base}/storage/v1/object/public/{BUCKET}/{path}", method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status == 200
    except urllib.error.HTTPError:
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually upload (default is a dry run)")
    ap.add_argument("--base-url", default=None, help="override NEXT_PUBLIC_SUPABASE_URL")
    ap.add_argument("--manifest", default=str(MANIFEST_DIR / "photos.json"))
    a = ap.parse_args()

    rows = json.loads(Path(a.manifest).read_text(encoding="utf-8"))
    files = []
    for r in rows:
        for p in (r["storage_path"], r.get("thumb_path")):
            if p:
                files.append((p, OUT / p))  # process_images.py writes OUT/<storage path>
    files = list(dict.fromkeys(files))
    missing = [str(f) for _, f in files if not f.exists()]
    if missing:
        sys.exit(f"{len(missing)} processed files missing, run process_images.py first (e.g. {missing[0]})")
    total = sum(f.stat().st_size for _, f in files)
    print(f"{len(files)} objects, {total / 1e6:.1f} MB for {len(rows)} recipes")

    if not a.apply:
        print("dry run -- nothing uploaded. Re-run with --apply to upload.")
        return

    base = (a.base_url or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not base or not key:
        sys.exit("need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in the environment")
    ensure_bucket(base, key)
    up = skipped = failed = 0
    for path, f in files:
        if exists(base, path):
            skipped += 1
            continue
        st, body = req("POST", f"{base}/storage/v1/object/{BUCKET}/{path}", key, f.read_bytes(),
                       {"Content-Type": "image/webp", "Cache-Control": CACHE_CONTROL, "x-upsert": "false"})
        if st in (200, 201):
            up += 1
        elif st in (400, 409) and b"exists" in body.lower():
            skipped += 1
        else:
            failed += 1
            print(f"FAILED {path}: http {st} {body[:120]!r}", file=sys.stderr)
    print(f"uploaded {up}, already present {skipped}, failed {failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
