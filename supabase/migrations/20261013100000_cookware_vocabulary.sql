-- Wave 5 / cookware backfill: widen the cookware vocabulary.
--
-- Before: 9 rows (sheet-pan, skillet, dutch-oven, pot, saucepan, small-saucepan,
-- wok, blender, baking-dish). A catalog where most recipes bake in a pan, whisk
-- in a blender or cook in the microwave needs more than that to answer
-- "what can I make with the equipment I own".
--
-- WHAT COUNTS AS COOKWARE HERE: a vessel or appliance you would have to own or
-- borrow to make the dish. Bowls, knives, spoons, colanders and cutting boards are
-- NOT cookware -- every kitchen has them and listing them would filter nothing.
--
-- Naming: slug = what a cook searches for, name = the chip label. "cake-pan" is
-- deliberately wide (round, springform, tube, bundt, pie plate) because the
-- distinction does not change whether you can cook the dish with what you own.
--
-- The filter only shows cookware that at least one recipe uses, so a row added
-- here that nothing references stays invisible.
--
-- Idempotent: ON CONFLICT DO NOTHING. Data only; no policy or privilege changes.

insert into cookware (name, slug) values
  ('Loaf pan',        'loaf-pan'),
  ('Muffin tin',      'muffin-tin'),
  ('Cake or pie pan', 'cake-pan'),
  ('Roasting pan',    'roasting-pan'),
  ('Food processor',  'food-processor'),
  ('Mixer',           'mixer'),
  ('Slow cooker',     'slow-cooker'),
  ('Rice cooker',     'rice-cooker'),
  ('Air fryer',       'air-fryer'),
  ('Microwave',       'microwave'),
  ('Grill',           'grill'),
  ('Griddle',         'griddle')
on conflict do nothing;
