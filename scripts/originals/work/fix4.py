from pathlib import Path
R=Path('scripts/originals/recipes')
pairs=[
 # frying/oil absorption realism
 ('japanese.txt','- 0.25 | cup | vegetable oil | about 1.5 inches in the pan; roughly this much is absorbed\n- 2 | cup | green cabbage','- 2 | tbsp | vegetable oil | about 1.5 inches in the pan; roughly this much is absorbed\n- 2 | cup | green cabbage'),
 ('japanese.txt','- 0.25 | cup | vegetable oil | about 1.5 inches in the pan; roughly this much is absorbed\n- 0.75 | cup | dashi','- 2 | tbsp | vegetable oil | about 1.5 inches in the pan; roughly this much is absorbed\n- 0.75 | cup | dashi'),
 ('japanese.txt','- 0.25 | cup | vegetable oil | about 3 cups to fill the pot; roughly this much is absorbed\n- 0.5 | cup | dashi','- 3 | tbsp | vegetable oil | about 3 cups to fill the pot; roughly this much is absorbed\n- 0.5 | cup | dashi'),
 ('european.txt','- 0.5 | cup | clarified butter | about 1/2 inch in the pan; roughly 2 tbsp is absorbed','- 3 | tbsp | clarified butter | about 1/2 inch in the pan; roughly this much is absorbed'),
 ('european.txt','- 0.5 | cup | olive oil | most is drained off after poaching','- 3 | tbsp | olive oil | about 1/2 cup goes in the pan and most is drained off after poaching'),
 ('vietnamese.txt','- 0.33 | cup | vegetable oil | for shallow frying','- 3 | tbsp | vegetable oil | for shallow frying, about 1/3 cup in the pan'),
 ('indonesian.txt','- 0.25 | cup | vegetable oil | for shallow frying','- 3 | tbsp | vegetable oil | for shallow frying'),
 ('thai.txt','- 3 | tbsp | vegetable oil | for frying','- 2 | tbsp | vegetable oil | about 1/2 cup in the pan; roughly this much is absorbed'),
 # portions that were unrealistic
 ('korean.txt','- 0.5 | cup | vegetable oil | divided','- 3 | tbsp | vegetable oil | divided'),
 ('korean.txt','- 12 | oz | pork belly | cut in 1/2-inch cubes','- 8 | oz | pork belly | cut in 1/2-inch cubes'),
 ('korean.txt','1. Heat 1/4 cup oil in a skillet over medium heat. Fry the black bean paste','1. Heat 2 tbsp oil in a skillet over medium heat. Fry the black bean paste'),
 ('chinese.txt','- 1.5 | lb | pork belly | cut in 1.5-inch cubes','- 1 | lb | pork belly | cut in 1.5-inch cubes'),
 ('filipino.txt','- 1.5 | lb | pork belly |\n- 4 | oz | chicken liver |','- 1 | lb | pork belly |\n- 4 | oz | chicken liver |'),
 ('taiwanese.txt','- 1.5 | lb | pork belly | skin-on or off, in a slab','- 12 | oz | pork belly | skin-on or off, in a slab'),
]
for f,o,n in pairs:
    p=R/f; s=p.read_text(encoding='utf-8')
    if o not in s: print('MISSING',f,o[:70]); continue
    p.write_text(s.replace(o,n,1),encoding='utf-8')
