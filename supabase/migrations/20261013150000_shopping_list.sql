-- Wave 6 / shopping list (BUILD-PLAN v1.1).
--
-- One table of RAW lines (one row per recipe ingredient added), owner-only.
-- Merging "2 cloves + 3 cloves = 5 cloves" happens when the list is READ, not
-- when it is written: raw rows keep the source recipe, so removing a recipe or
-- re-adding it at another serving count is a delete + insert, never arithmetic
-- on a merged number.
--
-- Two SECURITY INVOKER functions do the writes atomically. Invoker, not
-- definer: they run as the caller, so the RLS below is the only gate and there
-- is no privileged path to get wrong.
--
-- Deliberately no `SET pg_trgm.*` and nothing superuser-only: the snapshot
-- runs as superuser and hides privilege errors that live does not.

create table shopping_list_items (
  id               bigint  generated always as identity primary key,
  user_id          uuid    not null references profiles    (id) on delete cascade,
  ingredient_id    integer not null references ingredients (id) on delete restrict,
  quantity         numeric check (quantity > 0),             -- NULL = "to taste"
  unit_id          integer references units (id) on delete restrict,
  source_recipe_id uuid    references recipes (id) on delete set null,
  checked          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint shopping_unit_needs_quantity check (unit_id is null or quantity is not null)
);

comment on table shopping_list_items is
  'Raw shopping lines, owner-only. Merged across recipes at read time (src/lib/shopping.ts), never stored merged.';

create index shopping_list_items_user_idx   on shopping_list_items (user_id, created_at);
create index shopping_list_items_recipe_idx on shopping_list_items (source_recipe_id);

alter table shopping_list_items enable row level security;

create policy "users read their own shopping items" on shopping_list_items
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Like favourites: the recipe must be readable, or adding is an oracle for
-- which draft recipe ids exist.
create policy "users add their own shopping items" on shopping_list_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (source_recipe_id is null or can_read_recipe(source_recipe_id))
  );

create policy "users tick their own shopping items" on shopping_list_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users remove their own shopping items" on shopping_list_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Defence in depth: Supabase default privileges grant everything on new
-- tables to anon/authenticated. Signed-out users get nothing, and the only
-- column a signed-in user may change in place is `checked`.
revoke all on shopping_list_items from anon, authenticated;
grant select, insert, delete on shopping_list_items to authenticated;
grant update (checked) on shopping_list_items to authenticated;

-- A list this long is a bug or abuse, not a shopping trip.
create function shopping_list_cap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from shopping_list_items where user_id = new.user_id) >= 500 then
    raise exception 'shopping list is full (500 items)' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger shopping_list_cap_trg
  before insert on shopping_list_items
  for each row execute function shopping_list_cap();

-- ---------------------------------------------------------------------------
-- add_recipe_to_shopping_list(recipe, servings, skip_staples, have_ids)
--
-- Adds every ingredient of a recipe, scaled to `p_servings`. Re-adding the
-- same recipe REPLACES its earlier lines (so a double tap is harmless, and
-- changing the serving count and tapping again updates instead of doubling).
-- Skips pantry staples when asked, and anything the caller already has: an id
-- in `p_have_ids` covers itself and its family variants, the same rule
-- match_recipes uses.
-- NULL-safe on purpose: family_id is NULL for most ingredients, and
-- `NOT (false OR NULL)` is NULL, which would silently drop every such row.
-- Returns {added, skipped_staples, skipped_have: [names]}.
-- ---------------------------------------------------------------------------
create function add_recipe_to_shopping_list(
  p_recipe_id    uuid,
  p_servings     integer,
  p_skip_staples boolean default true,
  p_have_ids     integer[] default '{}'
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  uid        uuid := (select auth.uid());
  base       integer;
  have       integer[] := coalesce(p_have_ids, '{}');
  n_added    integer := 0;
  n_staples  integer := 0;
  have_names text[] := '{}';
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_servings is null or p_servings < 1 or p_servings > 48 then
    raise exception 'servings must be 1-48' using errcode = '22023';
  end if;
  if cardinality(have) > 200 then
    raise exception 'too many fridge ids' using errcode = '22023';
  end if;

  select r.servings into base from recipes r where r.id = p_recipe_id;
  if base is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;

  delete from shopping_list_items
   where user_id = uid and source_recipe_id = p_recipe_id;

  select coalesce(array_agg(i.canonical_name::text order by ri.sort_order), '{}')
    into have_names
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
   where ri.recipe_id = p_recipe_id
     and not (p_skip_staples and i.is_pantry_staple)
     and (ri.ingredient_id = any (have) or coalesce(i.family_id = any (have), false));

  select count(*) into n_staples
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
   where ri.recipe_id = p_recipe_id and p_skip_staples and i.is_pantry_staple;

  insert into shopping_list_items (user_id, ingredient_id, quantity, unit_id, source_recipe_id)
  select uid,
         ri.ingredient_id,
         case when ri.quantity is null then null
              else round(ri.quantity * p_servings / base::numeric, 4) end,
         case when ri.quantity is null then null else ri.unit_id end,
         p_recipe_id
    from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
   where ri.recipe_id = p_recipe_id
     and not (p_skip_staples and i.is_pantry_staple)
     and not (ri.ingredient_id = any (have) or coalesce(i.family_id = any (have), false))
   order by ri.sort_order;
  get diagnostics n_added = row_count;

  return jsonb_build_object(
    'added', n_added,
    'skipped_staples', n_staples,
    'skipped_have', to_jsonb(have_names)
  );
end;
$$;

comment on function add_recipe_to_shopping_list(uuid, integer, boolean, integer[]) is
  'Adds a recipe''s ingredients, scaled, to the caller''s list; replaces that recipe''s earlier lines. SECURITY INVOKER: RLS is the gate.';

revoke all on function add_recipe_to_shopping_list(uuid, integer, boolean, integer[]) from public, anon;
grant execute on function add_recipe_to_shopping_list(uuid, integer, boolean, integer[]) to authenticated;

-- ---------------------------------------------------------------------------
-- import_local_shopping_list(items)
--
-- The signed-out list lives in localStorage; on sign-in the browser hands it
-- over once. Untrusted input, so every field is validated here: unknown
-- ingredients, units and recipes are dropped (never errors), quantities must be
-- positive, and at most 300 lines are taken. Lines for a recipe already on the
-- account list replace it (same rule as above). Returns the number inserted.
--
-- items: [{ingredient_id, quantity|null, unit|null, recipe_slug|null, checked}]
-- ---------------------------------------------------------------------------
create function import_local_shopping_list(p_items jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  uid    uuid := (select auth.uid());
  parsed jsonb;
  n      integer := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ingredient_id', i.id,
           'quantity', q.quantity,
           'unit_id', case when q.quantity is null then null else u.id end,
           'recipe_id', r.id,
           'checked', coalesce((src.e ->> 'checked') = 'true', false)
         ) order by src.ord), '[]'::jsonb)
    into parsed
    from (select e, ord
            from jsonb_array_elements(p_items) with ordinality t(e, ord)
           where jsonb_typeof(e) = 'object'
           order by ord
           limit 300) src
    join ingredients i
      on (src.e ->> 'ingredient_id') ~ '^[0-9]{1,9}$'
     and i.id = (src.e ->> 'ingredient_id')::integer
    left join lateral (
      select round((src.e ->> 'quantity')::numeric, 4) as quantity
       where jsonb_typeof(src.e -> 'quantity') = 'number'
         and (src.e ->> 'quantity')::numeric > 0
         and (src.e ->> 'quantity')::numeric < 100000
    ) q on true
    left join units u
      on jsonb_typeof(src.e -> 'unit') = 'string'
     and u.name = (src.e ->> 'unit')::citext
    left join recipes r
      on jsonb_typeof(src.e -> 'recipe_slug') = 'string'
     and r.slug = src.e ->> 'recipe_slug'
     and can_read_recipe(r.id);

  delete from shopping_list_items
   where user_id = uid
     and source_recipe_id in (
       select (x ->> 'recipe_id')::uuid
         from jsonb_array_elements(parsed) x
        where x ->> 'recipe_id' is not null
     );

  insert into shopping_list_items (user_id, ingredient_id, quantity, unit_id, source_recipe_id, checked)
  select uid, x.ingredient_id, x.quantity, x.unit_id, x.recipe_id, x.checked
    from jsonb_to_recordset(parsed)
         as x(ingredient_id integer, quantity numeric, unit_id integer, recipe_id uuid, checked boolean);
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function import_local_shopping_list(jsonb) is
  'One-shot merge of the signed-out (localStorage) list into the account on sign-in. Validates everything; drops what it does not recognise.';

revoke all on function import_local_shopping_list(jsonb) from public, anon;
grant execute on function import_local_shopping_list(jsonb) to authenticated;
