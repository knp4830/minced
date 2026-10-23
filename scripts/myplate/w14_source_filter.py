#!/usr/bin/env python3
"""Wave 14 rescue, authorship gate. A MyPlate page can credit a university, an extension service or a state agency;
the recipe TEXT (method) of those is not a US federal work, so it is NOT public domain. Only pages whose "Source:"
field names a federal body (and no non-federal one) may be rescued as USDA public domain. Everything else goes to
the owner (authorship decision), never into the catalog.

    python -I scripts/myplate/w14_source_filter.py all-recipes.json rescue-recipes.json out-federal.json out-sources.csv

Uses the classifier written for the photo audit (scripts/photos/myplate_audit.py): FEDERAL / NONFEDERAL word lists.
"""
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, "scripts/photos")
from myplate_audit import classify_source, clean  # noqa: E402

CACHE = Path("scripts/myplate/cache")
SRC = re.compile(r'field--name-field-source[^>]*>(.*?)</span>\s*</span>', re.S)
SRC2 = re.compile(r'field--name-field-source.*?Source:(.*?)(?:Nutrition Information|</div>)', re.S)


def source_of(slug: str) -> str:
    t = (CACHE / f"{slug}.html").read_text(encoding="utf-8", errors="replace")
    m = SRC.search(t) or SRC2.search(t)
    s = clean(m.group(1)) if m else ""
    return re.sub(r"^\s*Source:\s*", "", s)


def main() -> int:
    rescue = json.load(open(sys.argv[2], encoding="utf-8"))
    keep, rest, rows = [], [], []
    for r in rescue:
        s = source_of(r["slug"])
        cls = classify_source(s)
        rows.append((r["slug"], r["title"], cls, s[:200]))
        if cls == "federal":
            r["usda_source_field"] = s
            keep.append(r)
        else:
            r["usda_source_field"] = s
            rest.append(r)
    json.dump(keep, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if len(sys.argv) > 5:
        json.dump(rest, open(sys.argv[5], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(sys.argv[4], "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["slug", "title", "class", "source_field"])
        w.writerows(rows)
    from collections import Counter
    print(Counter(c for _, _, c, _ in rows), "federal kept:", len(keep))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
