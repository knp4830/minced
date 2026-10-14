-- Ingredient combinations for /what-can-i-make/[combo] (M3.7).
--
-- Read-only. Run against the snapshot, never live:
--   docker exec -i <container> psql -U postgres -At -f - < scripts/seo/combos.sql > src/data/combos.json
--
-- A "key" is an ingredient rolled up to its family parent (yellow onion -> onion,
-- chicken breast -> chicken), the same unit the pantry matcher treats as
-- interchangeable. A recipe "uses" a key if any non-optional, non-staple
-- ingredient of it rolls up to that key. A combo's count is the number of
-- published recipes that use every key in it, so the page can honestly say
-- "N recipes use all of these".
--
-- Selection: the top 100 pairs and top 200 triples by count. A pair needs at
-- least 6 recipes, a triple at least 5, and onion + garlic never appear together, and a triple must be strictly narrower
-- than its narrowest pair (otherwise the third ingredient adds nothing and the
-- page would repeat the pair's page).
-- Only keys used by >= 12 recipes enter: that keeps pantry-typical ingredients.

with uses as (
  select distinct ri.recipe_id, coalesce(i.family_id, i.id) as key
  from recipe_ingredients ri
  join ingredients i on i.id = ri.ingredient_id
  join recipes r on r.id = ri.recipe_id and r.status = 'published'
  where not i.is_pantry_staple and not ri.is_optional
),
keys as (
  select u.key, k.canonical_name::text as name, k.slug, k.aisle_category, count(*) as n
  from uses u join ingredients k on k.id = u.key
  group by 1, 2, 3, 4
  having count(*) >= 12
),
u2 as (select u.* from uses u join keys using (key)),
-- Onion and garlic are in nearly everything. A page for "onion and garlic" is
-- noise, so a combo may hold at most one of them (ids 3616 onion, 11 garlic).
pairs as (
  select a.key as k1, b.key as k2, count(*) as n
  from u2 a join u2 b on a.recipe_id = b.recipe_id and a.key < b.key
  where not (a.key in (3616, 11) and b.key in (3616, 11))
  group by 1, 2
  having count(*) >= 6
),
triples as (
  select a.key as k1, b.key as k2, c.key as k3, count(*) as n
  from u2 a
  join u2 b on a.recipe_id = b.recipe_id and a.key < b.key
  join u2 c on a.recipe_id = c.recipe_id and b.key < c.key
  where (a.key in (3616, 11))::int + (b.key in (3616, 11))::int + (c.key in (3616, 11))::int <= 1
  group by 1, 2, 3
  having count(*) >= 5
),
pick_pairs as (
  select array[k1, k2] as ks, n from pairs order by n desc, k1, k2 limit 100
),
pick_triples as (
  select array[t.k1, t.k2, t.k3] as ks, t.n
  from triples t
  where t.n < least(
    (select n from pairs p where p.k1 = t.k1 and p.k2 = t.k2),
    (select n from pairs p where p.k1 = t.k1 and p.k2 = t.k3),
    (select n from pairs p where p.k1 = t.k2 and p.k2 = t.k3))
  order by t.n desc, t.k1, t.k2, t.k3
  limit 200
),
picked as (select * from pick_pairs union all select * from pick_triples),
-- Order inside a combo: protein first, then dairy, produce, pantry, spices, other;
-- more common first within an aisle. The slug follows the same order, so one set of
-- ingredients has exactly one URL.
expanded as (
  select p.ks, p.n, k.key, k.name, k.slug,
         row_number() over (
           partition by p.ks
           order by case k.aisle_category when 'Protein' then 1 when 'Dairy' then 2 when 'Produce' then 3
                    when 'Pantry' then 4 when 'Spices' then 5 else 6 end, k.n desc, k.name) as pos
  from picked p cross join lateral unnest(p.ks) as x(kid)
  join keys k on k.key = x.kid
)
select coalesce(jsonb_pretty(jsonb_agg(c order by (c->>'count')::int desc, c->>'slug')), '[]')
from (
  select jsonb_build_object(
    'slug', string_agg(slug, '-' order by pos),
    'ids', jsonb_agg(key order by pos),
    'names', jsonb_agg(name order by pos),
    'count', n) as c
  from expanded
  group by ks, n
) q;
