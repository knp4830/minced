-- Wave 10 fixer (audit-recipes): compute rules found wrong by the independent recipe audit.
--
--   1. A missing amount is "to taste" ONLY for seasonings and aromatics (pantry staples, spices, herbs, plus a curated
--      list in to_taste_ingredients). Any other ingredient with no amount is a GAP ('no_quantity'), not a free 0 g:
--      180+ "complete" recipes carried a main ingredient (pasta, tofu, orange juice) counted as nothing.
--   2. A prep note that says "optional" makes the line optional (98 such lines had is_optional = false).
--   3. compute_nutrients() returns nothing for an 'unavailable' set of lines (callers no longer have to gate on status).
--   4. nutrition_summary().gaps can no longer contain a NULL element (unknown ingredient id).
--   5. prep_rules gets kind 'each_factor' (size words scale an "each" weight only: "2 large onions") and the
--      "grams_factor" check is widened to cover it.
--   6. recipes.nutrition_kcal_delta: for USDA MyPlate recipes, (computed - published) / published calories, written by
--      refresh_recipe_nutrients(). The label uses it to flag a published-vs-computed disagreement above 20 percent.
--
-- Redefines nutrition_line_report, compute_nutrients, nutrition_summary and refresh_recipe_nutrients with the same
-- signatures (CREATE OR REPLACE), so grants are unchanged and no overload appears. Data for these rules lives in
-- supabase/seed-nutrition-zzzz-recipe-audit.sql.

select similarity('a', 'a');

-- ---------------------------------------------------------------------------
-- 1. Which ingredients may be left without an amount ("salt", "lemon wedge", "hot sauce")
-- ---------------------------------------------------------------------------
create table to_taste_ingredients (
  ingredient_id integer primary key references ingredients(id) on delete cascade,
  note          text
);
comment on table to_taste_ingredients is
  'Ingredients for which a line with NO amount means "to taste" and counts 0 g without being a gap, in addition to '
  'pantry staples, anything in the Spices aisle and herbs. Every other ingredient with no amount is a gap (no_quantity), '
  'because pasta or tofu with an unparsed amount is a main ingredient, not a seasoning.';

alter table to_taste_ingredients enable row level security;
revoke all on to_taste_ingredients from anon, authenticated;
grant select on to_taste_ingredients to anon, authenticated;
create policy "reference data is public" on to_taste_ingredients for select using (true);

-- ---------------------------------------------------------------------------
-- 5. prep_rules: each_factor
-- ---------------------------------------------------------------------------
alter table prep_rules drop constraint prep_rules_kind_check;
alter table prep_rules drop constraint prep_rules_check1;
alter table prep_rules
  add constraint prep_rules_kind_check check (kind in ('form', 'exclude', 'grams_factor', 'each_factor')),
  add constraint prep_rules_factor_kind_check check ((kind in ('grams_factor', 'each_factor')) = (factor is not null));
comment on table prep_rules is
  'form: use the ingredient''s food for that form when the prep note matches and the form exists. '
  'exclude: the line is listed but not counted (e.g. oil for greasing a pan). '
  'grams_factor: scale grams of any line (edible portion of bone-in meat, frying-bath oil absorption). '
  'each_factor: scale grams of a line with NO unit only (a size word: "2 large onions"). Proposed rules, reviewable by the owner.';

-- ---------------------------------------------------------------------------
-- 6. the published-vs-computed calorie flag
-- ---------------------------------------------------------------------------
alter table recipes add column nutrition_kcal_delta numeric;
comment on column recipes.nutrition_kcal_delta is
  'USDA MyPlate recipes only: (computed - published) / published calories per serving, from refresh_recipe_nutrients(). '
  'null = not applicable or calories not computed. |value| > 0.2 is the owner-approved "these numbers disagree" flag; '
  'the label then says the vitamins and minerals are computed from the ingredient list and may not match the published calories.';

-- ---------------------------------------------------------------------------
-- nutrition_line_report
-- ---------------------------------------------------------------------------
create or replace function nutrition_line_report(lines jsonb)
returns table (ord integer, ingredient_id integer, ingredient text, fdc_id integer, form text, state text,
               grams numeric, basis text, unit_name text, note text)
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $function$
begin
  if lines is null or jsonb_typeof(lines) <> 'array' then
    raise exception 'lines must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(lines) > 200 then
    raise exception 'at most 200 lines' using errcode = '22023';
  end if;

  return query
  with raw as (
    select t.ord::integer                            as ord,
           nullif(e ->> 'ingredient_id', '')::integer as ing_id,
           nullif(e ->> 'fdc_id', '')::integer        as req_fdc,
           nullif(lower(e ->> 'form'), '')            as req_form,
           nullif(e ->> 'quantity', '')::numeric      as qty,
           nullif(e ->> 'unit_id', '')::integer       as unit_id,
           nullif(trim(coalesce(e ->> 'prep_note', '')), '') as prep_note,
           -- a prep note that says "optional" is an optional line even when the flag was never set
           (coalesce((e ->> 'is_optional')::boolean, false)
            or coalesce(e ->> 'prep_note', '') ~* '\moptional\M')                as is_optional
    from   jsonb_array_elements(lines) with ordinality as t(e, ord)
  ),
  s1 as (
    select r.*,
           i.canonical_name::text as ing_name,
           u.name::text           as uname,
           -- seasonings, aromatics and the curated list: no amount means "to taste"
           (coalesce(i.is_pantry_staple, false)
            or i.aisle_category = 'Spices'
            or i.filter_group = 'herbs'
            or exists (select 1 from to_taste_ingredients t where t.ingredient_id = r.ing_id)) as to_taste_ok,
           -- the form of the explicitly chosen food, if it really belongs to this ingredient
           (select f.form from ingredient_foods f
             where r.req_fdc is not null and f.ingredient_id = r.ing_id and f.fdc_id = r.req_fdc
             order by f.is_default desc, f.form limit 1) as link_form,
           -- first matching prep rule whose form exists for this ingredient (specific rule beats generic)
           (select pr.form from prep_rules pr
             where pr.kind = 'form' and pr.enabled and r.prep_note ~* pr.pattern
               and (pr.ingredient_id is null or pr.ingredient_id = r.ing_id)
               and exists (select 1 from ingredient_foods f where f.ingredient_id = r.ing_id and f.form = pr.form)
             order by (pr.ingredient_id is null), pr.id limit 1) as rule_form,
           exists (select 1 from prep_rules pr
             where pr.kind = 'exclude' and pr.enabled and r.prep_note ~* pr.pattern
               and (pr.ingredient_id is null or pr.ingredient_id = r.ing_id)) as is_excluded,
           coalesce((select pr.factor from prep_rules pr
             where pr.kind = 'grams_factor' and pr.enabled and r.prep_note ~* pr.pattern
               and (pr.ingredient_id is null or pr.ingredient_id = r.ing_id)
             order by (pr.ingredient_id is null), pr.id limit 1), 1)
           * case when r.unit_id is null then
               coalesce((select pr.factor from prep_rules pr
                 where pr.kind = 'each_factor' and pr.enabled and r.prep_note ~* pr.pattern
                   and (pr.ingredient_id is null or pr.ingredient_id = r.ing_id)
                 order by (pr.ingredient_id is null), pr.id limit 1), 1)
             else 1 end as g_factor
    from   raw r
    left   join ingredients i on i.id = r.ing_id
    left   join units u on u.id = r.unit_id
  ),
  s2 as (
    select s.*,
           coalesce(s.link_form,
                    case when s.req_fdc is null and s.req_form is not null
                          and exists (select 1 from ingredient_foods f where f.ingredient_id = s.ing_id and f.form = s.req_form)
                         then s.req_form end,
                    case when s.req_fdc is null then s.rule_form end,
                    -- a line measured in cans means the canned product when the ingredient has one (integration rule)
                    case when s.req_fdc is null and s.uname = 'can'
                          and exists (select 1 from ingredient_foods f where f.ingredient_id = s.ing_id and f.form = 'canned')
                         then 'canned' end,
                    'default') as form_
    from   s1 s
  ),
  s3 as (
    select s.*,
           case when s.req_fdc is not null then
                  case when s.link_form is not null then s.req_fdc end
                else (select f.fdc_id from ingredient_foods f
                      where f.ingredient_id = s.ing_id and f.form = s.form_ and f.is_default)
           end as food
    from   s2 s
  ),
  s4 as (
    select s.*, g.grams as gr, g.basis as gb
    from   s3 s
    left   join lateral nutrition_line_grams(s.ing_id, s.form_, s.unit_id, s.qty) g on true
  )
  select s.ord,
         s.ing_id,
         s.ing_name,
         s.food,
         s.form_,
         case
           when s.ing_name is null                                  then 'bad_line'
           when s.unit_id is not null and s.uname is null           then 'bad_line'
           when s.is_optional                                       then 'optional'
           when s.qty is null and s.to_taste_ok                     then 'to_taste'
           when s.is_excluded                                       then 'excluded'
           when s.qty is null                                       then 'no_quantity'
           when s.qty <= 0                                          then 'bad_line'
           when s.req_fdc is not null and s.link_form is null       then 'bad_food'
           when s.food is null                                      then 'no_food'
           when s.gr is null                                        then 'no_grams'
           when not food_has_nutrition(s.food)                      then 'no_nutrients'
           else 'counted'
         end,
         case when s.gr is not null then round(s.gr * s.g_factor, 3) end,
         s.gb,
         s.uname,
         case when s.g_factor <> 1 then 'grams scaled by ' || round(s.g_factor, 3)::text end
  from   s4 s
  order  by s.ord;
end;
$function$;

-- ---------------------------------------------------------------------------
-- compute_nutrients: nothing for an unavailable set of lines
-- ---------------------------------------------------------------------------
create or replace function compute_nutrients(lines jsonb, servings integer)
returns table (nutrient_id smallint, nutrient_key text, amount_per_serving numeric, coverage numeric)
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $function$
begin
  if servings is null or servings < 1 or servings > 1000 then
    raise exception 'servings must be between 1 and 1000' using errcode = '22023';
  end if;

  return query
  with allr as materialized (select * from nutrition_line_report(lines)),
  gate as (
    select count(*) filter (where a.state not in ('to_taste', 'optional', 'excluded')) as n,
           count(*) filter (where a.state = 'counted')                                   as c
    from allr a
  ),
  rep as materialized (
    select a.ingredient_id, a.fdc_id, a.grams
    from   allr a, gate
    where  a.state = 'counted'
      and  gate.n > 0 and gate.c * 2 >= gate.n          -- same rule as nutrition_summary(): 'unavailable' yields no rows
  ),
  tot as (select sum(grams) as g from rep),
  per as (
    select n.id, n.key, n.sort, rep.grams, v.amt
    from   nutrients n
    cross  join rep
    cross  join lateral (select food_nutrient_amount(rep.fdc_id, n.id, rep.ingredient_id) as amt) v
    where  n.display_group <> 'hidden'
  )
  select p.id,
         p.key,
         round(sum(p.grams / 100.0 * p.amt) filter (where p.amt is not null) / servings, 4),
         greatest(round(sum(p.grams) filter (where p.amt is not null) / (select g from tot), 6), 0.000001)
  from   per p
  group  by p.id, p.key, p.sort
  having count(*) filter (where p.amt is not null) > 0
  order  by p.sort;
end;
$function$;

-- ---------------------------------------------------------------------------
-- nutrition_summary: no NULL in gaps; the new no_quantity message
-- ---------------------------------------------------------------------------
create or replace function nutrition_summary(lines jsonb)
returns table (status text, quantified_lines integer, counted_lines integer, total_grams numeric,
               gaps text[], to_taste text[], optional_lines text[], excluded_lines text[])
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $function$
begin
  return query
  with r as materialized (select * from nutrition_line_report(lines))
  select case
           when q.n = 0               then 'unavailable'
           when q.c = q.n             then 'complete'
           when q.c * 2 < q.n         then 'unavailable'
           else 'partial'
         end,
         q.n,
         q.c,
         q.g,
         coalesce((select array_agg(distinct x.msg order by x.msg) from (
             select coalesce(r2.ingredient, 'unknown ingredient') || ' (' ||
                    case r2.state
                      when 'no_food'      then 'no USDA food linked'
                      when 'bad_food'     then 'chosen food is not linked to this ingredient'
                      when 'no_quantity'  then 'no amount given'
                      when 'no_grams'     then 'no gram weight for ' || coalesce(r2.unit_name, 'each')
                                               || case when r2.form <> 'default' then ' (' || r2.form || ')' else '' end
                      when 'no_nutrients' then 'food has no nutrient data'
                      else 'unknown ingredient or unit'
                    end || ')' as msg
             from r r2 where r2.state in ('no_food', 'bad_food', 'no_quantity', 'no_grams', 'no_nutrients', 'bad_line')) x), '{}'::text[]),
         coalesce((select array_agg(distinct r2.ingredient order by r2.ingredient) from r r2 where r2.state = 'to_taste' and r2.ingredient is not null), '{}'::text[]),
         coalesce((select array_agg(distinct r2.ingredient order by r2.ingredient) from r r2 where r2.state = 'optional' and r2.ingredient is not null), '{}'::text[]),
         coalesce((select array_agg(distinct r2.ingredient order by r2.ingredient) from r r2 where r2.state = 'excluded' and r2.ingredient is not null), '{}'::text[])
  from (select count(*) filter (where r1.state not in ('to_taste', 'optional', 'excluded'))::integer as n,
               count(*) filter (where r1.state = 'counted')::integer                                   as c,
               coalesce(sum(r1.grams) filter (where r1.state = 'counted'), 0)                           as g
        from r r1) q;
end;
$function$;

-- ---------------------------------------------------------------------------
-- refresh_recipe_nutrients: also writes nutrition_kcal_delta
-- ---------------------------------------------------------------------------
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

  delete from recipe_nutrients where recipe_id = p_recipe_id;
  if st.status <> 'unavailable' then
    insert into recipe_nutrients (recipe_id, nutrient_id, amount_per_serving, coverage)
    select p_recipe_id, c.nutrient_id, c.amount_per_serving, c.coverage
    from   compute_nutrients(v_lines, rec.servings) c;
  end if;

  v_src := case when rec.source_name like 'USDA MyPlate%' then 'usda_myplate' else 'computed' end;

  if rec.author_id is not null then
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
         calories = m_kcal, protein_g = m_prot, carbs_g = m_carb,
         fat_g = m_fat, sodium_mg = m_sod, fiber_g = m_fib
   where id = p_recipe_id
     and (nutrition_status, nutrition_gaps, nutrition_source, nutrition_kcal_delta, calories, protein_g, carbs_g, fat_g, sodium_mg, fiber_g)
         is distinct from
         (st.status, st.gaps, v_src, v_delta, m_kcal, m_prot, m_carb, m_fat, m_sod, m_fib);
  perform set_config('minced.skip_touch', '', true);

  return st.status;
end;
$function$;

revoke all on function refresh_recipe_nutrients(uuid)     from public, anon, authenticated;
grant execute on function compute_nutrients(jsonb, integer) to anon, authenticated;
grant execute on function nutrition_summary(jsonb)          to anon, authenticated;
grant execute on function nutrition_line_report(jsonb)      to anon, authenticated;
