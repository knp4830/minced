-- Wave 10 fixer (ui review): type-ahead ranking in search_foods().
--
-- Typing `soy` returned edamame, soy milk, soybeans, soy flour and only then soy sauce, with no brand in the
-- top ten: every prefix match scores 0.8 and the tie-break was length(label), so the shortest word won.
-- Now (1) the tie-break among equal matches is how many recipe lines use the ingredient, and (2) the best
-- match (the "lead") is followed immediately by up to four of its own foods and brands, preferring ones that
-- carry a household serving (`1 Tbsp`). `soy sauce` and `kikkoman` keep working as before.
-- Body copied from 20261017120200_nutrition_search_and_hooks.sql; only the lead/uses logic is new.

select similarity('a', 'a');

create or replace function search_foods(q text, max_results integer default 12)
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
  -- how many recipe lines use each candidate ingredient: the tie-break among equally good name matches, so the
  -- ingredient a cook means by "soy" (soy sauce, 56 recipes) beats a rarer one that merely sorts shorter
  uses as (
    select ri.ingredient_id as iid, count(*)::integer as c
    from   recipe_ingredients ri
    where  ri.ingredient_id in (select iid from ing)
    group  by ri.ingredient_id
  ),
  ing_rows as (
    select i.iid, null::integer as fdc, 'ingredient'::text as kind, i.cname as label, null::text as brand,
           i.cname as iname, 'default'::text as form, true as is_default,
           -- 0 exact/prefix, 1 word-in-name or alias, 3 fuzzy (listed after brands: a loose match must not push a real brand off the list)
           case when i.sc >= 0.8 then 0 when i.sc >= 0.6 then 1 else 3 end as grp, i.sc::real as score,
           false as hs
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
           (x.frac * 0.7 + case when x.sc >= 0.8 then 0.3 else 0 end)::real as score,
           exists (select 1 from usda_foods u where u.fdc_id = x.fdc and u.household_serving is not null) as hs
    from   (select * from a union all select * from b) x
    order  by x.iid, x.fdc, x.frac desc, x.sc desc
  ),
  food_rows as (
    select o.iid, o.fdc, case when o.dt = 'branded' then 'brand' else 'food' end as kind, o.descr as label,
           o.brand, ig.canonical_name::text as iname, o.form, o.is_default,
           case when o.dt = 'branded' then 2 else 1 end as grp, o.score, o.hs
    from   fo o
    join   ingredients ig on ig.id = o.iid
  ),
  -- The lead is the ingredient the typed text most plausibly means: the best name match (exact beats prefix),
  -- then the most used in recipes, then the shortest name. Its own foods and brands (with a household
  -- serving first, at most four) come straight after it, so `soy` gives soy sauce and then Kikkoman rather
  -- than ten other soy foods first.
  lead as (
    select r.iid
    from   ing_rows r
    left   join uses u on u.iid = r.iid
    where  r.grp = 0
    order  by r.score desc, coalesce(u.c, 0) desc, length(r.label), r.label
    limit  1
  ),
  lead_foods as (
    select f.iid, f.fdc
    from  (select fr.iid, fr.fdc,
                  row_number() over (order by fr.hs desc, fr.score desc, (fr.kind = 'brand') desc, length(fr.label), fr.label, fr.fdc) as rn
           from   food_rows fr
           where  fr.iid = (select iid from lead)) f
    where  f.rn <= 4
  ),
  allrows as (
    select r.*,
           case when r.fdc is null and r.iid = (select iid from lead) then 0
                when r.fdc is not null and exists (select 1 from lead_foods lf where lf.iid = r.iid and lf.fdc = r.fdc) then 1
                else 2 end as ord
    from  (select * from ing_rows union all select * from food_rows) r
  ),
  top as (
    select a.*, coalesce(u.c, 0) as uses
    from   allrows a
    left   join uses u on u.iid = a.iid
    order  by a.ord, a.grp, a.score desc, coalesce(u.c, 0) desc, length(a.label), a.label, a.fdc nulls first
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
  order  by t.ord, t.grp, t.score desc, t.uses desc, length(t.label), t.label, t.fdc nulls first;
end;
$$;

grant execute on function search_foods(text, integer) to anon, authenticated;
