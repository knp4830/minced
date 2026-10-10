-- Wave 2 / matcher quality -- ingredient families and a wider staple set.
--
-- PROBLEM
--   A pantry holding "onion" missed every recipe that wrote "yellow onion", and
--   a pantry holding "rice" missed "brown rice". The vocabulary splits ingredients
--   a cook would happily swap (M1.5.1's splitting rule), but the matcher treated
--   the split as a hard wall.
--
-- MODEL: one level, parent -> children
--   ingredients.family_id points at a PARENT ingredient ("onion"). Children are
--   the specific variants ("yellow onion", "red onion"...). Exactly one level:
--   a parent has no family of its own, and a child has no children (trigger below).
--
--   Matching rule (implemented in expand_ingredient_family(), used by match_recipes):
--     recipe needs a CHILD   -> covered if the pantry holds the child OR its parent
--     recipe needs a PARENT  -> covered if the pantry holds the parent OR any child
--     recipe needs a CHILD, pantry holds a SIBLING -> NOT covered. Red onion is not
--       yellow onion; the user covers all of them by listing the parent ("onion").
--   The expansion is one hop from the ORIGINAL pantry, never transitive, which is
--   exactly what stops sibling-to-sibling leakage.
--
-- WHAT IS DELIBERATELY NOT A FAMILY
--   Cheeses (parmesan/pecorino/cheddar are not interchangeable), canned vs fresh
--   tomatoes (diced tomatoes is a different product), fresh vs dried herbs (the
--   M1.5.1 split is on purpose), tofu textures, dairy-vs-plant milks, citrus,
--   shallot/scallion (different alliums), sweet potato (not a potato here).

begin;

alter table ingredients
  add column family_id integer references ingredients(id) on delete set null,
  add constraint ingredients_family_not_self check (family_id is null or family_id <> id);

create index ingredients_family_idx on ingredients (family_id) where family_id is not null;

comment on column ingredients.family_id is
  'Parent ingredient of a family ("onion" for "yellow onion"). One level only. '
  'A pantry holding the parent covers every child; a pantry holding a child '
  'covers a recipe that names the parent. Siblings do not cover each other.';

-- Depth guard: CHECK constraints cannot look at other rows, so a trigger.
create function trg_ingredient_family_depth() returns trigger
language plpgsql as $$
begin
  if new.family_id is not null then
    if exists (select 1 from ingredients p where p.id = new.family_id and p.family_id is not null) then
      raise exception 'ingredient family is one level deep: % is itself a child', new.family_id;
    end if;
    if exists (select 1 from ingredients c where c.family_id = new.id) then
      raise exception 'ingredient % is a parent and cannot become a child', new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger ingredients_family_depth
  before insert or update of family_id on ingredients
  for each row execute function trg_ingredient_family_depth();

-- ---------------------------------------------------------------------------
-- Pantry expansion used by match_recipes
-- ---------------------------------------------------------------------------
-- Input ids -> input ids + their parents + their children. One hop from the
-- INPUT set (a UNION over the original array, not a recursive walk), so a child
-- brings its parent but never the parent's other children.
create function expand_ingredient_family(ids integer[])
returns integer[]
language sql
stable
parallel safe
as $$
  select coalesce(array_agg(distinct x), '{}')
  from (
    select unnest(coalesce(ids, '{}')) as x
    union
    select i.family_id from ingredients i
      where i.id = any (coalesce(ids, '{}')) and i.family_id is not null
    union
    select i.id from ingredients i
      where i.family_id = any (coalesce(ids, '{}'))
  ) s
  where x is not null;
$$;

comment on function expand_ingredient_family(integer[]) is
  'ids + parents of ids + children of ids (one hop, non-transitive). What a '
  'pantry covers once ingredient families are taken into account.';

-- ---------------------------------------------------------------------------
-- Family data
-- ---------------------------------------------------------------------------
-- Bare words used to be aliases pointing at one variant (onion -> yellow onion).
-- Now that "onion" is a real parent, those aliases would shadow nothing (exact
-- name wins) but read as lies, so they go. Imports of "1 onion" resolve to the
-- parent, which any onion in the pantry satisfies.
delete from ingredient_aliases
where alias in ('onion', 'rice', 'potato', 'bell pepper', 'lettuce', 'cabbage', 'white fish');

-- New parents (no existing generic row to reuse).
insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple) values
  ('onion',        'onion',        'Produce', false),
  ('rice',         'rice',         'Pantry',  false),
  ('bell pepper',  'bell-pepper',  'Produce', false),
  ('potato',       'potato',       'Produce', false),
  ('lettuce',      'lettuce',      'Produce', false),
  ('cabbage',      'cabbage',      'Produce', false),
  ('ground meat',  'ground-meat',  'Protein', false),
  ('white fish',   'white-fish',   'Protein', false)
on conflict (canonical_name) do nothing;

-- parent -> children. Parents that already existed as the generic row
-- (chicken, tomato, mushrooms, pasta, white beans, summer squash, breadcrumbs)
-- are reused rather than duplicated.
with fam(parent, child) as (values
  ('onion',        'yellow onion'), ('onion', 'red onion'), ('onion', 'white onion'), ('onion', 'sweet onion'),
  ('rice',         'white rice'), ('rice', 'brown rice'), ('rice', 'jasmine rice'),
  ('rice',         'basmati rice'), ('rice', 'short-grain rice'),
  ('chicken',      'chicken breast'), ('chicken', 'chicken thighs'), ('chicken', 'chicken drumsticks'),
  ('chicken',      'chicken wings'), ('chicken', 'whole chicken'), ('chicken', 'rotisserie chicken'),
  ('ground meat',  'ground beef'), ('ground meat', 'ground turkey'), ('ground meat', 'ground pork'),
  ('ground meat',  'ground chicken'), ('ground meat', 'ground lamb'),
  ('bell pepper',  'red bell pepper'), ('bell pepper', 'green bell pepper'), ('bell pepper', 'yellow bell pepper'),
  ('tomato',       'roma tomato'), ('tomato', 'cherry tomato'),
  ('potato',       'russet potato'), ('potato', 'red potato'), ('potato', 'yukon gold potato'),
  ('mushrooms',    'cremini mushrooms'), ('mushrooms', 'portobello mushrooms'),
  ('pasta',        'spaghetti'), ('pasta', 'angel hair'), ('pasta', 'linguine'), ('pasta', 'fettuccine'),
  ('pasta',        'penne'), ('pasta', 'rigatoni'), ('pasta', 'fusilli'), ('pasta', 'macaroni'),
  ('lettuce',      'romaine lettuce'), ('lettuce', 'iceberg lettuce'), ('lettuce', 'butter lettuce'),
  ('cabbage',      'green cabbage'), ('cabbage', 'red cabbage'),
  ('white beans',  'cannellini beans'), ('white beans', 'great northern beans'), ('white beans', 'navy beans'),
  ('summer squash','zucchini'), ('summer squash', 'yellow squash'),
  ('breadcrumbs',  'panko breadcrumbs'), ('breadcrumbs', 'seasoned breadcrumbs'),
  ('white fish',   'cod'), ('white fish', 'tilapia'), ('white fish', 'halibut'), ('white fish', 'pollock'),
  ('white fish',   'catfish'), ('white fish', 'walleye'), ('white fish', 'snapper')
),
resolved as (
  select p.id as parent_id, c.id as child_id, f.parent, f.child
  from   fam f
  left   join ingredients p on p.canonical_name = f.parent
  left   join ingredients c on c.canonical_name = f.child
)
-- A typo here must fail the migration, not silently skip a family member.
update ingredients i
set    family_id = (select r.parent_id from resolved r where r.child_id = i.id)
where  i.id in (select child_id from resolved where child_id is not null and parent_id is not null)
  and (select count(*) from resolved where parent_id is null or child_id is null) = 0;

do $$
declare n integer;
begin
  select count(*) into n from ingredients where family_id is not null;
  if n <> 57 then
    raise exception 'expected 57 family members, got % (a name in the family list does not resolve)', n;
  end if;
end $$;

-- Allergens must flow UP: a new import that says "white fish" resolves to the
-- parent, which would otherwise carry no fish allergen and slip past an
-- "exclude fish" filter. A parent carries the union of its children's allergens.
insert into ingredient_allergens (ingredient_id, allergen_id)
select distinct c.family_id, ia.allergen_id
from   ingredients c
join   ingredient_allergens ia on ia.ingredient_id = c.id
where  c.family_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Wider pantry staples ("never counts toward you're missing")
-- ---------------------------------------------------------------------------
-- Conservative: things most kitchens already hold and a recipe does not make you
-- shop for. Each is a judgement call, listed so it can be reverted by one UPDATE.
--   baking powder, baking soda   leavening that lasts a year; every baking recipe has it
--   vanilla extract              same, and recipes use a teaspoon
--   cooking spray                an oil by another name (oil is already a staple)
--   garlic powder, onion powder  the two seasonings in nearly every cupboard
--   dried oregano                the one dried herb that is effectively a staple
--   ground cinnamon              baking + oatmeal + curry; near-universal
--   black peppercorns            black pepper (already a staple) in whole form
--   white vinegar                the one vinegar for cleaning AND cooking
--   margarine                    butter (already a staple) by another name; used 66x
-- Left out on purpose: brown sugar, honey, soy sauce, cornstarch, other vinegars,
-- every other dried herb/spice, canola/vegetable oils are already staples.
update ingredients
set    is_pantry_staple = true
where  canonical_name in ('baking powder', 'baking soda', 'vanilla extract', 'cooking spray',
                          'garlic powder', 'onion powder', 'dried oregano', 'ground cinnamon',
                          'black peppercorns', 'white vinegar', 'margarine');

commit;
