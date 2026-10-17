-- Settings (wave 11): one private row per person for units, week start, sex and food defaults.
--
-- Why a new table and not columns on `profiles`: `profiles` has an update-own-row policy and is expected to
-- get a public SELECT policy once user recipes are live. Sex and allergens are private health-adjacent data,
-- so they live on a table that is private by construction: owner-only RLS, no anon access at all, no public
-- read ever. (LESSONS: "Admin as a flag on profiles" is the same class of mistake.)
--
-- Source of truth: `user_settings.sex` and `.units` replace `me_targets.sex` and `.units` as the thing the app
-- reads. The two old columns stay (NOT NULL, other SQL may read them) and are kept equal by two small
-- triggers, documented as TEMPORARY: a follow-up migration drops the columns and the triggers together once
-- nothing reads them. Dropping them in the same wave as the code change would make merge order fragile.
--
-- Written to run as a non-superuser: no placeholder GUCs in function definitions, no extensions.
-- Nothing here edits an applied migration.

-- ───────────────────────── table ─────────────────────────

create table public.user_settings (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  units          text        not null default 'metric' check (units in ('metric', 'imperial')),
  week_start     text        not null default 'monday' check (week_start in ('monday', 'sunday')),
  -- null = not set yet. The Me calorie formula needs a binary value, so Me asks once if this is empty.
  sex            text        check (sex in ('female', 'male')),
  -- Arrays cannot carry foreign keys; user_settings_guard() checks every slug against diets / allergens.
  diet_slugs     text[]      not null default '{}' check (cardinality(diet_slugs) <= 8),
  allergen_slugs text[]      not null default '{}' check (cardinality(allergen_slugs) <= 16),
  updated_at     timestamptz not null default now()
);

comment on table public.user_settings is
  'One private row per person: units, week start, sex, default diet and allergen filters. Owner-only; never publicly readable.';

-- ───────────────────────── guard trigger ─────────────────────────
-- Dedupes and sorts the slug arrays (stable output keeps the prefs cookie stable), caps them, rejects any slug
-- that is not a real diet / allergen (error 22023), and stamps updated_at. SECURITY INVOKER: diets and
-- allergens are readable by authenticated.

create function public.user_settings_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  bad text;
begin
  new.diet_slugs := coalesce(
    (select array_agg(distinct s order by s) from unnest(new.diet_slugs) as s where s is not null), '{}');
  new.allergen_slugs := coalesce(
    (select array_agg(distinct s order by s) from unnest(new.allergen_slugs) as s where s is not null), '{}');

  if cardinality(new.diet_slugs) > 8 or cardinality(new.allergen_slugs) > 16 then
    raise exception 'too many diets or allergens' using errcode = '22023';
  end if;

  select s into bad from unnest(new.diet_slugs) as s
   where not exists (select 1 from public.diets d where d.slug = s) limit 1;
  if bad is not null then
    raise exception 'unknown diet slug: %', left(bad, 64) using errcode = '22023';
  end if;

  select s into bad from unnest(new.allergen_slugs) as s
   where not exists (select 1 from public.allergens a where a.slug = s) limit 1;
  if bad is not null then
    raise exception 'unknown allergen slug: %', left(bad, 64) using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.user_settings_guard() from public, anon, authenticated;

create trigger user_settings_guard before insert or update on public.user_settings
  for each row execute function public.user_settings_guard();

-- ───────────────────────── row level security ─────────────────────────

alter table public.user_settings enable row level security;

-- (select auth.uid()) is evaluated once per statement, not once per row.
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_insert on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- No DELETE: the row goes with the account (on delete cascade). No anon access at all.
revoke all on public.user_settings from public, anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;

-- ───────────────────────── backfill ─────────────────────────

insert into public.user_settings (user_id, units, sex)
select user_id, units, sex from public.me_targets
on conflict (user_id) do nothing;

-- ───────────────────────── temporary mirror: user_settings <-> me_targets ─────────────────────────
-- (1) Writing me_targets copies the settings values in, so a stale client cannot make the two diverge.
-- (2) Writing user_settings copies sex / units into the person's me_targets row, if they have one.
-- Changing sex or units is not "re-doing your targets", so (2) must not reset me_targets.updated_at, which the
-- "update your targets?" check-in reads. The touch trigger honours a transaction-local flag for that.

create or replace function public.me_touch_targets()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('minced.settings_mirror', true), '') = '1' then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create function public.me_targets_take_settings()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s record;
begin
  select us.sex, us.units into s from public.user_settings us where us.user_id = new.user_id;
  if found then
    new.sex := coalesce(s.sex, new.sex);
    new.units := coalesce(s.units, new.units);
  else
    -- Targets saved by code that does not know about Settings yet (the window between this migration and the
    -- deploy): create the settings row from them, so the two never start out different.
    insert into public.user_settings (user_id, units, sex)
    values (new.user_id, new.units, new.sex)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.me_targets_take_settings() from public, anon, authenticated;

create trigger me_targets_take_settings before insert or update on public.me_targets
  for each row execute function public.me_targets_take_settings();

create function public.user_settings_mirror_to_targets()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform set_config('minced.settings_mirror', '1', true);
  update public.me_targets t
     set sex = coalesce(new.sex, t.sex), units = new.units
   where t.user_id = new.user_id
     and (t.sex is distinct from coalesce(new.sex, t.sex) or t.units is distinct from new.units);
  perform set_config('minced.settings_mirror', '', true);
  return null;
end;
$$;
revoke execute on function public.user_settings_mirror_to_targets() from public, anon, authenticated;

create trigger user_settings_mirror after insert or update of sex, units on public.user_settings
  for each row execute function public.user_settings_mirror_to_targets();

-- ───────────────────────── display name ─────────────────────────
-- Existing rows come from left(trim(..), 60) in handle_new_user, so this should already hold; trim any that
-- do not rather than let the migration fail on live.

update public.profiles set display_name = left(display_name, 60) where char_length(display_name) > 60;
alter table public.profiles
  add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 60) not valid;
alter table public.profiles validate constraint profiles_display_name_len;
