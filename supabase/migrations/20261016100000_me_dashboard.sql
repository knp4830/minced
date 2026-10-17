-- "Me" dashboard (BUILD-PLAN v1.5): daily targets, food log, workout log (with per-muscle sets), sleep log.
--
-- Everything here is private health-type data. The rules:
--   * One owner per row. RLS: select / insert / update / delete only where user_id = auth.uid().
--   * anon has no access at all; authenticated gets only the verbs the app needs.
--   * Rows go with the account: on delete cascade from auth.users.
--   * Dates are the person's LOCAL date, sent by the client. The database cannot know it, so a trigger
--     only bounds them to a sane window (not more than 2 days ahead, not before 2020).
--   * Food rows SNAPSHOT the recipe's nutrition at log time. Editing or deleting a recipe later never
--     rewrites someone's history.
--   * Ranges are enforced with check constraints, and a trigger caps rows per person per day so one
--     account cannot be used to stuff the table.
--
-- Written to run as a non-superuser (no placeholder GUCs, no extensions).

-- ───────────────────────── targets ─────────────────────────

create table public.me_targets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  sex        text         not null check (sex in ('female', 'male')),
  age_years  smallint     not null check (age_years between 13 and 110),
  height_cm  numeric(4,1) not null check (height_cm between 100 and 250),
  weight_kg  numeric(4,1) not null check (weight_kg between 30 and 300),
  units      text         not null default 'metric' check (units in ('metric', 'imperial')),
  activity   smallint     not null check (activity between 0 and 4),
  goal       text         not null check (goal in ('lose', 'maintain', 'gain')),
  pace_kg    numeric(3,2) not null default 0 check (pace_kg in (0, 0.25, 0.5, 0.75)),
  kcal       integer      not null check (kcal between 800 and 6000),
  protein_g  integer      not null check (protein_g between 0 and 600),
  carbs_g    integer      not null check (carbs_g between 0 and 1200),
  fat_g      integer      not null check (fat_g between 0 and 400),
  updated_at timestamptz  not null default now(),
  check ((goal = 'maintain') = (pace_kg = 0))
);

-- ───────────────────────── food log ─────────────────────────

create table public.me_food_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid          not null references auth.users (id) on delete cascade,
  log_date   date          not null,
  meal       text          not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  -- Null for a quick add. set null (not cascade): a deleted recipe must not delete someone's diary.
  recipe_id  uuid          references public.recipes (id) on delete set null,
  name       text          not null check (char_length(name) between 1 and 120),
  -- Servings eaten when it is a recipe; null for a quick add.
  servings   numeric(5,2)  check (servings > 0 and servings <= 100),
  -- Totals for the whole entry (per-serving value x servings, frozen at log time).
  calories   numeric(7,1)  not null check (calories between 0 and 20000),
  protein_g  numeric(6,1)  not null default 0 check (protein_g between 0 and 2000),
  carbs_g    numeric(6,1)  not null default 0 check (carbs_g between 0 and 3000),
  fat_g      numeric(6,1)  not null default 0 check (fat_g between 0 and 1500),
  -- Null means "unknown", which is not the same as zero.
  fiber_g    numeric(6,1)  check (fiber_g between 0 and 500),
  sodium_mg  numeric(8,1)  check (sodium_mg between 0 and 50000),
  created_at timestamptz   not null default now()
);
create index me_food_log_user_date_idx on public.me_food_log (user_id, log_date);

-- ───────────────────────── workouts ─────────────────────────

create table public.me_workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  log_date    date        not null,
  session     text        not null check (session in
                ('upper', 'lower', 'push', 'pull', 'legs', 'full_body', 'cardio', 'custom')),
  custom_name text        check (char_length(custom_name) between 1 and 60),
  minutes     smallint    check (minutes between 1 and 600),
  -- Total working sets. Cardio has none, so zero is allowed.
  sets        smallint    not null check (sets between 0 and 300),
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index me_workouts_user_date_idx on public.me_workouts (user_id, log_date);

-- Sets per muscle for one workout. The muscle names are the body-map slugs; the app owns the mapping
-- from a session type to muscles (src/lib/me/muscles.ts) and writes the result here, so editing that
-- table later never rewrites history.
create table public.me_workout_muscles (
  workout_id uuid     not null,
  user_id    uuid     not null,
  muscle     text     not null check (muscle in (
               'chest', 'deltoids', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'trapezius',
               'upper-back', 'lower-back', 'gluteal', 'quadriceps', 'hamstring', 'adductors',
               'calves', 'tibialis')),
  sets       smallint not null check (sets between 1 and 100),
  primary key (workout_id, muscle),
  -- The pair FK means a row cannot be attached to somebody else's workout.
  foreign key (workout_id, user_id) references public.me_workouts (id, user_id) on delete cascade
);
create index me_workout_muscles_user_idx on public.me_workout_muscles (user_id);

-- ───────────────────────── sleep ─────────────────────────

create table public.me_sleep (
  user_id  uuid         not null references auth.users (id) on delete cascade,
  log_date date         not null,
  hours    numeric(3,1) not null check (hours between 0 and 24),
  primary key (user_id, log_date)
);

-- ───────────────────────── date window and per-day caps ─────────────────────────

create function public.me_guard_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
  cap integer;
begin
  if new.log_date > current_date + 2 or new.log_date < date '2020-01-01' then
    raise exception 'log_date out of range' using errcode = '22008';
  end if;

  if tg_op = 'INSERT' and tg_table_name in ('me_food_log', 'me_workouts') then
    cap := case tg_table_name when 'me_food_log' then 60 else 10 end;
    if tg_table_name = 'me_food_log' then
      select count(*) into n from public.me_food_log where user_id = new.user_id and log_date = new.log_date;
    else
      select count(*) into n from public.me_workouts where user_id = new.user_id and log_date = new.log_date;
    end if;
    if n >= cap then
      raise exception 'too many entries for one day' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.me_guard_row() from public, anon, authenticated;

create trigger me_food_log_guard before insert or update on public.me_food_log
  for each row execute function public.me_guard_row();
create trigger me_workouts_guard before insert or update on public.me_workouts
  for each row execute function public.me_guard_row();
create trigger me_sleep_guard before insert or update on public.me_sleep
  for each row execute function public.me_guard_row();

create function public.me_touch_targets()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.me_touch_targets() from public, anon, authenticated;
create trigger me_targets_touch before update on public.me_targets
  for each row execute function public.me_touch_targets();

-- ───────────────────────── row level security ─────────────────────────

alter table public.me_targets         enable row level security;
alter table public.me_food_log        enable row level security;
alter table public.me_workouts        enable row level security;
alter table public.me_workout_muscles enable row level security;
alter table public.me_sleep           enable row level security;

-- (select auth.uid()) is evaluated once per statement, not once per row.
create policy me_targets_select on public.me_targets for select to authenticated using (user_id = (select auth.uid()));
create policy me_targets_insert on public.me_targets for insert to authenticated with check (user_id = (select auth.uid()));
create policy me_targets_update on public.me_targets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy me_targets_delete on public.me_targets for delete to authenticated using (user_id = (select auth.uid()));

create policy me_food_log_select on public.me_food_log for select to authenticated using (user_id = (select auth.uid()));
create policy me_food_log_insert on public.me_food_log for insert to authenticated with check (user_id = (select auth.uid()));
create policy me_food_log_update on public.me_food_log for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy me_food_log_delete on public.me_food_log for delete to authenticated using (user_id = (select auth.uid()));

create policy me_workouts_select on public.me_workouts for select to authenticated using (user_id = (select auth.uid()));
create policy me_workouts_insert on public.me_workouts for insert to authenticated with check (user_id = (select auth.uid()));
create policy me_workouts_update on public.me_workouts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy me_workouts_delete on public.me_workouts for delete to authenticated using (user_id = (select auth.uid()));

create policy me_workout_muscles_select on public.me_workout_muscles for select to authenticated using (user_id = (select auth.uid()));
create policy me_workout_muscles_insert on public.me_workout_muscles for insert to authenticated with check (user_id = (select auth.uid()));
create policy me_workout_muscles_delete on public.me_workout_muscles for delete to authenticated using (user_id = (select auth.uid()));

create policy me_sleep_select on public.me_sleep for select to authenticated using (user_id = (select auth.uid()));
create policy me_sleep_insert on public.me_sleep for insert to authenticated with check (user_id = (select auth.uid()));
create policy me_sleep_update on public.me_sleep for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy me_sleep_delete on public.me_sleep for delete to authenticated using (user_id = (select auth.uid()));

-- Grants: nothing for anon; only the verbs the app uses for authenticated.
revoke all on public.me_targets, public.me_food_log, public.me_workouts, public.me_workout_muscles, public.me_sleep
  from public, anon, authenticated;
grant select, insert, update, delete on public.me_targets  to authenticated;
grant select, insert, update, delete on public.me_food_log to authenticated;
grant select, insert, update, delete on public.me_workouts to authenticated;
grant select, insert, delete         on public.me_workout_muscles to authenticated;
grant select, insert, update, delete on public.me_sleep    to authenticated;

-- ───────────────────────── RPCs (SECURITY INVOKER: RLS still applies) ─────────────────────────

-- Insert a workout and its per-muscle sets in one statement, so a half-written workout cannot exist.
-- p_muscles: [{"m": "chest", "s": 4}, ...]. Total sets is the sum (the caller cannot disagree with itself).
create function public.me_log_workout(
  p_date        date,
  p_session     text,
  p_custom_name text,
  p_minutes     integer,
  p_muscles     jsonb
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  wid uuid;
  total integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_muscles is null or jsonb_typeof(p_muscles) <> 'array' or jsonb_array_length(p_muscles) > 16 then
    raise exception 'p_muscles must be an array of at most 16 items' using errcode = '22023';
  end if;

  select coalesce(sum((e ->> 's')::integer), 0) into total from jsonb_array_elements(p_muscles) e;

  insert into public.me_workouts (user_id, log_date, session, custom_name, minutes, sets)
  values (uid, p_date, p_session, nullif(btrim(p_custom_name), ''), p_minutes, total)
  returning id into wid;

  insert into public.me_workout_muscles (workout_id, user_id, muscle, sets)
  select wid, uid, e ->> 'm', (e ->> 's')::integer
  from jsonb_array_elements(p_muscles) e;

  return wid;
end;
$$;

-- Sets per muscle for a date range (the "This week's muscles" map).
create function public.me_week_muscles(p_from date, p_to date)
returns table (muscle text, sets bigint, days date[])
language sql
stable
set search_path = public, pg_temp
as $$
  select m.muscle, sum(m.sets)::bigint, array_agg(distinct w.log_date order by w.log_date)
  from public.me_workout_muscles m
  join public.me_workouts w on w.id = m.workout_id and w.user_id = m.user_id
  where m.user_id = (select auth.uid())
    and w.log_date between p_from and p_to
    and p_to - p_from <= 14
  group by m.muscle;
$$;

-- One row per day that has anything logged (the calendar). Capped at two months so it cannot be used to
-- scan a whole history in one call.
create function public.me_month_summary(p_from date, p_to date)
returns table (
  log_date     date,
  calories     numeric,
  protein_g    numeric,
  food_entries integer,
  trained      text[],
  sets         integer,
  sleep_hours  numeric
)
language sql
stable
set search_path = public, pg_temp
as $$
  with uid as (select (select auth.uid()) as id),
  rng as (select p_from as a, p_to as b where p_to - p_from <= 62),
  f as (
    select l.log_date, sum(l.calories) as calories, sum(l.protein_g) as protein_g, count(*)::integer as n
    from public.me_food_log l, uid, rng
    where l.user_id = uid.id and l.log_date between rng.a and rng.b
    group by l.log_date
  ),
  w as (
    select x.log_date,
           array_agg(x.session || coalesce(':' || x.custom_name, '') order by x.created_at) as trained,
           sum(x.sets)::integer as sets
    from public.me_workouts x, uid, rng
    where x.user_id = uid.id and x.log_date between rng.a and rng.b
    group by x.log_date
  ),
  s as (
    select z.log_date, z.hours
    from public.me_sleep z, uid, rng
    where z.user_id = uid.id and z.log_date between rng.a and rng.b
  )
  select coalesce(f.log_date, w.log_date, s.log_date),
         f.calories, f.protein_g, f.n, w.trained, w.sets, s.hours
  from f
  full join w on w.log_date = f.log_date
  full join s on s.log_date = coalesce(f.log_date, w.log_date)
  order by 1;
$$;

revoke execute on function public.me_log_workout(date, text, text, integer, jsonb) from public, anon;
revoke execute on function public.me_week_muscles(date, date) from public, anon;
revoke execute on function public.me_month_summary(date, date) from public, anon;
grant execute on function public.me_log_workout(date, text, text, integer, jsonb) to authenticated;
grant execute on function public.me_week_muscles(date, date) to authenticated;
grant execute on function public.me_month_summary(date, date) to authenticated;
