-- Fixer round 2 (recipe accuracy audit, finding 5): the macro columns of every recipe we computed (v_src = 'computed') are
-- the computed values, not the AI-drafted ones a seed wrote. 106 "Minced original" recipes (author_id null) kept their
-- drafted calories / protein / carbs / fat / sodium / fiber because refresh_recipe_nutrients() only overwrote the columns
-- for a member's recipe (author_id set). Of the 86 complete originals 16 differed from the ingredients by more than 15
-- percent in calories (up to 98), and the label presented the drafted number as computed.
--
-- Same signature (CREATE OR REPLACE), same grants. The values reach the columns at the next refresh_all_recipe_nutrients()
-- (live steps, step 4). A USDA MyPlate recipe is unchanged: its columns stay USDA's published values.

create or replace function refresh_recipe_nutrients(p_recipe_id uuid) returns text
language plpgsql
security definer
set search_path = public, pg_temp
set jit = off
as $function$
declare
  rec     recipes%rowtype;
  v_lines jsonb;
  st      record;
  v_src   text;
  v_delta numeric;
  v_ass   text[];
  m_kcal numeric; m_prot numeric; m_carb numeric; m_fat numeric; m_sod numeric; m_fib numeric;
begin
  select * into rec from recipes where id = p_recipe_id;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ingredient_id', ri.ingredient_id, 'fdc_id', ri.fdc_id, 'quantity', ri.quantity,
           'unit_id', ri.unit_id, 'prep_note', ri.prep_note, 'is_optional', ri.is_optional)
         order by ri.sort_order), '[]'::jsonb)
    into v_lines
  from recipe_ingredients ri
  where ri.recipe_id = p_recipe_id;

  select * into st from nutrition_summary(v_lines);
  v_ass := case when st.status = 'unavailable' then '{}'::text[] else nutrition_assumptions(v_lines) end;

  delete from recipe_nutrients where recipe_id = p_recipe_id;
  if st.status <> 'unavailable' then
    insert into recipe_nutrients (recipe_id, nutrient_id, amount_per_serving, coverage)
    select p_recipe_id, c.nutrient_id, c.amount_per_serving, c.coverage
    from   compute_nutrients(v_lines, rec.servings) c;
  end if;

  v_src := case when rec.source_name like 'USDA MyPlate%' then 'usda_myplate' else 'computed' end;

  -- The macro columns hold USDA's published value only for a USDA MyPlate import. A recipe we computed ("Minced original",
  -- the six mockup recipes, a member's recipe) has no published value: the AI-drafted numbers a seed wrote there disagreed
  -- with the ingredients by up to 98 percent (Jamaican Curry Chicken 782 kcal against 395 computed), and the label
  -- showed them as "computed". So its columns are always the computed value, and null when the recipe is not complete.
  if rec.author_id is not null or v_src = 'computed' then
    select max(round(amount_per_serving, 0)) filter (where nutrient_id = 1  and coverage >= 0.9),
           max(round(amount_per_serving, 1)) filter (where nutrient_id = 2  and coverage >= 0.9),
           max(round(amount_per_serving, 1)) filter (where nutrient_id = 3  and coverage >= 0.9),
           max(round(amount_per_serving, 1)) filter (where nutrient_id = 7  and coverage >= 0.9),
           max(round(amount_per_serving, 0)) filter (where nutrient_id = 13 and coverage >= 0.9),
           max(round(amount_per_serving, 1)) filter (where nutrient_id = 4  and coverage >= 0.9)
      into m_kcal, m_prot, m_carb, m_fat, m_sod, m_fib
    from recipe_nutrients where recipe_id = p_recipe_id;
    if st.status <> 'complete' then
      m_kcal := null; m_prot := null; m_carb := null; m_fat := null; m_sod := null; m_fib := null;
    end if;
  else
    m_kcal := rec.calories; m_prot := rec.protein_g; m_carb := rec.carbs_g;
    m_fat := rec.fat_g; m_sod := rec.sodium_mg; m_fib := rec.fiber_g;
  end if;

  -- published vs computed calories (MyPlate only): the disagreement flag
  v_delta := null;
  if v_src = 'usda_myplate' and rec.calories is not null and rec.calories > 0 then
    select round((n.amount_per_serving - rec.calories) / rec.calories, 4)
      into v_delta
    from recipe_nutrients n
    where n.recipe_id = p_recipe_id and n.nutrient_id = 1 and n.coverage >= 0.9;
  end if;

  -- trg_recipes_before_write skips its updated_at / search_vector work while this flag is set
  perform set_config('minced.skip_touch', '1', true);
  update recipes
     set nutrition_status = st.status,
         nutrition_gaps   = st.gaps,
         nutrition_source = v_src,
         nutrition_kcal_delta = v_delta,
         nutrition_assumptions = v_ass,
         calories = m_kcal, protein_g = m_prot, carbs_g = m_carb,
         fat_g = m_fat, sodium_mg = m_sod, fiber_g = m_fib
   where id = p_recipe_id
     and (nutrition_status, nutrition_gaps, nutrition_source, nutrition_kcal_delta, nutrition_assumptions, calories, protein_g, carbs_g, fat_g, sodium_mg, fiber_g)
         is distinct from
         (st.status, st.gaps, v_src, v_delta, v_ass, m_kcal, m_prot, m_carb, m_fat, m_sod, m_fib);
  perform set_config('minced.skip_touch', '', true);

  return st.status;
end;
$function$;

revoke all on function refresh_recipe_nutrients(uuid) from public, anon, authenticated;
