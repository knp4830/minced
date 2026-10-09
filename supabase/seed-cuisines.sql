-- Minced -- cuisine vocabulary and USDA cuisine tags (wave 1, content lane)
--
-- 1. Adds the cuisines the catalog now needs (the seed shipped seven).
-- 2. Tags USDA MyPlate recipes with a cuisine -- ONLY where the dish clearly
--    belongs to one, judged from its title and checked against its ingredients.
--    About 130 of 872 get a cuisine; the rest stay NULL on purpose. The USDA
--    corpus is American family cooking, and "Banana Bread" belonging to no
--    cuisine is the truth, not a gap to fill with a guess.
--
-- IDEMPOTENT. Cuisines upsert by name. Tags only fill a cuisine_id that is
-- still NULL, so a human or later pass that sets a cuisine is never overwritten,
-- and re-running changes zero rows. recipes_before_write re-derives
-- search_vector on the way, so "cuisine" becomes searchable with no extra step.
--
-- TAGGING RULES (so the judgement is reviewable, not just the result):
--   * A named dish of that cuisine (huevos motulenos, ratatouille, jambalaya).
--   * "Spanish rice" is NOT tagged Spanish: it is a Mexican-American dish and the
--     name misleads. Left NULL rather than guessed.
--   * Fusion or generic dishes ("Asian Mango Chicken Wraps", "Chicken Stir-Fry",
--     "Curried Chicken Salad", "Garlic Ginger Ramen with Beef") stay NULL.
--   * Tex-Mex is its own cuisine, not folded into Mexican: burritos, taco salad
--     and taco cups are American inventions; tacos, tostadas, enchiladas,
--     salsas, mole and pozole are Mexican.

begin;

insert into cuisines (name, slug) values
  ('Thai',            'thai'),
  ('Vietnamese',      'vietnamese'),
  ('Ethiopian',       'ethiopian'),
  ('Mexican',         'mexican'),
  ('Tex-Mex',         'tex-mex'),
  ('West African',    'west-african'),
  ('East African',    'east-african'),
  ('Filipino',        'filipino'),
  ('Caribbean',       'caribbean'),
  ('Peruvian',        'peruvian'),
  ('Argentinian',     'argentinian'),
  ('Salvadoran',      'salvadoran'),
  ('Chinese',         'chinese'),
  ('Greek',           'greek'),
  ('Turkish',         'turkish'),
  ('Moroccan',        'moroccan'),
  ('Spanish',         'spanish'),
  ('French',          'french'),
  ('Balkan',          'balkan'),
  ('Jewish',          'jewish'),
  ('Irish',           'irish'),
  ('British',         'british'),
  ('Russian',         'russian'),
  ('Cajun & Creole',  'cajun-creole'),
  ('Southern US',     'southern-us')
on conflict (name) do nothing;

create temp table _tag (slug text, cuisine text) on commit drop;

insert into _tag (slug, cuisine) values
  -- Mexican
  ('avocado-black-bean-taquitos',              'Mexican'),
  ('bean-enchiladas',                          'Mexican'),
  ('beef-and-bean-chile-verde',                'Mexican'),
  ('beef-pozole-soup',                         'Mexican'),
  ('chicken-pozole-soup',                      'Mexican'),
  ('chicken-mole',                             'Mexican'),
  ('black-bean-quesadillas',                   'Mexican'),
  ('quesadilla-con-huevos',                    'Mexican'),
  ('veggie-quesadillas',                       'Mexican'),
  ('corn-tortillas',                           'Mexican'),
  ('flour-tortillas',                          'Mexican'),
  ('fish-tacos',                               'Mexican'),
  ('simple-fish-tacos',                        'Mexican'),
  ('soft-chicken-taco',                        'Mexican'),
  ('delicious-tacos',                          'Mexican'),
  ('vegetable-tacos',                          'Mexican'),
  ('roasted-pork-tacos-pico-de-gallo',         'Mexican'),
  ('terrific-bean-taco',                       'Mexican'),
  ('fresh-salsa',                              'Mexican'),
  ('fresh-tomato-salsa',                       'Mexican'),
  ('salsa1',                                   'Mexican'),
  ('pico-de-gallo',                            'Mexican'),
  ('huevos-motulenos',                         'Mexican'),
  ('huevos-rancheros-fresh-salsa',             'Mexican'),
  ('migas-crumbs',                             'Mexican'),
  ('horchata',                                 'Mexican'),
  ('refried-beans',                            'Mexican'),
  ('tostadas',                                 'Mexican'),
  ('tostadas-delgadas',                        'Mexican'),
  ('stove-top-green-chile-chicken-enchiladas', 'Mexican'),
  -- Tex-Mex
  ('bean-and-rice-burritos',                   'Tex-Mex'),
  ('black-bean-burrito',                       'Tex-Mex'),
  ('breakfast-burrito-salsa',                  'Tex-Mex'),
  ('breakfast-potato-egg-burritos',            'Tex-Mex'),
  ('enchilada-bake',                           'Tex-Mex'),
  ('kid-friendly-taco-cups',                   'Tex-Mex'),
  ('taco-salad',                               'Tex-Mex'),
  ('taco-soup',                                'Tex-Mex'),
  ('tex-mex-skillet',                          'Tex-Mex'),
  -- Chinese
  ('egg-foo-young',                            'Chinese'),
  ('veggie-chow-mein',                         'Chinese'),
  ('garlic-bok-choy',                          'Chinese'),
  ('flavorful-fried-rice',                     'Chinese'),
  ('fried-rice',                               'Chinese'),
  ('fried-rice-chicken-vegetables',            'Chinese'),
  ('vegetable-fried-rice',                     'Chinese'),
  ('sweet-and-sour-vegetables',                'Chinese'),
  -- Indian
  ('chapatis-flatbread',                       'Indian'),
  ('naan',                                     'Indian'),
  ('masoor-dal-red-lentils-onion',             'Indian'),
  -- Italian
  ('chicken-cacciatore',                       'Italian'),
  ('marinara-sauce',                           'Italian'),
  ('minestrone-soup',                          'Italian'),
  ('lentil-minestrone',                        'Italian'),
  ('italian-bean-soup',                        'Italian'),
  ('italian-broccoli-and-pasta',               'Italian'),
  ('italian-inspired-summer-squash',           'Italian'),
  ('summer-squash-italian-style',              'Italian'),
  ('italian-style-vegetables',                 'Italian'),
  ('italian-vegetables',                       'Italian'),
  ('summer-italian-vegetables',                'Italian'),
  ('italian-pasta-salad',                      'Italian'),
  ('tomato-basil-bruschetta',                  'Italian'),
  ('tuscan-potato-skillet',                    'Italian'),
  ('asparagus-gremolata-sauce',                'Italian'),
  ('skillet-lasagna',                          'Italian'),
  ('quick-skillet-lasagna',                    'Italian'),
  ('short-cut-lasagna',                        'Italian'),
  ('potato-spinach-lasagna',                   'Italian'),
  ('pasta-frittata-peas',                      'Italian'),
  -- Spanish
  ('spanish-baked-fish',                       'Spanish'),
  ('spanish-frittata',                         'Spanish'),
  ('gazpacho',                                 'Spanish'),
  ('gazpacho-soup',                            'Spanish'),
  ('farmers-market-gazpacho',                  'Spanish'),
  -- Greek
  ('greek-salad',                              'Greek'),
  -- Middle Eastern
  ('falafel-yogurt-sandwich',                  'Middle Eastern'),
  ('brown-rice-tabbouleh',                     'Middle Eastern'),
  ('salata-ma-jibna-salad-parmesan-cheese',    'Middle Eastern'),
  -- East African
  ('somali-summer-salad',                      'East African'),
  -- Caribbean
  ('caribbean-bean-salad',                     'Caribbean'),
  ('caribbean-casserole',                      'Caribbean'),
  ('caribbean-pink-beans',                     'Caribbean'),
  ('jamaican-jerk-chicken',                    'Caribbean'),
  ('cuban-beans-and-rice',                     'Caribbean'),
  ('cuban-salad',                              'Caribbean'),
  ('plantain-cups-shredded-chicken-mofonguitos', 'Caribbean'),
  -- Cajun & Creole (Louisiana)
  ('20-minute-chicken-creole',                 'Cajun & Creole'),
  ('baked-fish-creole-sauce',                  'Cajun & Creole'),
  ('creole-beans',                             'Cajun & Creole'),
  ('cajun-catfish',                            'Cajun & Creole'),
  ('collard-green-gumbo-ham-hock',             'Cajun & Creole'),
  ('dirty-rice',                               'Cajun & Creole'),
  ('new-orleans-red-beans',                    'Cajun & Creole'),
  ('red-beans-and-rice',                       'Cajun & Creole'),
  ('red-beans-and-rice-0',                     'Cajun & Creole'),
  ('red-beans-and-rice1',                      'Cajun & Creole'),
  ('barley-jambalaya',                         'Cajun & Creole'),
  ('louisiana-green-beans',                    'Cajun & Creole'),
  -- Southern US
  ('candied-yams',                             'Southern US'),
  ('sweet-potato-pie',                         'Southern US'),
  ('mock-southern-sweet-potato-pie',           'Southern US'),
  ('spicy-southern-barbecued-chicken',         'Southern US'),
  ('quick-and-healthy-black-eyed-peas',        'Southern US'),
  ('quick-black-eyed-peas',                    'Southern US'),
  ('soul-healthy-cornbread',                   'Southern US'),
  ('corn-bread',                               'Southern US'),
  ('vegetarian-collard-greens',                'Southern US'),
  ('basic-steamed-collards',                   'Southern US'),
  ('julias-sauteed-steamed-collards',          'Southern US'),
  ('smoked-ham-hocks-lima-beans',              'Southern US'),
  ('skillet-catfish',                          'Southern US'),
  ('cornbread-dressing',                       'Southern US'),
  ('eggs-over-kale-and-sweet-potato-grits',    'Southern US'),
  ('chicken-and-dumplings',                    'Southern US'),
  ('lite-fried-okra',                          'Southern US'),
  ('banana-pudding',                           'Southern US'),
  -- Single-dish cuisines
  ('argentinean-grilled-steak-salsa-criolla',  'Argentinian'),
  ('chimichurri-sauce',                        'Argentinian'),
  ('curtido-salvadoreno-cabbage-salad',        'Salvadoran'),
  ('bosnian-pot',                              'Balkan'),
  ('ratatouille',                              'French'),
  ('ratatouille-0',                            'French'),
  ('chicken-ratatouille',                      'French'),
  ('basic-quiche',                             'French'),
  ('matzo-meal-kugel-pudding',                 'Jewish'),
  ('vegetarian-matzo-ball-soup',               'Jewish'),
  ('red-potato-and-cabbage-colcannon',         'Irish'),
  ('shepherds-pie',                            'British'),
  ('beef-stroganoff',                          'Russian');

do $guard$
declare
  bad text;
begin
  -- A typo in a slug would otherwise tag nothing and say nothing.
  select string_agg(t.slug, ', ') into bad
  from _tag t left join recipes r on r.slug = t.slug
  where r.id is null;
  if bad is not null then
    raise exception 'cuisine tags reference recipes that do not exist: %', bad;
  end if;

  select string_agg(distinct t.cuisine, ', ') into bad
  from _tag t left join cuisines c on c.name = t.cuisine
  where c.id is null;
  if bad is not null then
    raise exception 'cuisine tags reference unknown cuisines: %', bad;
  end if;

  select string_agg(slug, ', ') into bad
  from (select slug from _tag group by slug having count(*) > 1) d;
  if bad is not null then
    raise exception 'a recipe is tagged with two cuisines: %', bad;
  end if;

  -- Only USDA rows are this file's business.
  select string_agg(t.slug, ', ') into bad
  from _tag t join recipes r on r.slug = t.slug
  where r.source_name is distinct from 'USDA MyPlate Kitchen';
  if bad is not null then
    raise exception 'cuisine tag targets a non-USDA recipe: %', bad;
  end if;
end
$guard$;

update recipes r
set cuisine_id = c.id
from _tag t
join cuisines c on c.name = t.cuisine
where r.slug = t.slug
  and r.cuisine_id is null;

select
  count(*) filter (where cuisine_id is not null) as tagged,
  count(*) filter (where cuisine_id is null)     as untagged
from recipes
where source_name = 'USDA MyPlate Kitchen';

commit;
