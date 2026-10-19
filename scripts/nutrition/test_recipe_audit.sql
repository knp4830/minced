-- Regression checks for the recipe-audit fixes (migration 20261017180000 + seed-nutrition-zzzz-recipe-audit.sql).
--   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/nutrition/test_recipe_audit.sql
-- Raises on the first failure; a green run prints the final "ok" row. Read-only.
do $$
declare
  pasta int; salt int; lemon int; thighs int; onion int;
  gaps  text[]; st text; n int; g numeric; g2 numeric;
  unit_lb int; unit_cup int;
begin
  select id into pasta  from ingredients where canonical_name = 'pasta';
  select id into salt   from ingredients where canonical_name = 'salt';
  select id into lemon  from ingredients where canonical_name = 'lemon';
  select id into thighs from ingredients where canonical_name = 'chicken thighs';
  select id into onion  from ingredients where canonical_name = 'yellow onion';
  select id into unit_lb  from units where name = 'lb';
  select id into unit_cup from units where name = 'cup';

  -- 1. a main ingredient with no amount is a gap; salt and lemon with no amount are "to taste"
  select count(*) into n from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', pasta))) where state = 'no_quantity';
  if n <> 1 then raise exception 'FAIL 1a: pasta with no amount is not a gap'; end if;
  select count(*) into n from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', salt))) where state = 'to_taste';
  if n <> 1 then raise exception 'FAIL 1b: salt with no amount is not to taste'; end if;
  select count(*) into n from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', lemon))) where state = 'to_taste';
  if n <> 1 then raise exception 'FAIL 1c: lemon with no amount is not to taste'; end if;

  -- the summary names the gap and is partial, never complete
  select s.status, s.gaps into st, gaps from nutrition_summary(jsonb_build_array(
      jsonb_build_object('ingredient_id', pasta),
      jsonb_build_object('ingredient_id', thighs, 'quantity', 1, 'unit_id', unit_lb))) s;
  if st <> 'partial' or not (gaps @> array['pasta (no amount given)']) then raise exception 'FAIL 1d: status % gaps %', st, gaps; end if;

  -- 2. "optional" in the prep note is an optional line, and the stored flag agrees
  select count(*) into n from nutrition_line_report(jsonb_build_array(
      jsonb_build_object('ingredient_id', thighs, 'quantity', 1, 'unit_id', unit_lb, 'prep_note', 'optional'))) where state = 'optional';
  if n <> 1 then raise exception 'FAIL 2a: prep note optional'; end if;
  if exists (select 1 from recipe_ingredients where prep_note ~* '\moptional\M' and not is_optional) then
    raise exception 'FAIL 2b: a line says optional but is_optional is false';
  end if;

  -- 3. compute_nutrients returns nothing for an unavailable set of lines
  select count(*) into n from compute_nutrients(jsonb_build_array(jsonb_build_object('ingredient_id', pasta)), 2);
  if n <> 0 then raise exception 'FAIL 3: compute_nutrients returned % rows for an unavailable draft', n; end if;

  -- 4. an unknown ingredient id never puts a NULL in gaps
  select s.gaps into gaps from nutrition_summary(jsonb_build_array(jsonb_build_object('ingredient_id', 999999, 'quantity', 1))) s;
  if exists (select 1 from unnest(gaps) x where x is null) then raise exception 'FAIL 4: NULL element in gaps'; end if;

  -- 5. canned legumes: "(2 cans)" is the canned product, "dried, rinsed" is not; lentils "cooked, drained" are cooked
  select count(*) into n from nutrition_line_report(jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'pinto beans'), 'quantity', 4, 'unit_id', unit_cup, 'prep_note', '2 (15 ounce) cans'))) where form = 'canned';
  if n <> 1 then raise exception 'FAIL 5a: "(2 cans)" is not the canned form'; end if;
  select count(*) into n from nutrition_line_report(jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'pinto beans'), 'quantity', 1, 'unit_id', unit_cup, 'prep_note', 'dried, rinsed'))) where form = 'canned';
  if n <> 0 then raise exception 'FAIL 5b: "dried, rinsed" became canned'; end if;
  select count(*) into n from nutrition_line_report(jsonb_build_array(
      jsonb_build_object('ingredient_id', (select id from ingredients where canonical_name = 'lentils'), 'quantity', 1.5, 'unit_id', unit_cup, 'prep_note', 'cooked, drained'))) where form = 'cooked' and state = 'counted';
  if n <> 1 then raise exception 'FAIL 5c: cooked lentils'; end if;

  -- 6. boneless thighs are meat only (not meat and skin); bone-in loses 21 percent to the bone
  select x.grams into g from nutrition_line_report(jsonb_build_array(
      jsonb_build_object('ingredient_id', thighs, 'quantity', 1, 'unit_id', unit_lb, 'prep_note', 'boneless, sliced thin'))) x where x.form = 'skinless';
  if g is null or abs(g - 453.592) > 0.01 then raise exception 'FAIL 6a: boneless thighs grams %', g; end if;
  select x.grams into g from nutrition_line_report(jsonb_build_array(
      jsonb_build_object('ingredient_id', thighs, 'quantity', 1, 'unit_id', unit_lb, 'prep_note', 'bone-in, skin-on'))) x;
  if g is null or abs(g - 453.592 * 0.79) > 0.01 then raise exception 'FAIL 6b: bone-in thighs grams %', g; end if;

  -- 7. cranberry sauce uses fresh cranberries, not dried sweetened ones
  select count(*) into n from recipe_ingredients ri join recipes r on r.id = ri.recipe_id join ingredients i on i.id = ri.ingredient_id
   where r.title = 'Homemade Cranberry Sauce' and i.canonical_name = 'dried cranberries';
  if n <> 0 then raise exception 'FAIL 7: cranberry sauce still counts dried cranberries'; end if;

  -- 8. kaffir lime leaves are not basil
  if exists (select 1 from ingredient_foods f join ingredients i on i.id = f.ingredient_id where i.canonical_name = 'kaffir lime leaves') then
    raise exception 'FAIL 8: kaffir lime leaves still linked to a food';
  end if;

  -- 9. a size word scales an each weight (small = the USDA small:medium portion ratio (70 g / 110 g for an onion))
  select x.grams into g  from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', onion, 'quantity', 1, 'prep_note', 'small, chopped'))) x;
  select x.grams into g2 from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', onion, 'quantity', 1, 'prep_note', 'chopped'))) x;
  if g is null or g2 is null or abs(g - g2 * 70.0 / 110.0) > 0.01 then raise exception 'FAIL 9: small onion % vs medium*70/110 %', g, g2 * 70.0 / 110.0; end if;
  -- ... and never a measured amount
  select x.grams into g  from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', onion, 'quantity', 1, 'unit_id', unit_cup, 'prep_note', 'small, chopped'))) x;
  select x.grams into g2 from nutrition_line_report(jsonb_build_array(jsonb_build_object('ingredient_id', onion, 'quantity', 1, 'unit_id', unit_cup, 'prep_note', 'chopped'))) x;
  if g is distinct from g2 then raise exception 'FAIL 9b: a size word scaled a measured cup'; end if;

  -- 10. the disagreement flag is written for MyPlate recipes only
  select count(*) into n from recipes where nutrition_kcal_delta is not null and nutrition_source <> 'usda_myplate';
  if n > 0 then raise exception 'FAIL 10: delta on % non-MyPlate recipes', n; end if;

  raise notice 'recipe-audit checks passed';
end $$;
select 'ok' as recipe_audit;
