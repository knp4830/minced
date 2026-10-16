-- "Me" dashboard: owner-only data, constraints, caps and RPCs (wave 8).
--
-- Runs against a THROWAWAY database (snapshot container or local stack), never live. It creates two users
-- and removes everything it made. Each check prints "ok" or "FAIL <what>"; the last line counts failures.
--
--   docker exec -i <container> psql -U postgres -f - < supabase/tests/me_rls_test.sql
--
-- Needs migration 20261016100000 applied and the roles anon / authenticated. It switches to those ROLES
-- (not superuser) so privilege and RLS errors are real. Counts are re-read as superuser afterwards,
-- because "it did not error" is not "it did nothing" (an unauthorised UPDATE reports UPDATE 0).

\set ON_ERROR_STOP off
create temp table _res (ok boolean, what text);
grant all on _res to public;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'me-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'me-b@example.test')
on conflict (id) do nothing;

-- A bare snapshot has no Supabase default privileges (a real project does).
grant usage on schema public, auth to anon, authenticated;

create or replace function pg_temp.check(cond boolean, what text) returns void
language sql as $$ insert into _res values (coalesce(cond, false), what) $$;

-- Runs a statement as the current role and records whether it raised.
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
grant execute on function pg_temp.raises(text, text), pg_temp.succeeds(text, text) to public;

-- ================= A writes their own data =================
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-0000000000a1', false);

select pg_temp.succeeds($q$ insert into me_targets (user_id, sex, age_years, height_cm, weight_kg, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'male', 34, 182, 84, 2, 'lose', 0.5, 2300, 160, 245, 75) $q$, 'A inserts own targets');
select pg_temp.succeeds($q$ insert into me_food_log (user_id, log_date, meal, name, calories, protein_g, carbs_g, fat_g)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 'breakfast', 'Oats', 420, 14, 70, 9) $q$, 'A logs food');
select pg_temp.succeeds($q$ insert into me_food_log (user_id, log_date, meal, name, calories, protein_g, carbs_g, fat_g)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 'lunch', 'Curry', 560, 22, 60, 20) $q$, 'A logs a second food');
select pg_temp.succeeds($q$ insert into me_sleep (user_id, log_date, hours) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 7.5) $q$, 'A logs sleep');
select pg_temp.succeeds($q$ select me_log_workout(current_date, 'push', null, 45,
  '[{"m":"chest","s":6},{"m":"deltoids","s":4},{"m":"triceps","s":4}]'::jsonb) $q$, 'A logs a workout through the RPC');
select pg_temp.succeeds($q$ select me_log_workout(current_date - 1, 'legs', null, 50,
  '[{"m":"quadriceps","s":8},{"m":"gluteal","s":4},{"m":"hamstring","s":4}]'::jsonb) $q$, 'A logs a second workout');

select pg_temp.check((select count(*) from me_food_log) = 2, 'A sees their 2 food rows');
select pg_temp.check((select sets from me_workouts where session = 'push') = 14, 'workout total sets is the sum of the muscles (14)');
select pg_temp.check((select sets from me_week_muscles(current_date - 6, current_date) where muscle = 'chest') = 6, 'me_week_muscles: chest = 6 sets');
select pg_temp.check((select count(*) from me_week_muscles(current_date - 6, current_date)) = 6, 'me_week_muscles: 6 muscles trained');
select pg_temp.check((select calories from me_month_summary(current_date - 6, current_date) where log_date = current_date) = 980, 'me_month_summary: today is 980 kcal');
select pg_temp.check((select sleep_hours from me_month_summary(current_date - 6, current_date) where log_date = current_date) = 7.5, 'me_month_summary: sleep 7.5');
select pg_temp.check((select count(*) from me_month_summary(current_date - 6, current_date)) = 2, 'me_month_summary: two days with data');
select pg_temp.check((select count(*) from me_month_summary(current_date - 200, current_date)) = 0, 'me_month_summary: refuses a range over 62 days');

-- Constraints
select pg_temp.raises($q$ insert into me_food_log (user_id, log_date, meal, name, calories) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 'lunch', 'x', -5) $q$, 'negative kcal rejected');
select pg_temp.raises($q$ insert into me_food_log (user_id, log_date, meal, name, calories) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 'brunch', 'x', 5) $q$, 'unknown meal rejected');
select pg_temp.raises($q$ insert into me_food_log (user_id, log_date, meal, name, calories) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 'lunch', '', 5) $q$, 'empty name rejected');
select pg_temp.raises($q$ insert into me_food_log (user_id, log_date, meal, name, calories) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date + 30, 'lunch', 'x', 5) $q$, 'a date 30 days ahead rejected');
select pg_temp.raises($q$ insert into me_food_log (user_id, log_date, meal, name, calories) values ('aaaaaaaa-0000-0000-0000-0000000000a1', date '2019-12-31', 'lunch', 'x', 5) $q$, 'a date before 2020 rejected');
select pg_temp.raises($q$ insert into me_sleep (user_id, log_date, hours) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date - 3, 30) $q$, 'sleep over 24h rejected');
select pg_temp.raises($q$ select me_log_workout(current_date, 'yoga', null, 30, '[]'::jsonb) $q$, 'unknown session rejected');
select pg_temp.raises($q$ select me_log_workout(current_date, 'push', null, 30, '[{"m":"wings","s":3}]'::jsonb) $q$, 'unknown muscle rejected');
select pg_temp.raises($q$ select me_log_workout(current_date, 'push', null, 30, '[{"m":"chest","s":0}]'::jsonb) $q$, 'zero sets on a muscle rejected');
select pg_temp.raises($q$ select me_log_workout(current_date, 'push', null, 0, '[{"m":"chest","s":3}]'::jsonb) $q$, 'zero minutes rejected');
select pg_temp.raises($q$ insert into me_targets (user_id, sex, age_years, height_cm, weight_kg, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'male', 34, 182, 84, 9, 'lose', 0.5, 2300, 160, 245, 75) $q$, 'activity 9 rejected (and duplicate key)');

-- Day cap: 60 food rows per day (A has 2 today).
select pg_temp.succeeds($q$ insert into me_food_log (user_id, log_date, meal, name, calories)
  select 'aaaaaaaa-0000-0000-0000-0000000000a1', current_date - 2, 'snack', 'bulk ' || g, 10 from generate_series(1, 60) g $q$, 'A can log 60 rows on one day');
select pg_temp.raises($q$ insert into me_food_log (user_id, log_date, meal, name, calories) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date - 2, 'snack', 'one too many', 10) $q$, 'the 61st row on one day is rejected');

-- ================= B cannot see or touch A's data =================
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-0000000000b2', false);
select pg_temp.check((select count(*) from me_targets) = 0, 'B sees none of A targets');
select pg_temp.check((select count(*) from me_food_log) = 0, 'B sees none of A food');
select pg_temp.check((select count(*) from me_workouts) = 0, 'B sees none of A workouts');
select pg_temp.check((select count(*) from me_workout_muscles) = 0, 'B sees none of A muscle rows');
select pg_temp.check((select count(*) from me_sleep) = 0, 'B sees none of A sleep');
select pg_temp.check((select count(*) from me_week_muscles(current_date - 6, current_date)) = 0, 'B: me_week_muscles is empty');
select pg_temp.check((select count(*) from me_month_summary(current_date - 6, current_date)) = 0, 'B: me_month_summary is empty');

select pg_temp.raises($q$ insert into me_food_log (user_id, log_date, meal, name, calories) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 'lunch', 'forged', 5) $q$, 'B cannot insert a row owned by A');
select pg_temp.raises($q$ insert into me_sleep (user_id, log_date, hours) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date - 4, 5) $q$, 'B cannot write A sleep');
select pg_temp.raises($q$ insert into me_targets (user_id, sex, age_years, height_cm, weight_kg, activity, goal, pace_kg, kcal, protein_g, carbs_g, fat_g)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'male', 30, 180, 80, 1, 'maintain', 0, 2000, 120, 250, 60) $q$, 'B cannot write A targets');
-- attach B's muscle row to A's workout id
reset role;
select id as a_workout from me_workouts where session = 'push' \gset
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-0000000000b2', false);
select pg_temp.raises(format($q$ insert into me_workout_muscles (workout_id, user_id, muscle, sets) values (%L, 'bbbbbbbb-0000-0000-0000-0000000000b2', 'abs', 3) $q$, :'a_workout'), 'B cannot attach muscles to A workout (pair FK)');
select pg_temp.raises(format($q$ insert into me_workout_muscles (workout_id, user_id, muscle, sets) values (%L, 'aaaaaaaa-0000-0000-0000-0000000000a1', 'abs', 3) $q$, :'a_workout'), 'B cannot insert a muscle row as A');

-- B mutates: these report UPDATE 0 / DELETE 0 and do not raise, so verify by count as superuser below.
update me_food_log set calories = 1 where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
update me_targets set kcal = 800 where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
update me_sleep set hours = 1 where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
delete from me_food_log where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
delete from me_workouts where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
delete from me_workout_muscles where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
delete from me_sleep where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
delete from me_targets where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';

-- ================= anon has nothing =================
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.raises($q$ select count(*) from me_food_log $q$, 'anon cannot read food');
select pg_temp.raises($q$ select count(*) from me_targets $q$, 'anon cannot read targets');
select pg_temp.raises($q$ insert into me_sleep (user_id, log_date, hours) values ('aaaaaaaa-0000-0000-0000-0000000000a1', current_date, 5) $q$, 'anon cannot write sleep');
select pg_temp.raises($q$ select me_log_workout(current_date, 'push', null, 30, '[{"m":"chest","s":3}]'::jsonb) $q$, 'anon cannot call me_log_workout');
select pg_temp.raises($q$ select * from me_month_summary(current_date - 6, current_date) $q$, 'anon cannot call me_month_summary');

-- ================= verify as superuser that A is untouched =================
reset role;
select pg_temp.check((select count(*) from me_food_log where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and name in ('Oats', 'Curry')) = 2, 'A food rows survive B delete attempt');
select pg_temp.check((select calories from me_food_log where name = 'Oats') = 420, 'B update did not change A food');
select pg_temp.check((select kcal from me_targets where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 2300, 'A targets untouched');
select pg_temp.check((select hours from me_sleep where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1' and log_date = current_date) = 7.5, 'A sleep untouched');
select pg_temp.check((select count(*) from me_workouts where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 2, 'A workouts survive');
select pg_temp.check((select count(*) from me_workout_muscles where user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') = 6, 'A muscle rows survive');
select pg_temp.check((select count(*) from me_food_log where user_id = 'bbbbbbbb-0000-0000-0000-0000000000b2') = 0, 'nothing was written as B');

-- Grants: anon holds no privilege on any me_ table; authenticated has no TRUNCATE.
select pg_temp.check(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'me\_%' and grantee = 'anon'), 'anon has no grants on me_ tables');
select pg_temp.check(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'me\_%' and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')), 'authenticated cannot TRUNCATE');
select pg_temp.check((select bool_and(relrowsecurity) from pg_class where relname like 'me\_%' and relkind = 'r'), 'RLS enabled on every me_ table');

-- ================= cascade: deleting the user deletes their rows =================
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) from me_food_log) + (select count(*) from me_workouts) + (select count(*) from me_workout_muscles)
  + (select count(*) from me_sleep) + (select count(*) from me_targets) = 0, 'deleting the user cascades to every me_ table');
delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-0000000000b2';

select case when ok then 'ok   ' else 'FAIL ' end || what as result from _res order by ok, what;
select 'failures: ' || count(*) filter (where not ok) || ' of ' || count(*) as summary from _res;
