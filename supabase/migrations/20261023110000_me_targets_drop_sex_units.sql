-- Wave 14 (Me lane): me_targets.sex and me_targets.units are dropped. Settings (user_settings.sex / .units) is
-- the single source; the app has read them from Settings since wave 11 and the two-way mirror triggers only
-- existed to keep a duplicate copy in step. The code stops reading and writing both columns BEFORE this runs
-- (it reads `me_targets` with an explicit column list), so applying it first or last is safe for the current code.
--
-- Nothing is lost: before the columns go, any person who has a me_targets row but no user_settings row, or a
-- user_settings row with no sex, gets their saved sex copied across. Units already live in Settings (the mirror
-- made Settings win), so a user_settings row that is missing is created with the targets' units.
--
-- Written to run as a non-superuser (plain DDL; no placeholder GUCs, no extensions).

-- 1. Stop the mirror first, so the backfill below is not fought by the triggers that are being removed.
drop trigger if exists me_targets_take_settings on public.me_targets;
drop trigger if exists user_settings_mirror on public.user_settings;
drop function if exists public.me_targets_take_settings();
drop function if exists public.user_settings_mirror_to_targets();

-- 2. Back to the plain "stamp updated_at" trigger body (the mirror's transaction flag is gone).
create or replace function public.me_touch_targets()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3. Backfill Settings from the columns that are about to disappear.
insert into public.user_settings (user_id, units, sex)
select t.user_id, t.units, t.sex from public.me_targets t
on conflict (user_id) do nothing;

update public.user_settings s
   set sex = t.sex
  from public.me_targets t
 where t.user_id = s.user_id and s.sex is null;

-- 4. Drop the duplicate columns.
alter table public.me_targets drop column sex;
alter table public.me_targets drop column units;

comment on table public.me_targets is
  'Daily calorie and macro targets (one row per person). Sex, units and birth year live in user_settings, not here.';

-- 5. Editing the amount of an ingredient / brand entry also rewrites the amount in its name.
--    The name is saved as "chicken breast (raw or dry), 100 g"; changing the amount to 200 g used to leave the
--    old "100 g" in the name while the calories doubled. Same signature and grants as before (create or replace),
--    same body, plus the rename. A name that does not end in ", <amount> <unit>" (cut at 120 characters, or an
--    older entry) is left exactly as it was.

create or replace function public.me_update_food(p_id uuid, p_meal text, p_amount numeric default null)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  r public.me_food_log%rowtype;
  f numeric := 1;
  new_name text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_meal is not null and p_meal not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception 'unknown meal' using errcode = '22023';
  end if;
  if p_amount is not null and (p_amount <= 0 or p_amount > 100000) then
    raise exception 'amount out of range' using errcode = '22023';
  end if;

  select * into r from public.me_food_log where id = p_id and user_id = uid for update;
  if not found then
    return 0;
  end if;

  if p_amount is not null then
    p_amount := case when r.servings is not null then round(p_amount, 2) else round(p_amount, 3) end;
    if p_amount <= 0 then
      raise exception 'amount out of range' using errcode = '22023';
    end if;
    f := case
           when r.servings is not null then p_amount / r.servings
           when r.amount is not null then p_amount / r.amount
           else p_amount
         end;
    if f < 0.01 or f > 100 then
      raise exception 'amount out of range' using errcode = '22023';
    end if;
  end if;

  new_name := r.name;
  if p_amount is not null and r.servings is null and r.amount is not null and r.amount_unit is not null then
    new_name := regexp_replace(
      r.name,
      '^(.*), [0-9][0-9.,]* ' || regexp_replace(r.amount_unit, '([^A-Za-z0-9 ])', '\\\1', 'g') || '$',
      '\1, ' || trim_scale(p_amount)::text || ' ' || r.amount_unit
    );
  end if;

  update public.me_food_log set
    meal = coalesce(p_meal, meal),
    name = new_name,
    servings = case when r.servings is not null and p_amount is not null then p_amount else servings end,
    amount = case when r.servings is null and r.amount is not null and p_amount is not null then p_amount else amount end,
    calories = round(calories * f, 1),
    protein_g = round(protein_g * f, 1),
    carbs_g = round(carbs_g * f, 1),
    fat_g = round(fat_g * f, 1),
    fiber_g = round(fiber_g * f, 1),
    sodium_mg = round(sodium_mg * f, 1),
    nutrients = case
      when p_amount is null or nutrients is null then nutrients
      else (
        select jsonb_object_agg(t.k, round(t.v::numeric * f, 2))
        from jsonb_each_text(nutrients) as t(k, v)
        where t.v ~ '^[0-9]+(\.[0-9]+)?$'
      )
    end
  where id = p_id and user_id = uid;
  return 1;
end;
$$;
