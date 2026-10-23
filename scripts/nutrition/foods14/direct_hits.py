"""Wave 14 aid: from hits-compact.txt keep, per ingredient, only the non-branded FDC records whose description contains every distinctive word of the name.

    python -I -X utf8 scripts/nutrition/foods14/direct_hits.py
A cheap way to see which of the 458 have a record of that food at all; the person deciding still reads the record.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = {"sauce", "paste", "dried", "fresh", "powder", "seed", "leaf", "flour", "spice", "mix", "blend", "chile", "chili", "pepper", "sugar", "salt", "root", "fruit", "bean",
       "green", "red", "black", "white", "sweet", "hot", "cheese", "bread", "rice", "meat", "soup", "tea", "juice", "butter", "milk", "cream", "ground", "whole", "wild", "oil",
       "wine", "leaves", "seeds", "flakes"}


def main():
    lines = open(os.path.join(HERE, "out", "hits-compact.txt"), encoding="utf-8").read().splitlines()
    cur, res = None, {}
    for ln in lines:
        if ln.startswith("#"):
            cur = ln[1:].split(" | ")[0]
            res[cur] = []
            continue
        if ln.startswith("   B"):
            continue
        m = re.match(r"(\d+) (sr|found|fndds) (.*?) (k [\d.-]+ p .*)", ln)
        if m and cur:
            res[cur].append((m.group(1), m.group(2), m.group(3), m.group(4)))
    n = 0
    for ing, hits in res.items():
        toks = [t for t in re.findall(r"[a-z]+", ing.lower()) if len(t) >= 4 and t not in GEN]
        if not toks:
            continue
        ok = [h for h in hits if all(t[:max(4, len(t) - 1)] in h[2].lower() for t in toks)]
        if ok:
            n += 1
            print("##", ing)
            for h in ok[:4]:
                print("   ", h[0], h[1], h[2][:60], h[3][:40])
    print(n)


if __name__ == "__main__":
    main()
