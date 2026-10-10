#!/usr/bin/env python3
"""USDA MyPlate photos, stage 2: decide which recipe photos we may use.

    python scripts/photos/myplate_audit.py tally      # distribution of "Source:" lines, to tune the rules
    python scripts/photos/myplate_audit.py audit      # writes manifest/myplate_decisions.json (+ the include list)
    python scripts/photos/myplate_audit.py build      # needs downloaded images; writes manifest/myplate.json

THE LEGAL QUESTION. US federal works are public domain (17 U.S.C. 105). MyPlate
Kitchen is a USDA site, but a page being on usda.gov does not make everything on
it a federal work: each recipe page carries a "Source:" field, and many credit a
university extension, a state agency or a non-profit. A photo made by THEM is
their copyright (federal funding does not change that), even though it is
hosted by USDA. And stock-agency photos can sit on any government site.

The archived pages carry no per-photo credit and the images arrive with all
metadata stripped (Drupal re-encodes them), so we cannot prove authorship
photo-by-photo. The defensible rule is therefore about PROVENANCE:

  INCLUDE  the recipe's Source is a federal body (USDA, FNS, Team Nutrition,
           MyPlate, NIH/NHLBI, CDC ...) -- the photo is most plausibly federal
           work -- AND nothing on the page names a stock agency or photographer.
  EXCLUDE  the Source is a non-federal organisation (extension, university, state
           agency, council, foundation, company)      -> reason: third-party-source
           any stock agency / copyright / photographer credit appears anywhere in
           the page, alt text or file name            -> reason: third-party-credit
           the image is shared by recipes with different titles (a generic
           stand-in, or a mis-assignment)             -> reason: shared-image
           the alt text does not describe this recipe  -> reason: alt-mismatch
           missing / unreadable / under 300px wide    -> reason: unusable
  Excluded recipes keep the colour-block placeholder. Nothing is guessed.

`--include-nonfederal` exists so the owner can overrule the conservative default
once they have decided; it is NOT the default.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import html as H
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, MANIFEST_DIR, write_json  # noqa: E402

PAGES = CACHE / "myplate" / "pages"
IMAGES = CACHE / "myplate" / "images"
REVIEW_EXCLUDES: dict[str, str] = {}  # slug -> reason, from a human look at the photo

SOURCE_RE = re.compile(r'field--name-field-source[^>]*>(.*?)</span>\s*</span>', re.S)

# Federal bodies. Word-boundary anchored; checked against the Source field only.
FEDERAL = re.compile(
    r"\busda\b|u\.?s\.? department of agriculture|department of agriculture|food (and|&) nutrition service|\bfns\b|"
    r"team nutrition|\bcnpp\b|center for nutrition policy|snap[- ]ed connection|"
    r"national institutes? of health|\bnih\b|\bnhlbi\b|national heart,? lung|\bcdc\b|centers for disease control|"
    r"department of health and human services|\bhhs\b|\bfda\b|national agricultural library|"
    r"agricultural research service|\bnal\b|usda foods|food distribution program|child nutrition",
    re.I,
)
# Words that mean a non-federal body even if a federal one is also named
# ("USDA-funded, Cornell University Cooperative Extension").
NONFEDERAL = re.compile(
    r"universit|college|extension|cooperative|state of|department of public health|better health|more matters|5 a day|\bdepartment of (education|human services|social)|"
    r"county|council|foundation|association|society|institute for|dairy|board\b|inc\b|llc|company|corporation|"
    r"magazine|cookbook|publishing|\bbook\b|restaurant|hospital|clinic|school district|"
    r"produce for better health|fruits? (&|and) veggies|cooking matters|share our strength|eat smart|"
    r"\bnc\b|\bny\b|oregon|washington state|michigan|wisconsin|iowa|texas|california|virginia|florida|illinois|ohio|minnesota|"
    r"kansas|nebraska|colorado|utah|montana|idaho|maine|vermont|hawaii|alaska|arkansas|alabama|georgia|kentucky|louisiana|"
    r"mississippi|missouri|nevada|oklahoma|pennsylvania|tennessee|wyoming|dakota|carolina|jersey|mexico|indiana|arizona|"
    r"connecticut|massachusetts|maryland|delaware|rhode island|hampshire|west virginia",
    re.I,
)
STOCK = re.compile(
    r"shutterstock|istock|getty|alamy|adobe ?stock|fotolia|dreamstime|depositphotos|123rf|stocksy|unsplash|pexels|pixabay|"
    r"bigstock|canstock|thinkstock|corbis|jupiterimages|photo ?credit|photo by|photograph by|photography by|"
    r"image courtesy|courtesy of|©|&copy;|copyright (?!.*\busda\b)",
    re.I,
)
STOP = set("a an and the of with in on for to recipe recipes style easy quick simple my".split())


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def source_text(page: str) -> str:
    m = SOURCE_RE.search(page)
    if not m:
        return ""
    return re.sub(r"^\s*Source:\s*", "", clean(m.group(1)))


def page_main(page: str) -> str:
    """The recipe article only -- the site chrome contains words like 'copyright'."""
    a = page.find("<article")
    b = page.rfind("</article>")
    return page[a:b] if a != -1 and b != -1 else page


def tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]+", s.lower()) if t not in STOP and len(t) > 2}


def stem(t: str) -> str:
    return t[:-1] if t.endswith("s") and len(t) > 3 else t


def load_titles() -> dict[str, str]:
    f = CACHE / "titles.tsv"
    if not f.exists():
        sys.exit("need scripts/photos/cache/titles.tsv (slug<TAB>title); export from the DB:\n"
                 "  psql \"$URL\" -At -F $'\\t' -c \"select slug,title from recipes where source_url like 'https://www.myplate.gov/%'\" > scripts/photos/cache/titles.tsv")
    return dict(l.split("\t", 1) for l in f.read_text(encoding="utf-8").splitlines() if "\t" in l)


def classify_source(src: str) -> str:
    if not src:
        return "missing"
    fed, non = bool(FEDERAL.search(src)), bool(NONFEDERAL.search(src))
    if fed and not non:
        return "federal"
    if non:
        return "nonfederal"
    return "unknown"


def cmd_tally() -> None:
    c = collections.Counter()
    ex = {}
    for f in sorted(PAGES.glob("*.html")):
        s = source_text(f.read_text(encoding="utf-8", errors="replace"))
        k = classify_source(s)
        c[k] += 1
        ex.setdefault(k, collections.Counter())[s[:110]] += 1
    print(dict(c))
    for k, cc in ex.items():
        print(f"\n== {k}")
        for s, n in cc.most_common(40):
            print(f"{n:4d}  {s}")


def cmd_audit(include_nonfederal: bool) -> None:
    global REVIEW_EXCLUDES
    rx = MANIFEST_DIR / "myplate_review_excludes.json"
    REVIEW_EXCLUDES = json.loads(rx.read_text(encoding="utf-8")) if rx.exists() else {}
    titles = load_titles()
    found = {r["slug"]: r for r in json.loads((CACHE / "myplate" / "found.json").read_text(encoding="utf-8"))}
    # hash -> slugs, from downloaded images where present, else by image URL
    by_img = collections.defaultdict(list)
    for s, r in found.items():
        by_img[r.get("sha256") or re.sub(r"\?.*", "", r.get("src", ""))].append(s)
    out = []
    for slug, title in sorted(titles.items()):
        r = found.get(slug)
        d = {"slug": slug, "title": title, "include": False, "reason": None}
        out.append(d)
        pf = PAGES / f"{slug}.html"
        if not r or "error" in r and not r.get("src") or not pf.exists():
            d["reason"] = "unusable: page or photo not retrievable from the archive"
            continue
        page = pf.read_text(encoding="utf-8", errors="replace")
        src = source_text(page)
        d.update({"source_field": src, "source_class": classify_source(src), "image_src": r.get("src"), "alt": r.get("alt", "")})
        w = int(r["width"]) if str(r.get("width") or "").isdigit() else None
        if w is not None and w < 300:
            d["reason"] = f"unusable: only {w}px wide"
            continue
        hay = " ".join([r.get("alt", ""), r.get("src", ""), page_main(page)])
        m = STOCK.search(hay)
        if m:
            d["reason"] = f"third-party-credit: page/alt/filename contains {m.group(0)!r}"
            continue
        sc = d["source_class"]
        if sc != "federal" and not include_nonfederal:
            d["reason"] = f"third-party-source: Source is {sc} ({src[:80]!r})"
            continue
        key = r.get("sha256") or re.sub(r"\?.*", "", r.get("src", ""))
        mates = [m_ for m_ in by_img[key] if m_ != slug]
        if mates:
            # tolerate genuine variants of one dish ("Apple Cake"/"Apple Cake II")
            tt = {stem(t) for t in tokens(title)}
            if any(not (tt & {stem(t) for t in tokens(titles.get(m_, ""))}) for m_ in mates):
                d["reason"] = f"shared-image: same photo as unrelated recipe(s) {mates[:3]}"
                continue
        alt = {stem(t) for t in tokens(r.get("alt", ""))}
        tt = {stem(t) for t in tokens(title)}
        if r.get("alt") and tt and not (alt & tt):
            d["reason"] = f"alt-mismatch: alt {r.get('alt')!r} shares no word with title"
            continue
        vx = REVIEW_EXCLUDES.get(slug)
        if vx:
            d["reason"] = f"review-excluded: {vx}"
            continue
        d["include"] = True
        d["reason"] = "ok: federal-source recipe, no third-party credit signal" if sc == "federal" else f"ok (owner overrode: source {sc})"
    write_json(MANIFEST_DIR / "myplate_decisions.json", out)
    inc = [d for d in out if d["include"]]
    why = collections.Counter((d["reason"] or "").split(":")[0] for d in out if not d["include"])
    print(f"{len(inc)} included, {len(out) - len(inc)} excluded: {dict(why)}", file=sys.stderr)
    (CACHE / "myplate" / "include.txt").write_text("\n".join(d["slug"] for d in inc) + "\n", encoding="utf-8")


def cmd_build() -> None:
    dec = json.loads((MANIFEST_DIR / "myplate_decisions.json").read_text(encoding="utf-8"))
    found = {r["slug"]: r for r in json.loads((CACHE / "myplate" / "found.json").read_text(encoding="utf-8"))}
    rows, dropped = [], []
    for d in dec:
        if not d["include"]:
            continue
        slug = d["slug"]
        img = IMAGES / f"{slug}.bin"
        if not img.exists():
            dropped.append(slug)
            continue
        r = found[slug]
        data = img.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        rows.append({
            "slug": slug,
            "recipe_title": d["title"],
            "source": "usda_myplate",
            "license": "Public domain",
            "license_url": "https://www.usa.gov/government-works",
            "credit": "USDA MyPlate Kitchen (U.S. Department of Agriculture)",
            "attribution_url": f"https://www.myplate.gov/recipes/{slug}",
            "source_image_url": "https://web.archive.org/web/2025im_/" + r["src"],
            "alt_text": r.get("alt") or d["title"],
            "sha256": sha,
            "evidence": f"Recipe page Source field: {d['source_field']!r} (federal body). No stock-agency, photographer or copyright credit in the page's recipe section, image alt text or file name. Image shared with no unrelated recipe. Photo metadata is stripped by the site, so authorship is established by provenance, not by embedded credit.",
            "image_cache": f"myplate/images/{slug}.bin",
        })
    write_json(MANIFEST_DIR / "myplate.json", rows)
    print(f"{len(rows)} manifest rows; {len(dropped)} included slugs lack a downloaded image: {dropped[:5]}", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["tally", "audit", "build"])
    ap.add_argument("--include-nonfederal", action="store_true")
    a = ap.parse_args()
    {"tally": cmd_tally, "audit": lambda: cmd_audit(a.include_nonfederal), "build": cmd_build}[a.cmd]()


if __name__ == "__main__":
    main()
