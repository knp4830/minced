# Wave 14 recipe review sheet

Everything below lands as `in_review`; nothing is public until you approve it in `/admin/review`. Numbers are computed by the database from the ingredient rows (never typed); `complete` means every line was counted, `partial` means a named gap (the label then says "at least" and shows no calories column).

## 1. Licence and credit (read this first)

- **NHS Better Health: Healthier Families recipes.** The NHS terms (https://www.nhs.uk/our-policies/terms-and-conditions/, clauses 3.3 to 3.4) release NHS website content under the Open Government Licence v3.0, commercial use included. Clause 3.5 excludes logos, images, personal data and third-party items, so **no image was taken**. Clause 3.6b: adapted content must carry "Contains public sector information licensed under the Open Government Licence v3.0." and must not be attributed to the NHS website. The page itself shows only a Crown copyright line; the licence grant is in the site terms. robots.txt does not disallow `/healthier-families/`; pages were fetched at one request every 3 seconds. **The recipe page does not yet render this credit line** (it shows "Original recipe by Minced" for any unknown source), so approve none of the NHS recipes until the credit is shown (patch in the lane report).
- **USDA MyPlate rescues.** Public-domain US federal works, from the Internet Archive capture. Only pages whose `Source:` names a federal body were rescued; pages credited to a university, extension service, state agency or company are listed in section 5 and were NOT imported.

## 2. NHS pilot (20 recipes)

| Recipe | Serves | Our kcal | Published kcal | Protein / carbs / fat (ours) | Status | Allergens | Diets |
|---|---|---|---|---|---|---|---|
| [Chicken jalfrezi](https://www.nhs.uk/healthier-families/recipes/chicken-jalfrezi/) | 4 | 368 | 334 | 41 / 22 / 13 | complete | none | Gluten-free |
| [Chicken pasta with peas](https://www.nhs.uk/healthier-families/recipes/chicken-pasta-with-peas/) | 4 | 457 | 424 | 27 / 72 / 6 | complete | Dairy, Gluten, Wheat | - |
| [Coconut rice salad](https://www.nhs.uk/healthier-families/recipes/coconut-rice-salad/) | 4 | n/a | 127 | - / - / - | partial | none | Gluten-free, Vegan |
| [Vegetable frittata](https://www.nhs.uk/healthier-families/recipes/courgette-and-tomato-vegetable-frittata/) | 4 | 217 | 222 | 13 / 17 / 11 | complete | Dairy, Egg, Gluten, Wheat | Vegetarian |
| [Deresh curry](https://www.nhs.uk/healthier-families/recipes/deresh-aloo-curry/) | 4 | n/a | 197 | - / - / - | partial | none | Gluten-free, Vegan |
| [Easy carrot soup](https://www.nhs.uk/healthier-families/recipes/easy-carrot-soup/) | 4 | n/a | 100 | - / - / - | partial | Dairy | Gluten-free, Vegetarian |
| [Easy overnight oats](https://www.nhs.uk/healthier-families/recipes/easy-overnight-oats/) | 4 | 293 | 294 | 8 / 61 / 3 | complete | Dairy, Gluten | Vegetarian |
| [Classic vegetable soup](https://www.nhs.uk/healthier-families/recipes/easy-vegetable-soup/) | 4 | n/a | 100 | - / - / - | partial | Gluten, Wheat | Vegan |
| [Eggs paprika](https://www.nhs.uk/healthier-families/recipes/eggs-paprika/) | 4 | 221 | 209 | 12 / 25 / 9 | complete | Egg, Gluten, Wheat | Vegetarian |
| [Haddock florentine](https://www.nhs.uk/healthier-families/recipes/haddock-florentine/) | 4 | n/a | n/a | - / - / - | partial | Dairy, Egg, Fish, Gluten, Soy, Wheat | Pescatarian |
| [Panjabi dhal](https://www.nhs.uk/healthier-families/recipes/panjabi-dhal/) | 4 | 262 | 245 | 13 / 38 / 8 | complete | none | Gluten-free, Vegan |
| [Panjabi keema](https://www.nhs.uk/healthier-families/recipes/panjabi-keema/) | 4 | 429 | 451 | 39 / 22 / 22 | complete | none | Gluten-free |
| [Perfect pasta and tomato sauce](https://www.nhs.uk/healthier-families/recipes/perfect-pasta-and-tomato-sauce/) | 4 | n/a | 343 | - / - / - | partial | Gluten, Wheat | Vegan |
| [Roast chicken breast with peppers](https://www.nhs.uk/healthier-families/recipes/roast-chicken-breast-with-peppers/) | 4 | n/a | 384 | - / - / - | partial | Gluten, Wheat | - |
| [Bang-tasty chicken drumsticks](https://www.nhs.uk/healthier-families/recipes/roast-chicken-drumsticks/) | 4 | 520 | 404 | 51 / 59 / 9 | complete | Dairy, Gluten, Soy, Wheat | - |
| [Roasted veg and couscous](https://www.nhs.uk/healthier-families/recipes/roasted-veg-and-couscous/) | 4 | n/a | 385 | - / - / - | partial | Gluten, Wheat | Vegan |
| [Salmon and broccoli pasta](https://www.nhs.uk/healthier-families/recipes/salmon-and-broccoli-pasta/) | 4 | n/a | 465 | - / - / - | partial | Dairy, Fish, Gluten, Wheat | Pescatarian |
| [Salmon with spring onion mash](https://www.nhs.uk/healthier-families/recipes/salmon-with-spring-onion-mash/) | 4 | n/a | 445 | - / - / - | partial | Dairy, Fish | Gluten-free, Pescatarian |
| [Sweet and sour chicken](https://www.nhs.uk/healthier-families/recipes/sweet-and-sour-chicken/) | 4 | 323 | 295 | 22 / 47 / 6 | complete | Gluten, Soy, Wheat | - |
| [Sweet potato pasta](https://www.nhs.uk/healthier-families/recipes/sweet-potato-pea-pasta/) | 4 | 421 | 198 | 17 / 78 / 4 | complete | Dairy, Gluten, Wheat | Vegetarian |

### Chicken jalfrezi  (`chicken-jalfrezi`)

Source: https://www.nhs.uk/healthier-families/recipes/chicken-jalfrezi/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 15 min, cook 25 min.

Ingredients as stored:

- 30 ml canola oil
- 700 g chicken, boneless, cut into cubes
- 3 onion, chopped
- 2 bell pepper, chopped
- 4 chili peppers, green, sliced
- 4 clove garlic, finely chopped
- 20 g ginger, peeled and sliced into thin pieces
- 1 can diced tomatoes
- 1 tsp salt, optional (optional)
- 1 tsp ground turmeric
- 1 tsp cumin seeds, heaped
- 1 tsp red chili powder
- 1 tsp garam masala
- 1.5 tsp ground coriander
- 250 ml water
- fresh cilantro, finely chopped, optional (optional)

Wording changed before matching (page text -> catalog name):

- `700g boneless chicken, cut into cubes` -> `700g chicken, cut into cubes` [boneless]
- `4 green chillies, sliced` -> `4 chili peppers, sliced` [green]
- `400g tin of chopped tomatoes` -> `1 (400 g) can diced tomatoes`
- `1 heaped teaspoon cumin seeds` -> `1 teaspoon cumin seeds` [heaped]
- `1.5 teaspoon coriander powder` -> `1.5 teaspoon ground coriander`
- `fresh coriander to serve, finely chopped (optional)` -> `fresh cilantro to serve, finely chopped (optional)`

Method:

1. Heat the oil in a non-stick pan on a high heat. Add the chicken pieces and cook for 2 minutes. Add the cumin, turmeric, chilli powder and half a teaspoon of salt (if using). Mix well and fry on a medium heat for 3 to 4 mins, stirring frequently to stop the mixture from catching, until the chicken is lightly cooked and starting to turn white.
2. Remove the chicken and set aside, leaving the oil and juices in the pan. Fry the sliced onions on a medium heat for 7 minutes, until they're soft and beginning to turn golden. While the onions are cooking, blend the tinned tomatoes in a blender, or mash well using a masher or the back of a fork.
3. Add the ginger, garlic and peppers to the pan and cook for 2 minutes, then add the tomatoes, mix well and cook for another 2 minutes. Stir in the coriander powder, garam masala, cumin seeds and half a teaspoon of salt (if using), and cook for a further minute.
4. Add the chicken pieces back to the pan, stir well to coat in the mixture and cook for a couple of minutes. Add the green chillies, mix and fry on medium heat for another 2 minutes. Pour the water into the pot and stir, then cover and simmer on low heat for 10 to 15 minutes.
5. Once the chicken is tender and the sauce has thickened, turn off the heat and scatter over the chopped coriander.

### Chicken pasta with peas  (`chicken-pasta-with-peas`)

Source: https://www.nhs.uk/healthier-families/recipes/chicken-pasta-with-peas/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 5 min, cook 15 min.

Ingredients as stored:

- 350 g pasta
- 175 g peas
- 175 g chicken, cooked, chopped into small chunks
- 1 tbsp horseradish
- 1 tbsp creme fraiche
- 1 tbsp fresh parsley, chopped
- black pepper, ground

Method:

1. Bring a large pan of water to a boil. Add a pinch of salt and the pasta. Stir once and cook for 10 to 12 minutes, or according to the instructions on the packet, until the pasta is cooked but still slightly firm in the middle.
2. About 2 or 3 minutes before the pasta is done, add the peas to the water to cook.
3. Drain the pasta and peas in a colander, then return to the pan. Add the chicken, horseradish, crème fraîche and parsley. Stir well to combine, and season with the pepper.
4. Put the pan back over a low heat and mix gently until everything is just warmed through. Divide evenly between 4 bowls and tuck in!

### Coconut rice salad  (`coconut-rice-salad`)

Source: https://www.nhs.uk/healthier-families/recipes/coconut-rice-salad/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 15 min, cook 30 min.

Named gaps: scallion (no gram weight for bunch)

Ingredients as stored:

- 100 g brown rice
- 1 bell pepper, finely chopped
- 1 carrot, grated
- 1 bunch scallion, finely sliced
- 1 lime, juice and grated zest of
- 1 tbsp fresh cilantro, chopped
- 1 tbsp shredded coconut

Wording changed before matching (page text -> catalog name):

- `100g easy-cook brown rice` -> `100g brown rice`
- `1 pepper, any colour, finely chopped` -> `1 bell pepper, finely chopped`
- `1 tablespoon chopped fresh coriander` -> `1 tablespoon chopped fresh cilantro`

Method:

1. Rinse the rice in a sieve under the cold water tap. Add to 250ml of cold water in a pan, bring to the boil, cover and cook for 25 minutes. Alternatively, cook according to pack instructions.
2. After cooking, return to the sieve and rinse under the cold water tap to cool.
3. When the rice is cool, stir in the vegetables, lime juice and zest, and coriander.
4. Place in a serving dish and sprinkle with coconut. Keep in the fridge until ready to serve.

### Vegetable frittata  (`courgette-and-tomato-vegetable-frittata`)

Source: https://www.nhs.uk/healthier-families/recipes/courgette-and-tomato-vegetable-frittata/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 10 min, cook 12 min.

Ingredients as stored:

- 2 tsp vegetable oil
- 6 egg
- 2 tbsp milk
- 4 slice sandwich bread
- 2 tomato, chopped
- 1 zucchini, coarsely grated
- black pepper, optional (optional)

Wording changed before matching (page text -> catalog name):

- `4 slices bread (wholemeal if possible)` -> `4 slices bread (whole wheat if possible)`

Method:

1. Turn the grill on to preheat to a medium-high temperature.
2. Heat the vegetable oil in a non-stick frying pan. Add the courgette and tomatoes and cook on the hob for 3 to 4 minutes, stirring often, until soft. Spread out over the base of the frying pan.
3. Beat the eggs and milk together and pour into the frying pan. Cook over a medium-low heat for 4 or 5 minutes to set the base, then transfer to the grill to set the surface – about 3 minutes. Remove from the heat and let the frittata cool for 3 or 4 minutes.
4. Toast the slices of bread. Slice the frittata into wedges and serve with the toast.

### Deresh curry  (`deresh-aloo-curry`)

Source: https://www.nhs.uk/healthier-families/recipes/deresh-aloo-curry/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 10 min, cook 20 min.

Named gaps: panch phoron (no USDA food linked)

Ingredients as stored:

- 2 tbsp vegetable oil
- 1 tbsp panch phoron
- 2 bay leaf
- 1 onion, finely chopped
- 4 clove garlic, finely chopped
- 1 tbsp ginger, peeled and grated
- 3 potato, cubed
- 450 g okra, washed and halved
- 350 ml water

Method:

1. Heat the vegetable oil in a pan, then add the panch phoran, bay leaves, chopped onion, garlic and ginger. Cook on low heat for 3 or 4 minutes, until the mixture starts to brown.
2. Add the chopped potato, cover and cook for 5 minutes until it starts to soften.
3. Add the okra and mix well. Add the water, stir and lower the heat. Leave the mixture to simmer uncovered for around 5 minutes, until the okra is softened.

### Easy carrot soup  (`easy-carrot-soup`)

Source: https://www.nhs.uk/healthier-families/recipes/easy-carrot-soup/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 15 min, cook 25 min.

Named gaps: vegetable broth (no low sodium food linked)

Ingredients as stored:

- 1 onion, chopped
- 8 carrot, washed and chopped
- 1.2 l vegetable broth, low sodium
- 100 g cream cheese, low fat
- black pepper, optional (optional)
- 1 bunch fresh cilantro, chopped, optional (optional)

Wording changed before matching (page text -> catalog name):

- `1.2 litres reduced-salt vegetable stock` -> `1.2 litres vegetable broth` [low sodium]
- `100g lower-fat soft cheese` -> `100g cream cheese` [low fat]
- `small bunch of fresh coriander, chopped (optional)` -> `small bunch of fresh cilantro, chopped (optional)`

Method:

1. Put the onion and carrots into a large saucepan with the stock, and bring to a boil.
2. Reduce the heat and simmer, partially covered, for 20 to 25 minutes, or until the vegetables are tender.
3. Blend the soup to a purée using a handheld stick blender – or transfer to a food processor or blender and whizz until smooth. Add most of the soft cheese and blend again until it is thoroughly mixed in.
4. Reheat gently, then serve, garnished with the remaining cheese, a little black pepper and some scattered coriander (if using).

### Easy overnight oats  (`easy-overnight-oats`)

Source: https://www.nhs.uk/healthier-families/recipes/easy-overnight-oats/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 10 min, cook None min.

Ingredients as stored:

- 150 g rolled oats
- 25 g dried cranberries
- 50 g dried apricots, chopped
- 25 g raisins
- 300 ml apple juice, unsweetened
- 8 tbsp plain yogurt, low fat
- 100 g blueberries, thawed if frozen
- 100 g raspberries, thawed if frozen

Wording changed before matching (page text -> catalog name):

- `150g high-fibre porridge oats` -> `150g rolled oats`
- `50g ready-to-eat apricots, chopped` -> `50g dried apricots, chopped`
- `300ml unsweetened apple juice` -> `300ml apple juice` [unsweetened]
- `8 tablespoons low-fat natural yoghurt` -> `8 tablespoons plain yogurt` [low fat]
- `100g fresh or frozen blueberries, thawed if frozen` -> `100g blueberries, thawed if frozen`
- `100g fresh or frozen raspberries, thawed if frozen` -> `100g raspberries, thawed if frozen`

Method:

1. In a large bowl, mix together the porridge oats, cranberries, apricots and sultanas. Add the apple juice and stir well. Cover and refrigerate overnight.
2. In the morning, share the soaked mixture between 4 cereal bowls.
3. Spoon 2 tablespoons of natural yoghurt onto each portion, and share the berries between the bowls.

### Classic vegetable soup  (`easy-vegetable-soup`)

Source: https://www.nhs.uk/healthier-families/recipes/easy-vegetable-soup/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 15 min, cook 25 min.

Named gaps: italian seasoning (no USDA food linked); leek (no gram weight for each); vegetable broth (no low sodium food linked)

Ingredients as stored:

- 1 tsp vegetable oil
- 1 onion, peeled and chopped
- 2 carrot, chopped
- 1 leek, sliced
- 2 stalk celery, sliced
- 1 can diced tomatoes, or 400 g passata
- 1 l vegetable broth, low sodium
- 1 tbsp tomato paste
- 50 g snap peas, or green beans, sliced
- 50 g peas
- 40 g pasta, dried
- 1.5 tsp italian seasoning
- black pepper, ground

Wording changed before matching (page text -> catalog name):

- `2 celery sticks, sliced` -> `2 stalks celery, sliced`
- `1 tin chopped tomatoes or 400g passata` -> `1 can diced tomatoes` [or 400 g passata]
- `1L reduced-salt vegetable stock` -> `1L vegetable broth` [low sodium]
- `1 tablespoon tomato purée` -> `1 tablespoon tomato paste`
- `50g sugar snap peas or green beans, sliced` -> `50g sugar snap peas, sliced` [or green beans]
- `40g dried pasta shapes` -> `40g pasta` [dried]
- `1.5 teaspoon dried mixed herbs` -> `1.5 teaspoon italian seasoning`

Method:

1. Heat the oil in a large saucepan. Add the onion, carrots, leek and celery, and fry gently for 3 or 4 minutes.
2. Add the tomatoes, tomato purée, beans, frozen peas and stock. Bring to the boil and add the pasta, herbs and pepper.
3. Lower the heat and simmer for 15 minutes or until the pasta is cooked, stirring frequently to make sure the pasta doesn't stick.
4. Turn off the heat and leave to cool for a few minutes. Ladle into bowls and serve with a slice of wholemeal bread.

### Eggs paprika  (`eggs-paprika`)

Source: https://www.nhs.uk/healthier-families/recipes/eggs-paprika/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 5 min, cook 20 min.

Ingredients as stored:

- 4 egg
- 4 slice whole wheat bread
- 2 onion, sliced into thin rings
- 2 tsp vegetable oil
- 4 tomato, sliced
- 3 tsp paprika
- black pepper, ground

Wording changed before matching (page text -> catalog name):

- `4 slices wholemeal bread` -> `4 slices whole wheat bread`
- `3 teaspoons mild paprika, plus extra for sprinkling` -> `3 teaspoons paprika, plus extra for sprinkling`

Method:

1. Cook the eggs in gently boiling water for 10 to 12 minutes to hard-boil them.
2. While the eggs are cooking, heat the vegetable oil in a large non-stick frying pan. Add the onions and cook over a medium-low heat, stirring often, until very soft – about 10 minutes. Add a splash of boiling water if necessary to stop them from sticking.
3. Add the tomatoes and paprika to the onions, and cook for another 5 to 8 minutes. Season with a little black pepper.
4. Shell the eggs and cut each into 4. Toast the bread, then top each slice with a quarter of the tomato mixture and 4 egg quarters. Sprinkle with extra paprika or black pepper, if you like.

### Haddock florentine  (`haddock-florentine`)

Source: https://www.nhs.uk/healthier-families/recipes/haddock-florentine/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 5 min, cook 10 min.

Named gaps: haddock (no gram weight for each); margarine (no low fat food linked)

Ingredients as stored:

- 4 haddock
- 4 tomato, halved
- 4 egg
- 4 slice whole wheat bread
- 4 tsp margarine, low fat
- 300 g spinach
- black pepper, ground

Wording changed before matching (page text -> catalog name):

- `4 skinless haddock fillets` -> `4 haddock`
- `4 slices wholemeal bread` -> `4 slices whole wheat bread`
- `4 teaspoons reduced-fat spread` -> `4 teaspoons margarine` [low fat]

Method:

1. Preheat the grill. Fill the kettle and boil it. Grill the haddock fillets, with the tomatoes at the side of the grill pan for 5 to 6 minutes until the fish is cooked (it should stop looking see-through and should flake easily).
2. Meanwhile, poach the eggs in gently simmering water for 4 to 5 minutes. Toast the slices of bread and spread them with reduced-fat spread.
3. Put the spinach in a large colander and slowly pour the kettleful of boiling water over the leaves to wilt them. Leave to drain for a few moments, then share between 4 warm plates. Arrange the fish on top, and place a poached egg onto each portion.
4. Sprinkle with black pepper and serve with the tomatoes and toast.

### Panjabi dhal  (`panjabi-dhal`)

Source: https://www.nhs.uk/healthier-families/recipes/panjabi-dhal/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 5 min, cook 25 min.

Ingredients as stored:

- 50 g red lentils, washed and drained
- 170 g moong dal, washed and drained
- 1.5 l water
- 1 onion, finely chopped
- 4 clove garlic, finely chopped
- 4 chili peppers, green, finely chopped
- 30 ml canola oil
- 1 tsp salt, optional (optional)
- 1.5 tsp ground turmeric
- 1 tsp cumin seeds
- fresh cilantro, finely chopped

Wording changed before matching (page text -> catalog name):

- `50g red split lentils, washed and drained` -> `50g red lentils, washed and drained`
- `170g split mung dhal, washed and drained` -> `170g moong dal, washed and drained`
- `4 green chillies, finely chopped` -> `4 chili peppers, finely chopped` [green]
- `Fresh coriander, finely chopped (to serve)` -> `fresh cilantro, finely chopped (to serve)`

Method:

1. Put the washed mung dhal and red lentils in a large pot, add the water and put on the hob on a low heat. After a few minutes, add the salt and turmeric, stir and bring to the boil. Once boiling, turn the heat down again and leave to simmer, partially covered, for around 15 minutes.
2. Meanwhile, heat the rapeseed oil in a shallow frying pan on medium heat. Add the cumin seeds and fry for 15 seconds, then add the onions and garlic. Once those are soft and beginning to brown (around 5 minutes), add the green chillies, mix well and cook for a further couple of minutes.
3. Add the mixture from the frying pan to the simmering lentils, stir well and turn up to a medium heat. Once boiling, turn off the heat and remove the pot.
4. Allow to cool for a few minutes, then top with chopped coriander.

### Panjabi keema  (`panjabi-keema`)

Source: https://www.nhs.uk/healthier-families/recipes/panjabi-keema/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 15 min, cook 20 min.

Ingredients as stored:

- 30 ml canola oil
- 2 onion, finely chopped
- 4 clove garlic, finely chopped
- 1 can diced tomatoes
- 20 g ginger, peeled and chopped
- 4 chili peppers, green
- 150 g peas
- 1.5 tsp ground turmeric
- 700 g ground turkey
- 1 tsp salt, optional (optional)
- 1.5 tsp ground cumin
- 1.5 tsp ground coriander
- 2 tsp garam masala
- fresh cilantro, finely chopped

Wording changed before matching (page text -> catalog name):

- `400g tin of chopped tomatoes` -> `1 (400 g) can diced tomatoes`
- `4 green chillies` -> `4 chili peppers` [green]
- `1.5 teaspoon cumin powder` -> `1.5 teaspoon ground cumin`
- `Fresh coriander (to serve), finely chopped` -> `fresh cilantro (to serve), finely chopped`

Method:

1. Blend the chopped tomatoes, ginger and green chillies together, and set aside for later.
2. Heat the oil in a non-stick pan on medium heat and cook the chopped onions for 5 minutes or so. Once softened and beginning to brown, add the chopped garlic and cook for a further 3 minutes.
3. Add the blended tomato, ginger and chilli mix to the pan, along with the turmeric and frozen peas. Stir well and cook for a further 3 minutes.
4. Add the turkey mince to the pan along with the remaining spices. Mix well and keep cooking on a medium heat until the meat has turned white. Cover the pan, turn the heat to low and cook for another 5 minutes.
5. Remove the lid and carry on cooking for a few minutes to allow any excess water to evaporate. Once ready, top with chopped coriander.

### Perfect pasta and tomato sauce  (`perfect-pasta-and-tomato-sauce`)

Source: https://www.nhs.uk/healthier-families/recipes/perfect-pasta-and-tomato-sauce/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 5 min, cook 15 min.

Named gaps: italian seasoning (no USDA food linked)

Ingredients as stored:

- 1 tsp olive oil
- 1 onion, finely chopped
- 1 clove garlic, crushed or finely chopped
- 1 can diced tomatoes
- 2 tbsp tomato paste
- 2 tsp italian seasoning
- black pepper, ground
- 350 g spaghetti, dried
- 1 tbsp fresh basil, chopped

Wording changed before matching (page text -> catalog name):

- `400g chopped tomatoes` -> `1 (400 g) can diced tomatoes`
- `2 tablespoons tomato purée` -> `2 tablespoons tomato paste`
- `2 teaspoons dried mixed herbs` -> `2 teaspoons italian seasoning`
- `350g dried spaghetti` -> `350g spaghetti` [dried]

Method:

1. Heat the oil in a saucepan or frying pan. Add the onion and cook over a medium heat for 3 to 4 minutes, until soft.
2. Add the garlic, and cook gently for another minute. Add the chopped tomatoes, tomato purée and mixed herbs. Season with pepper and then simmer gently, stirring every now and again, for 15 minutes or until the sauce is thick and rich.
3. After the sauce has been simmering for 8 to 10 minutes, start cooking the spaghetti according to pack instructions.
4. Drain the spaghetti and serve with the sauce, topped with fresh basil or other chopped herbs, if you like.

### Roast chicken breast with peppers  (`roast-chicken-breast-with-peppers`)

Source: https://www.nhs.uk/healthier-families/recipes/roast-chicken-breast-with-peppers/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 15 min, cook 65 min.

Named gaps: vegetable broth (no low sodium food linked)

Ingredients as stored:

- 4 russet potato, scrubbed
- 1 tsp vegetable oil
- 1 onion, peeled and sliced
- 1 red bell pepper, deseeded and cut into strips
- 1 yellow bell pepper, deseeded and cut into strips
- 3 tsp paprika
- 2 tsp dried oregano, or mixed herbs
- 30 g all-purpose flour
- black pepper, ground
- 4 chicken breast, skinless, boneless, uncooked
- 300 ml vegetable broth, or chicken stock, low sodium
- 500 g broccoli

Wording changed before matching (page text -> catalog name):

- `1 red pepper, deseeded and cut into strips` -> `1 red bell pepper, deseeded and cut into strips`
- `1 yellow pepper, deseeded and cut into strips` -> `1 yellow bell pepper, deseeded and cut into strips`
- `3 teaspoons mild paprika` -> `3 teaspoons paprika`
- `2 teaspoons dried oregano or mixed herbs` -> `2 teaspoons dried oregano` [or mixed herbs]
- `4 skinless, boneless uncooked chicken breasts` -> `4 uncooked chicken breasts` [skinless, boneless]
- `300ml reduced-salt vegetable or chicken stock` -> `300ml vegetable broth` [or chicken stock, low sodium]

Method:

1. Preheat the oven to 190C (fan 170C, gas mark 5). Put the potatoes onto the top shelf of the oven to bake.
2. Heat the vegetable oil in a flame-proof casserole dish and stir-fry the onion and peppers over a high heat until softened, about 3 minutes.
3. Put the paprika, herbs and flour into a shallow dish, and season with some pepper, stirring to mix. Dip each chicken breast into the mixture, coating them on both sides. Transfer them to the casserole dish, placing them on top of the onions and peppers.
4. Pour in the stock, then cover the dish. Put in the oven to cook once the potatoes have been baking for 30 minutes. Bake for 35 minutes.
5. Around 10 minutes before the chicken and potatoes are ready, cook the broccoli in boiling water for 8 to 10 minutes, drain and serve with the rest of the meal.

### Bang-tasty chicken drumsticks  (`roast-chicken-drumsticks`)

Source: https://www.nhs.uk/healthier-families/recipes/roast-chicken-drumsticks/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 20 min, cook 30 min.

Ingredients as stored:

- 2 tsp tomato paste
- 2 tsp soy sauce, low sodium
- 2 tbsp lemon
- 8 chicken drumsticks, skinless
- 880 g potato, peeled and cut into chunks
- 4 carrot, sliced
- 320 g peas
- 4 tbsp 1% milk
- black pepper, ground

Wording changed before matching (page text -> catalog name):

- `2 teaspoons tomato purée` -> `2 teaspoons tomato paste`
- `2 teaspoons reduced-salt soy sauce` -> `2 teaspoons soy sauce` [low sodium]
- `8 skinless chicken drumsticks` -> `8 chicken drumsticks` [skinless]
- `4 tablespoons 1%-fat milk` -> `4 tablespoons 1% milk`

Method:

1. Put the tomato purée, reduced-salt soy sauce and lemon juice into a mixing bowl (not a metal one). Mix well and season with black pepper. Add the chicken drumsticks, turning to coat them in the mixture. Cover and refrigerate for at least 30 minutes, or overnight if preferred.
2. When ready to cook, preheat the oven to 200C/fan oven 180C/gas mark 6. Arrange the drumsticks in a foil-lined roasting tin and roast for 30 minutes, brushing them with the remaining glaze after 20 minutes.
3. While the chicken is roasting, boil the potatoes and carrots in separate saucepans until tender – they will take about 20 minutes. Put the peas on to cook in a little boiling water, 5 minutes before the chicken is ready.
4. Drain and mash the potatoes, beat in the milk and season with black pepper. Serve with the chicken drumsticks, carrots and peas.

### Roasted veg and couscous  (`roasted-veg-and-couscous`)

Source: https://www.nhs.uk/healthier-families/recipes/roasted-veg-and-couscous/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 10 min, cook 30 min.

Named gaps: vegetable broth (no low sodium food linked)

Ingredients as stored:

- 1 red bell pepper, deseeded and chopped
- 1 yellow bell pepper, deseeded and chopped
- 2 zucchini, sliced
- 4 clove garlic, removed from their skins but left whole
- 1 red onion, sliced
- 1 tsp vegetable oil
- 300 g couscous
- 450 ml vegetable broth, low sodium
- 250 g cherry tomato
- black pepper, ground

Wording changed before matching (page text -> catalog name):

- `1 red pepper, deseeded and chopped` -> `1 red bell pepper, deseeded and chopped`
- `1 yellow pepper, deseeded and chopped` -> `1 yellow bell pepper, deseeded and chopped`
- `4 garlic gloves, removed from their skins but left whole` -> `4 garlic cloves, removed from their skins but left whole`
- `450ml reduced-salt vegetable stock` -> `450ml vegetable broth` [low sodium]

Method:

1. Preheat the oven to 200C (fan oven 180C, gas mark 6). Put the pepper, courgette, garlic and onion into a roasting tin, and add the vegetable oil, tossing to coat. Roast for 25 to 30 minutes, stirring and turning after 15 minutes.
2. Meanwhile, put the couscous into a heatproof bowl and add the hot stock, stirring to mix. Cover and leave for 10 to 15 minutes to absorb the liquid and swell. Then stir with a fork to fluff up the grains.
3. Remove the veg from the oven after about 30 minutes. Add the cherry tomatoes and cooked couscous, then season with some pepper and stir well to mix everything together.
4. Return everything to the oven for a further 5 minutes to heat through before serving.

### Salmon and broccoli pasta  (`salmon-and-broccoli-pasta`)

Source: https://www.nhs.uk/healthier-families/recipes/salmon-and-broccoli-pasta/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 15 min, cook 15 min.

Named gaps: salmon (no gram weight for each)

Ingredients as stored:

- 2 salmon
- 250 g whole wheat pasta
- 5 scallion, washed and chopped
- 400 g broccoli, broken into small florets
- 100 g peas
- 150 g cream cheese, low fat
- 150 ml skim milk
- 1 lemon, zest of
- 2 tbsp fresh parsley, or chives, chopped
- black pepper, ground
- 4 tsp shredded cheese, reduced fat, hard, finely grated

Wording changed before matching (page text -> catalog name):

- `2 salmon fillets` -> `2 salmon`
- `250g wholemeal pasta (any shape is fine, but penne works well)` -> `250g whole wheat pasta (any shape is fine, but penne works well)`
- `100g peas (fresh or frozen)` -> `100g peas`
- `150g lower-fat soft cheese` -> `150g cream cheese` [low fat]
- `2 tablespoons fresh parsley or chives, chopped` -> `2 tablespoons fresh parsley, chopped` [or chives]
- `4 teaspoons reduced-fat hard cheese, finely grated` -> `4 teaspoons cheese, finely grated` [reduced fat, hard]

Method:

1. Set a large saucepan of water on the hob to boil and preheat the grill to medium-high. Arrange the salmon fillets on the grill rack and cook for 5 to 6 minutes. Turn off the grill and leave the salmon to rest.
2. While the salmon is grilling, cook the pasta shapes in the boiling water for 8 minutes, then add the spring onions and broccoli and cook for a further 3 or 4 minutes.
3. Put the peas in a large colander. Once the pasta, broccoli and spring onions are cooked, drain them into the colander over the peas – make sure to reserve 2 tablespoons of the cooking water in the pan.
4. Put the soft cheese and skimmed milk into the hot saucepan with the reserved cooking water. Stir over a medium heat until smooth. Then add the lemon zest and parsley (or chives).
5. Return the pasta and vegetables to the saucepan with the sauce and heat gently for a couple of minutes, until warmed through.
6. Carefully break the salmon into chunks and add to the pan – stir gently to avoid the salmon breaking up too much. Season everything with pepper, then serve each portion with 1 teaspoon of grated cheese on top.

### Salmon with spring onion mash  (`salmon-with-spring-onion-mash`)

Source: https://www.nhs.uk/healthier-families/recipes/salmon-with-spring-onion-mash/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 20 min, cook 25 min.

Named gaps: salmon (no gram weight for each)

Ingredients as stored:

- 1 kg potato, peeled and cut into chunks
- 6 scallion, finely sliced
- 1 tsp vegetable oil
- 4 salmon
- 4 tbsp 1% milk
- 2 tbsp fresh parsley, chopped
- 250 g broccoli, broken into florets
- black pepper, ground

Wording changed before matching (page text -> catalog name):

- `4 salmon fillets` -> `4 salmon`
- `4 tablespoons 1%-fat milk` -> `4 tablespoons 1% milk`

Method:

1. Cook the potatoes in boiling water for 20 minutes, until tender, adding the spring onions to the saucepan 5 minutes before the end of cooking time.
2. When the potatoes have been cooking for 10 minutes, start to prepare the salmon. Heat the vegetable oil oil in a non-stick frying pan, brushing it over the surface.
3. Add the salmon, skin side down. Cook over a high heat for 2 to 3 minutes, without moving the fillets. Turn the salmon over, reduce the heat and cook for a further 3 to 4 minutes.
4. At this point, put the broccoli on to cook in a little boiling water – it will take about 5 to 6 minutes. Let the salmon rest for a few minutes while making the mash.
5. Drain the potatoes and spring onions and mash thoroughly. Beat in the milk and parsley. Reheat on the hob for 1 minute, beating well. Share the mash between 4 warmed plates and arrange the salmon fillets on top. Serve with the broccoli.

### Sweet and sour chicken  (`sweet-and-sour-chicken`)

Source: https://www.nhs.uk/healthier-families/recipes/sweet-and-sour-chicken/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 20 min, cook 30 min.

Ingredients as stored:

- 150 g brown rice, or white rice
- 227 g pineapple
- 1 tbsp cornstarch
- 2 tbsp tomato paste
- 1 tsp soy sauce, low sodium
- 2 tsp vegetable oil
- 300 g chicken breast, or thigh, skinless, cut into chunks
- 1 onion, thinly sliced
- 1 bell pepper, deseeded and cut into chunks
- 3 stalk celery, sliced
- 2 tomato, cut into wedges
- black pepper, optional (optional)

Wording changed before matching (page text -> catalog name):

- `150g easy-cook brown or white rice` -> `150g brown rice` [or white rice]
- `227g pineapple pieces, in natural juice` -> `227g pineapple, in natural juice`
- `2 tablespoons tomato purée` -> `2 tablespoons tomato paste`
- `1 teaspoon reduced-salt soy sauce` -> `1 teaspoon soy sauce` [low sodium]
- `300g skinless chicken breast or thigh, cut into chunks` -> `300g chicken breast, cut into chunks` [or thigh, skinless]
- `1 pepper (any colour), deseeded and cut into chunks` -> `1 bell pepper, deseeded and cut into chunks`
- `3 celery sticks, sliced` -> `3 stalks celery, sliced`

Method:

1. Put the brown rice on to cook in plenty of boiling water for 30 minutes, or until tender.
2. Meanwhile, drain the juice from the pineapple into a small bowl or jug, and cut the pineapple rings into chunks. Add the cornflour to the juice and stir until smooth, then mix in the tomato purée and soy sauce. Set aside.
3. When the rice is 10 minutes from being ready, heat the oil in a wok or very large frying pan. Add the chicken and stir-fry over a high heat for 3 to 4 minutes.
4. Add the onion, pepper and celery to the pan. Stir-fry for another 3 to 4 minutes, then add the tomato wedges and pineapple chunks.
5. Give the pineapple juice mixture a quick stir, then add to the pan. Keep stirring until the sauce is hot and thickened. Season with the pepper, and serve with the drained rice.

### Sweet potato pasta  (`sweet-potato-pea-pasta`)

Source: https://www.nhs.uk/healthier-families/recipes/sweet-potato-pea-pasta/  
Credit: Contains public sector information licensed under the Open Government Licence v3.0.  
Times: prep 10 min, cook 15 min.

Ingredients as stored:

- 300 g sweet potato, peeled and cut into small cubes
- 300 g pasta, dried
- 100 g peas
- 2 tbsp 1% milk
- 150 g plain yogurt, low fat
- 40 g shredded cheese, reduced fat, hard, grated
- black pepper, ground

Wording changed before matching (page text -> catalog name):

- `300g dried pasta shapes` -> `300g pasta` [dried]
- `100g peas (fresh or frozen)` -> `100g peas`
- `2 tablespoons 1%-fat milk` -> `2 tablespoons 1% milk`
- `150g low-fat natural yoghurt` -> `150g plain yogurt` [low fat]
- `40g reduced-fat hard cheese, grated` -> `40g cheese, grated` [reduced fat, hard]

Method:

1. Cook the sweet potato chunks in simmering water for 12 to 15 minutes, until tender enough for a fork to easily pierce them. Drain well.
2. Meanwhile, cook the pasta in a large saucepan for 8 to 10 minutes, or according to pack instructions, until tender. Drain well, then return to the saucepan.
3. Stir the sweet potato chunks and peas through the pasta. Add the milk and yogurt and heat gently for 2 minutes, until all warmed through and slightly thickened. Serve, sprinkled with the cheese and a ground black pepper to taste.

## 3. Rescued USDA MyPlate recipes

| Recipe | Serves | Our kcal | Published kcal | Protein / carbs / fat (ours) | Status | Allergens | Diets |
|---|---|---|---|---|---|---|---|
| [Banana Cocoa Yogurt Pops](https://www.myplate.gov/recipes/banana-cocoa-yogurt-pops) | 4 | 77 | 77.17 | 4 / 14 / 1 | complete | Dairy | Gluten-free, Vegetarian |
| [Greek Salad with Chicken](https://www.myplate.gov/recipes/greek-salad-chicken) | 4 | 161 | 161.44 | 17 / 9 / 7 | complete | Dairy | Gluten-free |
| [Pupusas Revueltas](https://www.myplate.gov/recipes/pupusas-revueltas) | 12 | 225 | 224.87 | 14 / 23 / 9 | partial | Dairy | Gluten-free |
| [Strawberry Kiwi Yogurt Pops](https://www.myplate.gov/recipes/strawberry-kiwi-yogurt-pops) | 4 | 63 | 63.01 | 3 / 10 / 1 | complete | Dairy | Gluten-free, Vegetarian |
| [Strawberry Yogurt Pops](https://www.myplate.gov/recipes/strawberry-yogurt-pops) | 4 | 64 | 63.96 | 3 / 11 / 1 | complete | Dairy | Gluten-free, Vegetarian |
| [Vegetable Chili](https://www.myplate.gov/recipes/vegetable-chili) | 5 | 435 | 435.33 | 20 / 77 / 8 | partial | none | Gluten-free, Vegan |

### Banana Cocoa Yogurt Pops  (`banana-cocoa-yogurt-pops`)

Source: https://www.myplate.gov/recipes/banana-cocoa-yogurt-pops  
Credit: Public domain (US federal government work)  
Times: prep 15 min, cook None min.

Ingredients as stored:

- 1 cup vanilla yogurt, low fat
- 1 banana
- 2 tsp cocoa powder

Method:

1. Mash banana with a fork.
2. Add yogurt to banana and mix well.
3. Stir in cocoa powder.
4. Divide into 8 mini muffin cups or 4 small paper cups.
5. Place in cut paper straws or popsicle sticks.
6. Freeze and enjoy!

### Greek Salad with Chicken  (`greek-salad-chicken`)

Source: https://www.myplate.gov/recipes/greek-salad-chicken  
Credit: Public domain (US federal government work)  
Times: prep 30 min, cook None min.

Ingredients as stored:

- 0.5 cup greek yogurt, fat-free
- 2 tsp lemon
- 2 tsp olive oil
- 1 clove garlic
- 1 tsp dried oregano
- 0.25 tsp salt
- 0.25 tsp black pepper
- 1 head romaine lettuce
- 0.5 cup cherry tomato, cut in half
- 1 cucumber, diced
- 0.25 cup red onion, sliced
- 0.25 cup black olives, cut in half
- 1 cup chicken breast, cooked, cubed
- 0.25 cup feta, crumbled

Method:

1. To make the dressing, add Greek yogurt, lemon juice, olive oil, garlic, oregano, salt, and pepper to a small bowl. Mix well to combine.
2. Cover dressing and refrigerate for at least 1 hour.
3. Wash lettuce and tear into bite-sized pieces. Place in large salad bowl and add tomatoes, cucumbers, red onion, olives, and chicken.
4. Sprinkle with feta cheese.
5. Top with yogurt dressing and enjoy.

### Pupusas Revueltas  (`pupusas-revueltas`)

Source: https://www.myplate.gov/recipes/pupusas-revueltas  
Credit: Public domain (US federal government work)  
Times: prep None min, cook None min.

Named gaps: masa harina (no gram weight for cup)

Ingredients as stored:

- 16 oz chicken breast, ground
- 1 tbsp vegetable oil
- 0.5 lb mozzarella, part skim, grated
- 0.5 onion, small, finely diced
- 1 clove garlic, minced
- 1 green bell pepper, medium, seeded and minced
- 1 tomato, small, finely chopped
- 0.5 tsp salt
- 5 cup masa harina, instant
- 6 cup water

Method:

1. Wash hands with soap and water.
2. In a non-stick skillet over low heat, sauté chicken in oil until chicken turns white. Constantly stir the chicken to keep it from sticking.
3. Add onion, garlic, green pepper, and tomato. Cook until chicken mixture is cooked through. Remove skillet from stove and let mixture cool in the refrigerator.
4. While the chicken mixture is cooling, place the flour in a large mixing bowl and stir in enough water to make a stiff tortilla-like dough.
5. When the chicken mixture has cooled, mix in the cheese.
6. Divide the dough into 24 portions. With your hands, roll the dough into balls and flatten each ball into a 1/2 ich thick circle. Put a spoonful of the chicken mixture in the middle of each circle of dough and bring the edges to the center. Flatten the ball of dough again until it is 1/2 inch thick.
7. In a very hot, iron skillet, cook the pupusas on each side until golden brown.
8. Serve hot.

### Strawberry Kiwi Yogurt Pops  (`strawberry-kiwi-yogurt-pops`)

Source: https://www.myplate.gov/recipes/strawberry-kiwi-yogurt-pops  
Credit: Public domain (US federal government work)  
Times: prep 15 min, cook None min.

Ingredients as stored:

- 1 cup vanilla yogurt, low fat
- 1 kiwi
- 4 strawberries, about 1/2 cup chopped

Method:

1. Cut kiwi and strawberries into small pieces.
2. Add yogurt to chopped fruit and mix well to combine.
3. Divide into 8 ice cube squares (or 4 small paper cups).
4. Place in cut paper straws or popsicle sticks.
5. Freeze and enjoy!

### Strawberry Yogurt Pops  (`strawberry-yogurt-pops`)

Source: https://www.myplate.gov/recipes/strawberry-yogurt-pops  
Credit: Public domain (US federal government work)  
Times: prep 15 min, cook None min.

Ingredients as stored:

- 1 cup strawberry yogurt, low fat
- 6 strawberries, fresh or frozen

Method:

1. Cut strawberries into small pieces.
2. Place strawberries and yogurt into blender and mix until smooth.
3. Pour into 8 ice cube squares (or 4 small paper cups) and place in cut paper straws or popsicle sticks.
4. Freeze and enjoy!

### Vegetable Chili  (`vegetable-chili`)

Source: https://www.myplate.gov/recipes/vegetable-chili  
Credit: Public domain (US federal government work)  
Times: prep 20 min, cook 50 min.

Named gaps: kidney beans (no gram weight for can (low sodium))

Ingredients as stored:

- 2 tbsp vegetable oil
- 2 yellow onion, peeled and coarsely chopped
- 2 zucchini, cubed
- 2 sweet potato, cubed
- 3 clove garlic, minced
- 2 tsp ground cumin
- 2 tbsp chili powder
- 2 tsp dried oregano
- 3 can kidney beans, low sodium, drained and rinsed
- 2 can diced tomatoes, no salt added
- 2 cup corn, frozen

Method:

1. Put the pot over medium heat and when it is hot, add the oil. Add the onions, zucchini, sweet potatoes, garlic, and spices and cook, stirring from time to time, for 20 minutes.
2. Add the kidney beans and tomatoes. Stir and cook, covered, until the squash is tender, about 30 minutes.
3. Add the corn and cook until warmed throughout.
4. Serve right away or transfer to a container once cooled. Refrigerate up to 5 days.

## 4. NHS candidates not imported

The pilot looked at all 183 Healthier Families pages that publish structured data (4 of 187 were not parsed) and took the 20 above. The rest are not rejects of quality; they were either not needed for the pilot of 20 or failed a gate. The most common gate failures, by recipe count: "lower-fat spread" / "reduced-fat" cheeses with no matching ingredient (mapped to margarine / cheddar / cream cheese with a low-fat qualifier where the dish still reads true); "handful" and "sprig" amounts (no gram weight, so rejected rather than guessed); "mixed salad leaves" style blends; and UK-only items (wafer-thin ham, pizza bases, malt loaves, popping corn).

## 5. USDA MyPlate pages not imported

Pages in the Internet Archive capture that are not in the catalog, by who the page credits:

- nonfederal: 174
- federal: 55
- unknown: 23
- missing: 8

See `docs/content/MYPLATE-NOT-IMPORTED-w14.csv` for every page, its credited source and the reason.

