#!/usr/bin/env python3
"""Openverse photos (https://openverse.org): openly licensed images, mostly Flickr, searched by dish name.

    python scripts/photos/openverse.py search cache/photoless.json --out cand_ov_0.json [--max-queries 150]
    python scripts/photos/openverse.py sheets                  # numbered review sheets in cache/openverse/sheets/
    python scripts/photos/openverse.py build picks_ov.json     # picks: {"slug": "<openverse id>"}; merges into manifest/openverse.json
    python scripts/photos/openverse.py selftest

Rules, in code:
  * licence allowlist: CC0, public domain mark, CC BY, CC BY-SA (the API `license=` filter AND a re-check here).
    NC / ND / unknown are refused. A pick without a creator is refused (BY needs a name).
  * the title+tags gate keeps only results whose title/tags overlap the recipe title; a human then looks at every
    thumbnail against the recipe's ingredients (printed on the sheet) -- "genuinely this dish".
  * no logos/brands/ads/people-as-subject: RISKY words in the result title are dropped before download; the reviewer
    rejects the rest on sight.
  * anonymous API budget is 20 requests/minute and 200/day (response headers say how many are left). The search stops
    when the daily budget is nearly spent and records every query in cache/openverse/queried.json, so a rerun tomorrow
    continues instead of repeating. Image bytes come from the provider URL (Flickr), not from the API, so they are free.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons_r2 as R2  # noqa: E402
from common import CACHE, MANIFEST_DIR, USER_AGENT, http_get, write_json  # noqa: E402
from credits import LIMIT  # noqa: E402

API = "https://api.openverse.org/v1/images/"
OV = CACHE / "openverse"
QUERIED = OV / "queried.json"
SLEEP = 4.0                    # 15 requests/minute, under the 20/minute burst limit
MIN_AVAILABLE = 3              # stop when this few daily requests remain

# openverse licence code -> (manifest licence string, needs version)
LICENSES = {"cc0": "CC0", "pdm": "Public domain", "by": "CC BY", "by-sa": "CC BY-SA"}
RISKY = re.compile(
    r"restaurant|cafe\b|café|\bbar\b|grill\b|hotel|mcdonald|burger king|starbucks|subway|kfc|pizza hut|domino|chipotle|"
    r"taco bell|wendy|advert|promo|product|packag|brand|logo|menu|sponsor|portrait|selfie|chef\b|class\b|girl|boy\b|"
    r"woman|\bman\b|children|kids|baby|family|people|lady|guy\b|wedding|party|festival|market|stall|vendor|shop|store|"
    r"recipe card|cookbook|book\b|cover|label|poster|sign\b|truck|vending|\bwith my\b|\bmy \w+ and i\b",
    re.I,
)


def licence_string(r: dict) -> str | None:
    """Manifest licence like 'CC BY 2.0', 'CC0', 'Public domain'; None if not on the allowlist."""
    code = (r.get("license") or "").lower()
    if code not in LICENSES:
        return None
    if code in ("cc0", "pdm"):
        return LICENSES[code]
    ver = str(r.get("license_version") or "")
    if not re.fullmatch(r"[0-9.]+", ver):
        return None
    return f"{LICENSES[code]} {ver}"


def _get_json(url: str) -> tuple[dict, dict]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8")), dict(r.headers)


def api_search(q: str, n: int = 20, creator: str | None = None) -> tuple[list[dict], int | None]:
    params = {"q": q, "license": "cc0,pdm,by,by-sa", "category": "photograph", "page_size": n,
              "mature": "false", "extension": "jpg,jpeg,png"}
    if creator:
        params["creator"] = creator   # e.g. USDAgov: the USDA Flickr stream, US federal works marked public domain
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            data, hdr = _get_json(url)
            left = hdr.get("x-ratelimit-available-anon_sustained")
            return data.get("results", []), int(left) if left and left.isdigit() else None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(65 * (attempt + 1))  # per-minute burst; wait it out
                continue
            if e.code >= 500:
                time.sleep(15 * (attempt + 1))
                continue
            raise
        except (TimeoutError, urllib.error.URLError, OSError):   # the API sometimes stalls; one dropped request must not kill a day's run
            time.sleep(15 * (attempt + 1))
    return [], 0


def gate(title: str, r: dict, thr: float) -> float | None:
    """Score a result against the recipe title; None = refuse."""
    if licence_string(r) is None or not r.get("creator"):
        return None
    if (r.get("width") or 0) < 600 or (r.get("height") or 0) < 400:
        return None
    t = r.get("title") or ""
    if RISKY.search(t):
        return None
    tags = " ".join(x.get("name", "") for x in (r.get("tags") or []))
    s = R2.score(title, {"file": t, "description": tags})
    return s if s >= thr else None


def load_queried() -> dict:
    return json.loads(QUERIED.read_text(encoding="utf-8")) if QUERIED.exists() else {}


def cmd_search(path: str, out: str, thr: float, keep: int, max_queries: int, creator: str | None = None, tag: str = "") -> None:
    recs = json.loads(Path(path).read_text(encoding="utf-8"))
    queried = load_queried()
    outp = OV / out
    res = json.loads(outp.read_text(encoding="utf-8")) if outp.exists() else {}
    used = 0
    for rec in recs:
        slug, title = rec["slug"], rec["title"]
        qkey = slug + (f"@{creator}" if creator else "") + tag
        if qkey in queried or slug in res:
            continue
        if used >= max_queries:
            break
        qs = list(dict.fromkeys(rec.get("queries", []) + R2.queries(title)))[:1]   # one request per recipe: the budget is 200/day
        seen, cands = set(), []
        left = None
        for q in qs:
            rows, left = api_search(q, creator=creator)
            used += 1
            time.sleep(SLEEP)
            for r in rows:
                if r["id"] in seen:
                    continue
                seen.add(r["id"])
                s = gate(title, r, thr)
                if s is not None:
                    cands.append({"id": r["id"], "score": round(s, 2), "title": r.get("title"), "creator": r.get("creator"),
                                  "creator_url": r.get("creator_url"), "license": licence_string(r),
                                  "license_url": r.get("license_url"), "landing": r.get("foreign_landing_url"),
                                  "url": r.get("url"), "provider": r.get("provider"), "width": r.get("width"),
                                  "height": r.get("height"), "tags": [x.get("name") for x in (r.get("tags") or [])][:8]})
        cands.sort(key=lambda c: -c["score"])
        cands = cands[:keep]
        d = OV / "review" / slug
        d.mkdir(parents=True, exist_ok=True)
        for i, c in enumerate(cands):
            st, body, _ = http_get(c["url"], retries=2)
            if st == 200:
                (d / f"{i}.jpg").write_bytes(body)
            else:
                c["download_failed"] = st
        res[slug] = {"title": title, "ingredients": rec.get("ingredients") or [], "cands": cands}
        queried[qkey] = len(cands)
        write_json(outp, res)
        write_json(QUERIED, queried)
        print(f"{slug}: {len(cands)} (daily budget left: {left})", file=sys.stderr, flush=True)
        if left is not None and left <= MIN_AVAILABLE:
            print("daily Openverse budget spent; rerun later", file=sys.stderr)
            break


def cmd_sheets(per: int, top: int) -> None:
    from PIL import Image, ImageDraw

    cands = {}
    for f in sorted(OV.glob("cand_ov_*.json")):
        cands.update(json.loads(f.read_text(encoding="utf-8")))
    tiles = []
    for slug, v in cands.items():
        for i, c in enumerate(v["cands"][:top]):
            p = OV / "review" / slug / f"{i}.jpg"
            if p.exists():
                tiles.append((slug, i, v["title"], ", ".join(v["ingredients"][:7]), c["title"] or "", c["license"], p))
    W, H, COLS = 420, 360, 3
    outd = OV / "sheets"
    outd.mkdir(parents=True, exist_ok=True)
    for old in outd.glob("*.png"):
        old.unlink()
    n = 0
    for k in range(0, len(tiles), per):
        chunk = tiles[k : k + per]
        rows = (len(chunk) + COLS - 1) // COLS
        img = Image.new("RGB", (W * COLS, H * rows), "white")
        d = ImageDraw.Draw(img)
        for j, (slug, i, title, ing, ct, lic, p) in enumerate(chunk):
            x, y = (j % COLS) * W, (j // COLS) * H
            d.text((x + 3, y + 1), f"[{k + j}] {title}"[:64], fill="red")
            d.text((x + 3, y + 12), f"{ing}"[:68], fill="green")
            d.text((x + 3, y + 23), f"{ct[:46]} | {lic}", fill="blue")
            try:
                im = Image.open(p).convert("RGB")
                im.thumbnail((W - 4, H - 38))
                img.paste(im, (x + 2, y + 36))
            except Exception:  # noqa: BLE001
                pass
        img.save(outd / f"s{n:03d}.png")
        n += 1
    write_json(outd / "index.json", [{"n": k, "slug": t[0], "i": t[1], "title": t[2]} for k, t in enumerate(tiles)])
    print(f"{len(tiles)} tiles, {n} sheets in {outd}")


def short_name(name: str, reserve: int = 0) -> str:
    """Creator name for the on-photo credit: whitespace-collapsed, capped so name + suffix stays within credits.LIMIT."""
    n = re.sub(r"\s+", " ", name or "").strip()
    lim = LIMIT - reserve
    return n if len(n) <= lim else n[: lim - 1].rstrip() + "…"


def cmd_build(picks_file: str) -> None:
    """picks: {slug: candidate id}. Downloads the original once, writes/merges manifest/openverse.json
    (candidates with source "pexels", written by pexels.py, go to manifest/pexels.json)."""
    import hashlib

    picks = json.loads(Path(picks_file).read_text(encoding="utf-8"))
    cands = {}
    for f in sorted(OV.glob("cand_ov_*.json")) + [OV / "remap_ov.json"]:   # remap_ov.json: ov_pick.py "tile=other-slug"
        if f.exists():
            cands.update(json.loads(f.read_text(encoding="utf-8")))
    manifests: dict[str, list] = {}
    for src in ("openverse", "pexels"):
        t = MANIFEST_DIR / f"{src}.json"
        manifests[src] = json.loads(t.read_text(encoding="utf-8")) if t.exists() else []
    have = {r["slug"] for rows in manifests.values() for r in rows}
    imgdir = OV / "images"
    imgdir.mkdir(parents=True, exist_ok=True)
    for slug, cid in picks.items():
        if slug in have:
            continue
        v = cands.get(slug)
        c = next((x for x in (v or {}).get("cands", []) if x["id"] == cid), None)
        if not c:
            print(f"SKIP {slug}: pick {cid} not among candidates", file=sys.stderr)
            continue
        src = c.get("source", "openverse")
        lic = c["license"]
        ok_lic = lic == "Pexels License" if src == "pexels" else re.fullmatch(r"CC0|Public domain|CC BY(-SA)? [0-9.]+", lic or "")
        if not ok_lic or not c["creator"] or (lic not in ("CC0", "Public domain") and not c["license_url"]):
            print(f"SKIP {slug}: licence/creator/licence link not acceptable ({lic!r})", file=sys.stderr)
            continue
        f = imgdir / f"{slug}.bin"
        if not f.exists():
            st, body, _ = http_get(c["url"], retries=3)
            if st != 200:
                print(f"SKIP {slug}: download http={st}", file=sys.stderr)
                continue
            f.write_bytes(body)
        data = f.read_bytes()
        suffix = " / Flickr" if c.get("provider") == "flickr" else (" / Pexels" if src == "pexels" else "")
        label = "Pexels record" if src == "pexels" else "Openverse record"
        manifests[src].append({
            "slug": slug,
            "recipe_title": v["title"],
            "source": src,
            "license": lic,
            "license_raw": lic,
            "license_url": c["license_url"],
            "author": c["creator"],
            "credit": short_name(c["creator"], len(suffix)) + suffix,
            "alt_text": v["title"],
            "attribution_url": c["landing"],
            "source_image_url": c["url"],
            "candidate_id": c["id"],
            "file": c["title"],
            "sha256": hashlib.sha256(data).hexdigest(),
            "evidence": f"{label} {c['id']} reports licence {lic!r} (creator {c['creator']!r}, provider {c.get('provider')}); "
                        f"landing page {c['landing']}; image reviewed by a human/agent against the recipe's ingredients as showing this dish.",
            "image_cache": f"openverse/images/{slug}.bin",
        })
        have.add(slug)
    for src, rows in manifests.items():
        if rows or (MANIFEST_DIR / f"{src}.json").exists():
            rows.sort(key=lambda r: r["slug"])
            write_json(MANIFEST_DIR / f"{src}.json", rows)
    print({k: len(v) for k, v in manifests.items()}, file=sys.stderr)


def selftest() -> None:
    assert licence_string({"license": "by", "license_version": "2.0"}) == "CC BY 2.0"
    assert licence_string({"license": "by-sa", "license_version": "4.0"}) == "CC BY-SA 4.0"
    assert licence_string({"license": "cc0", "license_version": "1.0"}) == "CC0"
    assert licence_string({"license": "pdm", "license_version": "1.0"}) == "Public domain"
    for bad in ("by-nc", "by-nd", "by-nc-sa", "nc-sampling+", "sampling+", "", None):
        assert licence_string({"license": bad, "license_version": "2.0"}) is None, bad
    base = {"license": "by", "license_version": "2.0", "creator": "Ann", "width": 1024, "height": 768, "title": "Shakshuka in a pan", "tags": []}
    assert gate("Shakshuka", base, 0.67) is not None
    assert gate("Shakshuka", {**base, "creator": None}, 0.67) is None
    assert gate("Shakshuka", {**base, "title": "Shakshuka at Joe's restaurant"}, 0.67) is None
    assert gate("Shakshuka", {**base, "license": "by-nc"}, 0.67) is None
    assert gate("Cacio e Pepe", base, 0.67) is None
    print("openverse selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("recipes")
    s.add_argument("--out", required=True)
    s.add_argument("--thr", type=float, default=0.67)
    s.add_argument("--keep", type=int, default=4)
    s.add_argument("--max-queries", type=int, default=150)
    s.add_argument("--tag", default="", help="suffix for the queried key: re-query recipes with new query text")
    s.add_argument("--creator", help="restrict to one Openverse creator, e.g. USDAgov (USDA Flickr stream, public domain)")
    h = sub.add_parser("sheets")
    h.add_argument("--per", type=int, default=12)
    h.add_argument("--top", type=int, default=4)
    b = sub.add_parser("build")
    b.add_argument("picks")
    sub.add_parser("selftest")
    a = ap.parse_args()
    OV.mkdir(parents=True, exist_ok=True)
    if a.cmd == "search":
        cmd_search(a.recipes, a.out, a.thr, a.keep, a.max_queries, a.creator, a.tag)
    elif a.cmd == "sheets":
        cmd_sheets(a.per, a.top)
    elif a.cmd == "build":
        cmd_build(a.picks)
    else:
        selftest()
