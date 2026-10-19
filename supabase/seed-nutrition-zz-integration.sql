-- Wave 10 integration data fixes. IDEMPOTENT. Run AFTER all other nutrition seeds, BEFORE refresh_all_recipe_nutrients().
begin;
-- Canned forms created by the brand seed have no household weights of their own, and a non-default form never borrows
-- the default form's. Where the default product is already canned/cooked beans, fish or fruit (black beans, tuna ...),
-- the default-form weights are the right weights for the canned form too. Copy them across (never overwrite).
insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)
select p.ingredient_id, 'canned', p.unit_id, p.grams_per_unit, p.source,
       coalesce(p.note || '; ', '') || 'copied from the default form at integration (default product is already the canned one)'
from ingredient_portions p
where p.form = 'default'
  and exists (select 1 from ingredient_foods f where f.ingredient_id = p.ingredient_id and f.form = 'canned')
  and p.ingredient_id in (select id from ingredients where canonical_name in
        ('black beans','canned tuna','cannellini beans','chickpeas','kidney beans','mandarin orange','sardines','white beans'))
on conflict do nothing;
-- Branded oils: label rounding (14 g fat on a 13.6 g serving) gives 100.4-102.6 g of fat per 100 g. Clamp to 100.
update usda_food_nutrients set amount_per_100g = 100
where nutrient_id in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11) and amount_per_100g > 100
  and fdc_id in (select fdc_id from usda_foods where data_type = 'branded');
commit;
