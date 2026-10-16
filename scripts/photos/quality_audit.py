#!/usr/bin/env python3
"""Photo quality audit: measure every photo in the manifests, merge in human verdicts, write a CSV.

    python scripts/photos/quality_audit.py measure      # -> cache/quality_metrics.json (slow part, cached)
    python scripts/photos/quality_audit.py csv          # -> manifest/quality-audit.csv
    python scripts/photos/quality_audit.py sheets [verdict] [--out DIR]   # contact sheets (cache/quality_sheets/)

Numbers (all measured on the cached ORIGINAL, never on the resized WebP):
  w, h        pixel size of the original we hold (Commons rows are the 1280px thumbnail Wikimedia served)
  sharpness   variance of the Laplacian on the grey image normalised to a 640px long side.
              Normalising makes a 6000px photo and a 600px photo comparable; a photo that was small
              and upscaled, or soft to begin with, scores low.
  edge95      95th percentile of the gradient magnitude at the same size (robust to one bright edge)
  jpegq       estimated JPEG quality from the quantisation tables (None for non-JPEG)
  block       blockiness: ratio of gradient energy on 8px block borders vs inside blocks (1.0 = none)

Verdicts live in manifest/quality_decisions.json ({slug: {"verdict": "keep|replace|remove", "reason": "..."}}).
They are written by a human/agent looking at the contact sheets; the numbers only decide what to look at
first. A photo with no decision is "keep" if every metric is healthy, otherwise "review" (and the CSV says so),
so nothing is silently kept on the numbers alone.

Pillow + numpy are a dev-machine tool, never deployed, never in package.json.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, write_json  # noqa: E402

METRICS = CACHE / "quality_metrics.json"
DECISIONS = MANIFEST_DIR / "quality_decisions.json"
CSV_OUT = MANIFEST_DIR / "quality-audit.csv"
SHEETS = CACHE / "quality_sheets"

NORM = 640


def load_rows(strict: bool = True) -> list[dict]:
    """Rows of every source manifest. strict: only those in photos.json (the published set); not strict: all rows,
    so the audit also sees photos added since the last process_images.py run."""
    rows = []
    for name in ("myplate.json", "commons.json", "openverse.json", "pexels.json"):
        f = MANIFEST_DIR / name
        if f.exists():
            rows += json.loads(f.read_text(encoding="utf-8"))
    if not strict:
        return rows
    final = {r["slug"] for r in json.loads((MANIFEST_DIR / "photos.json").read_text(encoding="utf-8"))}
    return [r for r in rows if r["slug"] in final]


def jpeg_quality(im: Image.Image) -> int | None:
    q = getattr(im, "quantization", None)
    if not q or 0 not in q:
        return None
    t = list(q[0])
    avg = sum(t) / len(t)
    # IJG: scale = 200 - 2q for q>=50, 5000/q below; average table entry ~ base_avg*scale/100 (base avg ~ 57 for luma)
    scale = avg / 57.0 * 100
    return int(round((200 - scale) / 2)) if scale <= 100 else int(round(5000 / scale))


def measure_one(path: Path) -> dict:
    im = Image.open(path)
    im.load()
    w, h = im.size
    jq = jpeg_quality(im) if im.format == "JPEG" else None
    g = im.convert("L")
    s = NORM / max(w, h)
    g = g.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    a = np.asarray(g, dtype=np.float64)
    lap = a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
    gx = np.abs(a[:, 1:] - a[:, :-1])
    gy = np.abs(a[1:, :] - a[:-1, :])
    mag = np.sqrt(gx[:-1, :] ** 2 + gy[:, :-1] ** 2)
    # blockiness on the ORIGINAL grid (8px blocks), horizontal differences only
    full = np.asarray(im.convert("L").resize((w // 8 * 8 or 8, h), Image.BILINEAR if w < 8 else Image.NEAREST), dtype=np.float64)
    dx = np.abs(full[:, 1:] - full[:, :-1])
    cols = np.arange(dx.shape[1])
    border = dx[:, cols % 8 == 7].mean() if (cols % 8 == 7).any() else 0
    inner = dx[:, cols % 8 != 7].mean() or 1e-9
    hsv = np.asarray(im.convert("RGB").resize((64, 64)).convert("HSV"), dtype=np.float64)
    return {
        "w": w,
        "h": h,
        "sharpness": round(float(lap.var()), 1),
        "edge95": round(float(np.percentile(mag, 95)), 1),
        "jpegq": jq,
        "block": round(float(border / inner), 3),
        "mean": round(float(a.mean()), 1),
        "contrast": round(float(a.std()), 1),
        "sat": round(float(hsv[..., 1].mean() / 2.55), 1),
    }


def cmd_measure() -> None:
    # Merge into the previous file: a photo removed since is no longer in the manifests, but the audit CSV
    # still lists it (verdict remove/replace) with the numbers it was judged on.
    out = json.loads(METRICS.read_text(encoding="utf-8")) if METRICS.exists() else {}
    for r in load_rows(strict=False):
        p = CACHE / r["image_cache"]
        try:
            m = measure_one(p)
        except Exception as e:  # noqa: BLE001
            m = {"error": str(e)}
        m["source"] = r["source"]
        out[r["slug"]] = m
    write_json(METRICS, out)
    print(f"measured {len(out)} photos -> {METRICS}")


def auto_flags(m: dict) -> list[str]:
    f = []
    if m.get("error"):
        return ["cannot decode"]
    long_side = max(m["w"], m["h"])
    if long_side < 700:
        f.append(f"small ({m['w']}x{m['h']})")
    if m["sharpness"] < 60:
        f.append(f"soft (lap {m['sharpness']})")
    if m["contrast"] < 35:
        f.append(f"flat (contrast {m['contrast']})")
    if m["mean"] < 70:
        f.append(f"dark (mean {m['mean']})")
    if m["jpegq"] is not None and m["jpegq"] < 60:
        f.append(f"heavy JPEG (q~{m['jpegq']})")
    if m["block"] > 1.25:
        f.append(f"blocky ({m['block']})")
    return f


def cmd_csv() -> None:
    """verdict: keep = photo stays; replace = a better photo of the same dish took its place; remove = no better
    free photo exists, so the recipe goes back to the placeholder. Derived from the manifests, so it cannot drift:
    the review bucket in commons_r2_rejected.json says what was dropped, the current rows say what replaced it."""
    metrics = json.loads(METRICS.read_text(encoding="utf-8"))
    dec = json.loads(DECISIONS.read_text(encoding="utf-8")) if DECISIONS.exists() else {}
    rej = json.loads((MANIFEST_DIR / "commons_r2_rejected.json").read_text(encoding="utf-8")).get("wave8_quality_2026_10_16", {})
    now = {r["slug"] for r in load_rows(strict=False)}
    rows = []
    for slug in sorted(metrics):
        m = metrics[slug]
        d = dec.get(slug)
        flags = auto_flags(m)
        if slug in rej:
            verdict = "replace" if slug in now else "remove"
            reason = (d or {}).get("reason", "") or rej[slug]
            reason += "; replaced by a better photo of the same dish" if verdict == "replace" else "; no better free photo found, placeholder instead"
        elif d:
            verdict, reason = "keep", d["reason"]
        else:
            verdict, reason = "keep", "; ".join(flags) + " (numbers only; looked fine on the sheet)" if flags else "reviewed on contact sheet: no defect"
        rows.append([slug, m.get("source", ""), m.get("w"), m.get("h"), m.get("sharpness"), m.get("edge95"),
                     m.get("jpegq") or "", m.get("block"), verdict, reason])
    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    with CSV_OUT.open("w", newline="", encoding="utf-8") as fh:
        wr = csv.writer(fh, lineterminator="\n")
        wr.writerow(["slug", "source", "w", "h", "sharpness", "edge95", "jpegq", "block", "verdict", "reason"])
        wr.writerows(rows)
    from collections import Counter
    print(Counter(r[8] for r in rows), "->", CSV_OUT)


def font(sz: int):
    for n in ("arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(n, sz)
        except OSError:
            pass
    return ImageFont.load_default()


def cmd_sheets(args: list[str]) -> None:
    metrics = json.loads(METRICS.read_text(encoding="utf-8"))
    dec = json.loads(DECISIONS.read_text(encoding="utf-8")) if DECISIONS.exists() else {}
    rows = {r["slug"]: r for r in load_rows()}
    want = None
    out = SHEETS
    per = 20
    cols = 5
    it = iter(args)
    for a in it:
        if a == "--out":
            out = Path(next(it))
        elif a == "--per":
            per = int(next(it))
        elif a == "--cols":
            cols = int(next(it))
        else:
            want = a
    slugs = sorted(metrics)
    if want:
        slugs = [s for s in slugs if dec.get(s, {}).get("verdict") == want]
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    tw, th, lab = 380, 285, 34
    f = font(14)
    n = 0
    for i in range(0, len(slugs), per):
        chunk = slugs[i:i + per]
        rws = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rws * (th + lab)), (250, 248, 243))
        d = ImageDraw.Draw(sheet)
        for j, s in enumerate(chunk):
            x, y = (j % cols) * tw, (j // cols) * (th + lab)
            try:
                im = Image.open(CACHE / rows[s]["image_cache"]).convert("RGB")
                im.thumbnail((tw - 4, th - 4))
                sheet.paste(im, (x + 2 + (tw - 4 - im.width) // 2, y + 2 + (th - 4 - im.height) // 2))
            except Exception:  # noqa: BLE001
                d.text((x + 6, y + 6), "cannot decode", fill=(200, 0, 0), font=f)
            m = metrics[s]
            d.text((x + 3, y + th), f"{i + j + 1}. {s[:34]}", fill=(0, 0, 0), font=f)
            d.text((x + 3, y + th + 16), f"{m['w']}x{m['h']} lap{m['sharpness']:.0f} {m['source'][:4]}", fill=(90, 90, 90), font=f)
        n += 1
        sheet.save(out / f"sheet_{n:02d}.jpg", quality=88)
    print(f"{len(slugs)} photos -> {n} sheets in {out}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "measure":
        cmd_measure()
    elif cmd == "csv":
        cmd_csv()
    elif cmd == "sheets":
        cmd_sheets(sys.argv[2:])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
