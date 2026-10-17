-- "Me" dashboard v2 (wave 9): goal weight, daily weigh-ins, check-in dismissals, streak data.
--
-- Same rules as 20261016100000_me_dashboard.sql: one owner per row (RLS on user_id = auth.uid()), anon has
-- nothing, narrow grants, local-date window trigger, rows go with the account. Written to run as a
-- non-superuser. Nothing here edits an applied migration.
--
-- Week starts Monday: the week is chosen by the app (it passes p_from / p_to), so no SQL needs to change for
-- that. me_week_muscles keeps its current body. me_month_summary is replaced below only to add weight_kg,
-- and it is rebuilt from a list of days (the old full-join chain could drop a sleep-only day that sat
-- between two other days' joins).

-- ───────────────────────── goal weight ─────────────────────────

-- Nullable: "maintain" has none, and a person may skip it. Same range as the weight the targets are built from.
alter table public.me_targets
  add column goal_weight_kg numeric(4,1) check (goal_weight_kg between 30 and 300);

-- ───────────────────────── daily weigh-in ─────────────────────────

create table public.me_weights (
  user_id   uuid         not null references auth.users (id) on delete cascade,
  log_date  date         not null,
  weight_kg numeric(4,1) not null check (weight_kg between 30 and 300),
  primary key (user_id, log_date)
);

-- Same date window as the other log tables (not more than 2 days ahead, not before 2020). One row per
-- person per day is already the primary key, so no per-day cap is needed.
create trigger me_weights_guard before insert or update on public.me_weights
  for each row execute function public.me_guard_row();

alter table public.me_weights enable row level security;

create policy me_weights_select on public.me_weights for select to authenticated using (user_id = (select auth.uid()));
create policy me_weights_insert on public.me_weights for insert to authenticated with check (user_id = (select auth.uid()));
create policy me_weights_update on public.me_weights for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy me_weights_delete on public.me_weights for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.me_weights from public, anon, authenticated;
grant select, insert, update, delete on public.me_weights to authenticated;

-- ───────────────────────── check-in dismissals ─────────────────────────

-- "Update your targets?" cards the person has said "not now" to. Stored here (not in the browser) so the
-- answer follows them between devices. Saving new targets clears the rows (the app does that).
create table public.me_checkin_dismissals (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  kind         text        not null check (kind in ('weight', 'age', 'goal')),
  -- The local date it was dismissed (named log_date so the shared date-window trigger applies).
  log_date     date        not null,
  primary key (user_id, kind)
);

create trigger me_checkin_dismissals_guard before insert or update on public.me_checkin_dismissals
  for each row execute function public.me_guard_row();

alter table public.me_checkin_dismissals enable row level security;

create policy me_checkin_dismissals_select on public.me_checkin_dismissals for select to authenticated using (user_id = (select auth.uid()));
create policy me_checkin_dismissals_insert on public.me_checkin_dismissals for insert to authenticated with check (user_id = (select auth.uid()));
create policy me_checkin_dismissals_update on public.me_checkin_dismissals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy me_checkin_dismissals_delete on public.me_checkin_dismissals for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.me_checkin_dismissals from public, anon, authenticated;
grant select, insert, update, delete on public.me_checkin_dismissals to authenticated;

-- ───────────────────────── month summary, now with weight ─────────────────────────

-- The return type gains a column, so the function is dropped and recreated (same grants as before).
drop function public.me_month_summary(date, date);

create function public.me_month_summary(p_from date, p_to date)
returns table (
  log_date     date,
  calories     numeric,
  protein_g    numeric,
  food_entries integer,
  trained      text[],
  sets         integer,
  sleep_hours  numeric,
  weight_kg    numeric
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
  ),
  g as (
    select q.log_date, q.weight_kg
    from public.me_weights q, uid, rng
    where q.user_id = uid.id and q.log_date between rng.a and rng.b
  ),
  days as (
    select f.log_date from f union select w.log_date from w
    union select s.log_date from s union select g.log_date from g
  )
  select d.log_date, f.calories, f.protein_g, f.n, w.trained, w.sets, s.hours, g.weight_kg
  from days d
  left join f on f.log_date = d.log_date
  left join w on w.log_date = d.log_date
  left join s on s.log_date = d.log_date
  left join g on g.log_date = d.log_date
  order by d.log_date;
$$;

revoke execute on function public.me_month_summary(date, date) from public, anon;
grant execute on function public.me_month_summary(date, date) to authenticated;

-- ───────────────────────── days with an entry (streaks) ─────────────────────────

-- One row per kind per day that has at least one entry, for the streak counters. The app does the counting
-- (src/lib/me/streaks.ts) so there is a single implementation to test. Capped at 400 days so it cannot be
-- used to read a whole history in one call.
create function public.me_logged_days(p_from date, p_to date)
returns table (kind text, log_date date)
language sql
stable
set search_path = public, pg_temp
as $$
  with uid as (select (select auth.uid()) as id),
  rng as (select p_from as a, p_to as b where p_to - p_from <= 400)
  select 'food'::text, l.log_date from public.me_food_log l, uid, rng
    where l.user_id = uid.id and l.log_date between rng.a and rng.b group by l.log_date
  union all
  select 'sleep'::text, z.log_date from public.me_sleep z, uid, rng
    where z.user_id = uid.id and z.log_date between rng.a and rng.b
  union all
  select 'weight'::text, q.log_date from public.me_weights q, uid, rng
    where q.user_id = uid.id and q.log_date between rng.a and rng.b
  order by 1, 2;
$$;

revoke execute on function public.me_logged_days(date, date) from public, anon;
grant execute on function public.me_logged_days(date, date) to authenticated;
