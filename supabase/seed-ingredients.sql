-- Minced -- canonical ingredient vocabulary (M1.5.1)
--
-- Runs BEFORE supabase/seed.sql, which upserts the same 30 mockup ingredients
-- on top of this and then references them from its recipes.
--
-- IDEMPOTENT: every insert upserts on a natural key, so re-running converges on
-- this file's contents rather than duplicating.
--
-- NAMING RULE -- this is the whole quality argument, so it is written down:
--
--   canonical_name is what a COOK types. Aliases carry everything else,
--   including USDA FoodData Central's own phrasing.
--
--     canonical   red bell pepper
--     aliases     bell pepper, sweet red pepper, red peppers,
--                 "peppers, sweet, red"      <- USDA's spelling
--
--   USDA supplies the COVERAGE (what ingredients exist, at what breadth);
--   curation supplies the NAMES. Letting USDA's phrasing become canonical would
--   put "Onions, raw" in the pantry autocomplete. Keeping USDA spellings as
--   aliases also pre-wires the fdc_id mapping M1.5.4 needs.
--
-- SPLITTING RULE: a row earns its own canonical entry only when a cook would
-- shop for it separately AND swapping it changes the dish. "russet potato" and
-- "red potato" split; "extra-virgin olive oil" does not -- it is an alias of
-- olive oil. Over-splitting is the quiet killer here: a pantry holding "potato"
-- should not miss a recipe calling for "potatoes".

begin;

-- ---------------------------------------------------------------------------
-- Produce
-- ---------------------------------------------------------------------------
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('yellow onion',        'yellow-onion',        'Produce', false),
  ('red onion',           'red-onion',           'Produce', false),
  ('white onion',         'white-onion',         'Produce', false),
  ('sweet onion',         'sweet-onion',         'Produce', false),
  ('shallot',             'shallot',             'Produce', false),
  ('scallion',            'scallion',            'Produce', false),
  ('garlic',              'garlic',              'Produce', false),
  ('leek',                'leek',                'Produce', false),
  ('chives',              'chives',              'Produce', false),
  ('carrot',              'carrot',              'Produce', false),
  ('celery',              'celery',              'Produce', false),
  ('russet potato',       'russet-potato',       'Produce', false),
  ('red potato',          'red-potato',          'Produce', false),
  ('yukon gold potato',   'yukon-gold-potato',   'Produce', false),
  ('sweet potato',        'sweet-potato',        'Produce', false),
  ('turnip',              'turnip',              'Produce', false),
  ('parsnip',             'parsnip',             'Produce', false),
  ('rutabaga',            'rutabaga',            'Produce', false),
  ('radish',              'radish',              'Produce', false),
  ('beet',                'beet',                'Produce', false),
  ('jicama',              'jicama',              'Produce', false),
  ('spinach',             'spinach',             'Produce', false),
  ('kale',                'kale',                'Produce', false),
  ('swiss chard',         'swiss-chard',         'Produce', false),
  ('collard greens',      'collard-greens',      'Produce', false),
  ('mustard greens',      'mustard-greens',      'Produce', false),
  ('arugula',             'arugula',             'Produce', false),
  ('romaine lettuce',     'romaine-lettuce',     'Produce', false),
  ('iceberg lettuce',     'iceberg-lettuce',     'Produce', false),
  ('butter lettuce',      'butter-lettuce',      'Produce', false),
  ('mixed greens',        'mixed-greens',        'Produce', false),
  ('watercress',          'watercress',          'Produce', false),
  ('bok choy',            'bok-choy',            'Produce', false),
  ('napa cabbage',        'napa-cabbage',        'Produce', false),
  ('green cabbage',       'green-cabbage',       'Produce', false),
  ('red cabbage',         'red-cabbage',         'Produce', false),
  ('brussels sprouts',    'brussels-sprouts',    'Produce', false),
  ('broccoli',            'broccoli',            'Produce', false),
  ('broccoli rabe',       'broccoli-rabe',       'Produce', false),
  ('cauliflower',         'cauliflower',         'Produce', false),
  ('red bell pepper',     'red-bell-pepper',     'Produce', false),
  ('green bell pepper',   'green-bell-pepper',   'Produce', false),
  ('yellow bell pepper',  'yellow-bell-pepper',  'Produce', false),
  ('jalapeno',            'jalapeno',            'Produce', false),
  ('serrano pepper',      'serrano-pepper',      'Produce', false),
  ('poblano pepper',      'poblano-pepper',      'Produce', false),
  ('habanero',            'habanero',            'Produce', false),
  ('anaheim chile',       'anaheim-chile',       'Produce', false),
  ('thai chile',          'thai-chile',          'Produce', false),
  ('tomato',              'tomato',              'Produce', false),
  ('cherry tomato',       'cherry-tomato',       'Produce', false),
  ('roma tomato',         'roma-tomato',         'Produce', false),
  ('tomatillo',           'tomatillo',           'Produce', false),
  ('cucumber',            'cucumber',            'Produce', false),
  ('zucchini',            'zucchini',            'Produce', false),
  ('yellow squash',       'yellow-squash',       'Produce', false),
  ('butternut squash',    'butternut-squash',    'Produce', false),
  ('acorn squash',        'acorn-squash',        'Produce', false),
  ('spaghetti squash',    'spaghetti-squash',    'Produce', false),
  ('pumpkin',             'pumpkin',             'Produce', false),
  ('eggplant',            'eggplant',            'Produce', false),
  ('okra',                'okra',                'Produce', false),
  ('green beans',         'green-beans',         'Produce', false),
  ('snap peas',           'snap-peas',           'Produce', false),
  ('snow peas',           'snow-peas',           'Produce', false),
  ('corn',                'corn',                'Produce', false),
  ('asparagus',           'asparagus',           'Produce', false),
  ('artichoke',           'artichoke',           'Produce', false),
  ('fennel',              'fennel',              'Produce', false),
  ('mushrooms',           'mushrooms',           'Produce', false),
  ('cremini mushrooms',   'cremini-mushrooms',   'Produce', false),
  ('shiitake mushrooms',  'shiitake-mushrooms',  'Produce', false),
  ('portobello mushrooms','portobello-mushrooms','Produce', false),
  ('oyster mushrooms',    'oyster-mushrooms',    'Produce', false),
  ('fresh parsley',      'fresh-parsley',      'Produce', false),
  ('fresh cilantro',     'fresh-cilantro',     'Produce', false),
  ('fresh basil',        'fresh-basil',        'Produce', false),
  ('fresh mint',         'fresh-mint',         'Produce', false),
  ('fresh dill',         'fresh-dill',         'Produce', false),
  ('fresh rosemary',     'fresh-rosemary',     'Produce', false),
  ('fresh thyme',        'fresh-thyme',        'Produce', false),
  ('fresh sage',         'fresh-sage',         'Produce', false),
  ('fresh oregano',      'fresh-oregano',      'Produce', false),
  ('fresh tarragon',     'fresh-tarragon',     'Produce', false),
  ('ginger',              'ginger',              'Produce', false),
  ('lemongrass',          'lemongrass',          'Produce', false),
  ('lemon',               'lemon',               'Produce', false),
  ('lime',                'lime',                'Produce', false),
  ('orange',              'orange',              'Produce', false),
  ('grapefruit',          'grapefruit',          'Produce', false),
  ('apple',               'apple',               'Produce', false),
  ('pear',                'pear',                'Produce', false),
  ('banana',              'banana',              'Produce', false),
  ('plantain',            'plantain',            'Produce', false),
  ('strawberries',        'strawberries',        'Produce', false),
  ('blueberries',         'blueberries',         'Produce', false),
  ('raspberries',         'raspberries',         'Produce', false),
  ('blackberries',        'blackberries',        'Produce', false),
  ('grapes',              'grapes',              'Produce', false),
  ('pineapple',           'pineapple',           'Produce', false),
  ('mango',               'mango',               'Produce', false),
  ('peach',               'peach',               'Produce', false),
  ('plum',                'plum',                'Produce', false),
  ('cherries',            'cherries',            'Produce', false),
  ('watermelon',          'watermelon',          'Produce', false),
  ('cantaloupe',          'cantaloupe',          'Produce', false),
  ('avocado',             'avocado',             'Produce', false),
  ('pomegranate',         'pomegranate',         'Produce', false),
  ('kiwi',                'kiwi',                'Produce', false)
on conflict (canonical_name) do update
  set aisle_category   = excluded.aisle_category,
      is_pantry_staple = excluded.is_pantry_staple;

-- ---------------------------------------------------------------------------
-- Pantry
--
-- The is_pantry_staple flags start here. CLAUDE.md: salt, pepper, water, oil,
-- butter, sugar and flour never count toward "you're missing". Forgetting one
-- makes every match report a miss and the product feel broken.
-- ---------------------------------------------------------------------------
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('olive oil',            'olive-oil',            'Pantry', true),
  ('vegetable oil',        'vegetable-oil',        'Pantry', true),
  ('canola oil',           'canola-oil',           'Pantry', true),
  ('water',                'water',                'Pantry', true),
  ('granulated sugar',     'granulated-sugar',     'Pantry', true),
  ('all-purpose flour',    'all-purpose-flour',    'Pantry', true),
  ('coconut oil',          'coconut-oil',          'Pantry', false),
  ('toasted sesame oil',   'toasted-sesame-oil',   'Pantry', false),
  ('peanut oil',           'peanut-oil',           'Pantry', false),
  ('avocado oil',          'avocado-oil',          'Pantry', false),
  ('cooking spray',        'cooking-spray',        'Pantry', false),
  ('white vinegar',        'white-vinegar',        'Pantry', false),
  ('apple cider vinegar',  'apple-cider-vinegar',  'Pantry', false),
  ('red wine vinegar',     'red-wine-vinegar',     'Pantry', false),
  ('white wine vinegar',   'white-wine-vinegar',   'Pantry', false),
  ('rice vinegar',         'rice-vinegar',         'Pantry', false),
  ('balsamic vinegar',     'balsamic-vinegar',     'Pantry', false),
  ('sherry vinegar',       'sherry-vinegar',       'Pantry', false),
  ('crushed tomatoes',     'crushed-tomatoes',     'Pantry', false),
  ('whole tomatoes',       'whole-tomatoes',       'Pantry', false),
  ('diced tomatoes',       'diced-tomatoes',       'Pantry', false),
  ('tomato paste',         'tomato-paste',         'Pantry', false),
  ('tomato sauce',         'tomato-sauce',         'Pantry', false),
  ('sun-dried tomatoes',   'sun-dried-tomatoes',   'Pantry', false),
  ('roasted red peppers',  'roasted-red-peppers',  'Pantry', false),
  ('coconut milk',         'coconut-milk',         'Pantry', false),
  ('chicken broth',        'chicken-broth',        'Pantry', false),
  ('beef broth',           'beef-broth',           'Pantry', false),
  ('vegetable broth',      'vegetable-broth',      'Pantry', false),
  ('evaporated milk',      'evaporated-milk',      'Pantry', false),
  ('sweetened condensed milk','sweetened-condensed-milk','Pantry', false),
  ('chickpeas',            'chickpeas',            'Pantry', false),
  ('black beans',          'black-beans',          'Pantry', false),
  ('kidney beans',         'kidney-beans',         'Pantry', false),
  ('pinto beans',          'pinto-beans',          'Pantry', false),
  ('cannellini beans',     'cannellini-beans',     'Pantry', false),
  ('navy beans',           'navy-beans',           'Pantry', false),
  ('great northern beans', 'great-northern-beans', 'Pantry', false),
  ('black-eyed peas',      'black-eyed-peas',      'Pantry', false),
  ('refried beans',        'refried-beans',        'Pantry', false),
  ('lentils',              'lentils',              'Pantry', false),
  ('red lentils',          'red-lentils',          'Pantry', false),
  ('split peas',           'split-peas',           'Pantry', false),
  ('white rice',           'white-rice',           'Pantry', false),
  ('brown rice',           'brown-rice',           'Pantry', false),
  ('jasmine rice',         'jasmine-rice',         'Pantry', false),
  ('basmati rice',         'basmati-rice',         'Pantry', false),
  ('arborio rice',         'arborio-rice',         'Pantry', false),
  ('wild rice',            'wild-rice',            'Pantry', false),
  ('quinoa',               'quinoa',               'Pantry', false),
  ('couscous',             'couscous',             'Pantry', false),
  ('bulgur',               'bulgur',               'Pantry', false),
  ('farro',                'farro',                'Pantry', false),
  ('barley',               'barley',               'Pantry', false),
  ('rolled oats',          'rolled-oats',          'Pantry', false),
  ('steel-cut oats',       'steel-cut-oats',       'Pantry', false),
  ('cornmeal',             'cornmeal',             'Pantry', false),
  ('polenta',              'polenta',              'Pantry', false),
  ('grits',                'grits',                'Pantry', false),
  ('spaghetti',            'spaghetti',            'Pantry', false),
  ('penne',                'penne',                'Pantry', false),
  ('rigatoni',             'rigatoni',             'Pantry', false),
  ('fusilli',              'fusilli',              'Pantry', false),
  ('macaroni',             'macaroni',             'Pantry', false),
  ('lasagna noodles',      'lasagna-noodles',      'Pantry', false),
  ('egg noodles',          'egg-noodles',          'Pantry', false),
  ('orzo',                 'orzo',                 'Pantry', false),
  ('linguine',             'linguine',             'Pantry', false),
  ('fettuccine',           'fettuccine',           'Pantry', false),
  ('angel hair',           'angel-hair',           'Pantry', false),
  ('ramen noodles',        'ramen-noodles',        'Pantry', false),
  ('rice noodles',         'rice-noodles',         'Pantry', false),
  ('soba noodles',         'soba-noodles',         'Pantry', false),
  ('udon noodles',         'udon-noodles',         'Pantry', false),
  ('whole wheat flour',    'whole-wheat-flour',    'Pantry', false),
  ('bread flour',          'bread-flour',          'Pantry', false),
  ('cornstarch',           'cornstarch',           'Pantry', false),
  ('baking powder',        'baking-powder',        'Pantry', false),
  ('baking soda',          'baking-soda',          'Pantry', false),
  ('active dry yeast',     'active-dry-yeast',     'Pantry', false),
  ('brown sugar',          'brown-sugar',          'Pantry', false),
  ('powdered sugar',       'powdered-sugar',       'Pantry', false),
  ('honey',                'honey',                'Pantry', false),
  ('maple syrup',          'maple-syrup',          'Pantry', false),
  ('molasses',             'molasses',             'Pantry', false),
  ('vanilla extract',      'vanilla-extract',      'Pantry', false),
  ('cocoa powder',         'cocoa-powder',         'Pantry', false),
  ('chocolate chips',      'chocolate-chips',      'Pantry', false),
  ('semisweet chocolate',  'semisweet-chocolate',  'Pantry', false),
  ('breadcrumbs',          'breadcrumbs',          'Pantry', false),
  ('panko breadcrumbs',    'panko-breadcrumbs',    'Pantry', false),
  ('soy sauce',            'soy-sauce',            'Pantry', false),
  ('tamari',               'tamari',               'Pantry', false),
  ('fish sauce',           'fish-sauce',           'Pantry', false),
  ('oyster sauce',         'oyster-sauce',         'Pantry', false),
  ('hoisin sauce',         'hoisin-sauce',         'Pantry', false),
  ('worcestershire sauce', 'worcestershire-sauce', 'Pantry', false),
  ('sriracha',             'sriracha',             'Pantry', false),
  ('hot sauce',            'hot-sauce',            'Pantry', false),
  ('gochujang',            'gochujang',            'Pantry', false),
  ('harissa paste',        'harissa-paste',        'Pantry', false),
  ('white miso',           'white-miso',           'Pantry', false),
  ('tahini',               'tahini',               'Pantry', false),
  ('peanut butter',        'peanut-butter',        'Pantry', false),
  ('almond butter',        'almond-butter',        'Pantry', false),
  ('mayonnaise',           'mayonnaise',           'Pantry', false),
  ('ketchup',              'ketchup',              'Pantry', false),
  ('yellow mustard',       'yellow-mustard',       'Pantry', false),
  ('dijon mustard',        'dijon-mustard',        'Pantry', false),
  ('whole grain mustard',  'whole-grain-mustard',  'Pantry', false),
  ('barbecue sauce',       'barbecue-sauce',       'Pantry', false),
  ('salsa',                'salsa',                'Pantry', false),
  ('pesto',                'pesto',                'Pantry', false),
  ('red curry paste',      'red-curry-paste',      'Pantry', false),
  ('green curry paste',    'green-curry-paste',    'Pantry', false),
  ('almonds',              'almonds',              'Pantry', false),
  ('walnuts',              'walnuts',              'Pantry', false),
  ('pecans',               'pecans',               'Pantry', false),
  ('cashews',              'cashews',              'Pantry', false),
  ('pistachios',           'pistachios',           'Pantry', false),
  ('peanuts',              'peanuts',              'Pantry', false),
  ('pine nuts',            'pine-nuts',            'Pantry', false),
  ('hazelnuts',            'hazelnuts',            'Pantry', false),
  ('sunflower seeds',      'sunflower-seeds',      'Pantry', false),
  ('pumpkin seeds',        'pumpkin-seeds',        'Pantry', false),
  ('sesame seeds',         'sesame-seeds',         'Pantry', false),
  ('chia seeds',           'chia-seeds',           'Pantry', false),
  ('flaxseed',             'flaxseed',             'Pantry', false),
  ('raisins',              'raisins',              'Pantry', false),
  ('dried cranberries',    'dried-cranberries',    'Pantry', false),
  ('dates',                'dates',                'Pantry', false),
  ('shredded coconut',     'shredded-coconut',     'Pantry', false),
  ('capers',               'capers',               'Pantry', false),
  ('kalamata olives',      'kalamata-olives',      'Pantry', false),
  ('green olives',         'green-olives',         'Pantry', false),
  ('pickles',              'pickles',              'Pantry', false),
  ('sauerkraut',           'sauerkraut',           'Pantry', false),
  ('kimchi',               'kimchi',               'Pantry', false),
  ('nori',                 'nori',                 'Pantry', false),
  ('dry white wine',       'dry-white-wine',       'Pantry', false),
  ('dry red wine',         'dry-red-wine',         'Pantry', false),
  ('mirin',                'mirin',                'Pantry', false),
  ('sake',                 'sake',                 'Pantry', false)
on conflict (canonical_name) do update
  set aisle_category   = excluded.aisle_category,
      is_pantry_staple = excluded.is_pantry_staple;

-- ---------------------------------------------------------------------------
-- Dairy
--
-- Plant milks live here too: they sit in the dairy aisle and substitute for the
-- same line in a recipe, which is what aisle_category is for.
-- ---------------------------------------------------------------------------
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('butter',            'butter',            'Dairy', true),
  ('unsalted butter',   'unsalted-butter',   'Dairy', true),
  ('milk',              'milk',              'Dairy', false),
  ('buttermilk',        'buttermilk',        'Dairy', false),
  ('heavy cream',       'heavy-cream',       'Dairy', false),
  ('half-and-half',     'half-and-half',     'Dairy', false),
  ('sour cream',        'sour-cream',        'Dairy', false),
  ('plain yogurt',      'plain-yogurt',      'Dairy', false),
  ('greek yogurt',      'greek-yogurt',      'Dairy', false),
  ('cream cheese',      'cream-cheese',      'Dairy', false),
  ('ghee',              'ghee',              'Dairy', false),
  ('cheddar cheese',    'cheddar-cheese',    'Dairy', false),
  ('mozzarella',        'mozzarella',        'Dairy', false),
  ('fresh mozzarella',  'fresh-mozzarella',  'Dairy', false),
  ('parmesan',          'parmesan',          'Dairy', false),
  ('pecorino romano',   'pecorino-romano',   'Dairy', false),
  ('feta',              'feta',              'Dairy', false),
  ('goat cheese',       'goat-cheese',       'Dairy', false),
  ('ricotta',           'ricotta',           'Dairy', false),
  ('cottage cheese',    'cottage-cheese',    'Dairy', false),
  ('monterey jack',     'monterey-jack',     'Dairy', false),
  ('pepper jack',       'pepper-jack',       'Dairy', false),
  ('swiss cheese',      'swiss-cheese',      'Dairy', false),
  ('provolone',         'provolone',         'Dairy', false),
  ('gruyere',           'gruyere',           'Dairy', false),
  ('blue cheese',       'blue-cheese',       'Dairy', false),
  ('queso fresco',      'queso-fresco',      'Dairy', false),
  ('cotija',            'cotija',            'Dairy', false),
  ('mascarpone',        'mascarpone',        'Dairy', false),
  ('halloumi',          'halloumi',          'Dairy', false),
  ('american cheese',   'american-cheese',   'Dairy', false),
  ('almond milk',       'almond-milk',       'Dairy', false),
  ('soy milk',          'soy-milk',          'Dairy', false),
  ('oat milk',          'oat-milk',          'Dairy', false)
on conflict (canonical_name) do update
  set aisle_category   = excluded.aisle_category,
      is_pantry_staple = excluded.is_pantry_staple;

-- ---------------------------------------------------------------------------
-- Protein
-- ---------------------------------------------------------------------------
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('chicken breast',    'chicken-breast',    'Protein', false),
  ('chicken thighs',    'chicken-thighs',    'Protein', false),
  ('chicken drumsticks','chicken-drumsticks','Protein', false),
  ('chicken wings',     'chicken-wings',     'Protein', false),
  ('whole chicken',     'whole-chicken',     'Protein', false),
  ('ground chicken',    'ground-chicken',    'Protein', false),
  ('rotisserie chicken','rotisserie-chicken','Protein', false),
  ('ground beef',       'ground-beef',       'Protein', false),
  ('chuck roast',       'chuck-roast',       'Protein', false),
  ('beef stew meat',    'beef-stew-meat',    'Protein', false),
  ('sirloin steak',     'sirloin-steak',     'Protein', false),
  ('ribeye',            'ribeye',            'Protein', false),
  ('flank steak',       'flank-steak',       'Protein', false),
  ('skirt steak',       'skirt-steak',       'Protein', false),
  ('brisket',           'brisket',           'Protein', false),
  ('short ribs',        'short-ribs',        'Protein', false),
  ('pork chops',        'pork-chops',        'Protein', false),
  ('pork tenderloin',   'pork-tenderloin',   'Protein', false),
  ('pork shoulder',     'pork-shoulder',     'Protein', false),
  ('ground pork',       'ground-pork',       'Protein', false),
  ('bacon',             'bacon',             'Protein', false),
  ('pancetta',          'pancetta',          'Protein', false),
  ('prosciutto',        'prosciutto',        'Protein', false),
  ('ham',               'ham',               'Protein', false),
  ('italian sausage',   'italian-sausage',   'Protein', false),
  ('breakfast sausage', 'breakfast-sausage', 'Protein', false),
  ('chorizo',           'chorizo',           'Protein', false),
  ('hot dogs',          'hot-dogs',          'Protein', false),
  ('ground turkey',     'ground-turkey',     'Protein', false),
  ('turkey breast',     'turkey-breast',     'Protein', false),
  ('ground lamb',       'ground-lamb',       'Protein', false),
  ('lamb shoulder',     'lamb-shoulder',     'Protein', false),
  ('lamb chops',        'lamb-chops',        'Protein', false),
  ('salmon',            'salmon',            'Protein', false),
  ('smoked salmon',     'smoked-salmon',     'Protein', false),
  ('tuna steak',        'tuna-steak',        'Protein', false),
  ('canned tuna',       'canned-tuna',       'Protein', false),
  ('cod',               'cod',               'Protein', false),
  ('tilapia',           'tilapia',           'Protein', false),
  ('halibut',           'halibut',           'Protein', false),
  ('trout',             'trout',             'Protein', false),
  ('snapper',           'snapper',           'Protein', false),
  ('shrimp',            'shrimp',            'Protein', false),
  ('scallops',          'scallops',          'Protein', false),
  ('mussels',           'mussels',           'Protein', false),
  ('clams',             'clams',             'Protein', false),
  ('crab',              'crab',              'Protein', false),
  ('lobster',           'lobster',           'Protein', false),
  ('squid',             'squid',             'Protein', false),
  ('anchovies',         'anchovies',         'Protein', false),
  ('sardines',          'sardines',          'Protein', false),
  ('egg',               'egg',               'Protein', false),
  ('egg whites',        'egg-whites',        'Protein', false),
  ('firm tofu',         'firm-tofu',         'Protein', false),
  ('silken tofu',       'silken-tofu',       'Protein', false),
  ('tempeh',            'tempeh',            'Protein', false),
  ('seitan',            'seitan',            'Protein', false),
  ('edamame',           'edamame',           'Protein', false)
on conflict (canonical_name) do update
  set aisle_category   = excluded.aisle_category,
      is_pantry_staple = excluded.is_pantry_staple;

-- ---------------------------------------------------------------------------
-- Spices
--
-- FRESH VS DRIED -- a curation decision worth stating, because it silently
-- decides thousands of matches later:
--
--   Herbs that a cook buys in both forms get the form IN the canonical name
--   ("fresh thyme" in Produce, "dried thyme" here). The bare word is then an
--   alias pointing at whichever form a recipe writing it bare almost always
--   means: fresh for the soft herbs sold in bunches (parsley, cilantro, basil,
--   mint, dill, tarragon), dried for the woody ones a pantry keeps in a jar
--   (oregano, thyme, rosemary, sage).
--
--   The alternative -- one row per herb -- means a pantry holding dried thyme
--   matches a recipe wanting fresh, and the user is told to use a jar of dust
--   where the dish needs a sprig. Splitting costs a few rows; not splitting
--   costs correctness.
-- ---------------------------------------------------------------------------
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('salt',                  'salt',                  'Spices', true),
  ('kosher salt',           'kosher-salt',           'Spices', true),
  ('black pepper',          'black-pepper',          'Spices', true),
  ('white pepper',          'white-pepper',          'Spices', false),
  ('garlic powder',         'garlic-powder',         'Spices', false),
  ('onion powder',          'onion-powder',          'Spices', false),
  ('paprika',               'paprika',               'Spices', false),
  ('smoked paprika',        'smoked-paprika',        'Spices', false),
  ('chili powder',          'chili-powder',          'Spices', false),
  ('cayenne',               'cayenne',               'Spices', false),
  ('crushed red pepper',    'crushed-red-pepper',    'Spices', false),
  ('ground cumin',          'ground-cumin',          'Spices', false),
  ('ground coriander',      'ground-coriander',      'Spices', false),
  ('ground turmeric',       'ground-turmeric',       'Spices', false),
  ('ground ginger',         'ground-ginger',         'Spices', false),
  ('ground cinnamon',       'ground-cinnamon',       'Spices', false),
  ('cinnamon stick',        'cinnamon-stick',        'Spices', false),
  ('ground nutmeg',         'ground-nutmeg',         'Spices', false),
  ('ground allspice',       'ground-allspice',       'Spices', false),
  ('ground cloves',         'ground-cloves',         'Spices', false),
  ('cardamom',              'cardamom',              'Spices', false),
  ('star anise',            'star-anise',            'Spices', false),
  ('fennel seeds',          'fennel-seeds',          'Spices', false),
  ('mustard seeds',         'mustard-seeds',         'Spices', false),
  ('celery seed',           'celery-seed',           'Spices', false),
  ('caraway seeds',         'caraway-seeds',         'Spices', false),
  ('bay leaf',              'bay-leaf',              'Spices', false),
  ('dried oregano',         'dried-oregano',         'Spices', false),
  ('dried basil',           'dried-basil',           'Spices', false),
  ('dried thyme',           'dried-thyme',           'Spices', false),
  ('dried rosemary',        'dried-rosemary',        'Spices', false),
  ('dried sage',            'dried-sage',            'Spices', false),
  ('dried dill',            'dried-dill',            'Spices', false),
  ('dried parsley',         'dried-parsley',         'Spices', false),
  ('italian seasoning',     'italian-seasoning',     'Spices', false),
  ('herbes de provence',    'herbes-de-provence',    'Spices', false),
  ('poultry seasoning',     'poultry-seasoning',     'Spices', false),
  ('old bay seasoning',     'old-bay-seasoning',     'Spices', false),
  ('taco seasoning',        'taco-seasoning',        'Spices', false),
  ('curry powder',          'curry-powder',          'Spices', false),
  ('garam masala',          'garam-masala',          'Spices', false),
  ('chinese five spice',    'chinese-five-spice',    'Spices', false),
  ('za''atar',              'zaatar',                'Spices', false),
  ('sumac',                 'sumac',                 'Spices', false),
  ('saffron',               'saffron',               'Spices', false),
  ('everything bagel seasoning','everything-bagel-seasoning','Spices', false),
  ('furikake',              'furikake',              'Spices', false)
on conflict (canonical_name) do update
  set aisle_category   = excluded.aisle_category,
      is_pantry_staple = excluded.is_pantry_staple;

-- ---------------------------------------------------------------------------
-- Other -- breads, wrappers and doughs. Not produce, not shelf-stable pantry.
-- ---------------------------------------------------------------------------
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('corn tortillas',    'corn-tortillas',    'Other', false),
  ('flour tortillas',   'flour-tortillas',   'Other', false),
  ('sandwich bread',    'sandwich-bread',    'Other', false),
  ('baguette',          'baguette',          'Other', false),
  ('sourdough bread',   'sourdough-bread',   'Other', false),
  ('pita bread',        'pita-bread',        'Other', false),
  ('naan',              'naan',              'Other', false),
  ('hamburger buns',    'hamburger-buns',    'Other', false),
  ('hot dog buns',      'hot-dog-buns',      'Other', false),
  ('english muffin',    'english-muffin',    'Other', false),
  ('bagel',             'bagel',             'Other', false),
  ('pizza dough',       'pizza-dough',       'Other', false),
  ('puff pastry',       'puff-pastry',       'Other', false),
  ('phyllo dough',      'phyllo-dough',      'Other', false),
  ('pie crust',         'pie-crust',         'Other', false),
  ('wonton wrappers',   'wonton-wrappers',   'Other', false),
  ('rice paper',        'rice-paper',        'Other', false),
  ('croutons',          'croutons',          'Other', false)
on conflict (canonical_name) do update
  set aisle_category   = excluded.aisle_category,
      is_pantry_staple = excluded.is_pantry_staple;

-- ---------------------------------------------------------------------------
-- Aliases
--
-- Four kinds of row here, and only four -- anything else is noise:
--
--   1. REGIONAL synonyms      aubergine -> eggplant, coriander -> cilantro
--   2. USDA phrasings         "peppers, sweet, red" -> red bell pepper
--   3. SHORTHAND a cook types  evoo -> olive oil, half and half
--   4. IRREGULAR plurals      leaves, loaves -- regular ones are handled by
--                             singularize_ingredient_name() and would be dead rows
--
-- Simple plurals are deliberately ABSENT. "tomatoes" -> "tomato" is done by the
-- resolver; adding it here would be 400 rows of maintenance that hide the real
-- synonyms in the noise.
--
-- An alias must not repeat a canonical_name: the resolver checks canonical names
-- first, so such a row can never win, and it reads as a claim that is never true.
-- ---------------------------------------------------------------------------
-- Staged in a temp table first so the seed can CHECK itself before it writes.
-- Inserting straight from a VALUES list joined to ingredients means a typo in a
-- canonical name silently drops that alias: no error, no row, and a synonym
-- nobody notices is missing until the match rate is quietly wrong. That is the
-- exact failure mode this milestone exists to prevent, so it gets a guard.
create temp table _alias_seed (canonical citext, alias citext) on commit drop;

insert into _alias_seed (canonical, alias) values
  -- Alliums. The DoD case: all three of these must return one id.
  ('scallion',            'green onion'),
  ('scallion',            'spring onion'),
  ('scallion',            'salad onion'),
  ('scallion',            'onions, spring or scallions'),
  ('yellow onion',        'onion'),
  ('yellow onion',        'brown onion'),
  ('yellow onion',        'cooking onion'),
  ('yellow onion',        'onions, raw'),
  ('sweet onion',         'vidalia onion'),
  ('garlic',              'garlic clove'),
  ('garlic',              'cloves of garlic'),
  ('garlic',              'fresh garlic'),
  ('chives',              'fresh chives'),

  -- Regional synonyms -- the classic British/American splits.
  ('eggplant',            'aubergine'),
  ('zucchini',            'courgette'),
  ('arugula',             'rocket'),
  ('fresh cilantro',      'chinese parsley'),
  ('fresh cilantro',      'coriander leaves'),
  ('fresh cilantro',      'fresh coriander'),
  ('fresh cilantro',      'cilantro'),
  ('chickpeas',           'garbanzo beans'),
  ('chickpeas',           'garbanzo'),
  ('chickpeas',           'ceci beans'),
  ('crushed red pepper',  'red pepper flakes'),
  ('crushed red pepper',  'chili flakes'),
  ('crushed red pepper',  'chilli flakes'),
  ('crushed red pepper',  'pepper flakes'),
  ('green bell pepper',   'capsicum'),
  ('snap peas',           'sugar snap peas'),
  ('green beans',         'string beans'),
  ('green beans',         'french beans'),
  ('rutabaga',            'swede'),
  ('beet',                'beetroot'),
  ('corn',                'sweetcorn'),
  ('corn',                'corn on the cob'),
  ('cornstarch',          'corn flour'),
  ('cornstarch',          'cornflour'),
  ('heavy cream',         'double cream'),
  ('heavy cream',         'whipping cream'),
  ('heavy cream',         'heavy whipping cream'),
  ('powdered sugar',      'icing sugar'),
  ('powdered sugar',      'confectioners sugar'),
  ('granulated sugar',    'caster sugar'),
  ('granulated sugar',    'white sugar'),
  ('granulated sugar',    'sugar'),
  ('all-purpose flour',   'plain flour'),
  ('all-purpose flour',   'flour'),
  ('all-purpose flour',   'ap flour'),
  ('shrimp',              'prawns'),
  ('ground beef',         'beef mince'),
  ('ground beef',         'minced beef'),
  ('ground beef',         'hamburger meat'),
  ('crushed red pepper',  'crushed chillies'),

  -- USDA FoodData Central phrasing. These are how the source names things;
  -- keeping them here is what lets the M1.5.4 nutrition pipeline join cleanly.
  ('red bell pepper',     'peppers, sweet, red'),
  ('red bell pepper',     'sweet red pepper'),
  ('red bell pepper',     'bell pepper'),
  ('green bell pepper',   'peppers, sweet, green'),
  ('green bell pepper',   'sweet green pepper'),
  ('carrot',              'carrots, raw'),
  ('celery',              'celery, raw'),
  ('spinach',             'spinach, raw'),
  ('russet potato',       'potatoes, russet'),
  ('russet potato',       'baking potato'),
  ('russet potato',       'potato'),
  ('sweet potato',        'sweet potatoes, raw'),
  ('sweet potato',        'yam'),
  ('tomato',              'tomatoes, red, ripe, raw'),
  ('tomato',              'fresh tomato'),
  ('chicken breast',      'chicken, broilers or fryers, breast'),
  ('chicken breast',      'boneless skinless chicken breast'),
  ('chicken breast',      'chicken breasts, boneless'),
  ('chicken thighs',      'boneless skinless chicken thighs'),
  ('chicken thighs',      'chicken thigh'),
  ('ground beef',         'beef, ground, 85% lean'),
  ('ground turkey',       'turkey, ground'),
  ('milk',                'milk, reduced fat, fluid, 2% milkfat'),
  ('milk',                'whole milk'),
  ('milk',                'skim milk'),
  ('milk',                '2% milk'),
  ('milk',                'low-fat milk'),
  ('milk',                'nonfat milk'),
  ('milk',                'fat free milk'),
  ('chicken broth',       'low-sodium chicken broth'),
  ('chicken broth',       'reduced sodium chicken broth'),
  ('beef broth',          'low-sodium beef broth'),
  ('vegetable broth',     'low-sodium vegetable broth'),
  ('spinach',             'fresh spinach'),
  ('saffron',             'saffron threads'),
  ('greek yogurt',        'plain nonfat greek yogurt'),
  ('greek yogurt',        'nonfat greek yogurt'),
  ('egg',                 'egg, whole, raw, fresh'),
  ('egg',                 'large egg'),
  ('egg',                 'large eggs'),
  ('rolled oats',         'oats, old fashioned'),
  ('rolled oats',         'old-fashioned oats'),
  ('rolled oats',         'oatmeal'),
  ('rolled oats',         'oats'),
  ('black beans',         'beans, black, mature seeds'),
  ('kidney beans',        'beans, kidney, red, mature seeds'),
  ('brown rice',          'rice, brown, long-grain'),
  ('white rice',          'rice, white, long-grain'),
  ('white rice',          'rice'),
  ('white rice',          'long grain rice'),
  ('vegetable oil',       'oil, vegetable'),
  ('vegetable oil',       'neutral oil'),
  ('vegetable oil',       'cooking oil'),
  ('vegetable oil',       'oil'),

  -- Shorthand and brand-generic forms a cook actually types.
  ('olive oil',           'evoo'),
  ('olive oil',           'extra virgin olive oil'),
  ('olive oil',           'extra-virgin olive oil'),
  ('toasted sesame oil',  'sesame oil'),
  ('half-and-half',       'half and half'),
  ('parmesan',            'parmigiano reggiano'),
  ('parmesan',            'parmigiano-reggiano'),
  ('parmesan',            'parmesan cheese'),
  ('parmesan',            'grated parmesan'),
  ('pecorino romano',     'pecorino'),
  ('pecorino romano',     'romano cheese'),
  ('mozzarella',          'mozzarella cheese'),
  ('mozzarella',          'shredded mozzarella'),
  ('cheddar cheese',      'cheddar'),
  ('cheddar cheese',      'sharp cheddar'),
  ('cheddar cheese',      'shredded cheddar'),
  ('gruyere',             'gruyère'),
  ('feta',                'feta cheese'),
  ('goat cheese',         'chevre'),
  ('cream cheese',        'philadelphia'),
  ('greek yogurt',        'plain greek yogurt'),
  ('plain yogurt',        'yogurt'),
  ('plain yogurt',        'yoghurt'),
  ('sour cream',          'soured cream'),
  ('unsalted butter',     'sweet butter'),
  ('butter',              'salted butter'),
  ('white miso',          'miso'),
  ('white miso',          'miso paste'),
  ('white miso',          'shiro miso'),
  ('harissa paste',       'harissa'),
  ('gochujang',           'korean chili paste'),
  ('gochujang',           'korean red pepper paste'),
  ('sriracha',            'rooster sauce'),
  ('soy sauce',           'shoyu'),
  ('soy sauce',           'light soy sauce'),
  ('tamari',              'gluten free soy sauce'),
  ('fish sauce',          'nuoc mam'),
  ('fish sauce',          'nam pla'),
  ('dijon mustard',       'dijon'),
  ('yellow mustard',      'mustard'),
  ('barbecue sauce',      'bbq sauce'),
  ('mayonnaise',          'mayo'),
  ('ketchup',             'tomato ketchup'),
  ('worcestershire sauce','worcester sauce'),
  ('breadcrumbs',         'bread crumbs'),
  ('breadcrumbs',         'dried breadcrumbs'),
  ('panko breadcrumbs',   'panko'),
  ('coconut milk',        'full fat coconut milk'),
  ('coconut milk',        'canned coconut milk'),
  ('chicken broth',       'chicken stock'),
  ('beef broth',          'beef stock'),
  ('vegetable broth',     'vegetable stock'),
  ('vegetable broth',     'veggie broth'),
  ('crushed tomatoes',    'canned crushed tomatoes'),
  ('whole tomatoes',      'canned whole tomatoes'),
  ('whole tomatoes',      'san marzano tomatoes'),
  ('diced tomatoes',      'canned diced tomatoes'),
  ('tomato paste',        'concentrated tomato puree'),
  ('sun-dried tomatoes',  'sundried tomatoes'),
  ('canned tuna',         'tuna, canned in water'),
  ('canned tuna',         'tinned tuna'),
  ('anchovies',           'anchovy fillets'),
  ('firm tofu',           'tofu'),
  ('firm tofu',           'extra firm tofu'),
  ('silken tofu',         'soft tofu'),
  ('edamame',             'soybeans, green'),

  -- Herbs: the bare word, assigned per the fresh/dried rule above.
  ('fresh parsley',       'parsley'),
  ('fresh parsley',       'flat-leaf parsley'),
  ('fresh parsley',       'italian parsley'),
  ('fresh basil',         'basil'),
  ('fresh mint',          'mint'),
  ('fresh dill',          'dill'),
  ('fresh dill',          'dill weed'),
  ('fresh tarragon',      'tarragon'),
  ('dried oregano',       'oregano'),
  ('dried thyme',         'thyme'),
  ('dried rosemary',      'rosemary'),
  ('dried sage',          'sage'),
  ('bay leaf',            'bay leaves'),
  ('bay leaf',            'dried bay leaf'),

  -- Spices. "coriander" bare means the seed in US recipes; the leaf is
  -- "fresh coriander", which is mapped to cilantro above.
  ('ground coriander',    'coriander'),
  ('ground cumin',        'cumin'),
  ('ground cinnamon',     'cinnamon'),
  ('ground turmeric',     'turmeric'),
  ('ground ginger',       'dried ginger'),
  ('ground nutmeg',       'nutmeg'),
  ('ground allspice',     'allspice'),
  ('ground cloves',       'cloves'),
  ('cayenne',             'cayenne pepper'),
  ('cayenne',             'ground cayenne'),
  ('black pepper',        'pepper'),
  ('black pepper',        'freshly ground black pepper'),
  ('black pepper',        'ground black pepper'),
  ('salt',                'table salt'),
  ('salt',                'fine sea salt'),
  ('kosher salt',         'coarse salt'),
  ('kosher salt',         'flaky salt'),
  ('kosher salt',         'sea salt'),
  ('paprika',             'sweet paprika'),
  ('chili powder',        'chilli powder'),
  ('old bay seasoning',   'old bay'),
  ('za''atar',            'zaatar'),
  ('chinese five spice',  'five spice powder'),

  -- Produce shorthand and irregular plurals.
  ('mushrooms',           'button mushrooms'),
  ('mushrooms',           'white mushrooms'),
  ('mushrooms',           'mixed mushrooms'),
  ('cremini mushrooms',   'baby bella mushrooms'),
  ('cremini mushrooms',   'chestnut mushrooms'),
  ('shiitake mushrooms',  'dried shiitake'),
  ('collard greens',      'collards'),
  ('swiss chard',         'chard'),
  ('brussels sprouts',    'brussel sprouts'),
  ('napa cabbage',        'chinese cabbage'),
  ('bok choy',            'pak choi'),
  ('bok choy',            'baby bok choy'),
  ('green cabbage',       'cabbage'),
  ('romaine lettuce',     'cos lettuce'),
  ('mixed greens',        'salad greens'),
  ('mixed greens',        'spring mix'),
  ('cherry tomato',       'grape tomatoes'),
  ('jalapeno',            'jalapeño'),
  ('jalapeno',            'jalapeno pepper'),
  ('poblano pepper',      'ancho chile'),
  ('lemon',               'lemon juice'),
  ('lemon',               'lemon zest'),
  ('lime',                'lime juice'),
  ('lime',                'lime zest'),
  ('orange',              'orange juice'),
  ('ginger',              'fresh ginger'),
  ('ginger',              'ginger root'),
  ('strawberries',        'strawberry'),
  ('blueberries',         'blueberry'),
  ('raspberries',         'raspberry'),
  ('blackberries',        'blackberry'),
  ('cherries',            'cherry'),
  ('grapes',              'grape'),
  ('dried cranberries',   'craisins'),
  ('shredded coconut',    'desiccated coconut'),

  -- Pasta, grains and bread.
  ('spaghetti',           'tonnarelli'),
  ('spaghetti',           'spaghetti noodles'),
  ('macaroni',            'elbow macaroni'),
  ('macaroni',            'elbows'),
  ('angel hair',          'capellini'),
  ('egg noodles',         'wide egg noodles'),
  ('rice noodles',        'rice vermicelli'),
  ('rice noodles',        'pad thai noodles'),
  ('ramen noodles',       'instant ramen'),
  ('couscous',            'israeli couscous'),
  ('bulgur',              'cracked wheat'),
  ('corn tortillas',      'corn tortilla'),
  ('flour tortillas',     'flour tortilla'),
  ('flour tortillas',     'tortillas'),
  ('sandwich bread',      'white bread'),
  ('sandwich bread',      'bread'),
  ('baguette',            'french bread'),
  ('pita bread',          'pita'),
  ('hamburger buns',      'burger buns'),
  ('cooking spray',       'nonstick cooking spray'),
  ('active dry yeast',    'instant yeast'),
  ('active dry yeast',    'yeast'),
  ('semisweet chocolate', 'dark chocolate'),
  ('cocoa powder',        'unsweetened cocoa powder'),
  ('maple syrup',         'pure maple syrup'),
  ('peanut butter',       'creamy peanut butter'),
  ('dry white wine',      'white wine'),
  ('dry red wine',        'red wine'),
  ('hot dogs',            'frankfurters'),
  ('italian sausage',     'sweet italian sausage'),
  ('bacon',               'streaky bacon'),
  ('chuck roast',         'beef chuck'),
  ('pork shoulder',       'pork butt'),
  ('pork shoulder',       'boston butt'),
  ('rotisserie chicken',  'cooked chicken'),
  ('rotisserie chicken',  'shredded chicken')
;

do $guard$
declare
  orphans   text;
  shadowed  text;
begin
  -- An alias naming a canonical ingredient that does not exist.
  select string_agg(distinct s.canonical::text, ', ' order by s.canonical::text)
    into orphans
  from _alias_seed s
  left join ingredients i on i.canonical_name = s.canonical
  where i.id is null;

  if orphans is not null then
    raise exception 'alias seed references unknown canonical ingredients: %', orphans;
  end if;

  -- An alias that repeats a canonical_name. resolve_ingredient() checks
  -- canonical names first, so such a row can never win -- it is a dead claim.
  select string_agg(distinct s.alias::text, ', ' order by s.alias::text)
    into shadowed
  from _alias_seed s
  join ingredients i on i.canonical_name = s.alias;

  if shadowed is not null then
    raise exception 'alias rows shadow a canonical_name and can never match: %', shadowed;
  end if;
end
$guard$;

insert into ingredient_aliases (ingredient_id, alias)
select i.id, s.alias
from _alias_seed s
join ingredients i on i.canonical_name = s.canonical
on conflict (alias) do nothing;

commit;
