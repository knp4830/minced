-- Wave 12: cuisine backfill for USDA MyPlate recipes that had no cuisine. IDEMPOTENT, data only.
-- Policy: tag a recipe ONLY when the dish itself names an unmistakable cuisine AND the ingredient list supports it.
-- Of the 729 untagged recipes the large majority are generic American home cooking (no "American" cuisine exists
-- in the vocabulary) or loose adaptations (a "Hearty Mexican Soup" with curry powder), and are deliberately left untagged.
-- Review sheet: docs/content/CUISINE-BACKFILL-w12.csv. Never overwrites an existing cuisine (cuisine_id is null guard).
begin;
update recipes r set cuisine_id = c.id
from (values
  ('black-bean-and-sweet-potato-quesadillas', 'Mexican'),
  ('colorful-quesadillas', 'Mexican'),
  ('buttermilk-scones', 'British'),
  ('black-eyed-pea-and-collard-greens-soup', 'Southern US')
) v(slug, cuisine)
join cuisines c on c.name = v.cuisine
where r.slug = v.slug and r.cuisine_id is null and r.source_name = 'USDA MyPlate Kitchen';
commit;
