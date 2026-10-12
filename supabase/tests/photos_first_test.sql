-- Photos-first ordering (wave 3): has_photo trigger + tie-breaks + cursor paging.
-- Runs in a transaction and rolls back. Needs the live-shaped catalog (snapshot or live).
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/photos_first_test.sql
begin;

create temp table t_log (n serial, msg text);

do $$
declare
  rid uuid; fl boolean; bad int; n_all int; n_walk int; n_dup int;
  pantry int[]; cur_cov numeric; cur_have int; cur_tk int; cur_id uuid; rows_in_page int;
  s_cur_score float8; s_cur_id uuid;
begin
  -- 1. trigger: insert sets the flag, delete clears it ------------------------------------------
  select r.id into rid from recipes r
   where not exists (select 1 from recipe_photos p where p.recipe_id = r.id) order by r.slug limit 1;
  insert into recipe_photos (recipe_id, storage_path, width, height, source, license, attribution_url)
  values (rid, 'usda/test/md.webp', 100, 100, 'usda_myplate', 'Public domain', 'https://example.test/x');
  select has_photo into fl from recipes where id = rid;
  assert fl, 'insert into recipe_photos must set recipes.has_photo';
  delete from recipe_photos where recipe_id = rid;
  select has_photo into fl from recipes where id = rid;
  assert not fl, 'deleting the photo row must clear recipes.has_photo';

  -- give ~half of the catalog a photo so ties between photo / no-photo are common
  insert into recipe_photos (recipe_id, storage_path, width, height, source, license, attribution_url)
  select r.id, 'usda/t/' || r.slug, 100, 100, 'usda_myplate', 'Public domain', 'https://example.test/x'
  from recipes r
  where not exists (select 1 from recipe_photos p where p.recipe_id = r.id) and (hashtext(r.slug) % 2) = 0;
  assert (select count(*) from recipes where has_photo) = (select count(*) from recipe_photos),
         'has_photo must equal existence of a photo row for every recipe';

  -- 2. match_recipes: order is (coverage desc, have desc, has_photo desc, time_key, id) ---------
  select array_agg(id) into pantry from ingredients
   where canonical_name in ('egg','milk','onion','tomato','garlic','cheddar cheese','rice','banana','chicken breast');
  assert cardinality(pantry) >= 6, 'test pantry ingredients missing';

  create temp table t_m on commit drop as
    select row_number() over () as pos, m.*, r.has_photo
    from match_recipes(pantry, 6, '{}', 1, 100) m join recipes r on r.id = m.recipe_id;
  select count(*) into n_all from t_m;
  assert n_all >= 30, format('expected a decent result list, got %s', n_all);

  select count(*) into bad from t_m a join t_m b on b.pos = a.pos + 1
   where (a.coverage, a.have_count) = (b.coverage, b.have_count)
     and (not a.has_photo) and b.has_photo;
  assert bad = 0, 'a no-photo recipe sits above a photo recipe with equal coverage and have_count';
  select count(*) into bad from t_m a join t_m b on b.pos = a.pos + 1
   where (a.coverage, a.have_count) < (b.coverage, b.have_count);
  assert bad = 0, 'a photo must never lift a recipe above a better coverage score';
  assert exists (select 1 from t_m a join t_m b on b.pos = a.pos + 1
                 where (a.coverage, a.have_count) = (b.coverage, b.have_count) and a.has_photo <> b.has_photo),
         'test is vacuous: no coverage tie between photo and no-photo recipes';

  -- 3. cursor walk, 7 per page, equals the single-page order (no repeats, no gaps) --------------
  create temp table t_walk (pos serial, recipe_id uuid) on commit drop;
  cur_id := null;
  loop
    create temp table t_pg on commit drop as
      select m.*, row_number() over () as k from match_recipes(pantry, 6, '{}', 1, 7, cur_cov, cur_have, cur_tk, cur_id) m;
    select count(*) into rows_in_page from t_pg;
    exit when rows_in_page = 0;
    insert into t_walk (recipe_id) select recipe_id from t_pg order by k;
    select coverage, have_count, time_key, recipe_id into cur_cov, cur_have, cur_tk, cur_id
      from t_pg order by k desc limit 1;
    drop table t_pg;
    exit when (select count(*) from t_walk) >= n_all + 7;
  end loop;
  select count(*) into n_walk from t_walk;
  select count(*) - count(distinct recipe_id) into n_dup from t_walk;
  assert n_dup = 0, format('cursor walk repeated %s recipes', n_dup);
  assert n_walk >= n_all, format('cursor walk saw %s recipes, single page saw %s', n_walk, n_all);
  assert (select array_agg(recipe_id order by pos) from t_walk where pos <= n_all) = (select array_agg(recipe_id order by pos) from t_m),
         'cursor walk order differs from single-page order';

  -- 4. search_recipes ---------------------------------------------------------------------------
  create temp table t_s on commit drop as
    select row_number() over () as pos, s.*, r.has_photo
    from search_recipes(q => 'chicken', result_limit => 100) s
    join recipes r on r.id = s.id;
  select count(*) into n_all from t_s;
  assert n_all >= 20, 'expected chicken results';
  select count(*) into bad from t_s a join t_s b on b.pos = a.pos + 1 where a.score < b.score;
  assert bad = 0, 'search score order broken';
  select count(*) into bad from t_s a join t_s b on b.pos = a.pos + 1
   where a.score = b.score and (not a.has_photo) and b.has_photo;
  assert bad = 0, 'search: no-photo recipe above photo recipe at equal score';

  create temp table t_sw (pos serial, id uuid) on commit drop;
  s_cur_score := null; s_cur_id := null;
  loop
    create temp table t_sp on commit drop as
      select s.*, row_number() over () as k from search_recipes(q => 'chicken', result_limit => 7, cursor_score => s_cur_score, cursor_id => s_cur_id) s;
    select count(*) into rows_in_page from t_sp;
    exit when rows_in_page = 0;
    insert into t_sw (id) select id from t_sp order by k;
    select score, id into s_cur_score, s_cur_id from t_sp order by k desc limit 1;
    drop table t_sp;
    exit when (select count(*) from t_sw) > n_all + 7;
  end loop;
  select count(*) - count(distinct id) into n_dup from t_sw;
  assert n_dup = 0, format('search cursor walk repeated %s recipes', n_dup);
  assert (select count(*) from t_sw) >= n_all, format('search walk saw %s, single page %s', (select count(*) from t_sw), n_all);
  assert (select array_agg(id order by pos) from t_sw where pos <= n_all) = (select array_agg(id order by pos) from t_s),
         'search cursor walk order differs from single-page order';

  insert into t_log (msg) values ('photos-first tests passed');
end $$;

select msg as result from t_log;
rollback;
