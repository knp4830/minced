-- Wave 7 / M5: user-submitted recipes.
--
-- SUBMISSION MODEL (read this before changing anything)
--   The wave-5 security_hardening migration removed every author write policy and
--   grant on recipes and its child tables, because the old policies only checked
--   author_id and let a stranger publish, forge provenance and set image_url.
--   This migration does NOT bring those policies back. Authors still have NO
--   INSERT/UPDATE/DELETE privilege on any recipe table. All author writes go
--   through four SECURITY DEFINER functions that:
--     * take the author from auth.uid() (never from an argument),
--     * can only touch rows where author_id = auth.uid(),
--     * write a fixed column list (never image_url, has_photo, published_at,
--       nutrition, source_url, author_id, slug on update),
--     * never produce status 'published': the only reachable states for an
--       author are 'draft' and 'in_review'. Publishing stays admin_set_review().
--   Editing a PUBLISHED recipe sends it back to 'in_review' (it leaves the public
--   site until an admin approves it again). Every author save clears the recipe's
--   recipe_reviews row, so an approval never survives an edit.
--   Every ingredient name must resolve to a canonical ingredient (CLAUDE.md): an
--   unresolved name raises and nothing is written. Same for units.
--
--   Error contract: validation failures raise SQLSTATE 22023 with HINT = the form
--   field ('title', 'ingredient:3', 'step:1', ...) so the UI can point at it.
--   42501 = not signed in. P0002 = recipe not found (also returned for someone
--   else's recipe, so ids cannot be probed).
--
--   Limits live here (not only in the form): 50 recipes per author, 10 waiting for
--   review at once, 60 ingredient rows, 40 steps, 1000 characters per step.
--
-- ALSO IN THIS MIGRATION
--   * The admin review queue now includes user recipes (recipe_source_key 'user').
--     A user recipe is in scope once submitted (status <> 'draft') or if it already
--     has a review row (a rejected one is a draft again). A never-submitted draft is
--     private and invisible to admins. Approving a draft is refused (skipped).
--   * delete_my_account() now deletes the caller's recipes instead of orphaning
--     them (recipes.author_id is ON DELETE SET NULL, which would have turned a
--     deleted person's recipe into an "imported" one).
--
-- Non-superuser safe: no SET of extension parameters, no superuser-only statements.

begin;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------------

-- Trims, strips control and bidi/zero-width characters, collapses runs of spaces
-- (single-line fields) and enforces a length range. Empty string -> NULL when min = 0.
create function user_recipe_text(
  p_value text, p_field text, p_min integer, p_max integer, p_multiline boolean default false
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  t text := coalesce(p_value, '');
begin
  t := regexp_replace(t, '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩﻿]', '', 'g');
  if p_multiline then
    t := regexp_replace(t, '[ \t]+', ' ', 'g');
    t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  else
    t := regexp_replace(t, '\s+', ' ', 'g');
  end if;
  t := btrim(t);
  if t = '' and p_min = 0 then
    return null;
  end if;
  if char_length(t) < p_min or char_length(t) > p_max then
    raise exception '% must be % to % characters', initcap(replace(p_field, '_', ' ')), p_min, p_max
      using errcode = '22023', hint = p_field;
  end if;
  return t;
end;
$$;

-- jsonb scalar -> numeric within [p_min, p_max], or NULL when absent / null / ''.
create function user_recipe_num(
  p_value jsonb, p_field text, p_min numeric, p_max numeric, p_whole boolean default true
)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  n numeric;
begin
  if p_value is null or p_value = 'null'::jsonb or p_value = '""'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_value) not in ('number', 'string') then
    raise exception '% must be a number', initcap(replace(p_field, '_', ' ')) using errcode = '22023', hint = p_field;
  end if;
  begin
    n := (p_value #>> '{}')::numeric;
  exception when others then
    raise exception '% must be a number', initcap(replace(p_field, '_', ' ')) using errcode = '22023', hint = p_field;
  end;
  if n < p_min or n > p_max or (p_whole and n <> trunc(n)) then
    raise exception '% must be between % and %', initcap(replace(p_field, '_', ' ')), p_min, p_max
      using errcode = '22023', hint = p_field;
  end if;
  return n;
end;
$$;

-- Is a recipe row part of the admin review queue? Imported rows always; user rows
-- once submitted or once reviewed. Never-submitted user drafts stay private.
create function admin_in_scope(r recipes)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select r.author_id is null
      or r.status <> 'draft'
      or exists (select 1 from recipe_reviews v where v.recipe_id = r.id);
$$;

revoke all on function user_recipe_text(text, text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function user_recipe_num(jsonb, text, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function admin_in_scope(recipes) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_my_recipe(): create or update the caller's recipe
--
-- p_data = { title, description, cuisine_id, prep_time_min, cook_time_min,
--            servings, spice_level, cost_per_serving,
--            diets: [diet_id], cookware: [cookware_id],
--            ingredients: [{ quantity, unit, name, prep_note, is_optional }],
--            steps: [text] }
-- Returns { id, slug, status }.
-- ---------------------------------------------------------------------------

create function save_my_recipe(p_recipe_id uuid, p_data jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid        uuid := (select auth.uid());
  rec        recipes%rowtype;
  v_title    text;
  v_desc     text;
  v_cuisine  integer;
  v_prep     integer;
  v_cook     integer;
  v_servings integer;
  v_spice    smallint;
  v_cost     numeric;
  v_status   recipe_status;
  v_id       uuid;
  v_slug     text;
  el         jsonb;
  i          integer;
  raw_name   text;
  raw_unit   text;
  res_ing    integer;
  res_unit   integer;
  qty        numeric;
  ings       jsonb := '[]'::jsonb;
  steps      text[] := '{}';
  step_txt   text;
  diet_ids   integer[] := '{}';
  ware_ids   integer[] := '{}';
  x          integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 150000 then
    raise exception 'bad request' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = uid) then
    raise exception 'no profile' using errcode = '42501';
  end if;

  if p_recipe_id is not null then
    select * into rec from recipes where id = p_recipe_id and author_id = uid for update;
    if not found then
      raise exception 'recipe not found' using errcode = 'P0002';
    end if;
  end if;

  -- Scalars -----------------------------------------------------------------
  v_title    := user_recipe_text(p_data ->> 'title', 'title', 3, 120);
  v_desc     := user_recipe_text(p_data ->> 'description', 'description', 0, 500, true);
  v_cuisine  := user_recipe_num(p_data -> 'cuisine_id', 'cuisine', 1, 2147483647)::integer;
  v_prep     := user_recipe_num(p_data -> 'prep_time_min', 'prep_time', 0, 1440)::integer;
  v_cook     := user_recipe_num(p_data -> 'cook_time_min', 'cook_time', 0, 1440)::integer;
  v_servings := user_recipe_num(p_data -> 'servings', 'servings', 1, 100)::integer;
  v_spice    := user_recipe_num(p_data -> 'spice_level', 'spice', 0, 4)::smallint;
  v_cost     := user_recipe_num(p_data -> 'cost_per_serving', 'cost', 0, 999, false);
  if v_servings is null then
    raise exception 'Servings is required' using errcode = '22023', hint = 'servings';
  end if;
  if v_cost is not null then
    v_cost := round(v_cost, 2);
  end if;
  if v_cuisine is not null and not exists (select 1 from cuisines where id = v_cuisine) then
    raise exception 'Unknown cuisine' using errcode = '22023', hint = 'cuisine';
  end if;

  -- Diets and cookware: ids from the fixed vocabularies, nothing else ---------
  if jsonb_typeof(p_data -> 'diets') = 'array' then
    if jsonb_array_length(p_data -> 'diets') > 10 then
      raise exception 'Too many diet tags' using errcode = '22023', hint = 'diets';
    end if;
    for el in select * from jsonb_array_elements(p_data -> 'diets') loop
      x := user_recipe_num(el, 'diets', 1, 2147483647)::integer;
      if x is null or not exists (select 1 from diets where id = x) then
        raise exception 'Unknown diet' using errcode = '22023', hint = 'diets';
      end if;
      diet_ids := array_append(diet_ids, x);
    end loop;
  end if;
  if jsonb_typeof(p_data -> 'cookware') = 'array' then
    if jsonb_array_length(p_data -> 'cookware') > 30 then
      raise exception 'Too many cookware items' using errcode = '22023', hint = 'cookware';
    end if;
    for el in select * from jsonb_array_elements(p_data -> 'cookware') loop
      x := user_recipe_num(el, 'cookware', 1, 2147483647)::integer;
      if x is null or not exists (select 1 from cookware where id = x) then
        raise exception 'Unknown cookware' using errcode = '22023', hint = 'cookware';
      end if;
      ware_ids := array_append(ware_ids, x);
    end loop;
  end if;
  diet_ids := coalesce((select array_agg(distinct d) from unnest(diet_ids) d), '{}');
  ware_ids := coalesce((select array_agg(distinct d) from unnest(ware_ids) d), '{}');

  -- Ingredients: every non-blank row must resolve to a canonical ingredient -----
  if jsonb_typeof(p_data -> 'ingredients') = 'array' then
    if jsonb_array_length(p_data -> 'ingredients') > 60 then
      raise exception 'A recipe can have at most 60 ingredients' using errcode = '22023', hint = 'ingredients';
    end if;
    i := 0;
    for el in select * from jsonb_array_elements(p_data -> 'ingredients') loop
      i := i + 1;
      if jsonb_typeof(el) <> 'object' then
        raise exception 'Bad ingredient row' using errcode = '22023', hint = format('ingredient:%s', i);
      end if;
      raw_name := user_recipe_text(el ->> 'name', 'ingredient', 0, 80);
      raw_unit := user_recipe_text(el ->> 'unit', 'unit', 0, 30);
      if raw_name is null then
        if coalesce(user_recipe_text(el ->> 'quantity', 'quantity', 0, 20), '') <> '' or raw_unit is not null then
          raise exception 'Ingredient %: add a name or remove the row', i
            using errcode = '22023', hint = format('ingredient:%s', i);
        end if;
        continue;  -- fully blank row
      end if;

      select ingredient_id into res_ing from resolve_ingredient(raw_name) limit 1;
      if res_ing is null then
        raise exception 'Ingredient %: "%" is not in our ingredient list. Pick a suggestion or remove the row.', i, raw_name
          using errcode = '22023', hint = format('ingredient:%s', i);
      end if;

      qty := null;
      begin
        qty := user_recipe_num(el -> 'quantity', 'quantity', 0, 100000, false);
      exception when sqlstate '22023' then
        raise exception 'Ingredient %: quantity must be a positive number (or empty for to taste)', i
          using errcode = '22023', hint = format('ingredient:%s', i);
      end;
      if qty is not null and qty <= 0 then
        raise exception 'Ingredient %: quantity must be a positive number (or empty for to taste)', i
          using errcode = '22023', hint = format('ingredient:%s', i);
      end if;

      res_unit := null;
      if raw_unit is not null then
        select unit_id into res_unit from resolve_unit(raw_unit) limit 1;
        if res_unit is null then
          raise exception 'Ingredient %: unit "%" is not recognised', i, raw_unit
            using errcode = '22023', hint = format('ingredient:%s', i);
        end if;
      end if;

      ings := ings || jsonb_build_array(jsonb_build_object(
        'ingredient_id', res_ing,
        'quantity', qty,
        'unit_id', res_unit,
        'prep_note', user_recipe_text(el ->> 'prep_note', 'prep_note', 0, 100),
        'is_optional', coalesce((el ->> 'is_optional') = 'true', false)));
    end loop;
  end if;

  -- Steps ------------------------------------------------------------------
  if jsonb_typeof(p_data -> 'steps') = 'array' then
    if jsonb_array_length(p_data -> 'steps') > 40 then
      raise exception 'A recipe can have at most 40 steps' using errcode = '22023', hint = 'steps';
    end if;
    i := 0;
    for el in select * from jsonb_array_elements(p_data -> 'steps') loop
      i := i + 1;
      if jsonb_typeof(el) <> 'string' then
        raise exception 'Bad step' using errcode = '22023', hint = format('step:%s', i);
      end if;
      step_txt := user_recipe_text(el #>> '{}', 'step', 0, 1000, true);
      if step_txt is not null then
        steps := array_append(steps, step_txt);
      end if;
    end loop;
  end if;

  -- Status: an author can only ever reach draft or in_review -------------------
  if rec.id is not null and rec.status in ('in_review', 'published') then
    v_status := 'in_review';
  elsif coalesce(p_submit, false) then
    v_status := 'in_review';
  else
    v_status := 'draft';
  end if;

  if v_status = 'in_review' then
    -- Clickwrap for user content (docs/LEGAL-COMPLIANCE.md section 5): enforced here,
    -- not only in the form, because a Server Action is a public endpoint.
    if coalesce(p_data ->> 'rights_confirmed', '') <> 'true' then
      raise exception 'Please confirm that you wrote this recipe and may share it' using errcode = '22023', hint = 'rights';
    end if;
    if jsonb_array_length(ings) < 1 then
      raise exception 'Add at least one ingredient before submitting' using errcode = '22023', hint = 'ingredients';
    end if;
    if cardinality(steps) < 1 then
      raise exception 'Add at least one step before submitting' using errcode = '22023', hint = 'steps';
    end if;
  end if;

  -- Caps ----------------------------------------------------------------------
  if rec.id is null and (select count(*) from recipes where author_id = uid) >= 50 then
    raise exception 'You have reached the limit of 50 recipes. Delete one to add another.' using errcode = '22023';
  end if;
  if v_status = 'in_review' and (rec.id is null or rec.status = 'draft')
     and (select count(*) from recipes where author_id = uid and status = 'in_review') >= 10 then
    raise exception 'You already have 10 recipes waiting for review. Wait for a decision before submitting more.'
      using errcode = '22023';
  end if;

  -- Write ---------------------------------------------------------------------
  if rec.id is null then
    v_slug := left(trim(both '-' from regexp_replace(search_fold(v_title), '[^a-z0-9]+', '-', 'g')), 60);
    if v_slug = '' then
      v_slug := 'recipe';
    end if;
    v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 8);

    insert into recipes (slug, title, description, cuisine_id, author_id, status,
                         prep_time_min, cook_time_min, servings, spice_level, cost_per_serving,
                         source_name, source_license)
    values (v_slug, v_title, v_desc, v_cuisine, uid, v_status,
            v_prep, v_cook, v_servings, v_spice, v_cost,
            'User submission', 'user-submitted')
    returning id into v_id;
  else
    v_id := rec.id;
    v_slug := rec.slug;
    update recipes
       set title = v_title, description = v_desc, cuisine_id = v_cuisine,
           prep_time_min = v_prep, cook_time_min = v_cook, servings = v_servings,
           spice_level = v_spice, cost_per_serving = v_cost, status = v_status
     where id = v_id and author_id = uid;
  end if;

  delete from recipe_ingredients where recipe_id = v_id;
  delete from recipe_steps       where recipe_id = v_id;
  delete from recipe_diets       where recipe_id = v_id;
  delete from recipe_cookware    where recipe_id = v_id;

  insert into recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, prep_note, is_optional, sort_order)
  select v_id, (e ->> 'ingredient_id')::integer, (e ->> 'quantity')::numeric, (e ->> 'unit_id')::integer,
         e ->> 'prep_note', (e ->> 'is_optional')::boolean, (ord - 1)::integer
  from   jsonb_array_elements(ings) with ordinality as t(e, ord);

  insert into recipe_steps (recipe_id, sort_order, instruction)
  select v_id, (ord - 1)::integer, s
  from   unnest(steps) with ordinality as t(s, ord);

  insert into recipe_diets (recipe_id, diet_id)    select v_id, d from unnest(diet_ids) d;
  insert into recipe_cookware (recipe_id, cookware_id) select v_id, c from unnest(ware_ids) c;

  -- An edit always voids a previous review decision.
  delete from recipe_reviews where recipe_id = v_id;

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_my_recipe() / withdraw_my_recipe()
-- ---------------------------------------------------------------------------

create function delete_my_recipe(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  s   text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from recipes where id = p_recipe_id and author_id = uid returning slug into s;
  if s is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  return s;  -- the caller revalidates this slug's cached page
end;
$$;

-- in_review -> draft. Published recipes cannot be "withdrawn" here: delete them.
create function withdraw_my_recipe(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  s   text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update recipes set status = 'draft'
   where id = p_recipe_id and author_id = uid and status = 'in_review'
  returning slug into s;
  if s is null then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;
  delete from recipe_reviews where recipe_id = p_recipe_id;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_recipes() / my_recipe_for_edit(): the author's own rows, with review notes
-- (recipe_reviews is admin-only, so the author reads it through these)
-- ---------------------------------------------------------------------------

create function my_recipes()
returns table (
  id uuid, slug text, title text, status recipe_status,
  prep_time_min integer, cook_time_min integer, servings integer,
  ingredient_count integer, updated_at timestamptz,
  returned boolean, review_note text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
    select r.id, r.slug, r.title, r.status, r.prep_time_min, r.cook_time_min, r.servings,
           (select count(*)::int from recipe_ingredients ri where ri.recipe_id = r.id),
           r.updated_at,
           (rv.review_status = 'rejected' and r.status = 'draft'),
           case when rv.review_status = 'rejected' and r.status = 'draft' then rv.review_note end
    from   recipes r
    left join recipe_reviews rv on rv.recipe_id = r.id
    where  r.author_id = uid
    order  by r.updated_at desc, r.id
    limit  100;
end;
$$;

create function my_recipe_for_edit(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', r.id, 'slug', r.slug, 'title', r.title, 'description', r.description,
    'status', r.status, 'cuisine_id', r.cuisine_id,
    'prep_time_min', r.prep_time_min, 'cook_time_min', r.cook_time_min,
    'servings', r.servings, 'spice_level', r.spice_level,
    'cost_per_serving', r.cost_per_serving,
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'quantity', ri.quantity, 'unit', u.name, 'name', i.canonical_name,
               'prep_note', ri.prep_note, 'is_optional', ri.is_optional)
             order by ri.sort_order)
      from recipe_ingredients ri
      join ingredients i on i.id = ri.ingredient_id
      left join units u on u.id = ri.unit_id
      where ri.recipe_id = r.id), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(s.instruction order by s.sort_order)
      from recipe_steps s where s.recipe_id = r.id), '[]'::jsonb),
    'diets', coalesce((select jsonb_agg(rd.diet_id) from recipe_diets rd where rd.recipe_id = r.id), '[]'::jsonb),
    'cookware', coalesce((select jsonb_agg(rc.cookware_id) from recipe_cookware rc where rc.recipe_id = r.id), '[]'::jsonb),
    'allergens', coalesce((
      select jsonb_agg(a.name order by a.name)
      from recipe_allergens ra join allergens a on a.id = ra.allergen_id
      where ra.recipe_id = r.id), '[]'::jsonb),
    'returned', (rv.review_status = 'rejected' and r.status = 'draft'),
    'review_note', case when rv.review_status = 'rejected' and r.status = 'draft' then rv.review_note end
  )
  into result
  from recipes r
  left join recipe_reviews rv on rv.recipe_id = r.id
  where r.id = p_recipe_id and r.author_id = uid;

  return result;  -- null when it is not the caller's recipe
end;
$$;

revoke all on function save_my_recipe(uuid, jsonb, boolean) from public, anon;
revoke all on function delete_my_recipe(uuid)               from public, anon;
revoke all on function withdraw_my_recipe(uuid)             from public, anon;
revoke all on function my_recipes()                         from public, anon;
revoke all on function my_recipe_for_edit(uuid)             from public, anon;

grant execute on function save_my_recipe(uuid, jsonb, boolean) to authenticated;
grant execute on function delete_my_recipe(uuid)               to authenticated;
grant execute on function withdraw_my_recipe(uuid)             to authenticated;
grant execute on function my_recipes()                         to authenticated;
grant execute on function my_recipe_for_edit(uuid)             to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion removes the person's recipes too
-- ---------------------------------------------------------------------------

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from public.recipes where author_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin review queue: user recipes join the queue ('user' source)
-- Bodies are the 20261012120000 originals with the author_id IS NULL scope replaced
-- by admin_in_scope(r) and approval of a never-submitted draft refused.
-- ---------------------------------------------------------------------------

create or replace function recipe_source_key(p_source_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_source_name ilike 'USDA%'          then 'usda'
    when p_source_name ilike 'Minced original%' then 'minced'
    when p_source_name ilike 'Minced design%'   then 'mockup'
    when p_source_name = 'User submission'      then 'user'
    else 'other'
  end;
$$;

create or replace function admin_review_progress()
returns table (source_key text, state text, n bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform admin_assert();
  return query
    select recipe_source_key(r.source_name),
           coalesce(rv.review_status::text, 'unreviewed'),
           count(*)
    from   recipes r
    left join recipe_reviews rv on rv.recipe_id = r.id
    where  admin_in_scope(r)
    group  by 1, 2;
end;
$$;

create or replace function admin_review_list(
  p_state  text default 'unreviewed',
  p_source text default null,
  p_after  text default null,
  p_limit  integer default 50
)
returns table (
  slug text, title text, source_key text, state text, status recipe_status,
  ingredient_count integer, reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform admin_assert();
  if p_state not in ('all', 'unreviewed', 'approved', 'rejected') then
    raise exception 'bad state %', p_state using errcode = '22023';
  end if;
  return query
    select r.slug, r.title, recipe_source_key(r.source_name),
           coalesce(rv.review_status::text, 'unreviewed'),
           r.status,
           (select count(*)::int from recipe_ingredients ri where ri.recipe_id = r.id),
           rv.reviewed_at
    from   recipes r
    left join recipe_reviews rv on rv.recipe_id = r.id
    where  admin_in_scope(r)
      and  (p_source is null or recipe_source_key(r.source_name) = p_source)
      and  (p_state = 'all'
            or (p_state = 'unreviewed' and rv.recipe_id is null)
            or rv.review_status::text = p_state)
      and  (p_after is null or r.slug > p_after)
    order  by r.slug
    limit  least(greatest(p_limit, 1), 200);
end;
$$;

create or replace function admin_review_neighbors(
  p_slug   text,
  p_state  text default 'unreviewed',
  p_source text default null
)
returns table (prev_slug text, next_slug text, total bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform admin_assert();
  if p_state not in ('all', 'unreviewed', 'approved', 'rejected') then
    raise exception 'bad state %', p_state using errcode = '22023';
  end if;
  return query
    with q as (
      select r.slug
      from   recipes r
      left join recipe_reviews rv on rv.recipe_id = r.id
      where  admin_in_scope(r)
        and  (p_source is null or recipe_source_key(r.source_name) = p_source)
        and  (p_state = 'all'
              or (p_state = 'unreviewed' and rv.recipe_id is null)
              or rv.review_status::text = p_state)
    )
    select (select max(q.slug) from q where q.slug < p_slug),
           (select min(q.slug) from q where q.slug > p_slug),
           (select count(*) from q);
end;
$$;

create or replace function admin_recipe_detail(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform admin_assert();
  select jsonb_build_object(
    'id', r.id, 'slug', r.slug, 'title', r.title, 'description', r.description,
    'status', r.status, 'servings', r.servings,
    'prep_time_min', r.prep_time_min, 'cook_time_min', r.cook_time_min,
    'spice_level', r.spice_level,
    'cuisine', (select c.name from cuisines c where c.id = r.cuisine_id),
    'nutrition', jsonb_build_object(
      'calories', r.calories, 'protein_g', r.protein_g, 'carbs_g', r.carbs_g,
      'fat_g', r.fat_g, 'sodium_mg', r.sodium_mg, 'fiber_g', r.fiber_g),
    'source', jsonb_build_object(
      'key', recipe_source_key(r.source_name), 'name', r.source_name,
      'url', r.source_url, 'license', r.source_license),
    'notes', r.notes,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'sort_order', s.sort_order, 'instruction', s.instruction)
                       order by s.sort_order)
      from recipe_steps s where s.recipe_id = r.id), '[]'::jsonb),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ri.id, 'sort_order', ri.sort_order,
               'ingredient_id', i.id, 'canonical_name', i.canonical_name,
               'is_pantry_staple', i.is_pantry_staple, 'aisle', i.aisle_category,
               'quantity', ri.quantity, 'unit', u.name,
               'prep_note', ri.prep_note, 'is_optional', ri.is_optional)
             order by ri.sort_order)
      from recipe_ingredients ri
      join ingredients i on i.id = ri.ingredient_id
      left join units u on u.id = ri.unit_id
      where ri.recipe_id = r.id), '[]'::jsonb),
    'allergens', coalesce((
      select jsonb_agg(a.name order by a.name)
      from recipe_allergens ra join allergens a on a.id = ra.allergen_id
      where ra.recipe_id = r.id), '[]'::jsonb),
    'diets', coalesce((
      select jsonb_agg(d.name order by d.name)
      from recipe_diets rd join diets d on d.id = rd.diet_id
      where rd.recipe_id = r.id), '[]'::jsonb),
    'cookware', coalesce((
      select jsonb_agg(c.name order by c.name)
      from recipe_cookware rc join cookware c on c.id = rc.cookware_id
      where rc.recipe_id = r.id), '[]'::jsonb),
    'photo', (
      select jsonb_build_object(
               'storage_path', p.storage_path, 'width', p.width, 'height', p.height,
               'alt_text', p.alt_text, 'source', p.source, 'license', p.license,
               'license_url', p.license_url, 'credit', p.credit,
               'attribution_url', p.attribution_url)
      from recipe_photos p where p.recipe_id = r.id),
    'review', (
      select jsonb_build_object(
               'state', rv.review_status, 'reviewed_at', rv.reviewed_at,
               'note', rv.review_note)
      from recipe_reviews rv where rv.recipe_id = r.id)
  )
  into result
  from recipes r
  where r.slug = p_slug and admin_in_scope(r);

  return result;  -- null when the slug is unknown or out of scope
end;
$$;

create or replace function admin_set_review(p_slugs text[], p_state text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  rec record;
  n integer := 0;
  note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  perform admin_assert();
  if p_state not in ('approved', 'rejected', 'unreviewed') then
    raise exception 'bad state %', p_state using errcode = '22023';
  end if;
  if p_slugs is null or cardinality(p_slugs) = 0 or cardinality(p_slugs) > 200 then
    raise exception 'between 1 and 200 slugs required' using errcode = '22023';
  end if;

  for rec in
    select r.id, r.status, r.author_id, rv.review_status as cur_review, rv.prior_status
    from   recipes r
    left join recipe_reviews rv on rv.recipe_id = r.id
    where  r.slug = any (p_slugs) and admin_in_scope(r)
    for update of r
  loop
    if p_state = 'rejected' then
      insert into recipe_reviews (recipe_id, review_status, prior_status, reviewed_by, reviewed_at, review_note)
      values (rec.id, 'rejected',
              case when rec.cur_review = 'rejected' then rec.prior_status else rec.status end,
              uid, now(), note)
      on conflict (recipe_id) do update
        set review_status = 'rejected',
            prior_status  = case when recipe_reviews.review_status = 'rejected'
                                 then recipe_reviews.prior_status else rec.status end,
            reviewed_by = uid, reviewed_at = now(), review_note = note;
      update recipes set status = 'draft' where id = rec.id and status <> 'draft';

    elsif p_state = 'approved' then
      -- A user's recipe that is back in their drafts was not submitted: skip it.
      if rec.author_id is not null and rec.status = 'draft' then
        continue;
      end if;
      insert into recipe_reviews (recipe_id, review_status, reviewed_by, reviewed_at, review_note)
      values (rec.id, 'approved', uid, now(), note)
      on conflict (recipe_id) do update
        set review_status = 'approved', prior_status = null,
            reviewed_by = uid, reviewed_at = now(), review_note = note;
      -- Approval is what makes a recipe public.
      update recipes set status = 'published' where id = rec.id and status <> 'published';

    else -- unreviewed
      delete from recipe_reviews where recipe_id = rec.id;
      if rec.cur_review = 'rejected' then
        update recipes set status = coalesce(rec.prior_status, 'published')
        where id = rec.id;
      end if;
    end if;
    n := n + 1;
  end loop;

  return n;
end;
$$;

create or replace function admin_update_recipe(
  p_slug        text,
  p_title       text default null,
  p_steps       jsonb default '[]',
  p_ingredients jsonb default '[]'
)
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
end;
$$;

commit;
