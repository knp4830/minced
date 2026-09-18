-- M1.5.3 -- unit resolution.
--
-- THE PROBLEM THIS SOLVES
--
-- The ingredient parser reports units as a cook wrote them: "cloves", "pound",
-- "Tablespoons", "teaspoon". The units table stores them as a CONVERSION SYSTEM:
-- every row carries a kind (mass/volume/count) and a to_base_factor, which is
-- what lets a recipe be scaled by servings and volume be crossed to mass through
-- ingredients.density_g_per_ml.
--
-- Following the parser's spelling -- storing "tablespoon" beside "tbsp" -- would
-- fragment that system for no gain. It is the same mistake as letting "scallion"
-- and "green onion" be different ingredients, and it gets the same fix: ONE
-- canonical row, with every surface form recorded as an alias.
--
-- WHY citext MATTERS HERE MORE THAN ANYWHERE ELSE
--
-- The parser's unit normaliser is case-sensitive and fails silently:
--
--   "2 tablespoons butter"  -> a pint unit, tbsp        (recognised)
--   "2 Tablespoons butter"  -> the bare string          (not recognised)
--   "2 TABLESPOONS butter"  -> nothing at all           (unit LOST)
--
-- USDA recipe cards capitalise. A case-sensitive mapping would drop units from a
-- large slice of the catalog and report no error at all. `alias citext` makes
-- every one of those spellings the same key.

begin;

-- ---------------------------------------------------------------------------
-- Units USDA recipes use that we did not have. All volume, all exactly
-- convertible, so each gets a real factor against the ml base.
-- ---------------------------------------------------------------------------
insert into units (name, kind, to_base_factor) values
  ('fl oz', 'volume', 29.5735),
  ('pt',    'volume', 473.176),
  ('qt',    'volume', 946.353),
  ('gal',   'volume', 3785.41),
  -- "2 slices bread" is a real measure in this corpus, and like the other count
  -- units it has no conversion factor.
  ('slice', 'count',  null)
on conflict (name) do nothing;

-- Deliberately NOT added: "pinch", "dash", "to taste". They have no conversion
-- factor and vary by cook, so they are represented the way the schema already
-- allows -- quantity NULL, meaning "to taste" -- rather than as fake units that
-- would break the promise that every unit converts.

-- ---------------------------------------------------------------------------
-- unit_aliases -- the mirror of ingredient_aliases, for the same reason.
-- ---------------------------------------------------------------------------
create table unit_aliases (
  id      integer generated always as identity primary key,
  unit_id integer not null references units (id) on delete cascade,
  alias   citext  not null unique
);

comment on table unit_aliases is
  'tablespoon/Tablespoons/T -> tbsp. citext, because the parser loses units that '
  'are capitalised and USDA recipe cards capitalise.';

create index unit_aliases_unit_idx on unit_aliases (unit_id);

alter table unit_aliases enable row level security;

-- Reference data, world-readable like every other lookup table. No write policy
-- at all, which is the deny: imports run server-side and bypass RLS.
create policy "reference data is public" on unit_aliases
  for select using (true);

insert into unit_aliases (unit_id, alias)
select u.id, a.alias
from (values
  -- volume
  ('tsp',   'teaspoon'),    ('tsp',   'teaspoons'),   ('tsp',   'tsps'),
  ('tsp',   'tsp.'),
  -- NOT aliased: bare 't'. Traditional recipe shorthand is 't' = teaspoon and
  -- 'T' = TABLESPOON, and citext folds them together -- so the alias that makes
  -- "2 t" work would silently turn "2 T butter" into a third of the butter.
  -- An unknown unit gets flagged; a confidently wrong one ruins the dish.
  ('tbsp',  'tablespoon'),  ('tbsp',  'tablespoons'), ('tbsp',  'tbsps'),
  ('tbsp',  'tbs'),         ('tbsp',  'tbsp.'),       ('tbsp',  'tablespoonful'),
  ('cup',   'cups'),        ('cup',   'cp'),          ('cup',   'c'),
  ('ml',    'milliliter'),  ('ml',    'milliliters'), ('ml',    'millilitre'),
  ('l',     'liter'),       ('l',     'liters'),      ('l',     'litre'),
  ('fl oz', 'fluid ounce'), ('fl oz', 'fluid ounces'),('fl oz', 'floz'),
  ('fl oz', 'fl. oz.'),     ('fl oz', 'fl oz.'),
  ('pt',    'pint'),        ('pt',    'pints'),
  ('qt',    'quart'),       ('qt',    'quarts'),
  ('gal',   'gallon'),      ('gal',   'gallons'),
  -- mass
  ('g',     'gram'),        ('g',     'grams'),       ('g',     'gm'),
  ('kg',    'kilogram'),    ('kg',    'kilograms'),
  ('oz',    'ounce'),       ('oz',    'ounces'),      ('oz',    'oz.'),
  ('lb',    'pound'),       ('lb',    'pounds'),      ('lb',    'lbs'),
  ('lb',    'lb.'),         ('lb',    'lbs.'),
  -- count
  ('clove',   'cloves'),
  ('head',    'heads'),
  ('stalk',   'stalks'),
  ('fillet',  'fillets'),   ('fillet',  'filet'),     ('fillet', 'filets'),
  ('can',     'cans'),
  ('bunch',   'bunches'),
  ('piece',   'pieces'),
  ('slice',   'slices'),
  ('portion', 'portions'),  ('portion', 'serving'),   ('portion', 'servings')
) as a(unit_name, alias)
join units u on u.name = a.unit_name
on conflict (alias) do nothing;

-- ---------------------------------------------------------------------------
-- resolve_unit(raw) -- the units counterpart of resolve_ingredient().
--
-- Exact on the canonical name, then exact on an alias, then the singularised
-- form of each. No fuzzy tier on purpose: units are a small CLOSED vocabulary,
-- and a trigram guess between "tsp" and "tbsp" -- three characters apart, a
-- threefold difference in the kitchen -- is a silent recipe-ruining error.
-- Unknown units return zero rows so the importer can flag them.
-- ---------------------------------------------------------------------------
create or replace function resolve_unit(raw_unit text)
returns table (unit_id integer, unit_name citext, kind unit_kind)
language plpgsql
stable
parallel safe
as $$
declare
  probe   text := normalize_ingredient_name(raw_unit);
  probe_s text;
begin
  if probe is null then
    return;
  end if;

  probe_s := singularize_ingredient_name(probe);

  return query
    select u.id, u.name, u.kind
    from units u
    where normalize_ingredient_name(u.name::text) in (probe, probe_s)
    limit 1;
  if found then return; end if;

  return query
    select u.id, u.name, u.kind
    from unit_aliases a
    join units u on u.id = a.unit_id
    where normalize_ingredient_name(a.alias::text) in (probe, probe_s)
    limit 1;
end;
$$;

comment on function resolve_unit(text) is
  'Resolve a parsed unit string to a canonical unit. Zero rows means unknown -- '
  'the importer must flag it, never guess. No fuzzy matching: tsp/tbsp are three '
  'characters apart and threefold different in the kitchen.';

commit;
