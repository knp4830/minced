-- Tests for 20261017150000_me_food_nutrient_snapshot.sql and 20261017150100_recipe_ingredient_foods.sql.
-- Needs the nutrition tables, so run it on a throwaway database that has the wave 10 schema (the real one,
-- or supabase/tests/nutrition_ui_fixture.sql), NEVER on live. Everything runs in one transaction and is
-- rolled back. Each check raises on failure; a final NOTICE says it finished.
--
--   psql ... -v ON_ERROR_STOP=1 -f supabase/tests/recipe_ingredient_foods_test.sql

begin;

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
end $$;

-- Two users, one recipe each, one line "soy sauce" (ingredient 8) per recipe.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@example.test');
update feature_flags set enabled = true where name = 'user_recipes';

insert into recipes (id, slug, title, author_id, status, servings, source_name, source_license)
values
  ('10000000-0000-0000-0000-0000000000a1', 'tfoods-a', 'A recipe', '00000000-0000-0000-0000-0000000000a1', 'draft', 2, 'User submission', 'user-submitted'),
  ('10000000-0000-0000-0000-0000000000b2', 'tfoods-b', 'B recipe', '00000000-0000-0000-0000-0000000000b2', 'draft', 2, 'User submission', 'user-submitted');
insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, sort_order) values
  ('10000000-0000-0000-0000-0000000000a1', 8, 2, 8, 0),
  ('10000000-0000-0000-0000-0000000000a1', 3617, 1, 9, 1),
  ('10000000-0000-0000-0000-0000000000b2', 8, 2, 8, 0);

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  ra uuid := '10000000-0000-0000-0000-0000000000a1';
  rb uuid := '10000000-0000-0000-0000-0000000000b2';
  got integer;
  j jsonb;
begin
  -- 1. The owner attaches a food that really belongs to the line's ingredient.
  perform pg_temp.as_user(a);
  perform set_my_recipe_foods(ra, '[{"pos":0,"fdc_id":900002}]'::jsonb);
  reset role;
  select fdc_id into got from recipe_ingredients where recipe_id = ra and sort_order = 0;
  if got is distinct from 900002 then raise exception 'FAIL 1: brand not attached (got %)', got; end if;

  -- 2. A food of a DIFFERENT ingredient is silently not attached (line 1 is rice; 900002 is a soy sauce).
  perform pg_temp.as_user(a);
  perform set_my_recipe_foods(ra, '[{"pos":0,"fdc_id":900002},{"pos":1,"fdc_id":900002}]'::jsonb);
  reset role;
  select fdc_id into got from recipe_ingredients where recipe_id = ra and sort_order = 1;
  if got is not null then raise exception 'FAIL 2: unrelated food attached to the rice line (got %)', got; end if;

  -- 3. Picking again replaces the earlier pick (an empty list clears it).
  perform pg_temp.as_user(a);
  perform set_my_recipe_foods(ra, '[]'::jsonb);
  reset role;
  select fdc_id into got from recipe_ingredients where recipe_id = ra and sort_order = 0;
  if got is not null then raise exception 'FAIL 3: empty picks did not clear the food (got %)', got; end if;

  -- 4. Someone else's recipe: refused as not found, and nothing changes.
  perform pg_temp.as_user(b);
  begin
    perform set_my_recipe_foods(ra, '[{"pos":0,"fdc_id":900002}]'::jsonb);
    raise exception 'FAIL 4: another user could set foods on my recipe';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    perform my_recipe_foods(ra);
    raise exception 'FAIL 4b: another user could read my recipe foods';
  exception when sqlstate 'P0002' then null;
  end;
  reset role;

  -- 5. Bad payloads are rejected, not coerced.
  perform pg_temp.as_user(a);
  begin
    perform set_my_recipe_foods(ra, '{"pos":0}'::jsonb);
    raise exception 'FAIL 5: an object was accepted as picks';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform set_my_recipe_foods(ra, '[{"pos":"x","fdc_id":1}]'::jsonb);
    raise exception 'FAIL 5b: a non-numeric position was accepted';
  exception when sqlstate '22023' then null;
  end;
  reset role;

  -- 6. The read side returns what was set, with the brand for display.
  perform pg_temp.as_user(a);
  perform set_my_recipe_foods(ra, '[{"pos":0,"fdc_id":900002}]'::jsonb);
  j := my_recipe_foods(ra);
  reset role;
  if jsonb_array_length(j) <> 1 or (j -> 0 ->> 'fdc_id')::integer <> 900002 or (j -> 0 ->> 'brand') <> 'Fixturemann' then
    raise exception 'FAIL 6: my_recipe_foods returned %', j;
  end if;

  -- 7. Signed out and the switch off are both refused.
  set local role anon;
  begin
    perform set_my_recipe_foods(ra, '[]'::jsonb);
    raise exception 'FAIL 7: anon could call set_my_recipe_foods';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update feature_flags set enabled = false where name = 'user_recipes';
  perform pg_temp.as_user(a);
  begin
    perform set_my_recipe_foods(ra, '[]'::jsonb);
    raise exception 'FAIL 7b: the switch was off but the call worked';
  exception when sqlstate '42501' then null;
  end;
  reset role;
  update feature_flags set enabled = true where name = 'user_recipes';

  -- 8. The refresh hook ran (the fixture's stand-in logs each call; the real function recomputes).
  if to_regclass('fixture_refresh_log') is not null then
    select count(*) into got from fixture_refresh_log where recipe_id = ra;
    if got < 1 then raise exception 'FAIL 8: refresh_recipe_nutrients was not called'; end if;
  end if;

  -- 9. The diary snapshot column: object only, size-capped, and owner-only like the rest of the row.
  insert into me_targets (user_id, sex, age_years, height_cm, weight_kg, units, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g)
  values (a, 'male', 30, 180, 80, 'metric', 2, 'maintain', 0, 2400, 150, 270, 80),
         (b, 'male', 30, 180, 80, 'metric', 2, 'maintain', 0, 2400, 150, 270, 80);
  perform pg_temp.as_user(a);
  insert into me_food_log (user_id, log_date, meal, name, calories, nutrients)
  values (a, current_date, 'lunch', 'ok', 100, '{"calcium_mg": 12.5}'::jsonb);
  begin
    insert into me_food_log (user_id, log_date, meal, name, calories, nutrients)
    values (a, current_date, 'lunch', 'bad', 100, '[1,2]'::jsonb);
    raise exception 'FAIL 9: an array was accepted as a nutrient snapshot';
  exception when check_violation then null;
  end;
  begin
    insert into me_food_log (user_id, log_date, meal, name, calories, nutrients)
    values (a, current_date, 'lunch', 'big', 100, jsonb_build_object('k', repeat('x', 5000)));
    raise exception 'FAIL 9b: an oversized snapshot was accepted';
  exception when check_violation then null;
  end;
  perform pg_temp.as_user(b);
  select count(*) into got from me_food_log where name = 'ok';
  if got <> 0 then raise exception 'FAIL 9c: user b can read user a diary rows'; end if;
  reset role;

  raise notice 'recipe_ingredient_foods_test: all checks passed';
end $$;

rollback;
