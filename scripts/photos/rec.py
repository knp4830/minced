#!/usr/bin/env python3
"""Print description, ingredients and steps for recipes (from cache/details.json): python scripts/photos/rec.py slug [slug ...]"""
import json
import sys
from pathlib import Path

rows = {r["slug"]: r for r in json.loads((Path(__file__).resolve().parent / "cache" / "details.json").read_text(encoding="utf8"))}
for s in sys.argv[1:]:
    r = rows.get(s)
    if not r:
        print(s, "NOT FOUND")
        continue
    print(f"== {s}: {r.get('description') or ''}")
    print("   ING:", ", ".join(r.get("ingredients") or []))
    print("   STEPS:", " | ".join((x or "").strip() for x in (r.get("steps") or []))[:420])
