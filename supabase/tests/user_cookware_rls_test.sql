-- Wave 5: RLS on user_cookware. A cook sees and changes only their own rows.
-- Run on a THROWAWAY database (snapshot or local stack), never on live: it inserts two
-- auth users and removes them again at the end (and rolls back regardless).
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/user_cookware_rls_test.sql
--
-- Needs roles `anon` and `authenticated` with the usual Supabase grants (the local stack
-- has them; on the snapshot grant usage on schema public/auth and select on cookware,
-- profiles to them first). Success prints "user_cookware RLS tests passed: N assertions".

begin;

create temp table t_n (n int);
insert into t_n values (0);
grant all on t_n to anon, authenticated;

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  update t_n set n = n + 1;
end $$;
grant execute on function pg_temp.ok(boolean, text) to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a0a0', 'rls-a@test.invalid'),
  ('00000000-0000-0000-0000-00000000b0b0', 'rls-b@test.invalid');
insert into profiles (id) values
  ('00000000-0000-0000-0000-00000000a0a0'),
  ('00000000-0000-0000-0000-00000000b0b0');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid, true);
end $$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- A adds two pieces of cookware.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0a0');
insert into user_cookware (user_id, cookware_id)
select auth.uid(), id from cookware where slug in ('pot', 'skillet');
select pg_temp.ok((select count(*) from user_cookware) = 2, 'A sees their own two rows');

-- A cannot add a row for B.
do $$
begin
  begin
    insert into user_cookware (user_id, cookware_id)
    select '00000000-0000-0000-0000-00000000b0b0', id from cookware where slug = 'wok';
    raise exception 'FAILED: A inserted a row for B';
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'A cannot insert a row for B (RLS)');
  end;
end $$;

-- B sees nothing of A's, and deleting "everything" removes nothing of A's.
select pg_temp.as_user('00000000-0000-0000-0000-00000000b0b0');
select pg_temp.ok((select count(*) from user_cookware) = 0, 'B sees none of A''s rows');
delete from user_cookware;
-- A cannot be impersonated by a forged user_id filter either.
select pg_temp.ok((select count(*) from user_cookware where user_id = '00000000-0000-0000-0000-00000000a0a0') = 0,
                  'B cannot read A by naming A''s user_id');

-- A's rows survived B's delete.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a0a0');
select pg_temp.ok((select count(*) from user_cookware) = 2, 'A still has two rows after B''s delete');

-- A can remove one of their own.
delete from user_cookware where cookware_id = (select id from cookware where slug = 'pot');
select pg_temp.ok((select count(*) from user_cookware) = 1, 'A removed one of their own rows');

-- No UPDATE path: the table grants none and no policy exists.
do $$
begin
  begin
    update user_cookware set created_at = now();
    raise exception 'FAILED: UPDATE was allowed';
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'authenticated cannot UPDATE user_cookware');
  end;
end $$;

-- Signed-out (anon) sees and writes nothing.
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from user_cookware;
    raise exception 'FAILED: anon could query user_cookware';
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'anon has no access to user_cookware');
  end;
end $$;

-- Deleting the account removes the cookware (profiles cascade).
reset role;
delete from profiles where id = '00000000-0000-0000-0000-00000000a0a0';
select pg_temp.ok((select count(*) from user_cookware where user_id = '00000000-0000-0000-0000-00000000a0a0') = 0,
                  'deleting the profile cascades to user_cookware');

select 'user_cookware RLS tests passed: ' || n || ' assertions' from t_n;

rollback;
