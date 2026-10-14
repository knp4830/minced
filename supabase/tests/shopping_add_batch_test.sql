-- Wave 7: add_recipe_to_shopping_list(..., p_add_batch).
-- Default = replace the recipe's earlier lines (a retry never doubles the list).
-- p_add_batch = true keeps them and adds another batch (quantities add up).
-- Needs the shakshuka seed recipe. Runs as the table owner with a stubbed auth.uid();
-- RLS and grants are covered by shopping_list_test.sql / shopping_list_api_test.sh.
-- Self-contained, rolls back.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/shopping_add_batch_test.sql

begin;

insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'batch@example.test')
on conflict (id) do nothing;
insert into profiles (id) values ('cccccccc-0000-0000-0000-000000000003') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);

do $$
declare
  rid  uuid := (select id from recipes where slug = 'shakshuka');
  n1   int;
  q1   numeric;
  r    jsonb;
begin
  if rid is null then raise exception 'seed recipe shakshuka missing'; end if;

  -- the 4-argument call still works (default replace)
  r := add_recipe_to_shopping_list(rid, 3, true, '{}');
  select count(*), coalesce(sum(quantity), 0) into n1, q1 from shopping_list_items where source_recipe_id = rid;
  if n1 = 0 or n1 <> (r ->> 'added')::int then raise exception 'FAILED: first add (% rows, added %)', n1, r ->> 'added'; end if;

  -- default again: replaces, no doubling
  perform add_recipe_to_shopping_list(rid, 3, true, '{}');
  if (select count(*) from shopping_list_items where source_recipe_id = rid) <> n1 then
    raise exception 'FAILED: default re-add must replace, not double'; end if;

  -- add again as a batch: doubles rows and quantities
  perform add_recipe_to_shopping_list(rid, 3, true, '{}', true);
  if (select count(*) from shopping_list_items where source_recipe_id = rid) <> 2 * n1 then
    raise exception 'FAILED: batch add must keep the earlier lines (expected %)', 2 * n1; end if;
  if (select coalesce(sum(quantity), 0) from shopping_list_items where source_recipe_id = rid) <> 2 * q1 then
    raise exception 'FAILED: quantities must add up across batches'; end if;

  -- a third batch at different servings (6 = double quantities): 1x + 1x + 2x
  perform add_recipe_to_shopping_list(rid, 6, true, '{}', true);
  if (select count(*) from shopping_list_items where source_recipe_id = rid) <> 3 * n1 then
    raise exception 'FAILED: third batch row count'; end if;
  if (select coalesce(sum(quantity), 0) from shopping_list_items where source_recipe_id = rid) <> 4 * q1 then
    raise exception 'FAILED: third batch quantities (1x + 1x + 2x = 4x)'; end if;

  -- NULL p_add_batch behaves as false (replace)
  perform add_recipe_to_shopping_list(rid, 3, true, '{}', null);
  if (select count(*) from shopping_list_items where source_recipe_id = rid) <> n1 then
    raise exception 'FAILED: NULL batch flag must replace'; end if;

  -- only one overload exists (no ambiguous call for PostgREST)
  if (select count(*) from pg_proc where proname = 'add_recipe_to_shopping_list' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'FAILED: expected exactly one add_recipe_to_shopping_list'; end if;

  -- signed out still refused
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform add_recipe_to_shopping_list(rid, 3, true, '{}', true);
    raise exception 'FAILED: signed-out add must be refused';
  exception when sqlstate '28000' then null;
  end;

  raise notice 'shopping add-batch tests passed';
end $$;

rollback;
