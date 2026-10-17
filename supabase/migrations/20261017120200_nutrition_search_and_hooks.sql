-- Wave 10, lane B, migration 3 of 3: type-ahead search and the write hooks.
--
--   search_foods(q, max_results)   canonical ingredients AND linked generic foods AND brands
--   trg_recipes_before_write       skips its updated_at / search_vector work for nutrition-only writes
--   save_my_recipe (wrapper)       applies per-line food choices, then refreshes the recipe's nutrients
--   admin_update_recipe            refreshes nutrients after an edit
--   nutrition_calorie_check        QA view: computed vs USDA-published calories for MyPlate recipes
--
-- Redefinitions below copy the CURRENT bodies from the live schema (pg_get_functiondef, as of
-- 2026-10-17 with wave 9's two migrations applied) and add only the nutrition lines (LESSONS section 2).

select similarity('a', 'a');

-- ---------------------------------------------------------------------------
-- search_foods: the recipe-form type-ahead (MyFitnessPal style).
-- One row per thing a user can pick:
--   kind 'ingredient' : a canonical ingredient (fdc_id null = use its default food)
--   kind 'food'       : a generic USDA food / non-default form linked to an ingredient
--   kind 'brand'      : a Branded Foods record linked to an ingredient
-- Rank: strong canonical matches (exact / prefix), then word-in-name / alias matches and generic
-- foods, then brands, then loose fuzzy ingredient matches (so a real brand is never pushed off the
-- list by a vague match). The default food of an ingredient is not listed separately: the ingredient
-- row stands for it. Selecting a food row sends its ingredient_id AND fdc_id; the ingredient
-- stays canonical, so matching, pantry and filters are untouched.
-- has_nutrition false means the pick cannot be calculated (shown greyed in the UI).
-- ---------------------------------------------------------------------------
create function search_foods(q text, max_results integer default 12)
returns table (
  ingredient_id     integer,
  fdc_id            integer,
  kind              text,
  label             text,
  brand             text,
  ingredient_name   text,
  form              text,
  is_default        boolean,
  has_nutrition     boolean,
  serving_size      numeric,
  serving_size_unit text,
  household_serving text,
  data_type         text,
  score             real
)
language plpgsql stable
set search_path = public, pg_temp
set jit = off
as $$
#variable_conflict use_column
declare
  qn      text := lower(regexp_replace(coalesce(q, ''), '[^[:alnum:]]+', ' ', 'g'));
  toks    text[];
  longest text;
  lim     integer := least(greatest(coalesce(max_results, 12), 1), 25);
begin
  toks := array(select t from unnest(regexp_split_to_array(trim(qn), '\s+')) t where length(t) >= 2);
  if cardinality(toks) = 0 or length(trim(qn)) > 80 then
    return;
  end if;
  select t into longest from unnest(toks) t order by length(t) desc, t limit 1;

  return query
  with ing as (
    select s.ingredient_id as iid, s.canonical_name::text as cname, s.score as sc
    from   suggest_ingredients(q, 25) s
  ),
  ing_rows as (
    select i.iid, null::integer as fdc, 'ingredient'::text as kind, i.cname as label, null::text as brand,
           i.cname as iname, 'default'::text as form, true as is_default,
           -- 0 exact/prefix, 1 word-in-name or alias, 3 fuzzy (listed after brands: a loose match must not push a real brand off the list)
           case when i.sc >= 0.8 then 0 when i.sc >= 0.6 then 1 else 3 end as grp, i.sc::real as score
    from   ing i
  ),
  -- foods of the ingredients the name matched (generic and brands), not the default (that is the ingredient row)
  a as (
    select f.ingredient_id as iid, uf.fdc_id as fdc, uf.data_type as dt, uf.description as descr,
           coalesce(uf.brand_name, uf.brand_owner) as brand, f.form, f.is_default, i.sc,
           (select count(*) from unnest(toks) t
             where uf.description ilike '%' || t || '%' or uf.brand_name ilike '%' || t || '%'
                or uf.brand_owner ilike '%' || t || '%')::real / cardinality(toks) as frac
    from   ing i
    join   ingredient_foods f on f.ingredient_id = i.iid
    join   usda_foods uf on uf.fdc_id = f.fdc_id
    where  i.sc >= 0.6 and not (f.is_default and f.form = 'default')
  ),
  -- foods whose own text (description, brand) contains every typed word, e.g. "kikkoman soy"
  b as (
    select f.ingredient_id as iid, uf.fdc_id as fdc, uf.data_type as dt, uf.description as descr,
           coalesce(uf.brand_name, uf.brand_owner) as brand, f.form, f.is_default, 0::real as sc,
           1::real as frac
    from   usda_foods uf
    join   ingredient_foods f on f.fdc_id = uf.fdc_id
    where  (uf.description ilike '%' || longest || '%' or uf.brand_name ilike '%' || longest || '%'
            or uf.brand_owner ilike '%' || longest || '%')
      and  not (f.is_default and f.form = 'default')
      and  not exists (select 1 from unnest(toks) t
                       where not (uf.description ilike '%' || t || '%' or coalesce(uf.brand_name, '') ilike '%' || t || '%'
                                  or coalesce(uf.brand_owner, '') ilike '%' || t || '%'))
  ),
  fo as (
    select distinct on (x.iid, x.fdc) x.iid, x.fdc, x.dt, x.descr, x.brand, x.form, x.is_default,
           (x.frac * 0.7 + case when x.sc >= 0.8 then 0.3 else 0 end)::real as score
    from   (select * from a union all select * from b) x
    order  by x.iid, x.fdc, x.frac desc, x.sc desc
  ),
  food_rows as (
    select o.iid, o.fdc, case when o.dt = 'branded' then 'brand' else 'food' end as kind, o.descr as label,
           o.brand, ig.canonical_name::text as iname, o.form, o.is_default,
           case when o.dt = 'branded' then 2 else 1 end as grp, o.score
    from   fo o
    join   ingredients ig on ig.id = o.iid
  ),
  allrows as (
    select * from ing_rows
    union all
    select * from food_rows
  ),
  top as (
    select * from allrows
    order  by grp, score desc, length(label), label, fdc nulls first
    limit  lim
  )
  select t.iid, t.fdc, t.kind, t.label, t.brand, t.iname, t.form, t.is_default,
         case when t.fdc is not null then food_has_nutrition(t.fdc)
              else coalesce(food_has_nutrition(df.dfdc), false) end,
         sv.serving_size, sv.serving_size_unit, sv.household_serving, sv.data_type, t.score
  from   top t
  left   join lateral (select f.fdc_id as dfdc from ingredient_foods f
                       where t.fdc is null and f.ingredient_id = t.iid and f.form = 'default' and f.is_default limit 1) df on true
  left   join usda_foods sv on sv.fdc_id = coalesce(t.fdc, df.dfdc)
  order  by t.grp, t.score desc, length(t.label), t.label, t.fdc nulls first;
end;
$$;

grant execute on function search_foods(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- recipes before-write trigger: current live body plus one early exit.
-- refresh_recipe_nutrients sets minced.skip_touch (transaction-local) around its own UPDATE so a
-- nutrition refresh does not bump updated_at (sitemap lastmod, ordering) or recompute search_vector.
-- ---------------------------------------------------------------------------
create or replace function trg_recipes_before_write() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('minced.skip_touch', true), '') = '1' then
    return new;
  end if;

  new.updated_at := now();

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  new.search_vector :=
    compute_recipe_search_vector(new.id, new.title, new.cuisine_id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- User-recipe save: keep the feature-flag gate and the private implementation, then
--   1. store any per-line food the user picked (fdc_id), only if it is linked to that line's ingredient
--   2. refresh the recipe's nutrients (the calories etc. columns fill in when the status is complete)
-- p_data.ingredients[].fdc_id is optional. Blank rows are skipped by the private function, so the
-- n-th non-blank row becomes sort_order n-1; if the counts disagree the choices are ignored, not guessed.
-- ---------------------------------------------------------------------------
create or replace function save_my_recipe(p_recipe_id uuid, p_data jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  res      jsonb;
  rid      uuid;
  n_rows   integer;
  n_saved  integer;
begin
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  res := private.save_my_recipe(p_recipe_id, p_data, p_submit);
  rid := nullif(res ->> 'id', '')::uuid;

  if rid is not null then
    if jsonb_typeof(p_data -> 'ingredients') = 'array' then
      select count(*) into n_rows
      from   jsonb_array_elements(p_data -> 'ingredients') e
      where  jsonb_typeof(e) = 'object' and nullif(trim(coalesce(e ->> 'name', '')), '') is not null;
      select count(*) into n_saved from recipe_ingredients where recipe_id = rid;

      if n_rows = n_saved then
        update recipe_ingredients ri
           set fdc_id = x.fdc
          from (select (row_number() over (order by t.o) - 1)::integer as so,
                       case when t.e ->> 'fdc_id' ~ '^[0-9]{1,9}$' then (t.e ->> 'fdc_id')::integer end as fdc
                from   jsonb_array_elements(p_data -> 'ingredients') with ordinality as t(e, o)
                where  jsonb_typeof(t.e) = 'object' and nullif(trim(coalesce(t.e ->> 'name', '')), '') is not null) x
         where ri.recipe_id = rid
           and ri.sort_order = x.so
           and x.fdc is not null
           and exists (select 1 from ingredient_foods f where f.ingredient_id = ri.ingredient_id and f.fdc_id = x.fdc);
      end if;
    end if;
    perform refresh_recipe_nutrients(rid);
  end if;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin edits change quantities and ingredients, so nutrients must follow.
-- Body copied from the live function; only the final PERFORM is new.
-- ---------------------------------------------------------------------------
create or replace function admin_update_recipe(p_slug text, p_title text default null, p_steps jsonb default '[]'::jsonb, p_ingredients jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rid uuid;
  el jsonb;
  new_ing integer;
  rows_hit integer;
  qty numeric;
  txt text;
begin
  perform admin_assert();
  select r.id into rid from recipes r where r.slug = p_slug and admin_in_scope(r) for update of r;
  if rid is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_typeof(p_ingredients) is distinct from 'array' then
    raise exception 'steps and ingredients must be arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) > 100 or jsonb_array_length(p_ingredients) > 100 then
    raise exception 'too many edits' using errcode = '22023';
  end if;

  if p_title is not null then
    txt := trim(p_title);
    if txt = '' or char_length(txt) > 200 then
      raise exception 'title must be 1 to 200 characters' using errcode = '22023';
    end if;
    update recipes set title = txt where id = rid;
  end if;

  for el in select * from jsonb_array_elements(p_steps) loop
    txt := trim(el ->> 'instruction');
    if txt is null or txt = '' or char_length(txt) > 2000 then
      raise exception 'step text must be 1 to 2000 characters' using errcode = '22023';
    end if;
    update recipe_steps set instruction = txt
    where id = (el ->> 'id')::bigint and recipe_id = rid;
    get diagnostics rows_hit = row_count;
    if rows_hit <> 1 then
      raise exception 'step % is not part of this recipe', el ->> 'id' using errcode = '22023';
    end if;
  end loop;

  for el in select * from jsonb_array_elements(p_ingredients) loop
    qty := nullif(el ->> 'quantity', '')::numeric;
    if qty is not null and qty <= 0 then
      raise exception 'quantity must be positive (or empty for to taste)' using errcode = '22023';
    end if;
    txt := nullif(left(trim(coalesce(el ->> 'prep_note', '')), 200), '');

    new_ing := null;
    if nullif(trim(coalesce(el ->> 'ingredient_name', '')), '') is not null then
      select ingredient_id into new_ing from resolve_ingredient(trim(el ->> 'ingredient_name')) limit 1;
      if new_ing is null then
        raise exception 'ingredient "%" does not resolve to a canonical ingredient', el ->> 'ingredient_name'
          using errcode = '22023';
      end if;
    end if;

    update recipe_ingredients
       set quantity      = qty,
           prep_note     = txt,
           is_optional   = coalesce((el ->> 'is_optional')::boolean, is_optional),
           ingredient_id = coalesce(new_ing, ingredient_id)
     where id = (el ->> 'id')::bigint and recipe_id = rid;
    get diagnostics rows_hit = row_count;
    if rows_hit <> 1 then
      raise exception 'ingredient row % is not part of this recipe', el ->> 'id' using errcode = '22023';
    end if;
  end loop;

  -- Bumps updated_at and recomputes search_vector even for a steps-only edit.
  update recipes set updated_at = now() where id = rid;

  -- A changed ingredient may leave a per-line food that no longer belongs to it; drop such choices.
  update recipe_ingredients ri set fdc_id = null
   where ri.recipe_id = rid and ri.fdc_id is not null
     and not exists (select 1 from ingredient_foods f where f.ingredient_id = ri.ingredient_id and f.fdc_id = ri.fdc_id);
  perform refresh_recipe_nutrients(rid);
end;
$$;

-- ---------------------------------------------------------------------------
-- QA: where our computed calories disagree with USDA's published value by more than 20%.
-- Operator view (not granted to clients). Reviewed by hand, never auto-corrected.
-- ---------------------------------------------------------------------------
create view nutrition_calorie_check with (security_invoker = true) as
select r.id,
       r.slug,
       r.title,
       r.calories                     as published_kcal,
       n.amount_per_serving           as computed_kcal,
       round((n.amount_per_serving - r.calories) / r.calories * 100, 1) as pct_diff
from   recipes r
join   recipe_nutrients n on n.recipe_id = r.id and n.nutrient_id = 1
where  r.nutrition_source = 'usda_myplate'
  and  r.nutrition_status = 'complete'
  and  r.calories > 0
  and  abs(n.amount_per_serving - r.calories) > 0.2 * r.calories;
revoke all on nutrition_calorie_check from public, anon, authenticated;
