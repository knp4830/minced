#!/usr/bin/env python3
"""Pexels photos (Pexels License: free to use, attribution appreciated) -- OPTIONAL, needs an API key.

    python scripts/photos/pexels.py search cache/ov_slice.json --out cand_ov_px_0.json [--max-queries 150]

The key is read from PEXELS_API_KEY in the environment or in .env.local at the repo root (never printed, never
committed). Without a key the command exits with a plain message and does nothing: get a free key at
https://www.pexels.com/api/ and add `PEXELS_API_KEY=...` to .env.local.

Candidates are written in the same shape as openverse.py's (source "pexels"), so the SAME review sheets and the same
`openverse.py build` handle them; `build` writes manifest/pexels.json. Same rules: genuinely this dish (compare with the
ingredients on the sheet), no logos/brands/ads/people as the subject, creator recorded. Pexels asks API users to link
back to Pexels and credit photographers: the credit reads "<name> / Pexels" and attribution_url is the Pexels photo page.
Free tier: 200 requests/hour, 20,000/month. Image bytes come from images.pexels.com (not counted).

NOT exercised against the live API in wave 5 (no key was available); `selftest` covers the parsing and the gate.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons_r2 as R2  # noqa: E402
from common import USER_AGENT, http_get, write_json  # noqa: E402
from openverse import OV, RISKY  # noqa: E402

API = "https://api.pexels.com/v1/search"
LICENSE = "Pexels License"
LICENSE_URL = "https://www.pexels.com/license/"


def api_key() -> str | None:
    k = os.environ.get("PEXELS_API_KEY")
    if k:
        return k.strip()
    env = Path(__file__).resolve().parents[2] / ".env.local"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("PEXELS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"') or None
    return None


def to_candidate(p: dict, title: str, thr: float) -> dict | None:
    """One Pexels photo -> candidate, or None when it fails the gate. Pure function (selftest)."""
    alt = p.get("alt") or ""
    name = p.get("photographer")
    if not name or not p.get("url") or RISKY.search(alt):
        return None
    if (p.get("width") or 0) < 600 or (p.get("height") or 0) < 400:
        return None
    s = R2.score(title, {"file": alt, "description": ""})
    if s < thr:
        return None
    src = p.get("src") or {}
    return {"id": f"px{p['id']}", "score": round(s, 2), "title": alt, "creator": name, "creator_url": p.get("photographer_url"),
            "license": LICENSE, "license_url": LICENSE_URL, "landing": p["url"], "url": src.get("large2x") or src.get("large"),
            "provider": "pexels", "source": "pexels", "width": p.get("width"), "height": p.get("height"), "tags": []}


def cmd_search(path: str, out: str, thr: float, keep: int, max_queries: int) -> None:
    key = api_key()
    if not key:
        sys.exit("No PEXELS_API_KEY (env or .env.local). Skipping Pexels. Free key: https://www.pexels.com/api/")
    recs = json.loads(Path(path).read_text(encoding="utf-8"))
    outp = OV / out
    res = json.loads(outp.read_text(encoding="utf-8")) if outp.exists() else {}
    used = 0
    for rec in recs:
        if rec["slug"] in res:
            continue
        if used >= max_queries:
            break
        q = R2.queries(rec["title"])[0]
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode({"query": q + " food", "per_page": 15, "size": "large"}),
                                     headers={"Authorization": key, "User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=40) as r:
            photos = json.loads(r.read().decode("utf-8")).get("photos", [])
        used += 1
        time.sleep(2)
        cands = [c for c in (to_candidate(p, rec["title"], thr) for p in photos) if c]
        cands.sort(key=lambda c: -c["score"])
        cands = cands[:keep]
        d = OV / "review" / rec["slug"]
        d.mkdir(parents=True, exist_ok=True)
        for i, c in enumerate(cands):
            st, body, _ = http_get(c["url"], retries=2)
            if st == 200:
                (d / f"{i}.jpg").write_bytes(body)
        res[rec["slug"]] = {"title": rec["title"], "ingredients": rec.get("ingredients") or [], "cands": cands}
        write_json(outp, res)
        print(f"{rec['slug']}: {len(cands)}", file=sys.stderr, flush=True)


def selftest() -> None:
    p = {"id": 1, "width": 4000, "height": 3000, "url": "https://www.pexels.com/photo/x-1/", "photographer": "Ann", "photographer_url": "u",
         "alt": "Shakshuka in a cast iron pan", "src": {"large2x": "https://images.pexels.com/photos/1/x.jpeg"}}
    c = to_candidate(p, "Shakshuka", 0.67)
    assert c and c["license"] == LICENSE and c["credit" if "credit" in c else "creator"] == "Ann" and c["id"] == "px1"
    assert to_candidate({**p, "photographer": ""}, "Shakshuka", 0.67) is None
    assert to_candidate({**p, "alt": "Shakshuka at a restaurant"}, "Shakshuka", 0.67) is None
    assert to_candidate({**p, "alt": "A bowl of soup"}, "Shakshuka", 0.67) is None
    print("pexels selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("recipes")
    s.add_argument("--out", required=True)
    s.add_argument("--thr", type=float, default=0.67)
    s.add_argument("--keep", type=int, default=4)
    s.add_argument("--max-queries", type=int, default=150)
    sub.add_parser("selftest")
    a = ap.parse_args()
    cmd_search(a.recipes, a.out, a.thr, a.keep, a.max_queries) if a.cmd == "search" else selftest()
