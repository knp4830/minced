-- Pantry harness (M1.5.7): 20 realistic pantries run through match_recipes().
--
-- The question it answers: "does a plausible kitchen get a useful list?" Each
-- pantry must return >= 10 recipes with at most 3 missing ingredients. If a
-- pantry fails, that is a finding about the CATALOG or the VOCABULARY (too few
-- recipes of that kind, or ingredient names that do not resolve) -- the harness
-- reports it and the script exits non-zero; it never relaxes the threshold.
--
-- READ-ONLY: it only calls match_recipes() and reads ingredients, so it is safe
-- on any database that has the migrations (including live). Run:
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/pantry_harness.sql
--
-- Pantries are written with canonical ingredient names, the way a user picks them
-- from the autocomplete. A name that does not exist is a harness error, not a
-- silent skip. NOTE: match_recipes pages cap at 100, so "matches = 100" means "at least 100". Broad words ('rice', 'onion', 'chicken') are the family parents.

create temp table h_pantries (id serial primary key, label text, items text[]);
insert into h_pantries (label, items) values
 ('broke student',            array['pasta','egg','tomato sauce','rice','canned tuna','black beans','onion','ramen noodles','peanut butter','sandwich bread','carrot']),
 ('chicken rice broccoli',    array['chicken breast','white rice','broccoli','garlic','soy sauce','onion','ginger']),
 ('vegetarian staples',       array['egg','spinach','feta','chickpeas','tomato','onion','rice','plain yogurt','cucumber','lentils']),
 ('nearly empty fridge',      array['egg','milk','cheddar cheese','sandwich bread','butter','ketchup']),
 ('korean pantry',            array['gochujang','gochugaru','kimchi','soy sauce','toasted sesame oil','garlic','scallion','rice','egg','firm tofu','sesame seeds','ginger']),
 ('baking pantry',            array['all-purpose flour','egg','milk','brown sugar','chocolate chips','rolled oats','banana','raisins','walnuts','cocoa powder']),
 ('mexican night',            array['black beans','corn tortillas','salsa','avocado','lime','fresh cilantro','onion','tomato','jalapeno','ground beef','ground cumin','chili powder']),
 ('italian weeknight',        array['spaghetti','parmesan','garlic','diced tomatoes','fresh basil','mozzarella','ground beef','onion']),
 ('indian lentil kitchen',    array['red lentils','chickpeas','ginger','garlic','onion','tomato','garam masala','ground turmeric','curry powder','plain yogurt','spinach','rice']),
 ('breakfast shelf',          array['egg','milk','sandwich bread','banana','strawberries','rolled oats','peanut butter','honey','greek yogurt']),
 ('soup and stew',            array['carrot','celery','onion','potato','chicken broth','chicken','green beans','tomato paste','bay leaf']),
 ('stir-fry crisper',         array['soy sauce','ginger','garlic','broccoli','carrot','bell pepper','rice','egg','scallion','toasted sesame oil','firm tofu']),
 ('veg drawer odds and ends', array['zucchini','tomato','egg','cheddar cheese','bell pepper','onion','mushrooms']),
 ('seafood dinner',           array['salmon','lemon','garlic','asparagus','rice','shrimp','fresh parsley']),
 ('ramen upgrade',            array['ramen noodles','egg','scallion','soy sauce','mixed vegetables','garlic','ginger']),
 ('plant-based',              array['black beans','rice','avocado','tomato','corn','firm tofu','spinach','sweet potato','chickpeas']),
 ('mediterranean',            array['chickpeas','cucumber','tomato','feta','red onion','lemon','pita bread','plain yogurt','fresh parsley']),
 ('burger and fries night',   array['ground beef','hamburger buns','cheddar cheese','tomato','lettuce','onion','ketchup','yellow mustard','potato']),
 ('potato and dairy',         array['russet potato','onion','cheddar cheese','sour cream','milk','bacon','chives']),
 ('fruit bowl and yogurt',    array['apple','banana','strawberries','blueberries','plain yogurt','honey','rolled oats','orange','pear']);

create temp table h_results (
  id integer, label text, pantry_size integer, matches integer, zero_missing integer,
  one_missing integer, ms numeric, top3 text, passed boolean
);

do $$
declare
  p record; ids integer[]; t0 timestamptz; t1 timestamptz;
  n integer; z integer; o integer; top text;
begin
  for p in select * from h_pantries order by id loop
    select array_agg(i.id) into ids from ingredients i where i.canonical_name = any (p.items);
    if exists (select 1 from unnest(p.items) x
               where not exists (select 1 from ingredients i where i.canonical_name = x)) then
      raise exception 'harness error: pantry "%" names an ingredient that does not exist: %',
        p.label, (select array_agg(x) from unnest(p.items) x
                  where not exists (select 1 from ingredients i where i.canonical_name = x));
    end if;

    t0 := clock_timestamp();
    create temp table h_m on commit drop as
      select * from match_recipes(ids, 3, '{}', 1, 100);
    t1 := clock_timestamp();

    select count(*), count(*) filter (where missing_count = 0), count(*) filter (where missing_count <= 1)
      into n, z, o from h_m;
    select string_agg(title || ' (' || missing_count || ')', '; ' order by coverage desc, have_count desc, recipe_id)
      into top from (select * from h_m order by coverage desc, have_count desc, recipe_id limit 3) s;

    insert into h_results values (p.id, p.label, cardinality(p.items), n, z, o,
      round((extract(epoch from t1 - t0) * 1000)::numeric, 1), top,
      n >= 10 and not exists (select 1 from h_m where missing_count > 3));
    drop table h_m;
  end loop;
end $$;

select id, label, pantry_size as items, matches, zero_missing as "0 missing",
       one_missing as "<=1 missing", ms, case when passed then 'PASS' else 'FAIL' end as result, top3
from   h_results order by id;

select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed,
       min(matches) as fewest_matches, max(ms) as slowest_ms
from   h_results;

do $$
declare f text;
begin
  select string_agg(label || ' (' || matches || ' matches)', ', ') into f from h_results where not passed;
  if f is not null then
    raise exception 'pantry harness FAILED for: %', f;
  end if;
end $$;
