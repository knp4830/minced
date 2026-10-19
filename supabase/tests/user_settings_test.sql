-- Settings (wave 11): user_settings is owner-only, validated, mirrored to me_targets, and cascades with the account.
--
-- Runs against a THROWAWAY database (snapshot container or local stack), never live. It creates users and removes
-- everything it made. Each check prints "ok" or "FAIL <what>"; the last line counts failures.
--
--   docker exec -i <container> psql -U postgres -f - < supabase/tests/user_settings_test.sql
--
-- Needs migration 20261017160000 (and the wave 9 migrations) applied, and the roles anon / authenticated. It
-- switches to those ROLES (not superuser) so privilege and RLS errors are real. Counts are re-read as
-- superuser afterwards, because "it did not error" is not "it did nothing" (an unauthorised UPDATE reports
-- UPDATE 0). A bare snapshot has no Supabase default grants, so grants this test depends on are replayed from
-- the migration's own lines: judge a privilege failure here against that (LESSONS section 10).

\set ON_ERROR_STOP off
create temp table _res (ok boolean, what text);
grant all on _res to public;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'set-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'set-b@example.test'),
  ('cccccccc-0000-0000-0000-0000000000c3', 'set-c@example.test'),
  ('dddddddd-0000-0000-0000-0000000000d4', 'set-d@example.test')
on conflict (id) do nothing;
-- (handle_new_user makes the profiles rows where the trigger exists; make sure they do either way)
insert into public.profiles (id) select id from auth.users where email like 'set-%@example.test' on conflict do nothing;

grant usage on schema public, auth to anon, authenticated;
grant select on public.diets, public.allergens, public.profiles to authenticated;
grant update on public.profiles to authenticated;

create or replace function pg_temp.check(cond boolean, what text) returns void
language sql as $$ insert into _res values (coalesce(cond, false), what) $$;
create or replace function pg_temp.raises(stmt text, what text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _res values (false, what || ' (should have raised)');
  exception when others then
    insert into _res values (true, what);
  end;
end $$;
create or replace function pg_temp.succeeds(stmt text, what text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _res values (true, what);
  exception when others then
    insert into _res values (false, what || ' raised: ' || sqlerrm);
  end;
end $$;
grant execute on function pg_temp.raises(text, text), pg_temp.succeeds(text, text), pg_temp.check(boolean, text) to public;

-- ================= structure =================
select pg_temp.check((select relrowsecurity from pg_class where relname = 'user_settings'), 'RLS is enabled on user_settings');
select pg_temp.check(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'user_settings' and grantee = 'anon'), 'anon has no grant on user_settings');
select pg_temp.check(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'user_settings' and grantee = 'authenticated'
    and privilege_type not in ('SELECT', 'INSERT', 'UPDATE')), 'authenticated holds only SELECT, INSERT, UPDATE (no DELETE, TRUNCATE, TRIGGER)');
select pg_temp.check((select count(*) from pg_policies where tablename = 'user_settings' and cmd = 'DELETE') = 0, 'there is no DELETE policy');
select pg_temp.check((select count(*) from pg_policies where tablename = 'user_settings' and roles::text like '%anon%') = 0, 'no policy names anon');

-- ================= anon: nothing =================
set role anon;
select pg_temp.raises($q$ select count(*) from user_settings $q$, 'anon cannot read user_settings');
select pg_temp.raises($q$ insert into user_settings (user_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1') $q$, 'anon cannot insert user_settings');
select pg_temp.raises($q$ update user_settings set units = 'imperial' $q$, 'anon cannot update user_settings');
reset role;

-- ================= A: own row =================
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', false);
select pg_temp.check((select count(*) from user_settings) = 0, 'a new person has no row (the app falls back to defaults)');
select pg_temp.succeeds($q$ insert into user_settings (user_id, units, week_start, sex, diet_slugs, allergen_slugs)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'metric', 'monday', 'female', array['vegetarian','gluten-free'], array['nuts','dairy']) $q$, 'A inserts own settings');
select pg_temp.check((select count(*) from user_settings) = 1, 'A reads own row');
select pg_temp.check((select allergen_slugs from user_settings) = array['dairy','nuts'], 'allergen slugs are stored sorted');
select pg_temp.check((select diet_slugs from user_settings) = array['gluten-free','vegetarian'], 'diet slugs are stored sorted');
select pg_temp.succeeds($q$ update user_settings set week_start = 'sunday' where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' $q$, 'A updates own settings');
select pg_temp.check((select week_start from user_settings) = 'sunday', 'the update took');
select pg_temp.raises($q$ insert into user_settings (user_id) values ('bbbbbbbb-0000-0000-0000-0000000000b2') $q$, 'A cannot insert a row for B (policy)');
select pg_temp.raises($q$ insert into user_settings (user_id) values ('aaaaaaaa-0000-0000-0000-0000000000a1') $q$, 'a second row for A is a duplicate key');
select pg_temp.raises($q$ delete from user_settings $q$, 'authenticated cannot DELETE (permission)');
select pg_temp.raises($q$ update user_settings set user_id = 'bbbbbbbb-0000-0000-0000-0000000000b2' $q$, 'A cannot hand the row to B (with check)');

-- ---- constraints and the slug guard ----
select pg_temp.raises($q$ update user_settings set units = 'stone' $q$, 'bad units rejected');
select pg_temp.raises($q$ update user_settings set week_start = 'tuesday' $q$, 'bad week_start rejected');
select pg_temp.raises($q$ update user_settings set sex = 'other' $q$, 'bad sex rejected');
select pg_temp.succeeds($q$ update user_settings set sex = null $q$, 'sex may be null (not set yet)');
select pg_temp.succeeds($q$ update user_settings set sex = 'female' $q$, 'sex may be set again');
select pg_temp.raises($q$ update user_settings set diet_slugs = array['keto'] $q$, 'unknown diet slug rejected');
select pg_temp.raises($q$ update user_settings set allergen_slugs = array['peanuts'] $q$, 'unknown allergen slug rejected');
select pg_temp.succeeds($q$ update user_settings set allergen_slugs = array['nuts', null, 'dairy'] $q$, 'a null inside the array is accepted...');
select pg_temp.check((select allergen_slugs from user_settings) = array['dairy','nuts'], '...and dropped, never stored');
select pg_temp.succeeds($q$ update user_settings set allergen_slugs = array['nuts','nuts','dairy','nuts'] $q$, 'duplicates are accepted');
select pg_temp.check((select allergen_slugs from user_settings) = array['dairy','nuts'], 'duplicates are removed and the list sorted');
select pg_temp.succeeds($q$ update user_settings set diet_slugs = '{}', allergen_slugs = '{}' $q$, 'empty lists are fine');
select pg_temp.raises($q$ update user_settings set diet_slugs = array['vegan','vegetarian','pescatarian','gluten-free','a1','a2','a3','a4','a5'] $q$, 'more than 8 diets rejected');
select pg_temp.raises($q$ update user_settings set allergen_slugs = (select array_agg('x' || i) from generate_series(1, 17) i) $q$, 'more than 16 allergens rejected');
select pg_temp.raises($q$ update user_settings set diet_slugs = array[repeat('a', 5000)] $q$, 'a 5000-character slug is rejected');
select pg_temp.check((select updated_at from user_settings) >= now() - interval '1 minute', 'updated_at is stamped by the trigger');

-- ================= B: cannot see or touch A =================
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-0000000000b2', false);
select pg_temp.check((select count(*) from user_settings) = 0, 'B cannot read A''s row (count 0)');
select pg_temp.succeeds($q$ update user_settings set units = 'imperial', allergen_slugs = '{}' where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' $q$, 'B''s update of A''s row does not error (it matches nothing)');
select pg_temp.succeeds($q$ insert into user_settings (user_id, units) values ('bbbbbbbb-0000-0000-0000-0000000000b2', 'imperial') $q$, 'B inserts own settings');
select pg_temp.check((select count(*) from user_settings) = 1, 'B sees only their own row');
select pg_temp.raises($q$ update profiles set display_name = repeat('x', 61) where id = 'bbbbbbbb-0000-0000-0000-0000000000b2' $q$, 'a 61-character display name is rejected');
select pg_temp.succeeds($q$ update profiles set display_name = repeat('x', 60) where id = 'bbbbbbbb-0000-0000-0000-0000000000b2' $q$, 'a 60-character display name is accepted');
select pg_temp.succeeds($q$ update profiles set display_name = 'Hacked' where id = 'aaaaaaaa-0000-0000-0000-0000000000a1' $q$, 'B''s update of A''s profile does not error (it matches nothing)');

-- ================= verify as superuser =================
reset role;
select pg_temp.check((select units from user_settings where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 'metric', 'B did not change A''s units (UPDATE 0)');
select pg_temp.check((select week_start from user_settings where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 'sunday', 'A''s week start survives');
select pg_temp.check((select display_name from profiles where id = 'aaaaaaaa-0000-0000-0000-0000000000a1') is distinct from 'Hacked', 'B did not rename A');
select pg_temp.check((select count(*) from user_settings where user_id = 'bbbbbbbb-0000-0000-0000-0000000000b2') = 1, 'B has exactly one row');
select pg_temp.check((select count(*) from user_settings where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 1, 'A has exactly one row');

-- ================= mirror: user_settings <-> me_targets =================
-- A has settings (sex female, units metric). A target row inserted with different values takes Settings'.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', false);
select pg_temp.succeeds($q$ insert into me_targets (user_id, sex, age_years, height_cm, weight_kg, units, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'male', 34, 182, 84, 'imperial', 2, 'maintain', 0, 2500, 150, 300, 70) $q$, 'A saves targets with other sex and units');
select pg_temp.check((select sex from me_targets) = 'female', 'targets took sex from Settings');
select pg_temp.check((select units from me_targets) = 'metric', 'targets took units from Settings');
reset role;

-- Make the targets look old, to see that changing units / sex does not make them look "just updated".
alter table me_targets disable trigger me_targets_touch;
update me_targets set updated_at = now() - interval '30 days' where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
alter table me_targets enable trigger me_targets_touch;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', false);
select pg_temp.succeeds($q$ update user_settings set units = 'imperial', sex = 'male' $q$, 'A changes units and sex in Settings');
select pg_temp.check((select units from me_targets) = 'imperial', 'the change reached me_targets.units');
select pg_temp.check((select sex from me_targets) = 'male', 'the change reached me_targets.sex');
select pg_temp.check((select updated_at from me_targets) < now() - interval '29 days', 'changing units / sex did not reset me_targets.updated_at');
select pg_temp.succeeds($q$ update me_targets set sex = 'female', kcal = 2400 $q$, 'A edits targets directly');
select pg_temp.check((select sex from me_targets) = 'male', 'me_targets.sex cannot diverge from Settings');
select pg_temp.check((select updated_at from me_targets) > now() - interval '1 minute', 'a real targets edit still stamps updated_at');
select pg_temp.check((select current_setting('minced.settings_mirror', true)) is distinct from '1', 'the mirror flag is not left switched on');
reset role;

-- A person whose targets were written by code that does not know Settings: the settings row is created from them.
set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-0000000000d4', false);
select pg_temp.succeeds($q$ insert into me_targets (user_id, sex, age_years, height_cm, weight_kg, units, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g)
  values ('dddddddd-0000-0000-0000-0000000000d4', 'female', 29, 165, 62, 'imperial', 1, 'maintain', 0, 1900, 110, 230, 60) $q$, 'D saves targets with no settings row');
select pg_temp.check((select sex from user_settings) = 'female' and (select units from user_settings) = 'imperial', 'a settings row was created from D''s targets');
reset role;

-- Backfill: the migration's one-time statement, re-run, copies sex and units for someone with targets and no settings.
alter table me_targets disable trigger me_targets_take_settings;
insert into me_targets (user_id, sex, age_years, height_cm, weight_kg, units, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g)
  values ('cccccccc-0000-0000-0000-0000000000c3', 'male', 41, 178, 90, 'imperial', 3, 'maintain', 0, 2800, 160, 330, 90);
alter table me_targets enable trigger me_targets_take_settings;
select pg_temp.check((select count(*) from user_settings where user_id = 'cccccccc-0000-0000-0000-0000000000c3') = 0, 'C starts with targets and no settings');
insert into public.user_settings (user_id, units, sex)
select user_id, units, sex from public.me_targets
on conflict (user_id) do nothing;
select pg_temp.check((select sex || '/' || units from user_settings where user_id = 'cccccccc-0000-0000-0000-0000000000c3') = 'male/imperial', 'the backfill copied C''s sex and units');
select pg_temp.check((select count(*) from user_settings where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and sex = 'male' and units = 'imperial') = 1, 'the backfill left A''s existing row alone');

-- ================= diet equivalence (the path the saved defaults take) =================
select pg_temp.check(
  (select count(*) from filtered_recipes(null, null, array['vegetarian']))
  = (select count(distinct rd.recipe_id) from recipe_diets rd join diets d on d.id = rd.diet_id
      join recipes r on r.id = rd.recipe_id where d.slug = any (diet_satisfying('vegetarian'))),
  'saved diet {vegetarian} returns exactly the vegetarian-or-vegan recipes (diet_satisfying)');
select pg_temp.check(not exists (
  select 1 from filtered_recipes(null, null, array['vegetarian']) f
  where not exists (select 1 from recipe_diets rd join diets d on d.id = rd.diet_id
                    where rd.recipe_id = f.id and d.slug in ('vegetarian', 'vegan'))), 'no non-vegetarian recipe slips through');
select pg_temp.check(
  (select count(*) from search_recipes(q => 'salad', diet_slugs => array['vegetarian'], result_limit => 50)) <=
  (select count(*) from search_recipes(q => 'salad', result_limit => 50)), 'search with a diet default can only narrow');
select pg_temp.check(not exists (
  select 1 from search_recipes(q => 'salad', diet_slugs => array['vegan'], exclude_allergen_slugs => array['nuts'], result_limit => 50) s
  join recipe_allergens ra on ra.recipe_id = s.id join allergens a on a.id = ra.allergen_id where a.slug = 'nuts'),
  'search with an allergen default returns no recipe carrying that allergen');

-- ================= cascade =================
delete from auth.users where id in (
  'aaaaaaaa-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000b2',
  'cccccccc-0000-0000-0000-0000000000c3', 'dddddddd-0000-0000-0000-0000000000d4');
select pg_temp.check((select count(*) from user_settings where user_id in (
  'aaaaaaaa-0000-0000-0000-0000000000a1', 'bbbbbbbb-0000-0000-0000-0000000000b2',
  'cccccccc-0000-0000-0000-0000000000c3', 'dddddddd-0000-0000-0000-0000000000d4')) = 0, 'deleting the user removes their settings (cascade)');

select case when ok then 'ok   ' else 'FAIL ' end || what as result from _res order by ok, what;
select 'failures: ' || count(*) filter (where not ok) || ' of ' || count(*) as summary from _res;
