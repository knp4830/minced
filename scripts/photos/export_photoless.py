#!/usr/bin/env python3
"""List recipes that still have no photo (from a restored snapshot container) with their ingredients.

    python scripts/photos/export_photoless.py <docker-container> > cache/photoless.json

Read-only. The photo-matching rule needs the ingredients: a candidate image must plausibly
show THIS dish, and the title alone is often generic ("Baked Fish").
"""
from __future__ import annotations

import json
import subprocess
import sys

SQL = """
select coalesce(json_agg(x), '[]') from (
  select r.slug, r.title, r.source_name,
         (select json_agg(i.canonical_name order by ri.sort_order)
            from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id
           where ri.recipe_id = r.id) as ingredients
    from recipes r
   where not exists (select 1 from recipe_photos p where p.recipe_id = r.id)
   order by r.slug) x
"""


def main() -> None:
    name = sys.argv[1]
    out = subprocess.run(["docker", "exec", "-i", name, "psql", "-U", "postgres", "-At"], input=SQL,
                         capture_output=True, text=True, encoding="utf-8", check=True).stdout
    rows = json.loads(out)
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    print(f"{len(rows)} recipes without a photo", file=sys.stderr)


if __name__ == "__main__":
    main()
