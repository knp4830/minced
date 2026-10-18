-- Type-ahead ranking gates for search_foods() (migration 20261017190000). Read-only; raises on failure.
--   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/nutrition/test_search_ranking.sql
do $$
declare first_row record; brands int; kik int; ok int;
begin
  -- `soy`: soy sauce first, then its brands with a household serving, within the default ten
  select * into first_row from search_foods('soy', 10) limit 1;
  if first_row.label is distinct from 'soy sauce' or first_row.kind <> 'ingredient' then
    raise exception 'GATE soy: first row is % (%), expected the soy sauce ingredient', first_row.label, first_row.kind;
  end if;
  select count(*) filter (where kind = 'brand'), count(*) filter (where kind = 'brand' and household_serving is not null and brand ilike '%kikkoman%')
    into brands, kik from search_foods('soy', 10);
  if brands < 2 then raise exception 'GATE soy: only % brand rows in the top 10', brands; end if;
  if kik < 1 then raise exception 'GATE soy: no Kikkoman row with a serving in the top 10'; end if;

  -- the brand rows come right after the lead, before the other soy ingredients
  select count(*) into ok from (select kind, row_number() over () rn from search_foods('soy', 10)) x where rn = 2 and kind = 'brand';
  if ok <> 1 then raise exception 'GATE soy: second row is not a brand of the lead'; end if;

  -- unchanged behaviours
  select * into first_row from search_foods('soy sauce', 10) limit 1;
  if first_row.label is distinct from 'soy sauce' then raise exception 'GATE soy sauce: first row is %', first_row.label; end if;
  select count(*) into kik from search_foods('kikkoman', 10) where brand ilike '%kikkoman%';
  if kik < 5 then raise exception 'GATE kikkoman: only % Kikkoman rows', kik; end if;
  select * into first_row from search_foods('rice', 10) limit 1;
  if first_row.label is distinct from 'rice' then raise exception 'GATE rice: first row is %', first_row.label; end if;
  raise notice 'ok search ranking';
end $$;
