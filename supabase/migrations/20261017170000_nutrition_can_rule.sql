-- Wave 10 integration: a recipe line measured in cans ("1 can tomatoes") uses the ingredient's canned form when it
-- has one. Without this, 58 USDA recipes stayed partial only because the default (fresh) form has no can weight.
-- Redefines nutrition_line_report with one extra branch in the form choice; everything else is unchanged.

CREATE OR REPLACE FUNCTION public.nutrition_line_report(lines jsonb)
 RETURNS TABLE(ord integer, ingredient_id integer, ingredient text, fdc_id integer, form text, state text, grams numeric, basis text, unit_name text, note text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET jit TO 'off'
AS $function$
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
$function$
;

grant execute on function nutrition_line_report(jsonb) to anon, authenticated;
