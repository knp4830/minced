-- Regression test for M3.3: match_recipes() and suggest_ingredients().
--
-- Self-contained: builds its own ingredients and recipes (all prefixed "zz"),
-- asserts against them, and ROLLS BACK -- nothing persists, so it is safe on any
-- database that has the migrations applied, including a throwaway snapshot.
-- Do not run it against live: the inserts are rolled back, but that is not a
-- reason to take write locks on the production catalog.
--
--   psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -f supabase/tests/matcher_test.sql
--
-- Success prints "matcher tests passed: N assertions"; any failure raises.

begin;

create temp table t_ids (name text primary key, id integer);

do $$
declare
  n text;
begin
  foreach n in array array['zzchicken','zzchicken broth','zzrice','zzgarlic','zzscallion',
                           'zzlime','zzcilantro','zztomato','zzparsley'] loop
    insert into ingredients (canonical_name, slug, aisle_category)
    values (n, replace(n, ' ', '-'), 'Other');
  end loop;
  insert into ingredients (canonical_name, slug, aisle_category, is_pantry_staple)
  values ('zzsalt', 'zzsalt', 'Spices', true), ('zzoil', 'zzoil', 'Pantry', true);

  insert into t_ids select canonical_name::text, id from ingredients where canonical_name::text like 'zz%';
  insert into ingredient_aliases (ingredient_id, alias)
  select id, 'zzgreen onion' from t_ids where name = 'zzscallion';
end $$;

create function pg_temp.i(n text) returns integer language sql as
  $$ select id from t_ids where name = n $$;

-- A recipe builder: pg_temp.mk(title, minutes, status, variadic names)
-- Names prefixed '?' are optional; repeating a name creates a duplicate row.
create function pg_temp.mk(p_title text, p_minutes integer, p_status recipe_status, variadic p_names text[])
returns uuid language plpgsql as $$
declare
  rid uuid := gen_random_uuid();
  nm text; k int := 0;
begin
  insert into recipes (id, slug, title, servings, status, published_at, cook_time_min)
  values (rid, 'zz-' || rid, p_title, 2, p_status,
          case when p_status = 'published' then now() end, p_minutes);
  foreach nm in array p_names loop
    k := k + 1;
    insert into recipe_ingredients (recipe_id, ingredient_id, sort_order, is_optional)
    values (rid, pg_temp.i(ltrim(nm, '?')), k, left(nm, 1) = '?');
  end loop;
  return rid;
end $$;

create temp table t_r as
select 'full'      as k, pg_temp.mk('zz Full',      30, 'published', 'zzchicken','zzrice','zzgarlic','zzsalt','zzoil') as id union all
select 'oneshort',      pg_temp.mk('zz OneShort',   30, 'published', 'zzchicken','zzrice','zzlime')                    union all
select 'twoshort',      pg_temp.mk('zz TwoShort',   10, 'published', 'zzchicken','zzlime','zzcilantro')                union all
select 'optional',      pg_temp.mk('zz Optional',   20, 'published', 'zzchicken','zzrice','?zzparsley')                union all
select 'dupe',          pg_temp.mk('zz Dupe',       20, 'published', 'zzchicken','zzchicken','zzrice','zzgarlic')       union all
select 'unrelated',     pg_temp.mk('zz Unrelated',   5, 'published', 'zztomato','zzlime')                              union all
select 'draft',         pg_temp.mk('zz Draft',       5, 'draft',     'zzchicken','zzrice','zzgarlic')                  union all
select 'fast',          pg_temp.mk('zz Fast',        10, 'published', 'zzchicken','zzrice','zzgarlic')                 union all
select 'unknowntime',   pg_temp.mk('zz UnknownTime', 0,  'published', 'zzchicken','zzrice','zzgarlic');

create function pg_temp.rid(k text) returns uuid language sql as $$ select id from t_r where k = $1 $$;

create temp table t_n (n int);
insert into t_n values (0);

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  update t_n set n = n + 1;
end $$;

do $$
declare
  pantry int[] := array[pg_temp.i('zzchicken'), pg_temp.i('zzrice'), pg_temp.i('zzgarlic')];
  m record;
  names text[];
  seen uuid[] := '{}';
  c_cov numeric; c_have int; c_tk int; c_id uuid; got int; pages int := 0;
begin
  -- 1. staples never count as missing; coverage is 1 with nothing missing
  select * into m from match_recipes(pantry, 0) where recipe_id = pg_temp.rid('full');
  perform pg_temp.ok(m.coverage = 1 and m.missing_count = 0 and m.needed_count = 3 and m.missing_names = '{}',
    'staples (salt, oil) must not count toward needed or missing');

  -- 2. missing list is accurate and names are canonical
  select * into m from match_recipes(pantry, 2) where recipe_id = pg_temp.rid('twoshort');
  perform pg_temp.ok(m.missing_names = array['zzcilantro','zzlime'] and m.have_count = 1 and m.needed_count = 3
                  and m.coverage = 0.3333,
    'twoshort: missing zzcilantro, zzlime; 1 of 3; coverage 0.3333');

  -- 3. max_missing is a hard cap
  perform pg_temp.ok(not exists (select 1 from match_recipes(pantry, 1) where recipe_id = pg_temp.rid('twoshort')),
    'max_missing=1 must exclude a recipe missing two');
  perform pg_temp.ok(exists (select 1 from match_recipes(pantry, 1) where recipe_id = pg_temp.rid('oneshort')),
    'max_missing=1 must include a recipe missing one');

  -- 4. optional ingredients never count as missing
  select * into m from match_recipes(pantry, 0) where recipe_id = pg_temp.rid('optional');
  perform pg_temp.ok(m.missing_count = 0 and m.needed_count = 2, 'optional zzparsley must not be needed or missing');

  -- 5. a duplicate row counts once
  select * into m from match_recipes(pantry, 0) where recipe_id = pg_temp.rid('dupe');
  perform pg_temp.ok(m.needed_count = 3 and m.have_count = 3, 'duplicate zzchicken rows must count once');

  -- 6. nothing shared with the pantry => never returned, however small the recipe
  perform pg_temp.ok(not exists (select 1 from match_recipes(pantry, 10) where recipe_id = pg_temp.rid('unrelated')),
    'a recipe sharing no pantry ingredient must not be returned');

  -- 7. drafts are not matchable
  perform pg_temp.ok(not exists (select 1 from match_recipes(pantry, 10) where recipe_id = pg_temp.rid('draft')),
    'draft recipes must not be returned');

  -- 8. ordering: coverage desc, then have desc, then known-time asc, unknown last
  select array_agg(title order by ord) into names from (
    select title, row_number() over () as ord from match_recipes(pantry, 3) where title like 'zz %') x;
  perform pg_temp.ok(names[1] = 'zz Fast', 'fastest 100%-covered 3-of-3 recipe ranks first, got ' || names[1]);
  perform pg_temp.ok(names[array_length(names, 1)] is not null
                  and array_position(names, 'zz UnknownTime') > array_position(names, 'zz Full'),
    'unknown time (0) must sort after any known time at equal coverage');
  perform pg_temp.ok(array_position(names, 'zz Full') < array_position(names, 'zz OneShort'),
    '100% coverage ranks above 67%');

  -- 9. must-use ("use it up"): only recipes containing it, and it counts as owned
  perform pg_temp.ok(not exists (
      select 1 from match_recipes(pantry, 5, array[pg_temp.i('zzcilantro')])
      where recipe_id <> pg_temp.rid('twoshort')),
    'must_use=zzcilantro returns only recipes containing it');
  select * into m from match_recipes(pantry, 5, array[pg_temp.i('zzcilantro')]) limit 1;
  perform pg_temp.ok(m.have_count = 2 and m.missing_names = array['zzlime'],
    'a must-use ingredient is treated as owned');
  perform pg_temp.ok(not exists (select 1 from match_recipes(pantry, 5, array[pg_temp.i('zzcilantro'), pg_temp.i('zztomato')])),
    'two must-use ids must both be present');

  -- 10. min_have
  perform pg_temp.ok(not exists (select 1 from match_recipes(pantry, 5, '{}', 2) where recipe_id = pg_temp.rid('twoshort')),
    'min_have=2 excludes a recipe using only one pantry item');

  -- 11. degenerate inputs return nothing, not everything
  perform pg_temp.ok((select count(*) from match_recipes('{}')) = 0, 'empty pantry returns no rows');
  perform pg_temp.ok((select count(*) from match_recipes(null)) = 0, 'null pantry returns no rows');
  perform pg_temp.ok((select count(*) from match_recipes(array[pg_temp.i('zzsalt')], 9)) = 0,
    'a pantry of only staples returns no rows');

  -- 12. keyset pagination: walk 2 at a time, no duplicates, none skipped
  loop
    got := 0;
    for m in select * from match_recipes(pantry, 3, '{}', 1, 2, c_cov, c_have, c_tk, c_id) loop
      got := got + 1; seen := seen || m.recipe_id;
      c_cov := m.coverage; c_have := m.have_count; c_tk := m.time_key; c_id := m.recipe_id;
    end loop;
    exit when got = 0;
    pages := pages + 1;
  end loop;
  perform pg_temp.ok(cardinality(seen) = (select count(*) from match_recipes(pantry, 3, '{}', 1, 100)),
    'paged rows must equal the unpaged total');
  perform pg_temp.ok((select count(distinct x) from unnest(seen) x) = cardinality(seen), 'paging must not repeat a row');
  perform pg_temp.ok(pages >= 2, 'test must exercise more than one page');

  -- 13. suggest_ingredients
  perform pg_temp.ok((select ingredient_id from suggest_ingredients('zzgreen oni', 3) limit 1) = pg_temp.i('zzscallion'),
    'typing an alias prefix offers the canonical ingredient');
  perform pg_temp.ok((select canonical_name::text from suggest_ingredients('zzchicken', 5) limit 1) = 'zzchicken',
    'exact name outranks a longer name sharing the prefix');
  perform pg_temp.ok((select count(*) from suggest_ingredients('zzchicken', 5) where canonical_name::text = 'zzchicken broth') = 1,
    'the longer name is still offered');
  perform pg_temp.ok((select ingredient_id from suggest_ingredients('zzscalion', 3) limit 1) = pg_temp.i('zzscallion'),
    'a one-letter typo still finds the ingredient (trigram tier)');
  perform pg_temp.ok((select count(*) from suggest_ingredients('')) = 0 and (select count(*) from suggest_ingredients('  %_ ')) = 0,
    'empty or punctuation-only text offers nothing');
  perform pg_temp.ok((select count(*) from suggest_ingredients('zz', 3)) <= 3, 'max_results is honoured');
end $$;

select format('matcher tests passed: %s assertions', n) as result from t_n;

rollback;
