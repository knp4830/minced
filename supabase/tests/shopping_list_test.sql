-- Shopping list RLS + function regression (wave 6).
--
-- Runs against a THROWAWAY database (snapshot container or local stack), never
-- live. It creates two users and cleans up after itself. Each check prints
-- "ok" or "FAIL <what>"; the final line counts failures.
--
--   docker exec -i <container> psql -U postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/shopping_list_test.sql
--
-- Needs: the migration applied, roles anon/authenticated, auth.uid() reading
-- request.jwt.claim.sub, and the seed recipes shakshuka and chana-masala.
-- It switches to the `authenticated` / `anon` ROLES (not superuser) so that
-- privilege and RLS errors are real.

\set ON_ERROR_STOP off
create temp table _res (ok boolean, what text);
grant all on _res to public;

-- Users. On a snapshot auth.users is a stub with (id, email); on a Supabase
-- stack it has more columns. Insert only what both have.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'shop-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'shop-b@example.test')
on conflict (id) do nothing;
insert into profiles (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002')
on conflict (id) do nothing;

-- A bare snapshot has no Supabase default privileges; give the API roles the
-- read access the real project has on reference tables (NOT on the new one).
grant usage on schema public, auth to anon, authenticated;
grant select on recipes, recipe_ingredients, ingredients, units, profiles to anon, authenticated;
select min(id) as ing_id from ingredients \gset

create or replace function pg_temp.check(cond boolean, what text) returns void
language sql as $$ insert into _res values (coalesce(cond, false), what) $$;

-- ---- A adds shakshuka at 6 servings (base 3 => quantities double) ----
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

select pg_temp.check(
  (add_recipe_to_shopping_list((select id from recipes where slug = 'shakshuka'), 6, true, '{}') ->> 'added')::int > 0,
  'A adds shakshuka');
select pg_temp.check(
  (select count(*) from shopping_list_items) = (select count(*) from shopping_list_items where source_recipe_id = (select id from recipes where slug = 'shakshuka')),
  'A sees only its rows');

-- Scaling: every stored quantity is twice the recipe's.
select pg_temp.check(
  (select bool_and(s.quantity = round(ri.quantity * 2, 4))
     from shopping_list_items s
     join recipe_ingredients ri on ri.ingredient_id = s.ingredient_id
      and ri.recipe_id = s.source_recipe_id
    where ri.quantity is not null),
  'quantities scale x2 at 6 servings of a 3-serving recipe');

-- Re-adding replaces, it does not double.
select count(*) as before_n from shopping_list_items \gset
select add_recipe_to_shopping_list((select id from recipes where slug = 'shakshuka'), 6, true, '{}');
select pg_temp.check((select count(*) from shopping_list_items) = :before_n, 're-adding replaces, no doubling');

-- Staples: skipping removes them; including them adds them.
select pg_temp.check(
  not exists (select 1 from shopping_list_items s join ingredients i on i.id = s.ingredient_id where i.is_pantry_staple),
  'staples skipped by default');
select add_recipe_to_shopping_list((select id from recipes where slug = 'shakshuka'), 6, false, '{}');
select pg_temp.check(
  exists (select 1 from shopping_list_items s join ingredients i on i.id = s.ingredient_id where i.is_pantry_staple),
  'staples included when asked');

-- Fridge ids are subtracted and reported.
select ingredient_id as egg_id from recipe_ingredients
 where recipe_id = (select id from recipes where slug = 'shakshuka')
   and ingredient_id in (select id from ingredients where not is_pantry_staple)
 order by sort_order limit 1 \gset
select (add_recipe_to_shopping_list((select id from recipes where slug = 'shakshuka'), 3, true, array[:egg_id]) -> 'skipped_have') as skipped \gset
select pg_temp.check(jsonb_array_length(:'skipped'::jsonb) = 1, 'fridge ingredient reported as skipped');
select pg_temp.check(not exists (select 1 from shopping_list_items where ingredient_id = :egg_id), 'fridge ingredient not added');
-- Regression: a fridge id must not drop rows whose family_id is NULL (NOT (false OR NULL) is NULL).
select pg_temp.check(
  (select count(*) from shopping_list_items)
    = (select count(*) from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id
        where ri.recipe_id = (select id from recipes where slug = 'shakshuka')
          and not i.is_pantry_staple and ri.ingredient_id <> :egg_id and coalesce(i.family_id, 0) <> :egg_id),
  'fridge subtraction removes only the covered ingredient');

-- Validation.
do $$ begin
  perform add_recipe_to_shopping_list((select id from recipes where slug = 'shakshuka'), 99);
  insert into _res values (false, 'servings 99 should be rejected');
exception when others then insert into _res values (true, 'servings 99 rejected');
end $$;

-- Tick: only `checked` is updatable.
update shopping_list_items set checked = true;
select pg_temp.check((select count(*) from shopping_list_items where not checked) = 0, 'A can tick');
do $$ begin
  update shopping_list_items set quantity = 999;
  insert into _res values (false, 'A must not edit quantity');
exception when insufficient_privilege then insert into _res values (true, 'A cannot edit quantity (column grant)');
end $$;
do $$ begin
  update shopping_list_items set user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  insert into _res values (false, 'A must not reassign user_id');
exception when insufficient_privilege then insert into _res values (true, 'A cannot reassign user_id');
end $$;

-- Cannot insert as someone else.
do $$ begin
  insert into shopping_list_items (user_id, ingredient_id) values ('bbbbbbbb-0000-0000-0000-000000000002', (select id from ingredients limit 1));
  insert into _res values (false, 'A must not insert as B');
exception when others then insert into _res values (true, 'A cannot insert as B');
end $$;

-- Import: validates, drops junk, caps.
select import_local_shopping_list(replace('[
  {"ingredient_id": :ing_id, "quantity": 2, "unit": "tbsp", "recipe_slug": "chana-masala", "checked": true},
  {"ingredient_id": 999999, "quantity": 1},
  {"ingredient_id": "x"},
  {"ingredient_id": :ing_id, "quantity": -4, "unit": "cup"},
  {"ingredient_id": :ing_id, "quantity": 3, "unit": "nonsense-unit"},
  "junk", 7, null
]', ':ing_id', :'ing_id')::jsonb) as imported \gset
select pg_temp.check(:imported = 3, 'import keeps 3 valid lines, drops junk (got ' || :imported || ')');
select pg_temp.check(
  (select count(*) from shopping_list_items where quantity is null and unit_id is null and ingredient_id = :ing_id) = 1,
  'negative quantity becomes to-taste, unit dropped');
select pg_temp.check(import_local_shopping_list('"not an array"'::jsonb) = 0, 'non-array import is a no-op');

-- ---- B sees nothing of A's, changes nothing ----
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) from shopping_list_items) = 0, 'B reads zero of A''s rows');
update shopping_list_items set checked = false;
delete from shopping_list_items;
reset role;
select pg_temp.check(
  (select count(*) from shopping_list_items where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') > 0,
  'B update/delete touched none of A''s rows');
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  insert into shopping_list_items (user_id, ingredient_id) values ('aaaaaaaa-0000-0000-0000-000000000001', (select id from ingredients limit 1));
  insert into _res values (false, 'B must not insert as A');
exception when others then insert into _res values (true, 'B cannot insert as A');
end $$;

-- ---- anon: no table access, no function access ----
reset role;
set role anon;
do $$ begin
  perform count(*) from shopping_list_items;
  insert into _res values (false, 'anon must not read');
exception when insufficient_privilege then insert into _res values (true, 'anon cannot read the table');
end $$;
do $$ begin
  perform add_recipe_to_shopping_list((select id from recipes limit 1), 2);
  insert into _res values (false, 'anon must not call add');
exception when insufficient_privilege then insert into _res values (true, 'anon cannot call add_recipe_to_shopping_list');
end $$;
do $$ begin
  perform import_local_shopping_list('[]'::jsonb);
  insert into _res values (false, 'anon must not call import');
exception when insufficient_privilege then insert into _res values (true, 'anon cannot call import_local_shopping_list');
end $$;

-- ---- cap: 500 rows ----
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
delete from shopping_list_items;
insert into shopping_list_items (user_id, ingredient_id)
  select 'aaaaaaaa-0000-0000-0000-000000000001', (select min(id) from ingredients) from generate_series(1, 500);
do $$ begin
  insert into shopping_list_items (user_id, ingredient_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', (select min(id) from ingredients));
  insert into _res values (false, '501st row must be refused');
exception when others then insert into _res values (true, '501st row refused');
end $$;

-- ---- cleanup + report ----
reset role;
delete from profiles where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
delete from auth.users where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from shopping_list_items) = 0, 'cleanup cascades to shopping items');

select case when ok then 'ok   ' else 'FAIL ' end || what as result from _res;
select count(*) filter (where not ok) as failures from _res;
