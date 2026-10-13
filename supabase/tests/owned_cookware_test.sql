-- Wave 5: "Only cookware I own" on match_recipes() and search_recipes(), and the
-- user_cookware table.
-- Contract: `owned_cookware_slugs text[] DEFAULT NULL`; a recipe passes when it needs NO
-- cookware outside the list; recipes with no cookware data need none, so they pass;
-- NULL = no filter; '{}' = owns nothing (every recipe that needs cookware drops).
-- Self-contained, rolls back. Needs the migrations (snapshot or local stack).
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/owned_cookware_test.sql
--
-- Success prints "owned cookware tests passed: N assertions". The RLS half of the table
-- (a second user cannot read or write the first user's rows) needs real roles and runs in
-- docs/RLS-TEST-PLAN.md section "user_cookware".

begin;

create temp table t_n (n int);
insert into t_n values (0);

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  update t_n set n = n + 1;
end $$;

insert into ingredients (canonical_name, slug, aisle_category) values ('zzowthing', 'zzowthing', 'Other');

create function pg_temp.mk(p_title text, p_status recipe_status, variadic p_cook text[])
returns uuid language plpgsql as $$
declare rid uuid := gen_random_uuid(); c text;
begin
  insert into recipes (id, slug, title, servings, status, published_at, cook_time_min)
  values (rid, 'zz-' || rid, p_title, 2, p_status, case when p_status = 'published' then now() end, 20);
  insert into recipe_ingredients (recipe_id, ingredient_id, sort_order)
  select rid, id, 1 from ingredients where canonical_name = 'zzowthing';
  foreach c in array p_cook loop
    if c <> '' then
      insert into recipe_cookware (recipe_id, cookware_id) select rid, id from cookware where slug = c;
    end if;
  end loop;
  return rid;
end $$;

create temp table t_r as
select 'skillet' as k, pg_temp.mk('zzowunique Skillet', 'published', 'skillet') as id union all
select 'wokpot',       pg_temp.mk('zzowunique WokPot',  'published', 'wok', 'pot')         union all
select 'none',         pg_temp.mk('zzowunique None',    'published', '')                   union all
select 'draft',        pg_temp.mk('zzowunique Draft',   'draft',     'skillet');

create function pg_temp.mm(owned text[]) returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}')
  from match_recipes((select array[id] from ingredients where canonical_name = 'zzowthing'), 5, '{}', 1, 100,
                     owned_cookware_slugs => owned) m
  join t_r t on t.id = m.recipe_id $$;

create function pg_temp.ss(owned text[]) returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}')
  from search_recipes('zzowunique', owned_cookware_slugs => owned, result_limit => 50) s
  join t_r t on t.id = s.id and t.k <> 'draft' $$; -- tests run as the owner (no RLS): drafts are excluded by hand

do $$
begin
  -- match_recipes -----------------------------------------------------------------------------
  perform pg_temp.ok(pg_temp.mm(null) = array['none','skillet','wokpot'], 'matcher: NULL = no filter');
  perform pg_temp.ok(pg_temp.mm('{}') = array['none'], 'matcher: owns nothing -> only recipes with no cookware data');
  perform pg_temp.ok(pg_temp.mm(array['skillet']) = array['none','skillet'], 'matcher: skillet -> skillet recipe + no-data recipe');
  perform pg_temp.ok(pg_temp.mm(array['wok']) = array['none'], 'matcher: wok alone cannot make the wok+pot recipe');
  perform pg_temp.ok(pg_temp.mm(array['wok','pot']) = array['none','wokpot'], 'matcher: wok AND pot -> the wok+pot recipe');
  perform pg_temp.ok(pg_temp.mm(array['wok','pot','skillet']) = array['none','skillet','wokpot'], 'matcher: owns everything -> everything');
  perform pg_temp.ok(pg_temp.mm(array['no-such-pan']) = array['none'], 'matcher: unknown slug owns nothing real, no error');
  perform pg_temp.ok(pg_temp.mm(array['skillet','skillet']) = array['none','skillet'], 'matcher: duplicate slugs are harmless');
  perform pg_temp.ok(not exists (select 1 from match_recipes((select array[id] from ingredients where canonical_name = 'zzowthing'), 5,
        owned_cookware_slugs => array['skillet'], max_total_min => 5) m join t_r t on t.id = m.recipe_id and t.k = 'skillet'),
      'matcher: time filter (5 min < 20) is still ANDed with owned cookware');
  perform pg_temp.ok(pg_temp.mm(null) = (select coalesce(array_agg(t.k order by t.k), '{}')
      from match_recipes((select array[id] from ingredients where canonical_name = 'zzowthing'), 5, '{}', 1, 100,
                         cookware_slugs => null, owned_cookware_slugs => null) m join t_r t on t.id = m.recipe_id),
      'matcher: explicit NULLs behave like defaults');
  -- the two cookware filters compose: USES wok, and needs nothing beyond wok+pot
  perform pg_temp.ok((select coalesce(array_agg(t.k order by t.k), '{}')
      from match_recipes((select array[id] from ingredients where canonical_name = 'zzowthing'), 5, '{}', 1, 100,
                         cookware_slugs => array['wok'], owned_cookware_slugs => array['wok','pot']) m
      join t_r t on t.id = m.recipe_id) = array['wokpot'],
      'matcher: uses-any(wok) AND owned(wok,pot) -> only the wok+pot recipe');

  -- search_recipes ----------------------------------------------------------------------------
  perform pg_temp.ok(pg_temp.ss(null) = array['none','skillet','wokpot'], 'search: NULL = no filter');
  perform pg_temp.ok(pg_temp.ss('{}') = array['none'], 'search: owns nothing -> only no-data recipes');
  perform pg_temp.ok(pg_temp.ss(array['skillet']) = array['none','skillet'], 'search: skillet');
  perform pg_temp.ok(pg_temp.ss(array['wok']) = array['none'], 'search: wok alone');
  perform pg_temp.ok(pg_temp.ss(array['wok','pot']) = array['none','wokpot'], 'search: wok and pot');

  -- the old signatures are gone (a stale overload makes PostgREST answer "could not choose the best candidate")
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'match_recipes') = 1, 'exactly one match_recipes overload');
  perform pg_temp.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'search_recipes') = 1, 'exactly one search_recipes overload');
  -- settings carried over from earlier migrations
  perform pg_temp.ok(exists (select 1 from pg_proc where proname = 'match_recipes' and 'jit=off' = any (proconfig)), 'match_recipes keeps jit = off');
  perform pg_temp.ok(exists (select 1 from pg_proc where proname = 'search_recipes' and 'jit=off' = any (proconfig)), 'search_recipes keeps jit = off');
  perform pg_temp.ok(exists (select 1 from pg_proc where proname = 'search_recipes'
                             and 'pg_trgm.word_similarity_threshold=0.4' = any (proconfig)), 'search_recipes keeps its trigram threshold');

  -- user_cookware -----------------------------------------------------------------------------
  perform pg_temp.ok((select relrowsecurity from pg_class where relname = 'user_cookware'), 'user_cookware has RLS enabled');
  perform pg_temp.ok((select count(*) from pg_policy where polrelid = 'user_cookware'::regclass) = 3, 'user_cookware has select/insert/delete policies');
  perform pg_temp.ok(not exists (select 1 from pg_policy where polrelid = 'user_cookware'::regclass and polcmd = 'w'),
      'user_cookware has no UPDATE policy (a row is added or removed, never edited)');
end $$;

select 'owned cookware tests passed: ' || n || ' assertions' from t_n;

rollback;
