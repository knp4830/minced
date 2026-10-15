# Duplicate photos and near-duplicate recipes (review 2026-10-15)

Run by `scripts/photos/near_dupes.py` (title stem + ingredient overlap on a snapshot of live) and a sha256 / attribution-URL
check on `manifest/photos.json`. Every pair below was compared by hand (ingredients, quantities, steps, and the photo).

## 1. Five photos used by two recipes each

| Photo (Commons file) | Recipes | Decision |
|---|---|---|
| Apple Goodie crisp | apple-crisp-0, apple-pistachio-crisp | **Different dishes** (pistachio crisp has raisins, lemon, whole wheat flour, pistachios). Photo stays on apple-crisp-0 (plain oat crisp in a glass dish). Removed from apple-pistachio-crisp. |
| Deviled Eggs - 3-23-08 | deviled-eggs, heavenly-deviled-eggs | **Same dish** (6 eggs + mayonnaise, mustard or salt/pepper). Recipe heavenly-deviled-eggs deleted; photo stays on deviled-eggs. |
| Hummus from The Nile | hummus, fiesta-hummus | **Different dishes** (fiesta: yogurt, jalapeno, cilantro, lime; classic: tahini, lemon). Photo is classic tahini hummus, stays on hummus. Removed from fiesta-hummus. |
| Yellow Split Pea Soup | split-pea-soup, golden-split-pea-soup | **Different recipes** (golden has potatoes, broth, onion powder, poultry seasoning). Photo stays on split-pea-soup (onion, split peas, water). Removed from golden-split-pea-soup. |
| Tostada (5076307841) | tostadas, tostadas-delgadas | **Same dish** (flour tortillas, refried beans, lettuce, tomato, cheese). Recipe tostadas-delgadas deleted. The photo shows **grilled shrimp under green salsa**; neither recipe has shrimp, so it is also removed from tostadas. |

## 2. Recipes deleted (scripts/dedupe-near-duplicates.sql)

| Deleted | Kept | Why |
|---|---|---|
| heavenly-deviled-eggs | deviled-eggs | same dish; keeper has the fuller steps |
| tostadas-delgadas | tostadas | same dish; keeper has more ingredients and steps |
| scalloped-potatoes-ii | scalloped-potatoes | same dish (potato, onion, margarine, flour, milk); keeper has times and a photo |

Favourites and shopping-list "from this recipe" links on a deleted recipe are re-pointed at the keeper first.

## 3. Other near-identical pairs found, kept on purpose (different dishes)

| Pair | Why kept |
|---|---|
| muffins / pancakes / drop-biscuits (better baking mix) | same mix, different dishes |
| peanut-butter-bread, peanut-butter-muffins, three-grain-peanut-bread | loaf, muffin, grain loaf |
| tasty-chicken-and-veggie-packets, tasty-fish-and-veggie-packets | chicken vs fish |
| tomato-basil-bruschetta, tomato-basil-soup | appetiser vs soup |
| angel-food-cake, pumpkin-angel-food-cake | pumpkin version differs |
| chicken-spanish-rice, spanish-rice | with and without chicken |
| fresh-salsa, fresh-tomato-salsa | the second adds apple, parsley, cayenne |
| festive-microwave-baked-apples, microwave-baked-apple | festive adds raisins and more |
| chicken-ratatouille, ratatouille-0 | chicken added |
| brown-rice-tabbouleh, tabbouleh | brown rice instead of bulgur |
| homemade-mashed-potatoes, mashed-parsnips-and-potatoes | parsnips |
| quick-chili, two-bean-chili | different beans and method |
| green-bean-and-mushroom-medley, green-bean-saute | mushrooms |
| apple-chunk-cake, apple-coffee-cake | cake vs coffee cake |

Any pair above can be added to the `nd_pairs` list in `scripts/dedupe-near-duplicates.sql` if the owner disagrees.
