-- Allergens, split and audited; derived diet tags (wave 10c).
--
-- WHAT CHANGES
--   1. The 'nuts' allergen becomes two: 'peanuts' (a legume) and 'tree-nuts'. Coconut is NOT a tree nut (FDA, 2025).
--      'shellfish' now means crustaceans (the US major allergen) and a new 'mollusks' allergen covers clams, oysters,
--      scallops, squid and snails. A new 'wheat' allergen sits beside 'gluten' (wheat is a major allergen; gluten also
--      covers barley and rye). Slug 'nuts' is gone: saved settings are migrated to both new slugs, and the app maps
--      the legacy slug in URLs and the prefs cookie.
--   2. ingredient_allergens gains `basis` (inherent | typical | varies) and `reason`, so the data says why a tag exists
--      and how sure it is. recipe_allergens gains `basis` too.
--   3. recipe_allergens now holds only allergens that come from a REQUIRED ingredient line. Allergens that come ONLY
--      from optional lines (marked optional, or a garnish) go in the new recipe_optional_allergens. The
--      allergen filters already exclude on recipe_allergens, so an optional-only garnish no longer hides a recipe; the
--      recipe page names it ("Peanuts: optional garnish, leave them out"). The match_recipes / search_recipes /
--      filtered_recipes bodies are NOT touched, which is deliberate: they keep working whatever other lanes do to them.
--   4. ingredients.diet_class (plant | honey | dairy_egg | seafood | meat) says what an ingredient IS. Recipe diet tags
--      (vegan, vegetarian, pescatarian, gluten-free) are DERIVED from it (refresh_recipe_diets), with a reviewed
--      exception table. Before this, only ~100 hand-tagged recipes carried a diet.
--
-- INTERIM STATE: until supabase/seed-allergen-tags.sql runs, the new allergens inherit the old tags conservatively
-- (peanuts and tree-nuts both get every old 'nuts' ingredient; mollusks gets every old 'shellfish' ingredient; wheat gets
-- every old 'gluten' ingredient), so nothing is ever LESS protected than before. The seed then replaces all tags.
--
-- Written to run as a non-superuser: no placeholder GUCs in function definitions, no extensions. Nothing here edits
-- an applied migration.

-- ───────────────────────── columns ─────────────────────────

alter table public.ingredient_allergens
  add column basis  text not null default 'typical' check (basis in ('inherent', 'typical', 'varies')),
  add column reason text;

comment on column public.ingredient_allergens.basis is
  'inherent = the ingredient IS the allergen or is made from it; typical = most products contain it; varies = some brands or recipes do. typical and varies are both tagged: a false "safe" costs more than a false "contains".';

alter table public.recipe_allergens
  add column basis text not null default 'typical' check (basis in ('inherent', 'typical', 'varies'));

comment on column public.recipe_allergens.basis is
  'Strongest basis among the REQUIRED lines that carry this allergen. The recipe page says "Contains" for inherent / typical and "May contain" for varies.';

alter table public.ingredients
  add column diet_class text check (diet_class in ('plant', 'honey', 'dairy_egg', 'seafood', 'meat'));

comment on column public.ingredients.diet_class is
  'What the ingredient is, for diet derivation. plant = no animal product; honey = bee product (vegetarian, not vegan); dairy_egg = vegetarian, not vegan; seafood = pescatarian, not vegetarian; meat = flesh, organ, animal fat, gelatin, meat stock. NULL = not reviewed (a recipe using it gets no vegan / vegetarian / pescatarian / gluten-free tag).';

-- ───────────────────────── vocabulary ─────────────────────────

update public.allergens set slug = 'tree-nuts', name = 'Tree nuts' where slug = 'nuts';
update public.allergens set name = 'Crustacean shellfish' where slug = 'shellfish';

insert into public.allergens (name, slug) values
  ('Peanuts',  'peanuts'),
  ('Wheat',    'wheat'),
  ('Mollusks', 'mollusks')
on conflict (slug) do nothing;

-- Interim conservative copies (see header). Triggers are paused: one bulk refresh runs at the end.
alter table public.ingredient_allergens disable trigger user;

insert into public.ingredient_allergens (ingredient_id, allergen_id, basis, reason)
select ia.ingredient_id, tgt.id, 'varies', 'interim copy of the previous ' || src.slug || ' tag until seed-allergen-tags.sql runs'
from   public.ingredient_allergens ia
join   public.allergens src on src.id = ia.allergen_id
join   public.allergens tgt on tgt.slug = case src.slug
                                            when 'tree-nuts' then 'peanuts'
                                            when 'shellfish' then 'mollusks'
                                            when 'gluten'    then 'wheat'
                                          end
on conflict (ingredient_id, allergen_id) do nothing;

alter table public.ingredient_allergens enable trigger user;

-- Saved settings: whoever avoided 'nuts' now avoids both new slugs; whoever avoided 'shellfish' also avoids mollusks.
update public.user_settings us
   set allergen_slugs = x.slugs
  from (
    select u.user_id, array_agg(distinct m order by m) as slugs
    from   public.user_settings u
    cross  join lateral unnest(u.allergen_slugs) as s
    cross  join lateral unnest(case s
                                 when 'nuts'      then array['peanuts', 'tree-nuts']
                                 when 'shellfish' then array['shellfish', 'mollusks']
                                 else array[s]
                               end) as m
    where  u.allergen_slugs && array['nuts', 'shellfish']
    group  by u.user_id
  ) x
 where x.user_id = us.user_id;

-- ───────────────────────── optional-only allergens ─────────────────────────

create table public.recipe_optional_allergens (
  recipe_id   uuid    not null references public.recipes (id) on delete cascade,
  allergen_id integer not null references public.allergens (id) on delete cascade,
  basis       text    not null default 'typical' check (basis in ('inherent', 'typical', 'varies')),
  primary key (recipe_id, allergen_id)
);

comment on table public.recipe_optional_allergens is
  'Allergens a recipe carries ONLY through optional lines (optional, garnish). Derived with recipe_allergens by refresh_recipe_allergens(); never written by clients.';

create index recipe_optional_allergens_allergen_idx on public.recipe_optional_allergens (allergen_id);

alter table public.recipe_optional_allergens enable row level security;
revoke all on public.recipe_optional_allergens from anon, authenticated;
grant select on public.recipe_optional_allergens to anon, authenticated;

create policy "optional allergens follow recipe visibility" on public.recipe_optional_allergens
  for select using (recipe_id in (select r.id from public.recipes r));

-- ───────────────────────── reviewed diet exceptions ─────────────────────────

create table public.recipe_diet_exceptions (
  recipe_id uuid    not null references public.recipes (id) on delete cascade,
  diet_id   integer not null references public.diets (id) on delete cascade,
  action    text    not null check (action in ('add', 'remove')),
  reason    text    not null check (length(reason) > 0),
  primary key (recipe_id, diet_id)
);

comment on table public.recipe_diet_exceptions is
  'Reviewed corrections to the derived diet tags: a recipe whose text proves an ingredient is meant differently (a vegetarian refried-bean burrito, a gluten-free pasta). refresh_recipe_diets() applies them after the derivation. Operator-written; clients have no access.';

alter table public.recipe_diet_exceptions enable row level security;
revoke all on public.recipe_diet_exceptions from anon, authenticated;

-- ───────────────────────── optional lines ─────────────────────────

-- One definition of "this line can be left out", used by the allergen derivation.
create or replace function public.line_is_optional(p_is_optional boolean, p_prep_note text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_is_optional, false)
      or coalesce(p_prep_note ~* '\m(optional|garnish)\M', false);
$$;
grant execute on function public.line_is_optional(boolean, text) to anon, authenticated, service_role;

-- ───────────────────────── allergen derivation ─────────────────────────

create or replace function public.recipe_allergen_rows(p_recipe uuid default null)
returns table (recipe_id uuid, allergen_id integer, basis text, optional_only boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  select ri.recipe_id,
         ia.allergen_id,
         coalesce(
           (array_agg(ia.basis order by case ia.basis when 'inherent' then 1 when 'typical' then 2 else 3 end)
              filter (where not public.line_is_optional(ri.is_optional, ri.prep_note)))[1],
           (array_agg(ia.basis order by case ia.basis when 'inherent' then 1 when 'typical' then 2 else 3 end))[1]
         ),
         bool_and(public.line_is_optional(ri.is_optional, ri.prep_note))
  from   recipe_ingredients ri
  join   ingredient_allergens ia on ia.ingredient_id = ri.ingredient_id
  where  p_recipe is null or ri.recipe_id = p_recipe
  group  by ri.recipe_id, ia.allergen_id;
$$;

create or replace function public.refresh_recipe_allergens(p_recipe_id uuid)
returns void
language sql
as $$
  delete from recipe_allergens          where recipe_id = p_recipe_id;
  delete from recipe_optional_allergens where recipe_id = p_recipe_id;

  insert into recipe_optional_allergens (recipe_id, allergen_id, basis)
  select recipe_id, allergen_id, basis from recipe_allergen_rows(p_recipe_id) where optional_only;

  insert into recipe_allergens (recipe_id, allergen_id, basis)
  select recipe_id, allergen_id, basis from recipe_allergen_rows(p_recipe_id) where not optional_only;
$$;

create or replace function public.refresh_all_recipe_allergens()
returns void
language sql
as $$
  delete from recipe_allergens;
  delete from recipe_optional_allergens;

  insert into recipe_optional_allergens (recipe_id, allergen_id, basis)
  select recipe_id, allergen_id, basis from recipe_allergen_rows(null) where optional_only;

  insert into recipe_allergens (recipe_id, allergen_id, basis)
  select recipe_id, allergen_id, basis from recipe_allergen_rows(null) where not optional_only;
$$;
revoke all on function public.refresh_all_recipe_allergens() from public, anon, authenticated;

-- ───────────────────────── diet derivation ─────────────────────────
-- Catalog recipes only (author_id is null): a person's own recipe keeps the diets its author chose.
-- Ingredient facts: a recipe is VEGAN when every ingredient is plant; VEGETARIAN when none is meat or seafood;
-- PESCATARIAN when none is meat. Only the strictest of those three is stored (diet_satisfying() makes a vegan recipe
-- satisfy a vegetarian filter). GLUTEN-FREE when no ingredient carries the gluten tag. ALL lines count, optional or not:
-- a diet label describes the recipe as written. A recipe with an unreviewed ingredient (diet_class NULL) gets no tag.

create or replace function public.recipe_diet_rows(p_recipe uuid default null)
returns table (recipe_id uuid, diet_id integer)
language sql
stable
set search_path = public, pg_temp
as $$
  with facts as (
    select r.id as recipe_id,
           count(ri.id)                                           as n,
           count(*) filter (where i.diet_class is null)           as unreviewed,
           coalesce(bool_or(i.diet_class = 'meat'), false)        as has_meat,
           coalesce(bool_or(i.diet_class = 'seafood'), false)     as has_seafood,
           coalesce(bool_or(i.diet_class in ('honey', 'dairy_egg')), false) as has_animal_product,
           coalesce(bool_or(exists (
             select 1 from ingredient_allergens ia join allergens a on a.id = ia.allergen_id
             where  ia.ingredient_id = ri.ingredient_id and a.slug = 'gluten')), false) as has_gluten
    from   recipes r
    join   recipe_ingredients ri on ri.recipe_id = r.id
    join   ingredients i on i.id = ri.ingredient_id
    where  r.author_id is null and (p_recipe is null or r.id = p_recipe)
    group  by r.id
  )
  select f.recipe_id, d.id
  from   facts f
  join   diets d on d.slug = case
           when f.unreviewed > 0 then null
           when not f.has_meat and not f.has_seafood and not f.has_animal_product then 'vegan'
           when not f.has_meat and not f.has_seafood then 'vegetarian'
           when not f.has_meat then 'pescatarian'
         end
  union all
  select f.recipe_id, d.id
  from   facts f
  join   diets d on d.slug = 'gluten-free'
  where  f.unreviewed = 0 and not f.has_gluten;
$$;

-- Desired set = derived rows, minus reviewed removals, plus reviewed additions. Applied as a DIFF so a no-change
-- refresh writes nothing (the recipe_diets triggers bump recipes.updated_at on any write).
create or replace function public.refresh_recipe_diets(p_recipe_id uuid)
returns void
language plpgsql
as $$
begin
  -- Until the seed has classified at least one ingredient, every recipe would count as "unreviewed" and lose its
  -- diets. Do nothing in that window (between this migration and seed-allergen-tags.sql).
  if not exists (select 1 from ingredients where diet_class is not null) then
    return;
  end if;

  with want as (
    select recipe_id, diet_id from recipe_diet_rows(p_recipe_id)
    except
    select recipe_id, diet_id from recipe_diet_exceptions where recipe_id = p_recipe_id and action = 'remove'
    union
    select recipe_id, diet_id from recipe_diet_exceptions e
    where  e.recipe_id = p_recipe_id and e.action = 'add'
      and  exists (select 1 from recipes r where r.id = e.recipe_id and r.author_id is null)
  ),
  gone as (
    delete from recipe_diets rd
    using  recipes r
    where  rd.recipe_id = p_recipe_id and r.id = rd.recipe_id and r.author_id is null
      and  not exists (select 1 from want w where w.recipe_id = rd.recipe_id and w.diet_id = rd.diet_id)
    returning 1
  )
  insert into recipe_diets (recipe_id, diet_id)
  select w.recipe_id, w.diet_id from want w
  on conflict do nothing;
end;
$$;

create or replace function public.refresh_all_recipe_diets()
returns void
language plpgsql
as $$
declare
  r uuid;
begin
  perform set_config('minced.skip_touch', '1', true);
  for r in select id from recipes where author_id is null loop
    perform refresh_recipe_diets(r);
  end loop;
  perform set_config('minced.skip_touch', '', true);
end;
$$;
revoke all on function public.refresh_all_recipe_diets() from public, anon, authenticated;

-- ───────────────────────── triggers: keep the derived data fresh ─────────────────────────
-- Bodies copied from the live definitions (search_path kept); the only change is the extra diet refresh.

create or replace function public.trg_sync_allergens_from_recipe_ingredients()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target uuid;
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT; reference the right one.
  if tg_op = 'DELETE' then
    target := old.recipe_id;
  else
    target := new.recipe_id;
  end if;

  perform refresh_recipe_allergens(target);
  perform refresh_recipe_diets(target);
  return null;
end;
$$;

create or replace function public.trg_sync_allergens_from_ingredient()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r      uuid;
  target integer;
begin
  if tg_op = 'DELETE' then
    target := old.ingredient_id;
  else
    target := new.ingredient_id;
  end if;

  for r in
    select distinct recipe_id from recipe_ingredients where ingredient_id = target
  loop
    perform refresh_recipe_allergens(r);
    perform refresh_recipe_diets(r);
  end loop;
  return null;
end;
$$;

-- A change to an ingredient's diet class re-derives the diets of every recipe that uses it.
create or replace function public.trg_sync_diets_from_ingredient()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r uuid;
begin
  for r in select distinct recipe_id from recipe_ingredients where ingredient_id = new.id loop
    perform refresh_recipe_diets(r);
  end loop;
  return null;
end;
$$;
revoke all on function public.trg_sync_diets_from_ingredient() from public, anon, authenticated;

create trigger ingredients_sync_diets
after update of diet_class on public.ingredients
for each row when (old.diet_class is distinct from new.diet_class)
execute function public.trg_sync_diets_from_ingredient();

-- ───────────────────────── rebuild the derived data now ─────────────────────────
-- Allergens from the interim tags; diets stay as they are until the seed has classified every ingredient
-- (refresh_recipe_diets would otherwise strip every diet while diet_class is still NULL).
select public.refresh_all_recipe_allergens();
