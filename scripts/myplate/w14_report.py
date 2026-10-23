#!/usr/bin/env python3
"""Summarise a dry-run printout of a w14 seed: reject kinds, and the names to alias next, by frequency.
    python -I scripts/myplate/w14_report.py dry-output.txt
"""
import collections
import re
import sys

text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
per = collections.defaultdict(set)
kinds = collections.Counter()
for line in text.splitlines():
    m = re.match(r"\s*(\S+)\s*\|\s*(.*)", line)
    if not m or m.group(1) in ("slug", "reason"):
        continue
    slug, reason = m.groups()
    kind = reason.split(":")[0].split(" (")[0]
    kind = re.sub(r'"[^"]*"', '"X"', kind)
    kind = re.sub(r"near-duplicate title of \S+", "near-duplicate title", kind)
    per[slug].add(kind)
for ks in per.values():
    for k in ks:
        kinds[k] += 1
print("recipes by reject kind:", kinds.most_common())
print("recipes rejected ONLY for unresolved ingredients:", sum(1 for ks in per.values() if ks == {"unresolved ingredient"}))
un = collections.Counter(re.findall(r'unresolved ingredient: "([^"]*)"', text))
print("top unresolved:", un.most_common(70))
wk = collections.Counter(re.findall(r'weak match: "([^"]*)" -> "([^"]*)"', text))
print("top weak:", wk.most_common(40))
units = collections.Counter(re.findall(r'unknown unit "([^"]*)"', text))
print("units:", units.most_common(20))
