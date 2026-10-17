"""Print resolved.json compactly for review. Usage: python -I show.py [file-substring] [unresolved|sr|branded|all]"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "cache", "resolved.json"), encoding="utf-8"))
fsub = sys.argv[1] if len(sys.argv) > 1 else ""
mode = sys.argv[2] if len(sys.argv) > 2 else "all"
for r in data:
    if fsub and fsub not in r["file"]:
        continue
    f = r["food"]
    s = f["source"]
    if mode == "unresolved" and s != "unresolved":
        continue
    if mode == "sr" and s not in ("sr_legacy", "foundation", "fndds"):
        continue
    if mode == "branded" and s != "branded_medoid":
        continue
    tag = {"sr_legacy": "SR", "foundation": "FN", "fndds": "FD", "branded_medoid": "BR", "unresolved": "--"}[s]
    print("%-26s %s%s %s" % (r["name"][:26], tag, "*" if r.get("proxy") else " ", (f["description"] or "")[:100]))
