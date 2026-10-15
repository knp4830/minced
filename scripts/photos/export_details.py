#!/usr/bin/env python3
"""Export every recipe with description, ingredients and steps from a restored snapshot container.

    python scripts/photos/export_details.py <docker-container> > cache/details.json

Read-only. Used by review sheets: a photo must match the recipe's ingredients AND how the steps cook it.
"""
from __future__ import annotations

import json
import subprocess
import sys

SQL = """
select coalesce(json_agg(x), '[]') from (
  select r.slug, r.title, r.description, r.source_name,
         exists (select 1 from recipe_photos p where p.recipe_id = r.id) as has_photo,
         (select json_agg(i.canonical_name order by ri.sort_order)
            from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id
           where ri.recipe_id = r.id) as ingredients,
         (select json_agg(s.instruction order by s.sort_order)
            from recipe_steps s where s.recipe_id = r.id) as steps
    from recipes r
   order by r.slug) x
"""


def main() -> None:
    name = sys.argv[1]
    out = subprocess.run(["docker", "exec", "-i", name, "psql", "-U", "postgres", "-At"], input=SQL,
                         capture_output=True, text=True, encoding="utf-8")
    if out.returncode:
        sys.exit(out.stderr)
    rows = json.loads(out.stdout)
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    print(f"{len(rows)} recipes", file=sys.stderr)


if __name__ == "__main__":
    main()
