-- Wave 4: proves 20261012100000_rls_hashed_visibility.sql changed SPEED, not WHO CAN SEE WHAT.
--
-- For every recipe child table and each caller (anon, a signed-in NON-author, the
-- AUTHOR), the set of rows visible through RLS must equal the set the original
-- rule selects: rows whose parent satisfies can_read_recipe() (a SECURITY DEFINER
-- function that is unchanged by the migration and is the old policy's predicate).
-- It also checks the draft's children are invisible to anon / non-author and
-- visible to the author, and that write policies still gate by authorship.
--
-- Self-contained: builds a draft + a published recipe with children for every
-- table, rolls back. Needs the live-shaped catalog (snapshot or local stack).
-- Works with the snapshot's auth.uid() stub and with Supabase's real one (both read
-- request.jwt.claim.sub / request.jwt.claims).
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/perf_rls_equivalence_test.sql
--
-- Success prints "rls equivalence tests passed: N assertions".

begin;

create temp table t_n (n int);
insert into t_n values (0);
grant all on t_n to public;

do $$
declare
  author uuid := '00000000-0000-0000-0000-0000000000a1';
  other  uuid := '00000000-0000-0000-0000-0000000000b2';
  draft_id uuid := gen_random_uuid();
  pub_id   uuid := gen_random_uuid();
  tbl text; who text; uid text;
  vis text; want text; cnt int; draft_rows int;
  ing int; dt int; cw int; al int;
begin
  insert into auth.users (id, email) values (author, 'zz-author@example.test'), (other, 'zz-other@example.test')
    on conflict do nothing;
  -- a signup trigger creates this on a real stack; the snapshot's auth stub has none
  insert into profiles (id) values (author), (other) on conflict do nothing;

  insert into recipes (id, slug, title, servings, status, published_at, author_id)
  values (draft_id, 'zz-eq-draft', 'zz eq draft', 2, 'draft', null, author),
         (pub_id,   'zz-eq-pub',   'zz eq pub',   2, 'published', now(), author);

  select id into ing from ingredients order by id limit 1;
  select id into dt  from diets limit 1;
  select id into cw  from cookware limit 1;
  select id into al  from allergens limit 1;
  for tbl in select unnest(array[draft_id, pub_id]::uuid[])::text loop
    insert into recipe_steps (recipe_id, sort_order, instruction) values (tbl::uuid, 1, 'zz step');
    insert into recipe_ingredients (recipe_id, ingredient_id, sort_order) values (tbl::uuid, ing, 1);
    insert into recipe_diets (recipe_id, diet_id) values (tbl::uuid, dt);
    insert into recipe_cookware (recipe_id, cookware_id) values (tbl::uuid, cw);
    insert into recipe_allergens (recipe_id, allergen_id) values (tbl::uuid, al) on conflict do nothing;
    insert into recipe_photos (recipe_id, storage_path, width, height, source, license, attribution_url)
    values (tbl::uuid, 'zz/' || tbl, 10, 10, 'usda_myplate', 'Public domain', 'https://example.test/x');
  end loop;

  foreach who in array array['anon', 'other', 'author'] loop
    uid := case who when 'other' then other::text when 'author' then author::text else '' end;
    perform set_config('request.jwt.claim.sub', uid, true);
    perform set_config('request.jwt.claims', case when uid = '' then '{}' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);

    foreach tbl in array array['recipe_steps','recipe_ingredients','recipe_diets','recipe_cookware','recipe_allergens','recipe_photos'] loop
      -- expected: the OLD rule, evaluated as the table owner with this caller's claims
      execute format($f$select coalesce(md5(string_agg(t::text, '|' order by t::text)), '-') from %I t where can_read_recipe(t.recipe_id)$f$, tbl) into want;
      -- actual: through RLS as the real role
      execute case when who = 'anon' then 'set local role anon' else 'set local role authenticated' end;
      execute format($f$select coalesce(md5(string_agg(t::text, '|' order by t::text)), '-') from %I t$f$, tbl) into vis;
      execute format('select count(*) from %I where recipe_id = %L', tbl, draft_id) into draft_rows;
      reset role;

      assert vis = want, format('%s as %s: visible row set differs from can_read_recipe()', tbl, who);
      -- (recipe_allergens is trigger-maintained, so the author may see more than the one row inserted)
      assert case when who = 'author' then draft_rows >= 1 else draft_rows = 0 end,
        format('%s as %s: draft children visibility wrong (saw %s)', tbl, who, draft_rows);
      update t_n set n = n + 2;
    end loop;

    -- the published recipe's children are visible to everyone
    execute case when who = 'anon' then 'set local role anon' else 'set local role authenticated' end;
    select count(*) into cnt from recipe_ingredients where recipe_id = pub_id;
    reset role;
    assert cnt = 1, format('published recipe ingredients must be visible to %s', who);
    update t_n set n = n + 1;
  end loop;

  -- write policies still gate by authorship (non-author blocked, author allowed)
  perform set_config('request.jwt.claim.sub', other::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', other::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into recipe_steps (recipe_id, sort_order, instruction) values (pub_id, 9, 'zz hijack');
    reset role;
    raise exception 'FAILED: a non-author inserted a step into someone else''s recipe';
  exception when insufficient_privilege then
    reset role;
    update t_n set n = n + 1;
  end;

  perform set_config('request.jwt.claim.sub', author::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', author::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into recipe_steps (recipe_id, sort_order, instruction) values (pub_id, 9, 'zz own step');
  reset role;
  update t_n set n = n + 1;

  -- the non-author cannot read-then-edit the author's existing child rows
  perform set_config('request.jwt.claim.sub', other::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', other::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update recipe_steps set instruction = 'zz tampered' where recipe_id = pub_id;
  get diagnostics cnt = row_count;
  reset role;
  assert cnt = 0, 'a non-author must not be able to UPDATE another author''s step (UPDATE 0)';
  update t_n set n = n + 1;
end $$;

select 'rls equivalence tests passed: ' || n || ' assertions' as result from t_n;

rollback;
