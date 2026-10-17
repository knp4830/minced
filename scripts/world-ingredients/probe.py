"""Probe branded descriptions. Usage: python -I probe.py phrase1 | phrase2 | ...   (or a file of one phrase per line)
Prints the count of complete US branded products whose description contains the phrase (word-bounded)
and the 3 shortest descriptions. For hint-writing only."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fdcdb import rows, lit  # noqa: E402
from resolve import phrase_regex  # noqa: E402

arg = " ".join(sys.argv[1:])
if os.path.exists(arg):
    phrases = [p.strip() for p in open(arg, encoding="utf-8").read().splitlines() if p.strip()]
else:
    phrases = [p.strip() for p in arg.split("|") if p.strip()]
for p in phrases:
    rx = phrase_regex(p.split())
    r = rows("select b.description, b.brand_owner, b.category from branded b join bcore c using (fdc_id) where lower(b.description) ~ %s "
             "order by length(b.description) limit 3" % lit(rx))
    cnt = rows("select count(*) n from branded b join bcore c using (fdc_id) where lower(b.description) ~ %s" % lit(rx))[0]["n"]
    print("%-28s %6d  %s" % (p, cnt, " || ".join("%s [%s]" % (x["description"][:50], x["category"][:22]) for x in r)))
