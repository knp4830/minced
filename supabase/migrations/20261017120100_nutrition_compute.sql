-- Wave 10, lane B, migration 2 of 3: the compute layer.
--
--   food_has_nutrition(fdc)            can this food contribute at all (has energy)
--   food_nutrient_amount(fdc, n, ing)  per-100 g value with conversions and the added-sugar estimate
--   nutrition_line_grams(...)          one line -> grams, and how we got there
--   nutrition_line_report(lines)       one row per line: counted, or why not
--   compute_nutrients(lines, servings) per-serving amounts + coverage; never reads recipes
--   nutrition_summary(lines, servings) status (complete/partial/unavailable) + named gaps
--   refresh_recipe_nutrients(id)       writes recipe_nutrients + the status columns
--   refresh_all_recipe_nutrients()     the batch, run after any food/portion/mapping change
--
-- `lines` is a JSON array of
--   {ingredient_id, fdc_id?, form?, quantity, unit_id, prep_note, is_optional}
-- exactly the shape the user-recipe form can build before saving, so a draft previews with no
-- stored rows. Nothing here guesses: a line without a food or without a gram weight is a GAP,
-- never a number. A quantity of NULL is "to taste" and counts 0 without being a gap.

select similarity('a', 'a');

-- ---------------------------------------------------------------------------
create function food_has_nutrition(p_fdc integer) returns boolean
language sql stable
set search_path = public, pg_temp
set jit = off
as $$
  select exists (select 1 from usda_food_nutrients u where u.fdc_id = p_fdc and u.nutrient_id = 1)   -- 1 = energy_kcal
      or exists (select 1
                 from   usda_food_nutrients u
                 join   nutrient_conversions c on c.from_nutrient_id = u.nutrient_id and c.to_nutrient_id = 1
                 where  u.fdc_id = p_fdc);
$$;

-- ---------------------------------------------------------------------------
-- Per-100 g amount of one nutrient in one food. NULL = not reported.
--   1. the direct row
--   2. a conversion (vitamin D IU -> mcg, Atwater energy -> kcal)
--   3. added sugars (id 6): a direct row wins; otherwise a listed sweetener counts fraction * total
--      sugars (id 5); every unlisted ingredient counts 0 (owner-approved estimate, flagged on nutrients).
-- ---------------------------------------------------------------------------
create function food_nutrient_amount(p_fdc integer, p_nutrient smallint, p_ingredient integer)
returns numeric
language sql stable
set search_path = public, pg_temp
set jit = off
as $$
  select coalesce(
    (select u.amount_per_100g::numeric
     from   usda_food_nutrients u
     where  u.fdc_id = p_fdc and u.nutrient_id = p_nutrient),
    (select c.factor * s.amount_per_100g::numeric
     from   nutrient_conversions c
     join   usda_food_nutrients s on s.fdc_id = p_fdc and s.nutrient_id = c.from_nutrient_id
     where  c.to_nutrient_id = p_nutrient
     order  by c.priority
     limit  1),
    case when p_nutrient = 6 then
      case when exists (select 1 from added_sugar_ingredients a where a.ingredient_id = p_ingredient)
           then (select a.fraction * s.amount_per_100g::numeric
                 from   added_sugar_ingredients a
                 join   usda_food_nutrients s on s.fdc_id = p_fdc and s.nutrient_id = 5
                 where  a.ingredient_id = p_ingredient)
           else 0
      end
    end);
$$;

-- ---------------------------------------------------------------------------
-- Grams for one line. Returns no row when the weight is unknown (a gap).
--   mass   : quantity * to_base_factor
--   count / each : an ingredient_portions row for that exact unit AND form
--   volume : (1) a portion row for that exact unit and form
--            (2) ingredients.density_g_per_ml, default form only
--            (3) a density derived from any other volume portion of the same form
-- A non-default form never borrows the default form's weights: cooked rice is not raw rice.
-- ---------------------------------------------------------------------------
create function nutrition_line_grams(p_ingredient_id integer, p_form text, p_unit_id integer, p_qty numeric)
returns table (grams numeric, basis text)
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $$
declare
  u    units%rowtype;
  g    numeric;
  dens numeric;
begin
  if p_qty is null or p_qty <= 0 then
    return;
  end if;

  if p_unit_id is null then                                   -- "2 onions": each
    select p.grams_per_unit * p_qty into g
    from   ingredient_portions p
    where  p.ingredient_id = p_ingredient_id and p.form = p_form and p.unit_id is null
    limit  1;
    if g is not null then
      return query select g, 'each'::text;
    end if;
    return;
  end if;

  select * into u from units where id = p_unit_id;
  if not found then
    return;
  end if;

  if u.kind = 'mass' then
    return query select p_qty * u.to_base_factor, 'mass'::text;
    return;
  end if;

  if u.kind = 'count' then
    select p.grams_per_unit * p_qty into g
    from   ingredient_portions p
    where  p.ingredient_id = p_ingredient_id and p.form = p_form and p.unit_id = p_unit_id
    limit  1;
    if g is not null then
      return query select g, 'portion'::text;
    end if;
    return;
  end if;

  -- volume
  select p.grams_per_unit * p_qty into g
  from   ingredient_portions p
  where  p.ingredient_id = p_ingredient_id and p.form = p_form and p.unit_id = p_unit_id
  limit  1;
  if g is not null then
    return query select g, 'portion'::text;
    return;
  end if;

  if p_form = 'default' then
    select i.density_g_per_ml into dens from ingredients i where i.id = p_ingredient_id;
    if dens is not null then
      return query select p_qty * u.to_base_factor * dens, 'density'::text;
      return;
    end if;
  end if;

  select p_qty * u.to_base_factor * (p.grams_per_unit / pu.to_base_factor) into g
  from   ingredient_portions p
  join   units pu on pu.id = p.unit_id and pu.kind = 'volume'
  where  p.ingredient_id = p_ingredient_id and p.form = p_form
  order  by pu.to_base_factor desc, p.id          -- the larger measure carries less rounding
  limit  1;
  if g is not null then
    return query select g, 'derived_density'::text;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- One row per input line.
-- state: counted | to_taste | optional | excluded                 (not gaps)
--        no_food | bad_food | no_grams | no_nutrients | bad_line   (gaps)
-- ---------------------------------------------------------------------------
create function nutrition_line_report(lines jsonb)
returns table (
  ord           integer,
  ingredient_id integer,
  ingredient    text,
  fdc_id        integer,
  form          text,
  state         text,
  grams         numeric,
  basis         text,
  unit_name     text,
  note          text
)
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $$
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
           coalesce((e ->> 'is_optional')::boolean, false)   as is_optional
    from   jsonb_array_elements(lines) with ordinality as t(e, ord)
  ),
  s1 as (
    select r.*,
           i.canonical_name::text as ing_name,
           u.name::text           as uname,
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
             order by (pr.ingredient_id is null), pr.id limit 1), 1) as g_factor
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
           when s.qty is null                                       then 'to_taste'
           when s.qty <= 0                                          then 'bad_line'
           when s.is_excluded                                       then 'excluded'
           when s.req_fdc is not null and s.link_form is null       then 'bad_food'
           when s.food is null                                      then 'no_food'
           when s.gr is null                                        then 'no_grams'
           when not food_has_nutrition(s.food)                      then 'no_nutrients'
           else 'counted'
         end,
         case when s.gr is not null then round(s.gr * s.g_factor, 3) end,
         s.gb,
         s.uname,
         case when s.g_factor <> 1 then 'grams scaled by ' || s.g_factor::text end
  from   s4 s
  order  by s.ord;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-serving amounts. Rows exist only for nutrients that at least one counted food reports.
-- coverage = counted grams whose food reports the nutrient / all counted grams. Below 1 the
-- amount is a minimum ("at least"); the UI decides the 90% display rule.
-- ---------------------------------------------------------------------------
create function compute_nutrients(lines jsonb, servings integer)
returns table (nutrient_id smallint, nutrient_key text, amount_per_serving numeric, coverage numeric)
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $$
begin
  if servings is null or servings < 1 or servings > 1000 then
    raise exception 'servings must be between 1 and 1000' using errcode = '22023';
  end if;

  return query
  with rep as materialized (
    select r.ingredient_id, r.fdc_id, r.grams
    from   nutrition_line_report(lines) r
    where  r.state = 'counted'
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
$$;

-- ---------------------------------------------------------------------------
-- Status and named gaps.
--   unavailable: no quantified line, or fewer than half of them could be counted
--   complete   : every quantified, non-optional, non-excluded line counted
--   partial    : in between
-- ---------------------------------------------------------------------------
create function nutrition_summary(lines jsonb)
returns table (
  status           text,
  quantified_lines integer,
  counted_lines    integer,
  total_grams      numeric,
  gaps             text[],
  to_taste         text[],
  optional_lines   text[],
  excluded_lines   text[]
)
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $$
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
             select r2.ingredient || ' (' ||
                    case r2.state
                      when 'no_food'      then 'no USDA food linked'
                      when 'bad_food'     then 'chosen food is not linked to this ingredient'
                      when 'no_grams'     then 'no gram weight for ' || coalesce(r2.unit_name, 'each')
                                               || case when r2.form <> 'default' then ' (' || r2.form || ')' else '' end
                      when 'no_nutrients' then 'food has no nutrient data'
                      else 'unknown ingredient or unit'
                    end || ')' as msg
             from r r2 where r2.state in ('no_food', 'bad_food', 'no_grams', 'no_nutrients', 'bad_line')) x), '{}'::text[]),
         coalesce((select array_agg(distinct r2.ingredient order by r2.ingredient) from r r2 where r2.state = 'to_taste'), '{}'::text[]),
         coalesce((select array_agg(distinct r2.ingredient order by r2.ingredient) from r r2 where r2.state = 'optional'), '{}'::text[]),
         coalesce((select array_agg(distinct r2.ingredient order by r2.ingredient) from r r2 where r2.state = 'excluded'), '{}'::text[])
  from (select count(*) filter (where r1.state not in ('to_taste', 'optional', 'excluded'))::integer as n,
               count(*) filter (where r1.state = 'counted')::integer                                   as c,
               coalesce(sum(r1.grams) filter (where r1.state = 'counted'), 0)                           as g
        from r r1) q;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog / user-recipe writer. SECURITY DEFINER because clients cannot write recipe_nutrients;
-- execute is revoked from clients, so only other definer functions and the operator call it.
--   * recipe_nutrients: delete + insert (a regenerable cache; no rows for an unavailable recipe)
--   * recipes.nutrition_*: status, gaps, source
--   * recipes.calories..fiber_g: written ONLY for user recipes (author_id not null) and ONLY when
--     the status is complete and the nutrient's coverage is >= 0.9. USDA MyPlate and "Minced
--     original" macros are never overwritten by a refresh.
-- ---------------------------------------------------------------------------
create function refresh_recipe_nutrients(p_recipe_id uuid) returns text
language plpgsql
security definer
set search_path = public, pg_temp
set jit = off
as $$
declare
  rec     recipes%rowtype;
  v_lines jsonb;
  st      record;
  v_src   text;
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

  -- trg_recipes_before_write skips its updated_at / search_vector work while this flag is set
  perform set_config('minced.skip_touch', '1', true);
  update recipes
     set nutrition_status = st.status,
         nutrition_gaps   = st.gaps,
         nutrition_source = v_src,
         calories = m_kcal, protein_g = m_prot, carbs_g = m_carb,
         fat_g = m_fat, sodium_mg = m_sod, fiber_g = m_fib
   where id = p_recipe_id
     and (nutrition_status, nutrition_gaps, nutrition_source, calories, protein_g, carbs_g, fat_g, sodium_mg, fiber_g)
         is distinct from
         (st.status, st.gaps, v_src, m_kcal, m_prot, m_carb, m_fat, m_sod, m_fib);
  perform set_config('minced.skip_touch', '', true);

  return st.status;
end;
$$;

create function refresh_all_recipe_nutrients() returns integer
language plpgsql
security definer
set search_path = public, pg_temp
set jit = off
as $$
declare
  rid uuid;
  n   integer := 0;
begin
  for rid in select id from recipes order by id loop
    perform refresh_recipe_nutrients(rid);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. The pure compute functions read only select-only reference tables under the
-- caller's rights, so clients may preview a draft. The writers are operator / definer only.
-- ---------------------------------------------------------------------------
revoke all on function refresh_recipe_nutrients(uuid)     from public, anon, authenticated;
revoke all on function refresh_all_recipe_nutrients()      from public, anon, authenticated;
grant execute on function compute_nutrients(jsonb, integer)    to anon, authenticated;
grant execute on function nutrition_summary(jsonb)             to anon, authenticated;
grant execute on function nutrition_line_report(jsonb)         to anon, authenticated;
