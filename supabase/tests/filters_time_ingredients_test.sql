-- Wave 8 filters lane: min_total_min (time RANGE) and include_ingredient_ids (ingredient
-- filter) on match_recipes, search_recipes and filtered_recipes. Read-only; run on the
-- snapshot or a local stack:  psql -v ON_ERROR_STOP=1 -f supabase/tests/filters_time_ingredients_test.sql
do $$
declare
  n int := 0;
  v int;
  w int;
  chicken int; spinach int; onion int; yogurt int; egg int;
  pantry int[];
begin
  select id into chicken from ingredients where canonical_name = 'chicken';
  select id into spinach from ingredients where canonical_name = 'spinach';
  select id into onion   from ingredients where canonical_name = 'onion';
  select id into egg     from ingredients where canonical_name = 'egg';
  select array_agg(id) into pantry from ingredients where canonical_name in ('chicken','onion','rice','garlic','tomato');

  -- 1. TIME RANGE, search: every known-time row is inside [15, 30]; unknown time is EXCLUDED (wave 14).
  select count(*) into v from search_recipes('chicken', min_total_min => 15, max_total_min => 30, result_limit => 100) r
   where r.total_time_min > 0 and (r.total_time_min < 15 or r.total_time_min > 30);
  if v <> 0 then raise exception 'search: % rows outside the 15-30 range', v; end if;
  n := n + 1;
  select count(*) into v from search_recipes('chicken', min_total_min => 15, max_total_min => 30, result_limit => 100) r
   where coalesce(r.total_time_min, 0) = 0;
  if v <> 0 then raise exception 'search: % unknown-time rows passed a time range', v; end if;
  n := n + 1;

  -- 2. TIME RANGE, matcher: same two properties.
  select count(*) into v from match_recipes(pantry, 8, page_size => 100, min_total_min => 30, max_total_min => 60) r
   where r.total_time_min > 0 and (r.total_time_min < 30 or r.total_time_min > 60);
  if v <> 0 then raise exception 'match: % rows outside the 30-60 range', v; end if;
  n := n + 1;
  select count(*) into v from match_recipes(pantry, 8, page_size => 100, min_total_min => 30, max_total_min => 60) r
   where coalesce(r.total_time_min, 0) = 0;
  select count(*) into w from match_recipes(pantry, 8, page_size => 100) r where coalesce(r.total_time_min, 0) = 0;
  if v <> 0 then raise exception 'match: % unknown-time rows passed a time range', v; end if;
  if w = 0 then raise exception 'match: with no time filter untimed recipes must still show'; end if;
  n := n + 1;

  -- 3. Open-ended ranges and a min above everything behave.
  select count(*) into v from search_recipes('chicken', min_total_min => 600, result_limit => 100) r where r.total_time_min > 0;
  if v <> 0 then raise exception 'min 600 should leave nothing known, got % known', v; end if;
  select count(*) into v from search_recipes('chicken', min_total_min => 600, result_limit => 100);
  if v <> 0 then raise exception 'min 600 must not let unknown-time rows through, got %', v; end if;
  n := n + 1;

  -- 4. INCLUDE, search: every row has BOTH ingredients (family-expanded, non-optional).
  select count(*) into v from search_recipes('chicken', include_ingredient_ids => array[chicken, onion], result_limit => 100) r
   where not exists (select 1 from recipe_ingredients x
                     where x.recipe_id = r.id and not x.is_optional
                       and x.ingredient_id = any (expand_ingredient_family(array[chicken])))
      or not exists (select 1 from recipe_ingredients x
                     where x.recipe_id = r.id and not x.is_optional
                       and x.ingredient_id = any (expand_ingredient_family(array[onion])));
  if v <> 0 then raise exception 'search include: % rows lack a requested ingredient', v; end if;
  n := n + 1;
  select count(*) into v from search_recipes('chicken', include_ingredient_ids => array[chicken, onion], result_limit => 100);
  if v = 0 then raise exception 'search include: chicken + onion should find recipes'; end if;
  n := n + 1;

  -- 5. ALL semantics: adding an ingredient never widens the result.
  select count(*) into v from search_recipes('chicken', include_ingredient_ids => array[chicken], result_limit => 100);
  select count(*) into w from search_recipes('chicken', include_ingredient_ids => array[chicken, spinach], result_limit => 100);
  if w > v then raise exception 'include is ALL-of: % > %', w, v; end if;
  n := n + 1;

  -- 6. NULL and empty array are the same as no filter.
  select count(*) into v from search_recipes('chicken', result_limit => 100);
  select count(*) into w from search_recipes('chicken', include_ingredient_ids => '{}', result_limit => 100);
  if v <> w then raise exception 'empty include must be a no-op (% vs %)', v, w; end if;
  n := n + 1;

  -- 7. INCLUDE, matcher: every row has the ingredient even though it is not in the pantry.
  select count(*) into v from match_recipes(pantry, 8, page_size => 100, include_ingredient_ids => array[spinach]) r
   where not exists (select 1 from recipe_ingredients x
                     where x.recipe_id = r.recipe_id and not x.is_optional
                       and x.ingredient_id = any (expand_ingredient_family(array[spinach])));
  if v <> 0 then raise exception 'match include: % rows lack spinach', v; end if;
  n := n + 1;
  select count(*) into v from match_recipes(pantry, 8, page_size => 100, include_ingredient_ids => array[spinach]);
  select count(*) into w from match_recipes(pantry, 8, page_size => 100);
  if v >= w then raise exception 'match include: spinach should narrow (% vs %)', v, w; end if;
  n := n + 1;

  -- 8. A child satisfies its parent's request (family expansion): asking for "onion" finds
  --    a recipe that only lists a variant, if one exists in this catalog.
  select count(*) into v from filtered_recipes(null, array[onion]);
  select count(distinct ri.recipe_id) into w from recipe_ingredients ri
   where not ri.is_optional and ri.ingredient_id = any (expand_ingredient_family(array[onion]))
     and exists (select 1 from recipes r where r.id = ri.recipe_id);
  if v <> w then raise exception 'filtered_recipes include (% vs direct count %)', v, w; end if;
  n := n + 1;

  -- 9. filtered_recipes: both arguments combine, NULL/empty are no-ops, owned '{}' means owns nothing.
  select count(*) into v from filtered_recipes();
  select count(*) into w from recipes;
  if v <> w then raise exception 'filtered_recipes() must equal recipes (% vs %)', v, w; end if;
  n := n + 1;
  select count(*) into v from filtered_recipes(null, '{}');
  if v <> w then raise exception 'filtered_recipes(null, {}) must equal recipes'; end if;
  n := n + 1;
  select count(*) into v from filtered_recipes('{}', null);
  select count(*) into w from makeable_recipes('{}');
  if v <> w then raise exception 'filtered_recipes(owned) must equal makeable_recipes (% vs %)', v, w; end if;
  n := n + 1;
  select count(*) into v from filtered_recipes('{}', array[egg]);
  select count(*) into w from filtered_recipes(null, array[egg]);
  if v > w then raise exception 'owned + include must not widen'; end if;
  n := n + 1;

  -- 10. filter_group: every ingredient used by a recipe has a shelf or is Dairy (derived in the app).
  select count(*) into v from ingredients i
   where i.filter_group is null and i.aisle_category <> 'Dairy';
  if v <> 0 then raise exception '% non-dairy ingredients have no filter_group', v; end if;
  n := n + 1;
  select count(*) into v from ingredients c join ingredients p on p.id = c.family_id
   where p.filter_group is not null and c.filter_group is distinct from p.filter_group;
  if v <> 0 then raise exception '% family children disagree with their parent shelf', v; end if;
  n := n + 1;

  raise notice 'filters time + ingredients tests passed: % assertions', n;
end $$;
