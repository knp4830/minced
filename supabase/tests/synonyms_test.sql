-- Regression test for wave 5: everyday synonyms and regional names.
--
-- A home cook types what they call it ("aubergine", "icing sugar", "garbanzos"),
-- not what the vocabulary calls it. Each pair below is (typed term, canonical
-- ingredient). For every pair the test asserts BOTH:
--
--   1. resolve_ingredient(term) returns that canonical id with match_kind
--      'exact' or 'alias' (never a fuzzy guess -- fuzzy is a coin flip we
--      refuse to rely on for terms we know about), and
--   2. the fridge find box can find it: the term is the name or an alias of the
--      tappable catalog item (the family parent when the canonical is a
--      variant). This mirrors the `aka` payload built in
--      src/lib/queries/ingredientCatalog.ts.
--
-- It also spot-checks that suggest_ingredients() (the typeahead RPC) offers the
-- right ingredient for a prefix of an alias.
--
-- Read-only: it only SELECTs and creates a temp table, so it is safe on a
-- snapshot or live.
--
--   psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -f supabase/tests/synonyms_test.sql
--
-- Success prints "synonym tests passed: N pairs". Any failure lists every
-- offending pair, then raises.
--
-- To add a pair: append a row below; if it fails, add the alias to
-- supabase/seed-ingredients.sql (aliases only, never simple plurals --
-- see CLAUDE.md "Vocabulary rules"). Only list a pair when swapping the two
-- would not change the dish: "golden syrup = maple syrup" does not qualify.

create temp table t_pairs (term text, canonical text);

-- A singular typed for a plural canonical ("almond" for "almonds"). The
-- vocabulary rule forbids seeding simple plurals as aliases, so these resolve
-- by the fuzzy tier -- correctly, and that is accepted. Anything NOT listed
-- here must resolve exact or alias.
create temp table t_fuzzy_ok (term text primary key);
insert into t_fuzzy_ok values
  ('almond'), ('walnut'), ('pecan'), ('chive'), ('chickpea'), ('egg white'), ('chili pepper');

insert into t_pairs (term, canonical) values
  -- Alliums
  ('green onion',          'scallion'),
  ('spring onion',         'scallion'),
  ('spring onions',        'scallion'),
  ('salad onion',          'scallion'),
  ('eschalot',             'shallot'),
  ('brown onion',          'yellow onion'),
  ('spanish onion',        'yellow onion'),
  ('cooking onion',        'yellow onion'),
  ('chive',                'chives'),
  -- Produce, UK / AU / US
  ('aubergine',            'eggplant'),
  ('brinjal',              'eggplant'),
  ('courgette',            'zucchini'),
  ('courgettes',           'zucchini'),
  ('baby marrow',          'zucchini'),
  ('capsicum',             'bell pepper'),
  ('sweet pepper',         'bell pepper'),
  ('red capsicum',         'red bell pepper'),
  ('green capsicum',       'green bell pepper'),
  ('rocket',               'arugula'),
  ('rocket leaves',        'arugula'),
  ('swede',                'rutabaga'),
  ('beetroot',             'beet'),
  ('mangetout',            'snow peas'),
  ('mange tout',           'snow peas'),
  ('sugar snap peas',      'snap peas'),
  ('coriander leaves',     'fresh cilantro'),
  ('fresh coriander',      'fresh cilantro'),
  ('cilantro',             'fresh cilantro'),
  ('cilantro leaves',      'fresh cilantro'),
  ('chinese cabbage',      'napa cabbage'),
  ('chinese leaf',         'napa cabbage'),
  ('pak choi',             'bok choy'),
  ('pak choy',             'bok choy'),
  ('bok choi',             'bok choy'),
  ('cos lettuce',          'romaine lettuce'),
  ('little gem',           'romaine lettuce'),
  ('spring greens',        'collard greens'),
  ('silverbeet',           'swiss chard'),
  ('chard',                'swiss chard'),
  ('rainbow chard',        'swiss chard'),
  ('cavolo nero',          'kale'),
  ('lacinato kale',        'kale'),
  ('tuscan kale',          'kale'),
  ('brussel sprouts',      'brussels sprouts'),
  ('jacket potato',        'russet potato'),
  ('baking potato',        'russet potato'),
  ('idaho potato',         'russet potato'),
  ('new potatoes',         'red potato'),
  ('kumara',               'sweet potato'),
  ('mooli',                'daikon'),
  ('white radish',         'daikon'),
  ('lady fingers',         'okra'),
  ('ladies fingers',       'okra'),
  ('runner beans',         'green beans'),
  ('french beans',         'green beans'),
  ('string beans',         'green beans'),
  ('haricots verts',       'green beans'),
  ('broad beans',          'fava beans'),
  ('butter beans',         'lima beans'),
  ('garbanzo beans',       'chickpeas'),
  ('garbanzos',            'chickpeas'),
  ('chickpea',             'chickpeas'),
  ('chick peas',           'chickpeas'),
  ('haricot beans',        'navy beans'),
  ('puy lentils',          'lentils'),
  ('green lentils',        'lentils'),
  ('brown lentils',        'lentils'),
  ('plum tomato',          'roma tomato'),
  ('tinned tomatoes',      'diced tomatoes'),
  ('canned tomatoes',      'diced tomatoes'),
  ('chopped tomatoes',     'diced tomatoes'),
  ('passata',              'tomato sauce'),
  ('tomato puree',         'tomato paste'),
  ('sweetcorn',            'corn'),
  ('maize',                'corn'),
  ('clementine',           'mandarin orange'),
  ('satsuma',              'mandarin orange'),
  ('tangerine',            'mandarin orange'),
  ('rockmelon',            'cantaloupe'),
  ('pawpaw',               'papaya'),
  -- Meat and fish
  ('prawns',               'shrimp'),
  ('king prawns',          'shrimp'),
  ('minced beef',          'ground beef'),
  ('beef mince',           'ground beef'),
  ('hamburger meat',       'ground beef'),
  ('minced meat',          'ground meat'),
  ('mince',                'ground meat'),
  ('minced pork',          'ground pork'),
  ('pork mince',           'ground pork'),
  ('minced lamb',          'ground lamb'),
  ('lamb mince',           'ground lamb'),
  ('minced turkey',        'ground turkey'),
  ('turkey mince',         'ground turkey'),
  ('minced chicken',       'ground chicken'),
  ('chicken mince',        'ground chicken'),
  ('chicken breasts',      'chicken breast'),
  ('chicken fillet',       'chicken breast'),
  ('chicken thigh',        'chicken thighs'),
  ('streaky bacon',        'bacon'),
  ('back bacon',           'bacon'),
  ('rashers',              'bacon'),
  ('frankfurters',         'hot dogs'),
  ('wieners',              'hot dogs'),
  ('rump steak',           'sirloin steak'),
  ('rib eye',              'ribeye'),
  ('rib-eye steak',        'ribeye'),
  ('stewing beef',         'beef stew meat'),
  ('braising steak',       'beef stew meat'),
  ('calamari',             'squid'),
  ('tinned tuna',          'canned tuna'),
  ('anchovy fillets',      'anchovies'),
  ('crab meat',            'crab'),
  -- Dairy and eggs
  ('double cream',         'heavy cream'),
  ('whipping cream',       'heavy cream'),
  ('heavy whipping cream', 'heavy cream'),
  ('single cream',         'half-and-half'),
  ('light cream',          'half-and-half'),
  ('soured cream',         'sour cream'),
  ('whole milk',           'milk'),
  ('skimmed milk',         'milk'),
  ('semi-skimmed milk',    'milk'),
  ('condensed milk',       'sweetened condensed milk'),
  ('natural yogurt',       'plain yogurt'),
  ('plain yoghurt',        'plain yogurt'),
  ('greek yoghurt',        'greek yogurt'),
  ('parmigiano reggiano',  'parmesan'),
  ('parmigiano-reggiano',  'parmesan'),
  ('cheddar',              'cheddar cheese'),
  ('emmental',             'swiss cheese'),
  ('jack cheese',          'monterey jack'),
  ('goats cheese',         'goat cheese'),
  ('chevre',               'goat cheese'),
  ('eggs',                 'egg'),
  ('egg white',            'egg whites'),
  -- Baking and sugar
  ('icing sugar',          'powdered sugar'),
  ('confectioners sugar',  'powdered sugar'),
  ('confectioners'' sugar','powdered sugar'),
  ('caster sugar',         'granulated sugar'),
  ('superfine sugar',      'granulated sugar'),
  ('white sugar',          'granulated sugar'),
  ('demerara sugar',       'brown sugar'),
  ('muscovado sugar',      'brown sugar'),
  ('light brown sugar',    'brown sugar'),
  ('dark brown sugar',     'brown sugar'),
  ('cornflour',            'cornstarch'),
  ('corn flour',           'cornstarch'),
  ('bicarbonate of soda',  'baking soda'),
  ('bicarb',               'baking soda'),
  ('bicarb soda',          'baking soda'),
  ('sodium bicarbonate',   'baking soda'),
  ('plain flour',          'all-purpose flour'),
  ('ap flour',             'all-purpose flour'),
  ('strong flour',         'bread flour'),
  ('wholemeal flour',      'whole wheat flour'),
  ('wholewheat flour',     'whole wheat flour'),
  ('gram flour',           'chickpea flour'),
  ('besan',                'chickpea flour'),
  ('treacle',              'molasses'),
  ('black treacle',        'molasses'),
  ('cacao powder',         'cocoa powder'),
  ('unsweetened cocoa',    'cocoa powder'),
  ('chocolate chunks',     'chocolate chips'),
  ('bittersweet chocolate','semisweet chocolate'),
  ('vanilla essence',      'vanilla extract'),
  ('pure vanilla extract', 'vanilla extract'),
  ('dried yeast',          'active dry yeast'),
  ('desiccated coconut',   'shredded coconut'),
  ('porridge oats',        'rolled oats'),
  ('old-fashioned oats',   'rolled oats'),
  ('shortcrust pastry',    'pie crust'),
  ('filo pastry',          'phyllo dough'),
  ('filo',                 'phyllo dough'),
  ('maize meal',           'cornmeal'),
  -- Oils, vinegars, sauces, pantry
  ('sunflower oil',        'vegetable oil'),
  ('rapeseed oil',         'canola oil'),
  ('groundnut oil',        'peanut oil'),
  ('extra virgin olive oil','olive oil'),
  ('sesame oil',           'toasted sesame oil'),
  ('distilled white vinegar','white vinegar'),
  ('cider vinegar',        'apple cider vinegar'),
  ('table salt',           'salt'),
  ('coarse salt',          'kosher salt'),
  ('ground black pepper',  'black pepper'),
  ('cracked black pepper', 'black pepper'),
  ('peppercorns',          'black peppercorns'),
  ('tomato ketchup',       'ketchup'),
  ('catsup',               'ketchup'),
  ('worcester sauce',      'worcestershire sauce'),
  ('light soy sauce',      'soy sauce'),
  ('dark soy sauce',       'soy sauce'),
  ('shoyu',                'soy sauce'),
  ('wholegrain mustard',   'whole grain mustard'),
  ('mayo',                 'mayonnaise'),
  ('tabasco',              'hot sauce'),
  ('siracha',              'sriracha'),
  ('bbq sauce',            'barbecue sauce'),
  ('chicken stock',        'chicken broth'),
  ('beef stock',           'beef broth'),
  ('vegetable stock',      'vegetable broth'),
  ('veg stock',            'vegetable broth'),
  ('chicken stock cube',   'chicken bouillon'),
  ('beef stock cube',      'beef bouillon'),
  ('bread crumbs',         'breadcrumbs'),
  ('long grain rice',      'white rice'),
  ('long-grain rice',      'white rice'),
  ('sushi rice',           'short-grain rice'),
  ('risotto rice',         'arborio rice'),
  ('capellini',            'angel hair'),
  ('tagliatelle',          'fettuccine'),
  -- Herbs and spices
  ('flat-leaf parsley',    'fresh parsley'),
  ('italian parsley',      'fresh parsley'),
  ('basil leaves',         'fresh basil'),
  ('mint leaves',          'fresh mint'),
  ('bay leaves',           'bay leaf'),
  ('chilli',               'chili peppers'),
  ('chilli pepper',        'chili peppers'),
  ('chili pepper',         'chili peppers'),
  ('chillies',             'chili peppers'),
  ('green chilli',         'green chiles'),
  ('birds eye chilli',     'thai chile'),
  ('chilli powder',        'chili powder'),
  ('chilli flakes',        'crushed red pepper'),
  ('chili flakes',         'crushed red pepper'),
  ('red pepper flakes',    'crushed red pepper'),
  ('cayenne pepper',       'cayenne'),
  ('jeera',                'cumin seeds'),
  ('dhania powder',        'ground coriander'),
  ('turmeric powder',      'ground turmeric'),
  ('haldi',                'ground turmeric'),
  ('ginger root',          'ginger'),
  ('fresh ginger',         'ginger'),
  ('root ginger',          'ginger'),
  ('five spice',           'chinese five spice'),
  ('lemon grass',          'lemongrass'),
  ('makrut lime leaves',   'kaffir lime leaves'),
  ('saffron threads',      'saffron'),
  ('zaatar',               'za''atar'),
  ('garlic granules',      'garlic powder'),
  ('onion granules',       'onion powder'),
  -- Nuts, seeds, bread, other
  ('almond',               'almonds'),
  ('walnut',               'walnuts'),
  ('pecan',                'pecans'),
  ('groundnuts',           'peanuts'),
  ('cashew nuts',          'cashews'),
  ('pinenuts',             'pine nuts'),
  ('pignoli',              'pine nuts'),
  ('filberts',             'hazelnuts'),
  ('pepitas',              'pumpkin seeds'),
  ('linseed',              'flaxseed'),
  ('flax seeds',           'flaxseed'),
  ('sultanas',             'raisins'),
  ('craisins',             'dried cranberries'),
  ('pitta bread',          'pita bread'),
  ('burger buns',          'hamburger buns'),
  ('portabella mushrooms', 'portobello mushrooms'),
  ('chestnut mushrooms',   'cremini mushrooms'),
  ('baby bella mushrooms', 'cremini mushrooms'),
  ('sundried tomatoes',    'sun-dried tomatoes'),
  ('sun dried tomatoes',   'sun-dried tomatoes'),
  ('gherkins',             'pickles'),
  ('soya sauce',           'soy sauce'),
  ('soya milk',            'soy milk'),
  ('beansprouts',          'bean sprouts'),
  ('bean curd',            'firm tofu');

-- Normalise like the app does: lower-case for catalog lookups.
do $$
declare
  n_pairs   integer;
  bad       text;
  bad_cat   text;
  bad_sug   text;
begin
  select count(*) into n_pairs from t_pairs;

  -- Every expected canonical must exist (a typo in this file is not a pass).
  select string_agg(distinct p.canonical, ', ') into bad
  from t_pairs p
  left join ingredients i on i.canonical_name = p.canonical::citext
  where i.id is null;
  if bad is not null then
    raise exception 'test pairs name unknown canonical ingredients: %', bad;
  end if;

  -- 1. resolve_ingredient must land on the expected id, not fuzzy.
  select string_agg(
           format('%s -> expected %s, got %s',
                  p.term, p.canonical, coalesce(r.canonical_name::text || ' (' || r.match_kind::text || ')', 'NOTHING')),
           E'\n  ' order by p.term)
    into bad
  from t_pairs p
  join ingredients want on want.canonical_name = p.canonical::citext
  left join lateral resolve_ingredient(p.term) r on true
  where r.ingredient_id is distinct from want.id
     or (r.match_kind::text = 'fuzzy' and p.term not in (select term from t_fuzzy_ok));
  if bad is not null then
    raise exception E'resolve_ingredient mismatches:\n  %', bad;
  end if;

  -- 2. The fridge find box (catalog `aka` payload): the tappable item is the
  --    family parent if there is one. The picker (fridgePicker.tsx) does a
  --    substring match of the typed text, or of the text minus a trailing
  --    plural "s", against the item name and its `aka` synonyms.
  select string_agg(format('%s (%s)', p.term, p.canonical), E'
  ' order by p.term)
    into bad_cat
  from t_pairs p
  join ingredients want on want.canonical_name = p.canonical::citext
  cross join lateral (
    select lower(p.term) as full_t,
           case when length(regexp_replace(lower(p.term), '(ies|es|s)$', '')) >= 3
                then regexp_replace(lower(p.term), '(ies|es|s)$', '')
                else lower(p.term) end as stem_t
  ) n
  where not exists (
    select 1
    from ingredients m
    left join ingredient_aliases a on a.ingredient_id = m.id
    where coalesce(m.family_id, m.id) = coalesce(want.family_id, want.id)
      and (
        -- the tappable item's own name, or (for a folded variant) its name
        lower(m.canonical_name::text) like '%' || n.full_t || '%'
        or lower(m.canonical_name::text) like '%' || n.stem_t || '%'
        or lower(a.alias::text) like '%' || n.full_t || '%'
        or lower(a.alias::text) like '%' || n.stem_t || '%'
      )
  );
  if bad_cat is not null then
    raise exception E'catalog find-box payload misses:\n  %', bad_cat;
  end if;

  -- 3. suggest_ingredients() offers the right ingredient for the full term.
  --    Staples are excluded from the fridge picker, so only check non-staples.
  select string_agg(format('%s (%s)', p.term, p.canonical), E'\n  ' order by p.term)
    into bad_sug
  from t_pairs p
  join ingredients want on want.canonical_name = p.canonical::citext
  where not want.is_pantry_staple
    and not exists (
      select 1 from suggest_ingredients(p.term, 20) s
      where s.ingredient_id = coalesce(want.family_id, want.id) or s.ingredient_id = want.id
    );
  if bad_sug is not null then
    raise exception E'suggest_ingredients does not offer:\n  %', bad_sug;
  end if;

  raise notice 'synonym tests passed: % pairs', n_pairs;
end
$$;
