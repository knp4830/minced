-- Admin review queue (M1.5.6) regression. Runs in ONE transaction and rolls back.
-- Works against a throwaway Postgres with the migrations applied (it fakes the
-- JWT via request.jwt.claim.sub, which auth.uid() reads in the stub) AND against
-- the local Supabase stack (use the claims variant, see docs in the PR).
-- NEVER run against live: it inserts users.
--   docker exec -i <container> psql -v ON_ERROR_STOP=1 -U postgres < supabase/tests/admin_review_test.sql
-- Every check raises on failure; success prints "ALL PASS" at the end.
begin;

insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),   -- admin
  ('bbbbbbbb-0000-0000-0000-000000000002')    -- ordinary user
on conflict do nothing;
insert into profiles (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002')
on conflict do nothing;
insert into admins (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001');

-- The bare test container has no Supabase default grants; mimic them for the
-- tables the test touches (never for admins/recipe_reviews: their grants are
-- part of what is under test).
grant select, update on recipes, profiles to authenticated;
grant select on all tables in schema public to authenticated;

create temp table t_slugs as
  select slug from recipes where author_id is null and status = 'published' order by slug limit 3;
grant select on t_slugs to anon, authenticated;

create function pg_temp.expect_fail(sql text, want_code text) returns void language plpgsql as $$
declare got text;
begin
  begin
    execute sql;
    raise exception 'EXPECTED FAILURE DID NOT HAPPEN: %', sql using errcode = 'XX999';
  exception when others then
    get stacked diagnostics got = returned_sqlstate;
    if got = 'XX999' then raise; end if;
    if got <> want_code then raise exception 'wrong error % (want %) for %: %', got, want_code, sql, sqlerrm; end if;
  end;
end $$;
grant execute on function pg_temp.expect_fail(text, text) to anon, authenticated;

-- ---------------------------------------------------------------- anon
set local role anon;
select pg_temp.expect_fail('select * from admin_review_progress()', '42501');
select pg_temp.expect_fail('select admin_set_review(array[''x''], ''approved'')', '42501');
select pg_temp.expect_fail('select * from recipe_reviews', '42501');
select pg_temp.expect_fail('select * from admins', '42501');
select pg_temp.expect_fail('select is_admin()', '42501');
reset role;

-- ------------------------------------------------- ordinary signed-in user
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
do $$ begin
  if is_admin() then raise exception 'normal user is admin'; end if;
  if (select count(*) from admins) <> 0 then raise exception 'normal user can read admins'; end if;
  if (select count(*) from recipe_reviews) <> 0 then raise exception 'normal user can read reviews'; end if;
end $$;
select pg_temp.expect_fail('select * from admin_review_progress()', '42501');
select pg_temp.expect_fail('select * from admin_review_list()', '42501');
select pg_temp.expect_fail('select * from admin_review_neighbors(''x'')', '42501');
select pg_temp.expect_fail('select admin_recipe_detail(''shakshuka'')', '42501');
select pg_temp.expect_fail('select admin_set_review((select array_agg(slug) from t_slugs), ''rejected'')', '42501');
select pg_temp.expect_fail('select admin_update_recipe(''shakshuka'', ''hacked'')', '42501');
select pg_temp.expect_fail('select admin_assert()', '42501');
select pg_temp.expect_fail('insert into admins (user_id) values (''bbbbbbbb-0000-0000-0000-000000000002'')', '42501');
select pg_temp.expect_fail('insert into recipe_reviews (recipe_id, review_status) select id, ''approved'' from recipes limit 1', '42501');
do $$ declare n int; begin
  update recipes set title = 'pwn' where slug = (select min(slug) from t_slugs);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'normal user updated a recipe'; end if;
  update profiles set display_name = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if is_admin() then raise exception 'self-promotion'; end if;
end $$;
reset role;

-- ------------------------------------------------------------- the admin
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
do $$
declare
  s text[]; d jsonb; nb record; before_pub int; st recipe_status;
  one text; step jsonb; ing jsonb; new_ing int;
begin
  if not is_admin() then raise exception 'admin not recognised'; end if;
  select array_agg(slug order by slug) into s from t_slugs;
  one := s[1];

  if (select sum(n) from admin_review_progress()) < 900 then raise exception 'progress total'; end if;
  if (select count(*) from admin_review_list('unreviewed', null, null, 5)) <> 5 then raise exception 'list'; end if;
  if (select count(*) from admin_review_list('unreviewed', 'mockup', null, 50)) <> 6 then raise exception 'mockup filter (want 6)'; end if;
  select * into nb from admin_review_neighbors(s[2], 'unreviewed', null);
  if nb.prev_slug is null or nb.next_slug is null or nb.total < 900 then raise exception 'neighbors'; end if;

  d := admin_recipe_detail(one);
  if d is null or jsonb_array_length(d -> 'ingredients') = 0 or jsonb_array_length(d -> 'steps') = 0 then
    raise exception 'detail incomplete'; end if;

  select count(*) into before_pub from recipes where status = 'published';
  if admin_set_review(array[one], 'rejected', 'bad photo') <> 1 then raise exception 'reject count'; end if;
  -- Hidden from the public path even for the admin (RLS unchanged)...
  if (select count(*) from recipes where slug = one) <> 0 then raise exception 'rejected recipe still publicly readable'; end if;
  -- ...but not deleted: the admin RPC still finds it, with status draft.
  if admin_recipe_detail(one) ->> 'status' <> 'draft' then raise exception 'reject did not hide / row vanished'; end if;
  if (select count(*) from admin_review_list('rejected')) <> 1 then raise exception 'rejected filter'; end if;

  perform admin_set_review(array[one], 'unreviewed');
  select status into st from recipes where slug = one;
  if st <> 'published' then raise exception 'unreject did not restore'; end if;
  if (select count(*) from recipe_reviews) <> 0 then raise exception 'review row remained'; end if;

  if admin_set_review(s, 'approved') <> 3 then raise exception 'batch approve'; end if;
  if (select count(*) from admin_review_list('approved')) <> 3 then raise exception 'approved filter'; end if;
  if (select count(*) from recipes where status = 'published') <> before_pub then raise exception 'published count drifted'; end if;

  d := admin_recipe_detail(one);
  step := (d -> 'steps' -> 0);
  ing  := (d -> 'ingredients' -> 0);
  perform admin_update_recipe(one, 'Edited Title',
    jsonb_build_array(jsonb_build_object('id', (step ->> 'id')::bigint, 'instruction', 'Edited step.')),
    jsonb_build_array(jsonb_build_object('id', (ing ->> 'id')::bigint, 'quantity', 7, 'prep_note', 'chopped fine')));
  d := admin_recipe_detail(one);
  if d ->> 'title' <> 'Edited Title' or d -> 'steps' -> 0 ->> 'instruction' <> 'Edited step.'
     or (d -> 'ingredients' -> 0 ->> 'quantity')::numeric <> 7
     or d -> 'ingredients' -> 0 ->> 'prep_note' <> 'chopped fine' then raise exception 'edit not persisted'; end if;

  perform admin_update_recipe(one, null, '[]',
    jsonb_build_array(jsonb_build_object('id', (ing ->> 'id')::bigint, 'quantity', 7, 'ingredient_name', 'garlic')));
  select ingredient_id into new_ing from recipe_ingredients where id = (ing ->> 'id')::bigint;
  if new_ing is distinct from (select ingredient_id from resolve_ingredient('garlic') limit 1) then raise exception 'resolve edit'; end if;

  begin
    perform admin_update_recipe(one, 'Should Not Stick', '[]',
      jsonb_build_array(jsonb_build_object('id', (ing ->> 'id')::bigint, 'ingredient_name', 'zzqx not a food')));
    raise exception 'unresolved accepted' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;
  if (select title from recipes where slug = one) = 'Should Not Stick' then raise exception 'partial edit stuck'; end if;

  begin
    perform admin_update_recipe(one, null, '[]', jsonb_build_array(jsonb_build_object('id',
      (select min(id) from recipe_ingredients where recipe_id <> (select id from recipes where slug = one)), 'quantity', 1)));
    raise exception 'cross-recipe edit accepted' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;

  begin perform admin_update_recipe(one, '   '); raise exception 'blank title accepted' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;
  begin perform admin_set_review(array[one], 'banana'); raise exception 'bad state accepted' using errcode = 'XX999';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;

do $$ begin raise notice 'ALL PASS'; end $$;
rollback;
