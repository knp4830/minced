-- Wave 10c: fridge_recipes_grouped() and add_missing_to_shopping_list().
--
-- fridge_recipes_grouped must agree with match_recipes (same scoring and staples rule), put each recipe in the
-- right group, order soonest-expiring first inside a group, paginate one group by keyset without a skip or a
-- repeat, and return nothing for an empty fridge. add_missing_to_shopping_list adds only the named
-- ingredients, once. Needs the seeded catalog (959 recipes). Rolls back.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/fridge_grouped_test.sql

begin;

insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000010', 'fridge-grouped@example.test')
on conflict (id) do nothing;
insert into profiles (id) values ('cccccccc-0000-0000-0000-000000000010') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000010', true);

do $$
declare
  ids   int[];
  carrot int;
  n     int;
  bad   int;
  tot   int;
  walked int := 0;
  pages int := 0;
  seen  uuid[] := '{}';
  r     record;
  cs int; cc numeric; ch int; ct int; cr uuid; got int;
  prev_null boolean;
  rid   uuid;
  mid   int;
  res   jsonb;
begin
  select array_agg(id) into ids from ingredients
   where canonical_name in ('chicken breast','onion','garlic','rice','tomato','egg','cheddar cheese','broccoli','pasta','spinach','carrot','potato');
  if coalesce(cardinality(ids), 0) < 10 then raise exception 'FAILED: test ingredients missing'; end if;
  select id into carrot from ingredients where canonical_name = 'carrot';

  -- 1. empty fridge: nothing
  if exists (select 1 from fridge_recipes_grouped('{}'::int[])) then
    raise exception 'FAILED: an empty fridge must return nothing'; end if;

  -- 2. every row sits in the group its missing_count says
  select count(*) into bad from fridge_recipes_grouped(ids, null, 50) g
   where g.grp <> case when g.missing_count = 0 then 'now' when g.missing_count = 1 then 'missing1'
                       when g.missing_count = 2 then 'missing2' else 'more' end;
  if bad > 0 then raise exception 'FAILED: % rows in the wrong group', bad; end if;

  -- 3. parity with match_recipes: same recipes with nothing missing, and with one missing
  select count(*) into bad from (
    select recipe_id from match_recipes(ids, 0, '{}', 1, 100)
    except select recipe_id from fridge_recipes_grouped(ids, 'now', 12, 100)) x;
  if bad > 0 then raise exception 'FAILED: % "make now" recipes match_recipes has and the grouped one lacks', bad; end if;
  select count(*) into bad from (
    select recipe_id from fridge_recipes_grouped(ids, 'now', 12, 100)
    except select recipe_id from match_recipes(ids, 0, '{}', 1, 100)) x;
  if bad > 0 then raise exception 'FAILED: % "make now" recipes the grouped one has and match_recipes lacks', bad; end if;
  select count(*) into bad from (
    select recipe_id from match_recipes(ids, 1, '{}', 1, 100) where missing_count = 1
    except select recipe_id from fridge_recipes_grouped(ids, 'missing1', 12, 100)) x;
  if bad > 0 then raise exception 'FAILED: % "missing 1" recipes differ from match_recipes', bad; end if;

  -- 4. staples never count as missing, and ids and names line up (same length, same order)
  select count(*) into bad from fridge_recipes_grouped(ids, null, 50) g
   where exists (select 1 from ingredients i where i.id = any (g.missing_ids) and i.is_pantry_staple)
      or cardinality(g.missing_ids) <> cardinality(g.missing_names)
      or cardinality(g.missing_ids) <> g.missing_count;
  if bad > 0 then raise exception 'FAILED: % rows with a staple, or misaligned missing ids and names', bad; end if;

  -- 5. group_total is the whole group and holds on every row
  select count(*) into bad from (
    select grp, count(distinct group_total) d from fridge_recipes_grouped(ids, null, 50) group by grp having count(distinct group_total) > 1) x;
  if bad > 0 then raise exception 'FAILED: group_total differs inside a group'; end if;

  -- 6. soon-expiring first: with carrot due tomorrow, rows that use it come before rows that do not
  for r in select distinct grp from fridge_recipes_grouped(ids, null, 50) loop
    prev_null := false;
    for got in
      select case when soon_day is null then 1 else 0 end
        from fridge_recipes_grouped(ids, r.grp, 12, 100, array[carrot], array[1])
    loop
      if got = 1 then prev_null := true;
      elsif prev_null then raise exception 'FAILED: a soon-expiring recipe follows one that is not, in group %', r.grp; end if;
    end loop;
  end loop;
  if not exists (select 1 from fridge_recipes_grouped(ids, 'now', 12, 100, array[carrot], array[1]) where soon_day = 1) then
    raise exception 'FAILED: no "make now" recipe reports using the carrot due tomorrow'; end if;

  -- 7. keyset paging of one group: no skip, no repeat
  select max(group_total) into tot from fridge_recipes_grouped(ids, 'more', 1, 1);
  loop
    got := 0;
    for r in select * from fridge_recipes_grouped(ids, 'more', 1, 17, '{}', '{}', cs, cc, ch, ct, cr) loop
      got := got + 1; walked := walked + 1; seen := seen || r.recipe_id;
      cs := r.soon_key; cc := r.coverage; ch := r.have_count; ct := r.time_key; cr := r.recipe_id;
    end loop;
    pages := pages + 1;
    exit when got < 17 or pages > 200;
  end loop;
  if walked <> tot or (select count(distinct x) from unnest(seen) x) <> tot then
    raise exception 'FAILED: paging walked % rows (% distinct) of %', walked, (select count(distinct x) from unnest(seen) x), tot; end if;

  -- 8. add_missing_to_shopping_list: only what is named, once
  select g.recipe_id, g.missing_ids[1] into rid, mid from fridge_recipes_grouped(ids, 'missing1', 5, 5) g limit 1;
  if rid is null then raise exception 'FAILED: no missing-1 recipe to test with'; end if;
  res := add_missing_to_shopping_list(rid, array[mid]);
  if (res ->> 'added')::int <> 1 or (select count(*) from shopping_list_items where source_recipe_id = rid) <> 1 then
    raise exception 'FAILED: first add (%)', res; end if;
  res := add_missing_to_shopping_list(rid, array[mid]);
  if (res ->> 'added')::int <> 0 or (res ->> 'already')::int <> 1
     or (select count(*) from shopping_list_items where source_recipe_id = rid) <> 1 then
    raise exception 'FAILED: a second tap must not double the line (%)', res; end if;
  begin
    perform add_missing_to_shopping_list(rid, '{}');
    raise exception 'FAILED: an empty list must be refused';
  exception when sqlstate '22023' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform add_missing_to_shopping_list(rid, array[mid]);
    raise exception 'FAILED: signed-out add must be refused';
  exception when sqlstate '28000' then null;
  end;

  raise notice 'fridge grouped tests passed';
end $$;

rollback;
