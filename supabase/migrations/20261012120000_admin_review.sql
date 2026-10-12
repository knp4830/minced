-- Wave 4 / M1.5.6: admin review queue.
--
-- WHAT THIS ADDS
--   admins           who may review. A table, NOT an `is_admin` column on profiles:
--                    profiles has an "update your own row" policy, so a flag there
--                    would let any user promote themselves with one PATCH. `admins`
--                    has a SELECT-own-row policy and NO write policy at all; rows are
--                    inserted by hand with the database owner role (see the SQL in
--                    the PR body / docs), never through the API.
--   is_admin()       the one predicate every admin policy and function uses.
--   recipe_reviews   one row per REVIEWED recipe. No row = unreviewed. A separate
--                    table (rather than columns on `recipes`) because: `recipes` is
--                    the hot read path and was already bloated once; review state
--                    changes by the thousand during review and would churn that
--                    table's dead tuples; the admin-only RLS lives cleanly on a
--                    table nobody else may read; and `unreviewed` needs no
--                    backfill of 959 rows.
--   admin_* RPCs     SECURITY DEFINER, every one starts with an is_admin() check.
--
-- WHY RPCs INSTEAD OF "ADMIN CAN SEE EVERY RECIPE" POLICIES
--   src/lib/queries/recipes.ts and search.ts deliberately rely on RLS for the
--   published filter. A broad admin SELECT policy on `recipes` would make the
--   public browse and search pages show drafts and rejected recipes to an admin
--   who is just using the site. Nothing here changes a policy on any existing
--   table; the public surface behaves identically for admins and everyone else.
--
-- REJECT HIDES, NEVER DELETES
--   Rejecting sets recipes.status = 'draft' (no policy lets the public read it)
--   and remembers the previous status in recipe_reviews.prior_status so that
--   un-rejecting restores exactly what was there.
--
-- SCOPE: only imported recipes (author_id IS NULL). A user-authored draft is never
-- touched or published by the queue.

-- ---------------------------------------------------------------------------
-- admins + is_admin()
-- ---------------------------------------------------------------------------

create table admins (
  user_id    uuid primary key references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table admins is
  'Who may use /admin. Rows are added by the database owner only: there is deliberately no INSERT/UPDATE/DELETE policy.';

alter table admins enable row level security;

create policy "admins read their own row" on admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Defence in depth on top of "no write policy": Supabase's default privileges
-- grant everything on new tables to anon/authenticated.
revoke all on admins from anon, authenticated;
grant select on admins to authenticated;

create function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from admins where user_id = (select auth.uid()));
$$;

comment on function is_admin() is
  'True when the caller is in `admins`. SECURITY DEFINER so it works without a read policy leaking the admin list.';

revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- Internal guard shared by every admin_* function. Not callable via the API.
create function admin_assert()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function admin_assert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- recipe_reviews
-- ---------------------------------------------------------------------------

create type review_status as enum ('approved', 'rejected');

create table recipe_reviews (
  recipe_id     uuid primary key references recipes (id) on delete cascade,
  review_status review_status not null,
  -- recipes.status before a rejection, so un-rejecting restores it exactly.
  prior_status  recipe_status,
  reviewed_by   uuid references profiles (id) on delete set null,
  reviewed_at   timestamptz not null default now(),
  review_note   text check (review_note is null or char_length(review_note) <= 1000)
);

create index recipe_reviews_status_idx on recipe_reviews (review_status);

comment on table recipe_reviews is
  'One row per reviewed recipe; no row means unreviewed. Admin-only. Written by admin_set_review().';

alter table recipe_reviews enable row level security;

create policy "admins read reviews"   on recipe_reviews for select to authenticated using (is_admin());
create policy "admins insert reviews" on recipe_reviews for insert to authenticated with check (is_admin());
create policy "admins update reviews" on recipe_reviews for update to authenticated using (is_admin()) with check (is_admin());
create policy "admins delete reviews" on recipe_reviews for delete to authenticated using (is_admin());

revoke all on recipe_reviews from anon;
grant select, insert, update, delete on recipe_reviews to authenticated;  -- RLS (is_admin) is the gate

-- ---------------------------------------------------------------------------
-- Source buckets (matches recipes.source_name as imported)
-- ---------------------------------------------------------------------------

create function recipe_source_key(p_source_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_source_name ilike 'USDA%'          then 'usda'
    when p_source_name ilike 'Minced original%' then 'minced'
    when p_source_name ilike 'Minced design%'   then 'mockup'
    else 'other'
  end;
$$;

-- ---------------------------------------------------------------------------
-- admin_review_progress(): counts per source and state
-- ---------------------------------------------------------------------------

create function admin_review_progress()
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
    where  r.author_id is null
    group  by 1, 2;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_review_list(): filtered, keyset-paginated on slug
-- ---------------------------------------------------------------------------

create function admin_review_list(
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
    where  r.author_id is null
      and  (p_source is null or recipe_source_key(r.source_name) = p_source)
      and  (p_state = 'all'
            or (p_state = 'unreviewed' and rv.recipe_id is null)
            or rv.review_status::text = p_state)
      and  (p_after is null or r.slug > p_after)
    order  by r.slug
    limit  least(greatest(p_limit, 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_review_neighbors(): previous / next slug and size of the filtered queue
-- ---------------------------------------------------------------------------

create function admin_review_neighbors(
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
      where  r.author_id is null
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

-- ---------------------------------------------------------------------------
-- admin_recipe_detail(): everything the review screen shows, one round trip
-- ---------------------------------------------------------------------------

create function admin_recipe_detail(p_slug text)
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
  where r.slug = p_slug and r.author_id is null;

  return result;  -- null when the slug is unknown
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_review(): approve / reject / return to unreviewed, in batches
-- ---------------------------------------------------------------------------

create function admin_set_review(p_slugs text[], p_state text, p_note text default null)
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
    select r.id, r.status, rv.review_status as cur_review, rv.prior_status
    from   recipes r
    left join recipe_reviews rv on rv.recipe_id = r.id
    where  r.slug = any (p_slugs) and r.author_id is null
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
      insert into recipe_reviews (recipe_id, review_status, reviewed_by, reviewed_at, review_note)
      values (rec.id, 'approved', uid, now(), note)
      on conflict (recipe_id) do update
        set review_status = 'approved', prior_status = null,
            reviewed_by = uid, reviewed_at = now(), review_note = note;
      -- Approval is what makes an imported recipe public.
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

-- ---------------------------------------------------------------------------
-- admin_update_recipe(): title, step text, ingredient quantity / prep note
--
-- p_steps        [{ "id": <recipe_steps.id>, "instruction": "..." }]
-- p_ingredients  [{ "id": <recipe_ingredients.id>, "quantity": 1.5 | null,
--                   "prep_note": "..." | null, "is_optional": bool,
--                   "ingredient_name": "..." }]   -- last key optional
--
-- Ingredient identity changes ONLY through resolve_ingredient(): an unresolved
-- name raises and the whole edit rolls back, per the CLAUDE.md rule that a recipe
-- never carries an ingredient that is not a canonical row. Every id must belong
-- to the recipe named by p_slug.
-- ---------------------------------------------------------------------------

create function admin_update_recipe(
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
  select id into rid from recipes where slug = p_slug and author_id is null for update;
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

-- ---------------------------------------------------------------------------
-- Grants: signed-in callers only; each function re-checks is_admin() itself.
-- ---------------------------------------------------------------------------

revoke all on function admin_review_progress()                          from public, anon;
revoke all on function admin_review_list(text, text, text, integer)     from public, anon;
revoke all on function admin_review_neighbors(text, text, text)         from public, anon;
revoke all on function admin_recipe_detail(text)                        from public, anon;
revoke all on function admin_set_review(text[], text, text)             from public, anon;
revoke all on function admin_update_recipe(text, text, jsonb, jsonb)    from public, anon;

grant execute on function admin_review_progress()                       to authenticated;
grant execute on function admin_review_list(text, text, text, integer)  to authenticated;
grant execute on function admin_review_neighbors(text, text, text)      to authenticated;
grant execute on function admin_recipe_detail(text)                     to authenticated;
grant execute on function admin_set_review(text[], text, text)          to authenticated;
grant execute on function admin_update_recipe(text, text, jsonb, jsonb) to authenticated;
