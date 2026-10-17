-- Wave 10 nutrition tables: RLS and grants. Self-contained, rolls back.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/nutrition_rls_test.sql
--
-- Cases: reference tables are readable and NOT writable by anon/authenticated (INSERT, UPDATE,
-- DELETE, TRUNCATE each); recipe_nutrients follows recipe visibility (published to everyone, a draft
-- only to its author) and is not writable; the writers (refresh_*) are not callable by clients while
-- the pure compute functions and search_foods are; the QA view is not readable by clients.
--
-- The snapshot dump has no Supabase default grants (LESSONS section 2): the grants below, made inside this
-- rolled-back transaction, stand in for them so the reads under test are not blocked by an unrelated table.

begin;

grant usage on schema public to anon, authenticated;
grant select on recipes, recipe_ingredients, ingredients, units, ingredient_aliases, ingredient_shelf_life to anon, authenticated;
grant select on recipes to authenticated;

insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-00000000a001', 'nutri-a@example.test'),
  ('eeeeeeee-0000-0000-0000-00000000b001', 'nutri-b@example.test')
on conflict (id) do nothing;
insert into profiles (id) values ('eeeeeeee-0000-0000-0000-00000000a001'), ('eeeeeeee-0000-0000-0000-00000000b001') on conflict (id) do nothing;

insert into recipes (id, slug, title, servings, status, author_id) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'fixture-nrls-published', 'pub', 1, 'published', null),
  ('eeeeeeee-1111-0000-0000-000000000002', 'fixture-nrls-draft-a',   'dra', 1, 'draft', 'eeeeeeee-0000-0000-0000-00000000a001');
insert into recipe_nutrients (recipe_id, nutrient_id, amount_per_serving, coverage) values
  ('eeeeeeee-1111-0000-0000-000000000001', 1, 100, 1),
  ('eeeeeeee-1111-0000-0000-000000000002', 1, 200, 1);
insert into usda_foods (fdc_id, description, data_type) values (990101, 'FIXTURE rls food', 'sr_legacy');

create function pg_temp.denied(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;                       -- it ran: not denied
exception when insufficient_privilege then return true;
         when others then return false;
end $$;
grant execute on function pg_temp.denied(text) to anon, authenticated;

-- ---------------------------------------------------------------- reference tables: readable, never writable
do $$
declare t text; role_name text; n bigint;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('set local role %I', role_name);
    foreach t in array array['nutrients', 'nutrient_conversions', 'usda_foods', 'usda_food_nutrients', 'ingredient_foods',
                             'ingredient_portions', 'prep_rules', 'added_sugar_ingredients'] loop
      execute format('select count(*) from %I', t) into n;     -- must not raise
      if pg_temp.denied(format('insert into %I default values', t)) is not true then
        raise exception 'FAILED: % may INSERT into %', role_name, t; end if;
      if pg_temp.denied(format('update %I set %s = %s where false', t,
            (select a.attname from pg_attribute a where a.attrelid = t::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum desc limit 1),
            (select a.attname from pg_attribute a where a.attrelid = t::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum desc limit 1))) is not true then
        raise exception 'FAILED: % may UPDATE %', role_name, t; end if;
      if pg_temp.denied(format('delete from %I where false', t)) is not true then
        raise exception 'FAILED: % may DELETE from %', role_name, t; end if;
      if pg_temp.denied(format('truncate %I', t)) is not true then
        raise exception 'FAILED: % may TRUNCATE %', role_name, t; end if;
    end loop;
    if (select count(*) from nutrients) <> 38 then raise exception 'FAILED: % sees % nutrients (want 38)', role_name, (select count(*) from nutrients); end if;
    reset role;
  end loop;
  raise notice 'ok reference tables read-only';
end $$;

-- ---------------------------------------------------------------- recipe_nutrients follows recipe visibility
do $$
begin
  set local role anon;
  if (select count(*) from recipe_nutrients where recipe_id::text like 'eeeeeeee-1111%') <> 1 then
    raise exception 'FAILED: anon should see exactly the published recipe''s rows'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-00000000b001', true);   -- user B
  set local role authenticated;
  if (select count(*) from recipe_nutrients where recipe_id = 'eeeeeeee-1111-0000-0000-000000000002') <> 0 then
    raise exception 'FAILED: B can read A''s draft nutrients'; end if;
  if pg_temp.denied('insert into recipe_nutrients (recipe_id, nutrient_id, amount_per_serving, coverage) values (''eeeeeeee-1111-0000-0000-000000000001'', 2, 1, 1)') is not true then
    raise exception 'FAILED: authenticated may insert recipe_nutrients'; end if;
  if pg_temp.denied('update recipe_nutrients set amount_per_serving = 0') is not true then
    raise exception 'FAILED: authenticated may update recipe_nutrients'; end if;
  if pg_temp.denied('delete from recipe_nutrients') is not true then
    raise exception 'FAILED: authenticated may delete recipe_nutrients'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-00000000a001', true);   -- user A, the author
  set local role authenticated;
  if (select count(*) from recipe_nutrients where recipe_id = 'eeeeeeee-1111-0000-0000-000000000002') <> 1 then
    raise exception 'FAILED: the author cannot read their own draft nutrients'; end if;
  reset role;
  raise notice 'ok recipe_nutrients visibility';
end $$;

-- ---------------------------------------------------------------- functions
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('set local role %I', role_name);
    if pg_temp.denied('select refresh_recipe_nutrients(''eeeeeeee-1111-0000-0000-000000000001'')') is not true then
      raise exception 'FAILED: % may call refresh_recipe_nutrients', role_name; end if;
    if pg_temp.denied('select refresh_all_recipe_nutrients()') is not true then
      raise exception 'FAILED: % may call refresh_all_recipe_nutrients', role_name; end if;
    if pg_temp.denied('select * from nutrition_calorie_check') is not true then
      raise exception 'FAILED: % may read nutrition_calorie_check', role_name; end if;
    -- clients may preview a draft and use the type-ahead
    perform * from compute_nutrients('[]'::jsonb, 1);
    perform * from nutrition_summary('[]'::jsonb);
    perform * from nutrition_line_report('[]'::jsonb);
    perform * from search_foods('soy', 5);
    reset role;
  end loop;
  -- the recipe a refresh would have changed is untouched
  if (select nutrition_status from recipes where id = 'eeeeeeee-1111-0000-0000-000000000001') is not null then
    raise exception 'FAILED: a denied refresh changed the recipe'; end if;
  -- the trigger helper is not callable by clients
  set local role authenticated;
  if pg_temp.denied('select trg_ingredient_foods_one_default()') is not true then
    raise exception 'FAILED: trigger function callable by authenticated'; end if;
  reset role;
  raise notice 'ok function privileges';
end $$;

-- ---------------------------------------------------------------- an oversized preview cannot be used to burn the database
do $$
begin
  set local role anon;
  begin
    perform * from nutrition_line_report((select jsonb_agg('{"ingredient_id":1,"quantity":1}'::jsonb) from generate_series(1, 5000)));
    raise exception 'FAILED: 5000-line preview accepted';
  exception when sqlstate '22023' then null; end;
  reset role;
  raise notice 'ok preview size cap';
end $$;

rollback;
