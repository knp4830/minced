-- Computed vs published macros for the USDA MyPlate recipes (the audit's validation).
--   psql "$URL" -f scripts/nutrition/validate_myplate.sql
-- Targets (plan): median abs error kcal 8, protein 8, carbs 10, fat 10, sodium 20; 80% of recipes within 15% on kcal.
\echo == median absolute percent error, MyPlate recipes with status complete
with c as (
  select r.id, r.title, r.nutrition_status st,
    r.calories pk, r.protein_g pp, r.carbs_g pc, r.fat_g pf, r.sodium_mg ps, r.fiber_g pfi,
    max(n.amount_per_serving) filter (where n.nutrient_id=1) ck,
    max(n.amount_per_serving) filter (where n.nutrient_id=2) cp,
    max(n.amount_per_serving) filter (where n.nutrient_id=3) cc,
    max(n.amount_per_serving) filter (where n.nutrient_id=7) cf,
    max(n.amount_per_serving) filter (where n.nutrient_id=13) cs,
    max(n.amount_per_serving) filter (where n.nutrient_id=4) cfi
  from recipes r join recipe_nutrients n on n.recipe_id=r.id
  where r.source_name like 'USDA MyPlate%' and r.nutrition_status='complete'
  group by r.id
)
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
from c where pk > 0;
