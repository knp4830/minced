import re
from pathlib import Path
R=Path('scripts/originals/recipes')
def sub_all(pattern, repl, files=None, flags=0):
    n=0
    for p in R.glob('*.txt'):
        s=p.read_text(encoding='utf-8'); t,c=re.subn(pattern,repl,s,flags=re.M|flags)
        if c: p.write_text(t,encoding='utf-8'); n+=c
    return n
# aromatics that are infused and discarded, or negligible: no quantity, count kept in the note
print(sub_all(r'^- ([0-9.]+) \| (?:stalk) \| lemongrass \|(.*)$', lambda m: f'-  |  | lemongrass | {m.group(1).rstrip("0").rstrip(".")} stalk{"s" if float(m.group(1))!=1 else ""}{(", "+m.group(2).strip()) if m.group(2).strip() else ""}'))
print(sub_all(r'^- ([0-9.]+) \| \| (kaffir lime leaves|pandan leaves|salam leaf) \|(.*)$', lambda m: f'-  |  | {m.group(2)} | {m.group(1).rstrip("0").rstrip(".")} leaves{(", "+m.group(3).strip()) if m.group(3).strip() else ""}'))
print(sub_all(r'^- ([0-9.]+) \| \| (black cardamom) \|(.*)$', lambda m: f'-  |  | {m.group(2)} | {m.group(1).rstrip("0").rstrip(".")} pods{(", "+m.group(3).strip()) if m.group(3).strip() else ""}'))
pairs=[
 ('thai.txt','- 3 | tbsp | red curry paste |','- 45 | g | red curry paste | about 3 tbsp'),
 ('thai.txt','- 4 | tbsp | red curry paste |','- 60 | g | red curry paste | about 4 tbsp'),
 ('thai.txt','- 3 | tbsp | panang curry paste |','- 45 | g | panang curry paste | about 3 tbsp'),
 ('thai.txt','- 3 | tbsp | yellow curry paste |','- 45 | g | yellow curry paste | about 3 tbsp'),
 ('thai.txt','- 0.5 | tsp | white pepper |','- 0.5 | tsp | white pepper |'),
 ('thai.txt','- 1 | | nori |','- 1 | | nori |'),
 ('thai.txt','- 2 | | pandan leaves | optional, knotted','-  |  | pandan leaves | 2 leaves, optional, knotted'),
 ('korean.txt','- 1 | tbsp | kimchi base | brine from the jar\n',''),
 ('korean.txt','- 1 | tbsp | perilla seeds | ground','- 1 | tbsp | perilla seeds | ground'),
 ('korean.txt','- 8 | | chestnuts | peeled','- 3 | oz | chestnuts | about 8, peeled'),
 ('korean.txt','- 4 | | chestnuts | peeled','- 1.5 | oz | chestnuts | about 4, peeled'),
 ('korean.txt','- 4 | | red dates |','- 0.75 | oz | red dates | about 4'),
 ('korean.txt','- 8 | | dried anchovies | heads and guts removed','-  |  | dried anchovies | 8, heads and guts removed (they flavor the broth and are strained out)'),
 ('korean.txt','- 10 | | perilla leaves | sliced','-  |  | perilla leaves | 10, sliced'),
 ('korean.txt','- 1 | lb | udon noodles | fresh or frozen','- 1 | lb | chinese wheat noodles | thick fresh noodles, or udon'),
 ('korean.txt','- 4 | | nori | whole sheets','- 10 | g | nori | 4 whole sheets, about 2.5 g each'),
 ('korean.txt','- 1 | | nori | toasted, crumbled','- 2.5 | g | nori | 1 sheet, toasted and crumbled'),
 ('japanese.txt','- 1 | | nori | toasted, cut in thin strips','- 2.5 | g | nori | 1 sheet, toasted and cut in thin strips'),
 ('japanese.txt','- 2 | | shiitake mushrooms | thinly sliced','- 1.25 | oz | shiitake mushrooms | about 2, thinly sliced'),
 ('chinese.txt','- 6 | cup | white rice','- 6 | cup | white rice'),
 ('chinese.txt','- 0.75 | cup | water | just boiled','- 0.75 | cup | water | steaming hot'),
 ('taiwanese.txt','- 0.75 | cup | water | just boiled','- 0.75 | cup | water | steaming hot'),
 ('indian.txt','- 1 | tbsp | biryani masala |','- 6 | g | biryani masala | about 1 tbsp'),
 ('indian.txt','- 1 | | raw banana | peeled, cut in batons','- 6 | oz | raw banana | peeled, cut in batons'),
 ('filipino.txt','- 0.5 | cup | peanut butter | natural, no added sugar if possible','- 0.5 | cup | peanut butter | smooth'),
 ('malaysian.txt','- 8 | | tofu puffs | halved','- 3 | oz | tofu puffs | about 8, halved'),
 ('malaysian.txt','- 3 | tbsp | tamarind pulp |','- 3 | tbsp | tamarind pulp |'),
 ('pakistani-sri-lankan-nepali.txt','- 1 | tbsp | curry powder | dark roasted if you can find it','- 1 | tbsp | curry powder | dark roasted if available'),
 ('thai.txt','- 4 | | baby corn | halved lengthwise','- 1.5 | oz | baby corn | about 4, halved lengthwise'),
 ('italian.txt','- 4 | | anchovies | minced','- 0.5 | oz | anchovies | about 4 fillets, minced'),
 ('italian.txt','- 8 | | fresh sage | leaves','-  |  | fresh sage | 8 leaves'),
 ('italian.txt','- 24 | | ladyfingers |','- 6 | oz | ladyfingers | about 24'),
 ('european.txt','- 1 | tsp | sherry vinegar |','- 5 | ml | sherry vinegar |'),
 ('european.txt','- 12 | | phyllo dough | sheets, thawed','- 8 | oz | phyllo dough | about 12 sheets, thawed'),
 ('indonesian.txt','- 3 | | candlenuts | or macadamia nuts','- 0.4 | oz | candlenuts | about 3, or macadamia nuts'),
]
for f,o,n in pairs:
    p=R/f; s=p.read_text(encoding='utf-8')
    if o not in s: print('MISSING',f,o[:50]); continue
    p.write_text(s.replace(o,n),encoding='utf-8')
