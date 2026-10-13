-- Wave 5+6 review fix: catalog is operator-written, profiles are private, grants are narrow.
-- Throwaway database only (inserts auth users; everything rolls back).
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening_test.sql
begin;
create temp table t_n (n int);
insert into t_n values (0);
grant all on t_n to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'sec-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'sec-b@test.invalid');
insert into profiles (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1') on conflict do nothing;
insert into recipes (id, slug, title, servings, status, published_at, author_id)
  values ('00000000-0000-0000-0000-0000000000c1', 'sec-own', 'Sec own', 2, 'draft', null,
          '00000000-0000-0000-0000-0000000000a1');

do $$
declare cnt int; denied boolean;
        a uuid := '00000000-0000-0000-0000-0000000000a1';
        c uuid := '00000000-0000-0000-0000-0000000000c1';
        stmt text;
begin
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  foreach stmt in array array[
    $q$insert into recipes (slug, title, servings, status, published_at, author_id) values ('sec-spam','Spam',1,'published', now(), '00000000-0000-0000-0000-0000000000a1')$q$,
    $q$update recipes set status = 'published' where id = '00000000-0000-0000-0000-0000000000c1'$q$,
    $q$update recipes set has_photo = true where id = '00000000-0000-0000-0000-0000000000c1'$q$,
    $q$delete from recipes where id = '00000000-0000-0000-0000-0000000000c1'$q$,
    $q$insert into recipe_steps (recipe_id, sort_order, instruction) values ('00000000-0000-0000-0000-0000000000c1', 1, 'x')$q$,
    $q$insert into recipe_diets (recipe_id, diet_id) select '00000000-0000-0000-0000-0000000000c1', id from diets limit 1$q$,
    $q$insert into recipe_cookware (recipe_id, cookware_id) select '00000000-0000-0000-0000-0000000000c1', id from cookware limit 1$q$,
    $q$insert into recipe_ingredients (recipe_id, ingredient_id, sort_order) select '00000000-0000-0000-0000-0000000000c1', id, 1 from ingredients limit 1$q$,
    $q$truncate recipes cascade$q$
  ] loop
    denied := false;
    begin
      execute stmt;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAILED: authenticated could run: %', stmt; end if;
    update t_n set n = n + 1;
  end loop;

  -- the owner still reads their own profile, and only their own
  select count(*) into cnt from profiles;
  if cnt <> 1 then raise exception 'FAILED: authenticated sees % profiles, wanted 1', cnt; end if;
  update t_n set n = n + 1;
  reset role;

  -- anon: no profiles, no writes
  set local role anon;
  select count(*) into cnt from profiles;
  if cnt <> 0 then raise exception 'FAILED: anon sees % profiles', cnt; end if;
  update t_n set n = n + 1;
  denied := false;
  begin
    insert into recipes (slug, title, servings, status) values ('sec-anon','x',1,'published');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAILED: anon inserted a recipe'; end if;
  update t_n set n = n + 1;
  reset role;

  -- anon still reads the published catalog
  set local role anon;
  select count(*) into cnt from recipes where status = 'published';
  if cnt < 1 then raise exception 'FAILED: anon cannot read published recipes'; end if;
  update t_n set n = n + 1;
  reset role;

  -- no blanket TRUNCATE/REFERENCES/TRIGGER and no trigger-function EXECUTE for API roles
  select count(*) into cnt from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon','authenticated')
     and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER');
  if cnt <> 0 then raise exception 'FAILED: % leftover TRUNCATE/REFERENCES/TRIGGER grants', cnt; end if;
  update t_n set n = n + 1;

  select count(*) into cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or p.proconfig is null or not (p.proconfig::text like '%search_path%'));
  if cnt <> 0 then raise exception 'FAILED: % trigger functions callable or without search_path', cnt; end if;
  update t_n set n = n + 1;
end $$;

select 'security hardening tests passed: ' || n || ' assertions' as result from t_n;
rollback;
