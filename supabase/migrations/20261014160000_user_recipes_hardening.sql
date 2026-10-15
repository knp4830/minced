-- Wave 7 review fixes for 20261014120000_user_recipes (never edit an applied/shipped migration).
--
-- 1. A database-side feature switch for user recipes. NEXT_PUBLIC_ENABLE_USER_RECIPES only hid
--    the UI; the author RPCs were callable by any signed-in user straight through PostgREST.
--    The five author RPCs now live in schema "private" (not exposed by the API) and the public
--    functions of the same name are thin wrappers that refuse with 42501 while the switch is off.
--    Turn it on (as the postgres role, SQL editor or a migration):
--      update feature_flags set enabled = true where name = 'user_recipes';
-- 2. admin_set_review: undoing an approval on a user recipe takes it back out of public view.
-- 3. user_recipe_text: the invisible/bidi characters are now regex escapes (file is pure ASCII).

begin;

-- ---------------------------------------------------------------------------
-- 1. Feature switch
-- ---------------------------------------------------------------------------

create table feature_flags (
  name    text primary key,
  enabled boolean not null default false
);
alter table feature_flags enable row level security;   -- no policies: API roles see nothing
revoke all on feature_flags from public, anon, authenticated;
insert into feature_flags (name, enabled) values ('user_recipes', false);

create function feature_enabled(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select enabled from feature_flags where name = p_name), false);
$$;
revoke all on function feature_enabled(text) from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter function save_my_recipe(uuid, jsonb, boolean) set schema private;
alter function delete_my_recipe(uuid)               set schema private;
alter function withdraw_my_recipe(uuid)             set schema private;
alter function my_recipes()                         set schema private;
alter function my_recipe_for_edit(uuid)             set schema private;

revoke all on function private.save_my_recipe(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function private.delete_my_recipe(uuid)               from public, anon, authenticated;
revoke all on function private.withdraw_my_recipe(uuid)             from public, anon, authenticated;
revoke all on function private.my_recipes()                         from public, anon, authenticated;
revoke all on function private.my_recipe_for_edit(uuid)             from public, anon, authenticated;

create function save_my_recipe(p_recipe_id uuid, p_data jsonb, p_submit boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  return private.save_my_recipe(p_recipe_id, p_data, p_submit);
end;
$$;

create function delete_my_recipe(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  return private.delete_my_recipe(p_recipe_id);
end;
$$;

create function withdraw_my_recipe(p_recipe_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  return private.withdraw_my_recipe(p_recipe_id);
end;
$$;

create function my_recipes()
returns table (
  id uuid, slug text, title text, status recipe_status,
  prep_time_min integer, cook_time_min integer, servings integer,
  ingredient_count integer, updated_at timestamptz,
  returned boolean, review_note text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  return query select * from private.my_recipes();
end;
$$;

create function my_recipe_for_edit(p_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  return private.my_recipe_for_edit(p_recipe_id);
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
-- 2. admin_set_review: Undo on an approved user recipe un-publishes it
-- ---------------------------------------------------------------------------

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
      if rec.author_id is not null and rec.cur_review = 'approved' then
        -- A user recipe is public only because it was approved: undoing that pulls it back.
        update recipes set status = 'in_review' where id = rec.id and status = 'published';
      elsif rec.cur_review = 'rejected' then
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
-- 3. user_recipe_text: pure-ASCII source (control + zero-width + bidi characters as escapes)
-- ---------------------------------------------------------------------------

create or replace function user_recipe_text(
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

commit;
