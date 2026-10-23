import re,sys
from pathlib import Path
R=Path('scripts/originals/recipes')
pairs=[
 ('european.txt','- 3 | lb | chicken thighs | bone-in, skin-on','- 2.25 | lb | chicken thighs | boneless, skin-on'),
 ('european.txt','- 3 | lb | chicken thighs | bone-in, skin removed','- 2.25 | lb | chicken thighs | boneless, skinless'),
 ('filipino.txt','- 3 | lb | oxtail | cut in pieces','- 1.4 | lb | oxtail | edible meat weight; buy about 3 lb bone-in, cut in pieces'),
 ('filipino.txt','- 2.5 | lb | chicken thighs | bone-in, cut up','- 1.75 | lb | chicken thighs | boneless, cut in pieces'),
 ('filipino.txt','- 3 | lb | beef shank | bone-in, 2-inch thick cross-cut with marrow','- 1.8 | lb | beef shank | edible meat weight; buy about 3 lb bone-in cross-cut with marrow'),
 ('filipino.txt','- 2 | lb | chicken thighs | bone-in','- 1.5 | lb | chicken thighs | boneless'),
 ('indian.txt','- 2 | lb | lamb shoulder | bone-in, in 2-inch pieces','- 1.5 | lb | lamb shoulder | edible meat weight; buy about 2 lb bone-in, in 2-inch pieces'),
 ('indian.txt','- 2 | lb | chicken thighs | bone-in, skin removed','- 1.5 | lb | chicken thighs | boneless, skinless'),
 ('indian.txt','- 2.5 | lb | chicken drumsticks | skin removed, deeply scored','- 1.75 | lb | chicken thighs | boneless, skinless, cut in large pieces and scored'),
 ('indonesian.txt','- 2 | lb | chicken thighs | bone-in','- 1.5 | lb | chicken thighs | boneless'),
 ('korean.txt','- 3 | lb | short ribs | cut Korean-style or in 2-inch pieces','- 1.8 | lb | short ribs | edible meat weight; buy about 3 lb bone-in, cut Korean-style or in 2-inch pieces'),
 ('korean.txt','- 2 | lb | whole chicken | small young chicken or Cornish hen','- 1.3 | lb | whole chicken | edible meat and skin weight of a small 2 lb young chicken or Cornish hen'),
 ('korean.txt','- 3 | lb | pork spare ribs | or pork neck bones, cut apart','- 1.8 | lb | pork spare ribs | edible meat weight; buy about 3 lb bone-in, or use neck bones, cut apart'),
 ('malaysian.txt','- 3.5 | lb | whole chicken |','- 2.25 | lb | whole chicken | edible meat and skin weight of a 3.5 lb bird'),
 ('malaysian.txt','- 1.5 | lb | mackerel | steaks','- 1.4 | lb | mackerel | fillets or boneless steaks'),
 ('pakistani-sri-lankan-nepali.txt','- 2 | lb | chicken thighs | bone-in, skin removed, cut up','- 1.5 | lb | chicken thighs | boneless, skinless, cut up'),
 ('pakistani-sri-lankan-nepali.txt','- 2.5 | lb | beef shank | bone-in, cut in chunks','- 1.5 | lb | beef shank | edible meat weight; buy about 2.5 lb bone-in, cut in chunks'),
 ('pakistani-sri-lankan-nepali.txt','- 2 | lb | lamb shoulder | bone-in, in chunks','- 1.5 | lb | lamb shoulder | edible meat weight; buy about 2 lb bone-in, in chunks'),
 ('pakistani-sri-lankan-nepali.txt','- 1.5 | lb | chicken thighs | bone-in','- 1.1 | lb | chicken thighs | boneless'),
 ('pakistani-sri-lankan-nepali.txt','- 2 | lb | chicken thighs | bone-in, skin removed','- 1.5 | lb | chicken thighs | boneless, skinless'),
 ('taiwanese.txt','- 2 | lb | chicken thighs | bone-in, chopped into 2-inch pieces','- 1.5 | lb | chicken thighs | boneless, chopped into 2-inch pieces'),
 ('thai.txt','- 1.5 | lb | chicken drumsticks |','- 1.1 | lb | chicken thighs | boneless, skinless, in large pieces'),
 ('thai.txt','- 3 | lb | whole chicken |','- 2 | lb | whole chicken | edible meat and skin weight of a 3 lb bird'),
 ('vietnamese.txt','- 2 | lb | oxtail |','- 0.9 | lb | oxtail | edible meat weight; buy about 2 lb bone-in'),
 ('vietnamese.txt','- 1.5 | lb | pork trotters | cut in pieces','- 0.7 | lb | pork trotters | edible weight; buy about 1.5 lb, cut in pieces'),
 ('vietnamese.txt','- 4 | | pork chops | thin-cut, bone-in, about 1/2 inch','- 1.25 | lb | pork chops | thin-cut boneless, about 1/2 inch (bone-in works too)'),
]
for f,o,n in pairs:
    p=R/f; s=p.read_text(encoding='utf-8')
    if o not in s: print('MISSING',f,o); continue
    p.write_text(s.replace(o,n,1),encoding='utf-8')
