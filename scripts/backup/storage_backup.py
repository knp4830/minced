#!/usr/bin/env python3
"""List a Supabase Storage bucket and (optionally) download every object. Standard library only.

    python scripts/backup/storage_backup.py --out DIR [--bucket recipe-photos] [--manifest-only]

Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from the environment and never prints the key.
Writes DIR/storage-manifest.csv (path, size, content type, updated_at) and, unless --manifest-only,
DIR/<bucket>/<path> for each object. Read-only: it only lists and downloads.
"""
import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

PAGE = 100


def call(url, key, body=None):
    req = urllib.request.Request(
        url,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def list_prefix(base, key, bucket, prefix):
    """Yield every object (not folder) under prefix, recursing into folders."""
    offset = 0
    while True:
        raw = call(
            f"{base}/storage/v1/object/list/{bucket}",
            key,
            {"prefix": prefix, "limit": PAGE, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
        )
        items = json.loads(raw)
        for it in items:
            name = it["name"]
            path = f"{prefix}/{name}" if prefix else name
            if it.get("id") is None:  # a folder
                yield from list_prefix(base, key, bucket, path)
            else:
                meta = it.get("metadata") or {}
                yield {
                    "path": path,
                    "size": meta.get("size", ""),
                    "content_type": meta.get("mimetype", ""),
                    "updated_at": it.get("updated_at", ""),
                }
        if len(items) < PAGE:
            return
        offset += PAGE


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--bucket", default="recipe-photos")
    ap.add_argument("--manifest-only", action="store_true")
    a = ap.parse_args()

    base = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not base or not key:
        sys.exit("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (e.g. set -a; . .env.local; set +a).")

    os.makedirs(a.out, exist_ok=True)
    objects = list(list_prefix(base, key, a.bucket, ""))
    with open(os.path.join(a.out, "storage-manifest.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "size", "content_type", "updated_at"])
        w.writeheader()
        w.writerows(objects)
    print(f"manifest: {len(objects)} objects in bucket {a.bucket}")
    if a.manifest_only:
        return

    failed = 0
    for i, o in enumerate(objects, 1):
        dest = os.path.join(a.out, a.bucket, *o["path"].split("/"))
        if os.path.exists(dest) and str(os.path.getsize(dest)) == str(o["size"]):
            continue  # resumable: already downloaded
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        url = f"{base}/storage/v1/object/{a.bucket}/{urllib.parse.quote(o['path'])}"
        try:
            data = call(url, key)
            with open(dest, "wb") as f:
                f.write(data)
        except (urllib.error.URLError, TimeoutError) as e:
            failed += 1
            print(f"  failed: {o['path']} ({getattr(e, 'code', type(e).__name__)})", file=sys.stderr)
        if i % 50 == 0:
            print(f"  {i}/{len(objects)}")
    print(f"downloaded {len(objects) - failed}/{len(objects)}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
