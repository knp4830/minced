-- Computed vs published macros for the USDA MyPlate recipes (the audit's validation).
--   psql "$URL" -f scripts/nutrition/validate_myplate.sql
-- Targets (owner, wave 10c): median abs error kcal 8, protein/carbs/fat 10, sodium/fiber 20; 80% of recipes within 15% on kcal.
--
-- Two populations, because a gap must never improve the score by hiding a recipe:
--   complete : recipes whose every counted line has a food (the headline the audit used)
--   covered  : every MyPlate recipe whose computed calories cover at least 90% of its counted mass, partial or not
\echo == status of the 872 MyPlate recipes
select nutrition_status, count(*) from recipes where source_name like 'USDA MyPlate%' group by 1 order by 1;

create temp view _v as
with c as (
  select r.id, r.title, r.nutrition_status st,
    r.calories pk, r.protein_g pp, r.carbs_g pc, r.fat_g pf, r.sodium_mg ps, r.fiber_g pfi,
    max(n.amount_per_serving) filter (where n.nutrient_id=1)  ck,
    max(n.amount_per_serving) filter (where n.nutrient_id=2)  cp,
    max(n.amount_per_serving) filter (where n.nutrient_id=3)  cc,
    max(n.amount_per_serving) filter (where n.nutrient_id=7)  cf,
    max(n.amount_per_serving) filter (where n.nutrient_id=13) cs,
    max(n.amount_per_serving) filter (where n.nutrient_id=4)  cfi,
    max(n.coverage) filter (where n.nutrient_id=1) cov
  from recipes r join recipe_nutrients n on n.recipe_id=r.id
  where r.source_name like 'USDA MyPlate%'
  group by r.id
)
select * from c where pk > 0 and ck is not null;

\echo == median absolute percent error, status complete
select count(*) n,
  round((percentile_cont(0.5) within group (order by abs(ck-pk)/nullif(pk,0)))::numeric*100,1) kcal,
  round((percentile_cont(0.5) within group (order by abs(cp-pp)/nullif(pp,0)))::numeric*100,1) protein,
  round((percentile_cont(0.5) within group (order by abs(cc-pc)/nullif(pc,0)))::numeric*100,1) carbs,
  round((percentile_cont(0.5) within group (order by abs(cf-pf)/nullif(pf,0)))::numeric*100,1) fat,
  round((percentile_cont(0.5) within group (order by abs(cs-ps)/nullif(ps,0)))::numeric*100,1) sodium,
  round((percentile_cont(0.5) within group (order by abs(cfi-pfi)/nullif(pfi,0)))::numeric*100,1) fiber,
  round(100.0*count(*) filter (where abs(ck-pk)/nullif(pk,0) <= 0.15)/count(*),1) pct_kcal_within_15,
  count(*) filter (where abs(ck-pk)/nullif(pk,0) > 0.2) gt20,
  count(*) filter (where abs(ck-pk)/nullif(pk,0) > 0.5) gt50
from _v where st = 'complete';

\echo == same, every recipe whose calories are computed from at least 90 percent of the counted mass (partial included)
select count(*) n,
  round((percentile_cont(0.5) within group (order by abs(ck-pk)/nullif(pk,0)))::numeric*100,1) kcal,
  round((percentile_cont(0.5) within group (order by abs(cp-pp)/nullif(pp,0)))::numeric*100,1) protein,
  round((percentile_cont(0.5) within group (order by abs(cc-pc)/nullif(pc,0)))::numeric*100,1) carbs,
  round((percentile_cont(0.5) within group (order by abs(cf-pf)/nullif(pf,0)))::numeric*100,1) fat,
  round((percentile_cont(0.5) within group (order by abs(cs-ps)/nullif(ps,0)))::numeric*100,1) sodium,
  round((percentile_cont(0.5) within group (order by abs(cfi-pfi)/nullif(pfi,0)))::numeric*100,1) fiber,
  round(100.0*count(*) filter (where abs(ck-pk)/nullif(pk,0) <= 0.15)/count(*),1) pct_kcal_within_15,
  count(*) filter (where abs(ck-pk)/nullif(pk,0) > 0.2) gt20,
  count(*) filter (where abs(ck-pk)/nullif(pk,0) > 0.5) gt50
from _v where cov >= 0.9;

\echo == the 20 recipes (status complete) furthest from the published calories
select title, st, round(pk) published, round(ck) computed, round(100*(ck-pk)/pk) pct
from _v where st = 'complete' order by abs(ck-pk)/pk desc limit 20;
