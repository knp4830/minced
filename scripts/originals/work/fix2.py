from pathlib import Path
R=Path('scripts/originals/recipes')
pairs=[
 # (file, old, new)
 ('italian.txt','- 1 | cup | pecorino romano | finely grated, plus more to serve','- 3.5 | oz | pecorino romano | finely grated (about 1 cup), plus more to serve'),
 ('italian.txt','- 0.5 | cup | pecorino romano | grated','- 1.75 | oz | pecorino romano | grated (about 1/2 cup)'),
 ('italian.txt','- 2 | tbsp | pecorino romano | finely grated','- 0.4 | oz | pecorino romano | finely grated (about 2 tbsp)'),
 ('italian.txt','- 8 | slice | prosciutto |','- 3 | oz | prosciutto | about 8 thin slices'),
 ('japanese.txt','- 30 | | dumpling wrappers | round','- 7 | oz | dumpling wrappers | about 30 round wrappers'),
 ('japanese.txt','- 0.5 | | napa cabbage | cut in large pieces','- 12 | oz | napa cabbage | cut in large pieces (about half a head)'),
 ('pakistani-sri-lankan-nepali.txt','- 40 | | dumpling wrappers | round','- 9 | oz | dumpling wrappers | about 40 round wrappers'),
 ('chinese.txt','- 24 | | wonton wrappers |','- 5 | oz | wonton wrappers | about 24'),
 ('chinese.txt','- 2 | | leek | sliced on the diagonal','- 6 | oz | leek | trimmed, sliced on the diagonal (about 2 leeks)'),
 ('european.txt','- 1 | bunch | scallion | sliced','- 6 | | scallion | sliced'),
 ('european.txt','- 1 | lb | potato | boiled and riced','- 1 | lb | potato | peeled, cut in chunks'),
 ('european.txt','1. Mix the flour with 1/2 tsp salt. Add the egg, sour cream and warm water and knead 5 min to a smooth dough. Cover and rest 30 min.','1. Mix the flour with 1/2 tsp salt. Add the egg, sour cream and warm water and knead 5 min to a smooth dough. Cover and rest 30 min. Meanwhile boil the potato in salted water 15 min until tender, drain and rice it.'),
 ('filipino.txt','- 0.5 | cup | peanut butter | unsweetened','- 0.5 | cup | peanut butter | natural, no added sugar if possible'),
 ('filipino.txt','- 1 | | bitter melon | seeded, sliced','- 8 | oz | bitter melon | seeded, sliced (about 1 melon)'),
 ('filipino.txt','- 1 | can | sweetened condensed milk | 14 oz','- 14 | oz | sweetened condensed milk | one can'),
 ('indian.txt','- 2 | cup | atta | plus extra for dusting','- 8.5 | oz | atta | about 2 cups, plus extra for dusting'),
 ('indian.txt','- 1 | lb | potato | boiled, peeled, mashed dry','- 1 | lb | potato | peeled, cut in chunks'),
 ('indian.txt','2. Mix the mashed potato with the green chili, mango powder, garam masala, red chili powder, cilantro and remaining salt.','2. Boil the potato in salted water 20 min until tender, drain well and mash dry. Mix with the green chili, mango powder, garam masala, red chili powder, cilantro and remaining salt.'),
 ('indian.txt','- 8 | oz | potato | boiled and mashed','- 8 | oz | potato | peeled, cut in chunks'),
 ('indian.txt','1. Mix the paneer, potato, cornstarch, garam masala and salt into a smooth dough.','1. Boil the potato in salted water 15 min until tender, drain and mash dry. Mix the paneer, mashed potato, cornstarch, garam masala and salt into a smooth dough.'),
 ('indian.txt','- 1 | cup | cauliflower | small florets','- 3.5 | oz | cauliflower | small florets (about 1 cup)'),
 ('indian.txt','- 0.33 | cup | toor dal | cooked soft and mashed','- 2 | tbsp | toor dal | dry, rinsed'),
 ('indian.txt','2. Stir in the mashed dal, rasam powder and the remaining water.','2. Meanwhile simmer the dal in 1 cup water 25 min until very soft and mash it. Stir in the mashed dal, rasam powder and the remaining water.'),
 ('indonesian.txt','- 12 | oz | potato | boiled, sliced','- 12 | oz | potato | peeled'),
 ('indonesian.txt','- 0.25 | cup | shredded coconut | unsweetened, toasted until deep brown, ground','- 0.25 | cup | shredded coconut | toasted until deep brown, ground'),
 ('malaysian.txt','- 10 | oz | rice stick noodles | cooked','- 8 | oz | rice stick noodles | dried, cooked per package directions'),
 ('malaysian.txt','- 1 | | potato | boiled and diced','- 1 | | potato | peeled, diced small and simmered in water 6 min first'),
 ('vietnamese.txt','- 1 | lb | rice stick noodles | thick round rice noodles, cooked','- 12 | oz | rice stick noodles | thick round, dried, cooked per package directions'),
]
for f,o,n in pairs:
    p=R/f; s=p.read_text(encoding='utf-8')
    if o not in s: print('MISSING',f,o[:60]); continue
    p.write_text(s.replace(o,n,1),encoding='utf-8')
