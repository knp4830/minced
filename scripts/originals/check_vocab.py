#!/usr/bin/env python3
"""List every ingredient/unit/cookware name in scripts/originals/recipes that the gate would reject.

    python scripts/originals/check_vocab.py <docker-container>

Runs against a snapshot container (never live). Prints unresolved names, non exact/alias matches and unknown units.
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("bo", ROOT / "scripts" / "content" / "build_original.py")
bo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bo)
bo.RECIPE_DIR = ROOT / "scripts" / "originals" / "recipes"

recipes = bo.parse_recipes()
names, units, cw = {}, {}, {}
for r in recipes:
    for i in r["ingredients"]:
        names.setdefault(i["name"], []).append(r["slug"])
        if i["unit"]:
            units.setdefault(i["unit"], []).append(r["slug"])
    for c in r["cookware"]:
        cw.setdefault(c, []).append(r["slug"])

vals = ",".join("(" + bo.sql_text(n) + ")" for n in names)
uvals = ",".join("(" + bo.sql_text(n) + ")" for n in units) or "('x')"
cvals = ",".join("(" + bo.sql_text(n) + ")" for n in cw) or "('x')"
sql = f"""
select 'ING', n.n, coalesce(r.match_kind::text,'UNRESOLVED'), coalesce(r.canonical_name::text,'')
from (values {vals}) n(n) left join lateral resolve_ingredient(n.n) r on true
where r.match_kind is null or r.match_kind not in ('exact','alias');
select 'UNIT', n.n from (values {uvals}) n(n) where not exists (select 1 from resolve_unit(n.n));
select 'COOK', n.n from (values {cvals}) n(n) where not exists (select 1 from cookware k where k.name = n.n);
"""
out = subprocess.run(["docker", "exec", "-i", sys.argv[1], "psql", "-U", "postgres", "-At", "-F", " | "],
                     input=sql, text=True, capture_output=True, encoding="utf-8")
print(out.stdout)
print(out.stderr, file=sys.stderr)
print(f"{len(recipes)} recipes, {len(names)} distinct ingredient names")
for line in out.stdout.splitlines():
    p = line.split(" | ")
    if p[0] in ("ING", "UNIT", "COOK"):
        key = p[1]
        src = names.get(key) or units.get(key) or cw.get(key) or []
        print("   used by:", p[1], "->", ", ".join(src[:4]))
