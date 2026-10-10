-- Regression test for wave 2 matcher quality: ingredient families, the M3.4
-- filters inside match_recipes, and search_recipes NULL semantics.
--
-- Self-contained: builds its own "zz" ingredients/recipes and ROLLS BACK. Needs
-- the real cuisines/diets/allergens reference rows (italian, vegan, egg) and the
-- real catalog for the search section, so run it on the snapshot, never on live:
--
--   psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -f supabase/tests/matcher_quality_test.sql
--
-- Success prints "matcher quality tests passed: N assertions"; any failure raises.

begin;

create temp table t_ids (name text primary key, id integer);

do $$
declare n text;
begin
  foreach n in array array['zzonion','zzyellow onion','zzred onion','zzgarlic','zzpasta','zzpenne','zzfish','zzegg'] loop
    insert into ingredients (canonical_name, slug, aisle_category)
    values (n, replace(n, ' ', '-'), 'Other');
  end loop;
  insert into t_ids select canonical_name::text, id from ingredients where canonical_name::text like 'zz%';
  -- family: zzonion -> zzyellow onion, zzred onion ; zzpasta -> zzpenne
  update ingredients set family_id = (select id from t_ids where name = 'zzonion')
   where canonical_name in ('zzyellow onion', 'zzred onion');
  update ingredients set family_id = (select id from t_ids where name = 'zzpasta')
   where canonical_name = 'zzpenne';
  -- the egg allergen rides in on an ingredient
  insert into ingredient_allergens (ingredient_id, allergen_id)
  select (select id from t_ids where name = 'zzegg'), id from allergens where slug = 'egg';
end $$;

create function pg_temp.i(n text) returns integer language sql as $$ select id from t_ids where name = n $$;

create function pg_temp.mk(p_title text, p_minutes integer, variadic p_names text[])
returns uuid language plpgsql as $$
declare rid uuid := gen_random_uuid(); nm text; k int := 0;
begin
  insert into recipes (id, slug, title, servings, status, published_at, cook_time_min)
  values (rid, 'zz-' || rid, p_title, 2, 'published', now(), p_minutes);
  foreach nm in array p_names loop
    k := k + 1;
    insert into recipe_ingredients (recipe_id, ingredient_id, sort_order) values (rid, pg_temp.i(nm), k);
  end loop;
  return rid;
end $$;

create temp table t_r as
select 'needs_yellow' as k, pg_temp.mk('zz NeedsYellow', 20, 'zzyellow onion', 'zzgarlic') as id union all
select 'needs_parent',      pg_temp.mk('zz NeedsParent', 20, 'zzonion', 'zzgarlic')            union all
select 'needs_red',         pg_temp.mk('zz NeedsRed',    20, 'zzred onion', 'zzgarlic')        union all
select 'needs_penne',       pg_temp.mk('zz NeedsPenne',  20, 'zzpenne', 'zzgarlic')            union all
select 'eggy',              pg_temp.mk('zz Eggy',        20, 'zzgarlic', 'zzegg')              union all
select 'slow',              pg_temp.mk('zz Slow',        90, 'zzgarlic')                       union all
select 'notime',            pg_temp.mk('zz NoTime',      0,  'zzgarlic')                       union all
select 'fast',             pg_temp.mk('zz Fast',        10, 'zzgarlic');

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
  garlic int := pg_temp.i('zzgarlic');
  m record;
  ids uuid[];
  s record;
  prev double precision;
  seen_unknown boolean;
  cnt int;
  page1 uuid[]; page2 uuid[]; c_score double precision; c_id uuid; chunk uuid[]; n int;
begin
  -- ===== FAMILIES =====
  -- parent in pantry covers a child the recipe names
  select * into m from match_recipes(array[garlic, pg_temp.i('zzonion')], 0) where recipe_id = pg_temp.rid('needs_yellow');
  perform pg_temp.ok(m.recipe_id is not null and m.missing_count = 0,
    'pantry parent (zzonion) must cover recipe child (zzyellow onion)');

  -- child in pantry covers a recipe that names the parent
  select * into m from match_recipes(array[garlic, pg_temp.i('zzred onion')], 0) where recipe_id = pg_temp.rid('needs_parent');
  perform pg_temp.ok(m.recipe_id is not null and m.missing_count = 0,
    'pantry child (zzred onion) must cover recipe parent (zzonion)');

  -- a sibling is NOT covered
  select * into m from match_recipes(array[garlic, pg_temp.i('zzred onion')], 1) where recipe_id = pg_temp.rid('needs_yellow');
  perform pg_temp.ok(m.missing_count = 1 and m.missing_names = array['zzyellow onion'],
    'pantry sibling (zzred onion) must NOT cover zzyellow onion; name stays readable');

  -- exact child still works
  select * into m from match_recipes(array[garlic, pg_temp.i('zzyellow onion')], 0) where recipe_id = pg_temp.rid('needs_yellow');
  perform pg_temp.ok(m.recipe_id is not null and m.missing_count = 0, 'exact child still matches');

  -- parent covers a different child recipe too (pasta family)
  select * into m from match_recipes(array[garlic, pg_temp.i('zzpasta')], 0) where recipe_id = pg_temp.rid('needs_penne');
  perform pg_temp.ok(m.recipe_id is not null and m.missing_count = 0, 'pantry zzpasta covers zzpenne recipe');

  -- coverage counts do not double count a parent+child pair held together
  select * into m from match_recipes(array[garlic, pg_temp.i('zzonion'), pg_temp.i('zzred onion')], 0)
   where recipe_id = pg_temp.rid('needs_yellow');
  perform pg_temp.ok(m.have_count = 2 and m.needed_count = 2, 'parent+child in pantry: have counted once per recipe ingredient');

  -- must_use through a family: use up "zzonion" -> recipes with any onion variant
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, array[pg_temp.i('zzonion')]);
  perform pg_temp.ok(pg_temp.rid('needs_yellow') = any (ids) and pg_temp.rid('needs_red') = any (ids)
                     and pg_temp.rid('needs_parent') = any (ids),
    'must_use parent must return recipes using any variant');
  perform pg_temp.ok(not (pg_temp.rid('needs_penne') = any (ids)), 'must_use onion must exclude recipes without any onion');

  -- must_use child does not leak to its sibling
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, array[pg_temp.i('zzred onion')]);
  perform pg_temp.ok(pg_temp.rid('needs_red') = any (ids) and pg_temp.rid('needs_parent') = any (ids)
                     and not (pg_temp.rid('needs_yellow') = any (ids)),
    'must_use zzred onion: red + parent recipes yes, yellow sibling recipe no');

  -- depth guard
  begin
    update ingredients set family_id = pg_temp.i('zzyellow onion') where canonical_name = 'zzpenne';
    perform pg_temp.ok(false, 'two-level family must be rejected');
  exception when raise_exception then
    perform pg_temp.ok(sqlerrm like '%one level%', 'depth trigger message');
  end;

  -- ===== FILTERS in match_recipes =====
  -- max_total_min: known-too-slow excluded; fast, mid, and unknown-time pass
  select array_agg(recipe_id) into ids from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, 30);
  perform pg_temp.ok(not (pg_temp.rid('slow') = any (ids)), 'maxTime 30 excludes a 90-minute recipe');
  perform pg_temp.ok(pg_temp.rid('fast') = any (ids) and pg_temp.rid('notime') = any (ids),
    'maxTime 30 keeps a 10-minute recipe AND the unknown-time recipe (NULL semantics)');

  -- allergen exclusion
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, null, null, null, array['egg']);
  perform pg_temp.ok(not (pg_temp.rid('eggy') = any (ids)) and pg_temp.rid('fast') = any (ids),
    'exclude egg drops the recipe containing the egg ingredient and keeps the rest');

  -- cuisine (strict): a recipe with no cuisine does not match
  update recipes set cuisine_id = (select id from cuisines where slug = 'italian') where id = pg_temp.rid('fast');
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, null, array['italian']);
  perform pg_temp.ok(ids = array[pg_temp.rid('fast')], 'cuisine=italian returns only the italian recipe');

  -- diet (ALL of): only recipes carrying the diet
  insert into recipe_diets (recipe_id, diet_id)
    select pg_temp.rid('fast'), id from diets where slug = 'vegan';
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, null, null, array['vegan']);
  perform pg_temp.ok(ids = array[pg_temp.rid('fast')], 'diet=vegan returns only the vegan recipe');
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, null, null, array['vegan', 'gluten-free']);
  perform pg_temp.ok(ids is null, 'diet=vegan,gluten-free requires BOTH (recipe has only vegan)');

  -- spice / calories / protein: unknown passes, known-out-of-range fails
  update recipes set spice_level = 4, calories = 900, protein_g = 5 where id = pg_temp.rid('slow');
  update recipes set spice_level = 1, calories = 300, protein_g = 30 where id = pg_temp.rid('fast');
  -- 'notime' keeps NULL spice/calories/protein
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, null, null, null, null, 2::smallint);
  perform pg_temp.ok(not (pg_temp.rid('slow') = any (ids)) and pg_temp.rid('fast') = any (ids) and pg_temp.rid('notime') = any (ids),
    'spiceMax 2: spice 4 out, spice 1 in, unknown spice in');
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, null, null, null, null, null, 200, 600);
  perform pg_temp.ok(not (pg_temp.rid('slow') = any (ids)) and pg_temp.rid('fast') = any (ids) and pg_temp.rid('notime') = any (ids),
    'calories 200..600: 900 out, 300 in, unknown in');
  select array_agg(recipe_id) into ids
    from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, null, null, null, null, null, null, null, 20);
  perform pg_temp.ok(not (pg_temp.rid('slow') = any (ids)) and pg_temp.rid('fast') = any (ids) and pg_temp.rid('notime') = any (ids),
    'proteinMin 20: 5g out, 30g in, unknown in');

  -- filters compose with the cursor: page through everything 1 at a time
  declare c_cov numeric; c_have int; c_tk int; c_rid uuid; total int := 0; seen uuid[] := '{}'; r record;
  begin
    for i in 1 .. 20 loop
      select * into r from match_recipes(array[garlic], 3, '{}', 1, 1, c_cov, c_have, c_tk, c_rid, 100);
      exit when r.recipe_id is null;
      perform pg_temp.ok(not (r.recipe_id = any (seen)), 'cursor page must not repeat a row');
      seen := seen || r.recipe_id;
      c_cov := r.coverage; c_have := r.have_count; c_tk := r.time_key; c_rid := r.recipe_id;
      total := total + 1;
    end loop;
    select count(*) into cnt from match_recipes(array[garlic], 3, '{}', 1, 100, null, null, null, null, 100);
    perform pg_temp.ok(total = cnt, 'paging one-by-one with filters reaches exactly the same rows as one big page');
  end;

  -- ===== search_recipes NULL semantics (real catalog) =====
  -- With a time filter: every known fit comes before every unknown-time row.
  prev := null; seen_unknown := false; cnt := 0;
  for s in select * from search_recipes('chicken', 30) loop
    cnt := cnt + 1;
    perform pg_temp.ok(coalesce(s.total_time_min, 0) = 0 or s.total_time_min <= 30,
      'search maxTime 30 returned a recipe known to exceed 30 minutes: ' || s.title);
    if coalesce(s.total_time_min, 0) = 0 then seen_unknown := true;
    else perform pg_temp.ok(not seen_unknown, 'known-time result ranked after an unknown-time one: ' || s.title);
    end if;
  end loop;
  perform pg_temp.ok(cnt > 0, 'search chicken under 30 min returns rows');
  perform pg_temp.ok(exists (select 1 from search_recipes('chicken', 30) where coalesce(total_time_min, 0) = 0),
    'search maxTime keeps unknown-time recipes (they used to be dropped / treated as instant)');

  -- Without any range filter nothing is offset: scores in [0,1).
  perform pg_temp.ok(not exists (select 1 from search_recipes('chicken') where score < 0 or score >= 1),
    'unfiltered search scores stay in [0,1)');

  -- Cursor round trip across the known/unknown boundary: 7 rows at a time must
  -- reproduce the single big page exactly (the cursor compares offset scores).
  select array_agg(id order by score desc, id desc) into page1
    from search_recipes('soup', 60, result_limit => 100);
  perform pg_temp.ok(exists (select 1 from search_recipes('soup', 60) where coalesce(total_time_min,0) = 0) and exists (select 1 from search_recipes('soup', 60) where total_time_min > 0), 'test premise: soup has both known and unknown times');
  perform pg_temp.ok(cardinality(page1) < 100, 'test premise: fewer than 100 soup results (single page holds all)');
  page2 := '{}';
  c_score := null; c_id := null;
  for n in 1 .. 40 loop
    select array_agg(id order by score desc, id desc) into chunk
      from search_recipes('soup', 60, result_limit => 7, cursor_score => c_score, cursor_id => c_id);
    exit when chunk is null;
    page2 := page2 || chunk;
    -- the cursor is the LAST row of the chunk (lowest score, then id)
    select s2.score, s2.id into c_score, c_id
      from search_recipes('soup', 60, result_limit => 100) s2
     where s2.id = chunk[cardinality(chunk)];
  end loop;
  perform pg_temp.ok(page1 = page2, 'chunked cursor paging reproduces the single-page order, crossing the unknown boundary');
end $$;

select format('matcher quality tests passed: %s assertions', n) as result from t_n;

rollback;
