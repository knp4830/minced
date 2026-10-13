-- Wave 6 / fridge with dates.
--
-- 1. fridge_items: a signed-in user's saved fridge, one row per ingredient,
--    with optional purchase / expiry dates. Owner-only (same shape as favorites).
-- 2. shelf_life_defaults + ingredient_shelf_life: suggested days-until-expiry,
--    stored as DATA so tuning is an UPDATE, not a deploy. Per-ingredient rows
--    win over the aisle default.
-- 3. suggested_shelf_life(ids): the lookup the app calls.
-- 4. recipe_expiry_days(...): "how soon does a recipe's ingredients expire",
--    family-aware, used to sort "Use these first" results.
--
-- No SET pg_trgm.*, no superuser-only statements: runs as the migration role.

begin;

-- ---------------------------------------------------------------------------
-- 1. fridge_items
-- ---------------------------------------------------------------------------

create table fridge_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid    not null references profiles (id) on delete cascade,
  ingredient_id integer not null references ingredients (id) on delete cascade,
  added_on      date    not null default current_date,
  purchased_on  date,
  expires_on    date,
  quantity      text check (char_length(quantity) <= 60),
  notes         text check (char_length(notes) <= 200),
  created_at    timestamptz not null default now(),
  -- One row per ingredient: the picker is a set, and this makes "save these
  -- ids" an idempotent upsert instead of a pile of duplicates.
  unique (user_id, ingredient_id)
);

comment on table fridge_items is
  'A signed-in user''s saved fridge. Owner-only. expires_on NULL means "no date" (never urgent).';

create index fridge_items_user_expiry_idx on fridge_items (user_id, expires_on nulls last);

alter table fridge_items enable row level security;

create policy "users read their own fridge" on fridge_items
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users add to their own fridge" on fridge_items
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users edit their own fridge" on fridge_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users remove from their own fridge" on fridge_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on fridge_items to authenticated;

-- A cap, so one account cannot grow the table without bound. Counts only the
-- caller's own rows (RLS already limits what an insert may name).
create function enforce_fridge_item_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.fridge_items where user_id = new.user_id) >= 150 then
    raise exception 'fridge is full (150 items)' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger fridge_items_limit
  before insert on fridge_items
  for each row execute function enforce_fridge_item_limit();

-- ---------------------------------------------------------------------------
-- 2. Shelf-life suggestions (data, not code)
-- ---------------------------------------------------------------------------

create table shelf_life_defaults (
  aisle_category text primary key check (
    aisle_category in ('Produce', 'Pantry', 'Dairy', 'Protein', 'Spices', 'Other')
  ),
  days integer not null check (days > 0),
  note  text
);

comment on table shelf_life_defaults is
  'Suggested days from purchase until an ingredient should be used, per aisle. A starting point the user overrides per item; not food-safety advice.';

create table ingredient_shelf_life (
  ingredient_id integer primary key references ingredients (id) on delete cascade,
  days integer not null check (days > 0),
  note text
);

comment on table ingredient_shelf_life is
  'Per-ingredient override of shelf_life_defaults (raw mince spoils faster than hard cheese; both are "Dairy"/"Protein" aisles).';

alter table shelf_life_defaults  enable row level security;
alter table ingredient_shelf_life enable row level security;

create policy "anyone reads shelf life defaults" on shelf_life_defaults
  for select to anon, authenticated using (true);
create policy "anyone reads ingredient shelf life" on ingredient_shelf_life
  for select to anon, authenticated using (true);

grant select on shelf_life_defaults, ingredient_shelf_life to anon, authenticated;

insert into shelf_life_defaults (aisle_category, days, note) values
  ('Produce', 6,   'Fresh fruit and vegetables: 5 to 7 days'),
  ('Dairy',   9,   'Milk, yogurt, cheese: 7 to 10 days'),
  ('Protein', 3,   'Raw meat, poultry and fish: 2 to 3 days'),
  ('Pantry',  180, 'Dry and canned goods'),
  ('Spices',  365, 'Dried spices'),
  ('Other',   30,  'Unsorted items');

insert into ingredient_shelf_life (ingredient_id, days, note)
select i.id, v.days, v.note
from (values
  ('spinach',        4,  'Leafy greens go first'),
  ('fresh basil',    5,  'Tender herbs wilt fast'),
  ('strawberries',   4,  'Berries'),
  ('blueberries',    7,  'Berries'),
  ('mushrooms',      5,  null),
  ('banana',         5,  null),
  ('carrot',         21, 'Root vegetables keep'),
  ('garlic',         60, null),
  ('sweet potato',   21, null),
  ('milk',           7,  null),
  ('parmesan',       30, 'Hard cheese keeps'),
  ('egg',            28, null),
  ('bacon',          7,  null),
  ('ground beef',    2,  'Mince spoils fastest'),
  ('ground turkey',  2,  'Mince spoils fastest'),
  ('chicken breast', 2,  null),
  ('salmon',         2,  null),
  ('shrimp',         2,  null)
) as v(name, days, note)
join ingredients i on i.canonical_name = v.name
on conflict (ingredient_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. suggested_shelf_life(ids) -> one row per id that has a suggestion
-- ---------------------------------------------------------------------------

create function suggested_shelf_life(ingredient_ids integer[])
returns table (ingredient_id integer, days integer)
language sql
stable
parallel safe
set search_path = public
as $$
  select i.id, coalesce(o.days, d.days)
  from   ingredients i
  left   join ingredient_shelf_life o on o.ingredient_id = i.id
  left   join shelf_life_defaults   d on d.aisle_category = i.aisle_category
  where  i.id = any (coalesce(ingredient_ids, '{}'))
    and  coalesce(o.days, d.days) is not null;
$$;

comment on function suggested_shelf_life(integer[]) is
  'Suggested days until use, per ingredient: the per-ingredient row if present, else the aisle default.';

grant execute on function suggested_shelf_life(integer[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. recipe_expiry_days: for each recipe, the soonest "days until expiry" among
--    the fridge items it uses. Family-aware, same rule as match_recipes: an item
--    covers its parent and its children. Recipes using none of the items are
--    absent from the result.
-- ---------------------------------------------------------------------------

create function recipe_expiry_days(recipe_ids uuid[], item_ids integer[], item_days integer[])
returns table (recipe_id uuid, days integer, items integer)
language sql
stable
parallel safe
set search_path = public
as $$
  with it as (
    select u.id, u.d
    from   unnest(coalesce(item_ids, '{}'), coalesce(item_days, '{}')) as u(id, d)
    where  u.id is not null and u.d is not null
  ),
  cover as (
    select it.id as item, it.d, unnest(expand_ingredient_family(array[it.id])) as ing
    from   it
  )
  select ri.recipe_id, min(c.d)::integer, count(distinct c.item)::integer
  from   recipe_ingredients ri
  join   cover c on c.ing = ri.ingredient_id
  where  ri.recipe_id = any (coalesce(recipe_ids, '{}'))
  group  by ri.recipe_id;
$$;

comment on function recipe_expiry_days(uuid[], integer[], integer[]) is
  'Per recipe: the soonest days-until-expiry among the given fridge items it uses, and how many of those items it uses (families expanded). Sorts "Use these first": soonest first, then more items used.';

grant execute on function recipe_expiry_days(uuid[], integer[], integer[]) to anon, authenticated;

commit;
