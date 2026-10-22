-- Wave 12, Me: log food for any day, edit and remove entries, and a one-tap "I trained today".
--
--   1. me_workouts.session gains 'trained': a workout row with no sets and no muscles, written by the calendar's
--      one-tap "Trained" check. It counts as a training day everywhere a real workout does (calendar, month
--      tally, "days logged") and adds nothing to the muscle map, because no muscle was named.
--   2. me_food_log gains the amount and unit a person typed ("150 g"), written when an ingredient or brand is
--      logged, so an entry can be edited later in the unit it was entered in. Older rows have none.
--   3. me_update_food(): move an entry to another meal and/or change how much of it was eaten. Every stored
--      figure (calories, macros, fibre, sodium and the per-nutrient snapshot) is scaled by the same factor in
--      one statement, so the row cannot end up half edited. SECURITY INVOKER: RLS and the explicit user_id
--      filter both apply. Nutrition is linear in the amount, so scaling the frozen values is exact; nothing is
--      re-derived from a guess.
--
-- Non-superuser safe: no placeholder settings, no extensions, no ownership changes.

-- 1. 'trained' ---------------------------------------------------------------------------------------------

alter table public.me_workouts drop constraint if exists me_workouts_session_check;
alter table public.me_workouts add constraint me_workouts_session_check
  check (session in ('upper', 'lower', 'push', 'pull', 'legs', 'full_body', 'cardio', 'custom', 'trained'));

-- 2. the amount that was typed -----------------------------------------------------------------------------

alter table public.me_food_log add column if not exists amount numeric(10,3);
alter table public.me_food_log add column if not exists amount_unit text;

alter table public.me_food_log drop constraint if exists me_food_log_amount_check;
alter table public.me_food_log add constraint me_food_log_amount_check
  check (amount is null or (amount > 0 and amount <= 100000));
alter table public.me_food_log drop constraint if exists me_food_log_amount_unit_check;
alter table public.me_food_log add constraint me_food_log_amount_unit_check
  check (amount_unit is null or char_length(amount_unit) between 1 and 12);

-- 3. edit an entry -----------------------------------------------------------------------------------------
--
-- p_amount is "how much now" in whatever the row measures:
--   a recipe entry   -> servings (the row's servings column changes with it)
--   an entry with a typed amount -> that amount, in the unit it was entered in
--   anything else    -> a portion multiple of what was logged (1 = unchanged, 0.5 = half)
-- NULL leaves the amount alone (a pure meal move). Returns the number of rows changed: 0 means the entry was
-- not found (or not yours), which the caller must treat as a failure.

create function public.me_update_food(p_id uuid, p_meal text, p_amount numeric default null)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  r public.me_food_log%rowtype;
  f numeric := 1;
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
    -- servings is stored to two decimals; scale by the stored figure so the row agrees with itself.
    -- amount is stored to three.
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

  update public.me_food_log set
    meal = coalesce(p_meal, meal),
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

revoke execute on function public.me_update_food(uuid, text, numeric) from public, anon;
grant execute on function public.me_update_food(uuid, text, numeric) to authenticated;
