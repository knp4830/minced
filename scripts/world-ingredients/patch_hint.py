"""Dev helper: bulk-edit curated rows without re-typing whole lines.

Usage: python -I patch_hint.py cache/patch.txt
Patch file lines:
  name = new hint          replace the hint (last field) of that ingredient
  name : field=value       replace one named field: aisle|group|regions|aliases|allergens
  DROP name                delete the row
Matching is by canonical name, case-insensitive, across data/ingredients-*.txt.
"""
import glob
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIELDS = {"aisle": 1, "group": 2, "regions": 3, "aliases": 4, "allergens": 5, "hint": 6}


def main():
    patch = open(sys.argv[1], encoding="utf-8").read().splitlines()
    ops = {}
    for line in patch:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("DROP "):
            ops.setdefault(line[5:].strip().lower(), []).append(("drop", None, None))
        elif " : " in line:
            name, rest = line.split(" : ", 1)
            k, v = rest.split("=", 1)
            ops.setdefault(name.strip().lower(), []).append(("field", FIELDS[k.strip()], v.strip()))
        elif " = " in line:
            name, hint = line.split(" = ", 1)
            ops.setdefault(name.strip().lower(), []).append(("field", 6, hint.strip()))
    done = set()
    for path in sorted(glob.glob(os.path.join(HERE, "data", "ingredients-*.txt"))):
        out = []
        changed = False
        for line in open(path, encoding="utf-8").read().splitlines():
            if line.strip() and not line.lstrip().startswith("#"):
                parts = [p.strip() for p in line.split("|")]
                key = parts[0].lower()
                if key in ops:
                    drop = False
                    for kind, idx, val in ops[key]:
                        if kind == "drop":
                            drop = True
                        else:
                            parts[idx] = val
                    done.add(key)
                    changed = True
                    if drop:
                        continue
                    line = " | ".join(parts)
            out.append(line)
        if changed:
            open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out) + "\n")
    missing = [k for k in ops if k not in done]
    print("applied", len(done), "missing:", missing)


main()
