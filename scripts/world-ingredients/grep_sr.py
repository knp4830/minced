"""Find SR/Foundation/FNDDS descriptions. Usage: python -I grep_sr.py "term1|term2|..."  (each term = space-separated AND words)
Prints up to 4 shortest raw-ish matches per term. For hint-writing only."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
lines = [l.rstrip("\n").split("|", 2) for l in open(os.path.join(HERE, "cache", "sr_desc.txt"), encoding="utf-8")]
for term in " ".join(sys.argv[1:]).split("|"):
    words = [w.lower() for w in term.split()]
    hits = [d for _, t, d in lines if all(w in d.lower() for w in words)]
    hits.sort(key=lambda d: (("raw" not in d.lower()), len(d)))
    print("%-22s %3d  %s" % (term.strip(), len(hits), " ## ".join(h[:70] for h in hits[:4])))
