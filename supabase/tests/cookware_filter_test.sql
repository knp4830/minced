-- Wave 4: cookware filter on match_recipes() and search_recipes().
-- Contract: `cookware_slugs text[] DEFAULT NULL`; a recipe matches when it USES ANY
-- of the slugs; recipes with no cookware data do NOT match; NULL / '{}' = no filter.
-- Self-contained, rolls back. Needs the migrations (snapshot or local stack).
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/cookware_filter_test.sql
--
-- Success prints "cookware tests passed: N assertions".

begin;

create temp table t_n (n int);
insert into t_n values (0);

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  update t_n set n = n + 1;
end $$;

insert into ingredients (canonical_name, slug, aisle_category) values ('zzcwthing', 'zzcwthing', 'Other');

create function pg_temp.mk(p_title text, p_status recipe_status, variadic p_cook text[])
returns uuid language plpgsql as $$
declare rid uuid := gen_random_uuid(); c text;
begin
  insert into recipes (id, slug, title, servings, status, published_at, cook_time_min)
  values (rid, 'zz-' || rid, p_title, 2, p_status, case when p_status = 'published' then now() end, 20);
  insert into recipe_ingredients (recipe_id, ingredient_id, sort_order)
  select rid, id, 1 from ingredients where canonical_name = 'zzcwthing';
  foreach c in array p_cook loop
    if c <> '' then
      insert into recipe_cookware (recipe_id, cookware_id) select rid, id from cookware where slug = c;
    end if;
  end loop;
  return rid;
end $$;

create temp table t_r as
select 'skillet' as k, pg_temp.mk('zzcwunique Skillet', 'published', 'skillet') as id union all
select 'wokpot',       pg_temp.mk('zzcwunique WokPot',  'published', 'wok', 'pot')         union all
select 'none',         pg_temp.mk('zzcwunique None',    'published', '')                   union all
select 'draft',        pg_temp.mk('zzcwunique Draft',   'draft',     'skillet');

create function pg_temp.mm(slugs text[]) returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}')
  from match_recipes((select array[id] from ingredients where canonical_name = 'zzcwthing'), 5, '{}', 1, 100,
                     cookware_slugs => slugs) m
  join t_r t on t.id = m.recipe_id $$;

create function pg_temp.ss(slugs text[]) returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}')
  from search_recipes('zzcwunique', cookware_slugs => slugs, result_limit => 50) s
  join t_r t on t.id = s.id and t.k <> 'draft' $$; -- tests run as the owner (no RLS): drafts are excluded here by hand

do $$
begin
  -- match_recipes -----------------------------------------------------------------------------
  perform pg_temp.ok(pg_temp.mm(null) = array['none','skillet','wokpot'], 'matcher: NULL = no filter (draft still hidden)');
  perform pg_temp.ok(pg_temp.mm('{}') = array['none','skillet','wokpot'], 'matcher: empty array = no filter');
  perform pg_temp.ok(pg_temp.mm(array['skillet']) = array['skillet'], 'matcher: skillet -> only the skillet recipe (no cookware data and drafts excluded)');
  perform pg_temp.ok(pg_temp.mm(array['wok']) = array['wokpot'], 'matcher: wok -> the wok+pot recipe');
  perform pg_temp.ok(pg_temp.mm(array['skillet','wok']) = array['skillet','wokpot'], 'matcher: ANY of skillet, wok');
  perform pg_temp.ok(pg_temp.mm(array['wok','pot']) = array['wokpot'], 'matcher: a recipe matching two requested cookware appears once');
  perform pg_temp.ok(pg_temp.mm(array['blender']) = '{}', 'matcher: cookware nobody uses -> nothing');
  perform pg_temp.ok(pg_temp.mm(array['no-such-pan']) = '{}', 'matcher: unknown slug -> nothing, no error');
  perform pg_temp.ok(not exists (select 1 from match_recipes((select array[id] from ingredients where canonical_name = 'zzcwthing'), 5,
        cookware_slugs => array['skillet'], max_total_min => 5) m join t_r t on t.id = m.recipe_id and t.k = 'skillet'),
      'matcher: time filter (5 min < 20) is still ANDed with cookware');

  -- search_recipes ----------------------------------------------------------------------------
  perform pg_temp.ok(pg_temp.ss(null) = array['none','skillet','wokpot'], 'search: NULL = no filter');
  perform pg_temp.ok(pg_temp.ss('{}') = array['none','skillet','wokpot'], 'search: empty array = no filter');
  perform pg_temp.ok(pg_temp.ss(array['skillet']) = array['skillet'], 'search: skillet only');
  perform pg_temp.ok(pg_temp.ss(array['wok']) = array['wokpot'], 'search: wok only');
  perform pg_temp.ok(pg_temp.ss(array['skillet','wok']) = array['skillet','wokpot'], 'search: ANY of skillet, wok');
  perform pg_temp.ok(pg_temp.ss(array['wok','pot']) = array['wokpot'], 'search: two matching cookware -> one row');
  perform pg_temp.ok(pg_temp.ss(array['no-such-pan']) = '{}', 'search: unknown slug -> nothing');

  -- the old call shapes (no cookware argument) still work and are not ambiguous
  perform pg_temp.ok((select count(*) from match_recipes(array[1])) >= 0, 'matcher: call without cookware arg resolves');
  perform pg_temp.ok((select count(*) from search_recipes('zzcwunique') s join t_r t on t.id = s.id and t.k <> 'draft') = 3, 'search: call without cookware arg resolves');
end $$;

select 'cookware tests passed: ' || n || ' assertions' as result from t_n;

rollback;
