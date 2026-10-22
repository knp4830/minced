-- Wave 10c (recipe math accuracy): compute rules found wrong by the round-2 recipe audit.
--
--   1. prep_rules gets `strict`, `satisfied_by` and `priority`. A STRICT form rule that matches a line's prep note but has
--      no food for that form on the ingredient makes the line a named GAP ('no_form') instead of silently falling back to
--      the raw / dry / full-fat default. "2 cups cooked rice" with no cooked rice food is a gap, never 2 cups of dry rice.
--      `satisfied_by` is a regex tested against the description of the food the line resolved to (its form's default):
--      a food that already is the requested state (canned tuna is canned; "Soup, chicken broth, low sodium, canned" is
--      low sodium) needs no form row.
--      `priority` orders rules inside the same specificity (a sodium qualifier beats a state qualifier).
--   2. ingredient_assumptions + recipes.nutrition_assumptions: a stated assumption behind a number ("nutrition assumes
--      cheddar" when a line says only "cheese"). Written by refresh_recipe_nutrients(), shown on the label.
--   3. nutrition_line_report: the form logic above. Everything else is unchanged from 20261017180000.
--   4. nutrition_summary: the message for a 'no_form' gap.
--   5. refresh_recipe_nutrients: also writes nutrition_assumptions.
--
-- Same signatures everywhere (CREATE OR REPLACE), so grants and callers are unchanged. Data lives in
-- supabase/seed-nutrition-zzzzz-math-10c.sql.

select similarity('a', 'a');

-- ---------------------------------------------------------------------------
-- 1. prep_rules: strict / satisfied_by / priority
-- ---------------------------------------------------------------------------
alter table prep_rules
  add column strict       boolean not null default false,
  add column satisfied_by text,
  add column priority     integer not null default 100;

comment on column prep_rules.strict is
  'kind form only. true: when the pattern matches and the ingredient has NO food for that form (and the food the line resolved to '
  'does not already match satisfied_by), the line is a gap (state no_form) instead of using the default food. Never a silent raw/dry/full-fat fallback.';
comment on column prep_rules.satisfied_by is
  'Postgres regex tested case-insensitively against the description of the food the line resolved to. A match means that food '
  'already is the requested state, so a strict rule does not fire.';
comment on column prep_rules.priority is
  'Form rules: the lowest number wins; among equal numbers an ingredient-specific rule beats a generic one. '
  'Qualifier rules (sodium 10, fat 20-30, unsweetened 40) sit below the state rules (100) so "low-sodium, drained" is the low-sodium food.';

-- ---------------------------------------------------------------------------
-- 2. assumptions
-- ---------------------------------------------------------------------------
create table ingredient_assumptions (
  ingredient_id integer primary key references ingredients(id) on delete cascade,
  note          text    not null check (length(note) between 3 and 120)
);
comment on table ingredient_assumptions is
  'A plain-words assumption behind an ingredient''s nutrition, shown on a recipe label when the line is counted '
  '(for example "assumes cheddar"). Owner decision 2026-10-17: a bare "cheese" is cheddar and the label says so.';
alter table ingredient_assumptions enable row level security;
revoke all on ingredient_assumptions from anon, authenticated;
grant select on ingredient_assumptions to anon, authenticated;
create policy "reference data is public" on ingredient_assumptions for select using (true);

alter table recipes add column nutrition_assumptions text[] not null default '{}';
comment on column recipes.nutrition_assumptions is
  'Assumptions behind the computed nutrition (ingredient_assumptions notes for counted lines), written by refresh_recipe_nutrients().';

-- ---------------------------------------------------------------------------
-- 3. nutrition_line_report
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
             order by pr.priority, (pr.ingredient_id is null), pr.id limit 1) as rule_form,
           exists (select 1 from prep_rules pr
             where pr.kind = 'exclude' and pr.enabled and r.prep_note ~* pr.pattern
               and (pr.ingredient_id is null or pr.ingredient_id = r.ing_id)) as is_excluded,
           coalesce((select pr.factor from prep_rules pr
             where pr.kind = 'grams_factor' and pr.enabled and r.prep_note ~* pr.pattern
               and (pr.ingredient_id is null or pr.ingredient_id = r.ing_id)
             order by (pr.ingredient_id is null), pr.priority, pr.id limit 1), 1)
           * case when r.unit_id is null then
               coalesce((select pr.factor from prep_rules pr
                 where pr.kind = 'each_factor' and pr.enabled and r.prep_note ~* pr.pattern
                   and (pr.ingredient_id is null or pr.ingredient_id = r.ing_id)
                 order by (pr.ingredient_id is null), pr.priority, pr.id limit 1), 1)
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
  s2a as (
    -- A STRICT rule whose pattern matches the note but whose form this ingredient does not have, and whose state the
    -- food actually chosen for the line does not already have. An explicit food / form choice by the author skips this.
    select s.*,
           case when s.req_fdc is not null or s.req_form is not null then null else
             (select pr.form from prep_rules pr
               where pr.kind = 'form' and pr.enabled and pr.strict and s.prep_note ~* pr.pattern
                 and (pr.ingredient_id is null or pr.ingredient_id = s.ing_id)
                 and not exists (select 1 from ingredient_foods f where f.ingredient_id = s.ing_id and f.form = pr.form)
                 and not (pr.satisfied_by is not null and exists (
                       select 1 from ingredient_foods f join usda_foods d on d.fdc_id = f.fdc_id
                        where f.ingredient_id = s.ing_id and f.form = s.form_ and f.is_default
                          and d.description ~* pr.satisfied_by))
               order by pr.priority, (pr.ingredient_id is null), pr.id limit 1)
           end as miss_form
    from   s2 s
  ),
  s2b as (
    -- the line asked for a state / qualifier we have no food for: it becomes a named gap, never the default food
    select s.*, (s.miss_form is not null) as form_missing
    from   s2a s
  ),
  s3 as (
    select s.*,
           case when s.req_fdc is not null then
                  case when s.link_form is not null then s.req_fdc end
                else (select f.fdc_id from ingredient_foods f
                      where f.ingredient_id = s.ing_id and f.form = s.form_ and f.is_default)
           end as food
    from   s2b s
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
         case when s.form_missing then s.miss_form else s.form_ end,
         case
           when s.ing_name is null                                  then 'bad_line'
           when s.unit_id is not null and s.uname is null           then 'bad_line'
           when s.is_optional                                       then 'optional'
           when s.qty is null and s.to_taste_ok                     then 'to_taste'
           when s.is_excluded                                       then 'excluded'
           when s.qty is null                                       then 'no_quantity'
           when s.qty <= 0                                          then 'bad_line'
           when s.req_fdc is not null and s.link_form is null       then 'bad_food'
           when s.form_missing                                      then 'no_form'
           when s.food is null                                      then 'no_food'
           when s.gr is null                                        then 'no_grams'
           when not food_has_nutrition(s.food)                      then 'no_nutrients'
           else 'counted'
         end,
         case when s.gr is not null and not s.form_missing then round(s.gr * s.g_factor, 3) end,
         s.gb,
         s.uname,
         case when s.g_factor <> 1 then 'grams scaled by ' || round(s.g_factor, 3)::text end
  from   s4 s
  order  by s.ord;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. nutrition_summary: the no_form message
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
                      when 'no_form'      then 'no ' || replace(r2.form, '_', ' ') || ' food linked'
                      when 'bad_food'     then 'chosen food is not linked to this ingredient'
                      when 'no_quantity'  then 'no amount given'
                      when 'no_grams'     then 'no gram weight for ' || coalesce(r2.unit_name, 'each')
                                               || case when r2.form <> 'default' then ' (' || replace(r2.form, '_', ' ') || ')' else '' end
                      when 'no_nutrients' then 'food has no nutrient data'
                      else 'unknown ingredient or unit'
                    end || ')' as msg
             from r r2 where r2.state in ('no_food', 'no_form', 'bad_food', 'no_quantity', 'no_grams', 'no_nutrients', 'bad_line')) x), '{}'::text[]),
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
-- 5. assumptions for the counted lines, and the refresh that stores them
-- ---------------------------------------------------------------------------
create function nutrition_assumptions(lines jsonb) returns text[]
language sql stable
set search_path = public, pg_temp
set jit = off
as $$
  select coalesce(array_agg(distinct a.note order by a.note), '{}'::text[])
  from   nutrition_line_report(lines) r
  join   ingredient_assumptions a on a.ingredient_id = r.ingredient_id
  where  r.state = 'counted';
$$;
grant execute on function nutrition_assumptions(jsonb) to anon, authenticated;

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
grant execute on function nutrition_summary(jsonb)     to anon, authenticated;
grant execute on function nutrition_line_report(jsonb) to anon, authenticated;
