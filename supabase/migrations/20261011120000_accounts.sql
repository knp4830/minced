-- Wave 3 / accounts (M4.1-M4.3).
--
-- 1. A profile row for every new auth user. Nothing created one before, and
--    `favorites.user_id` references `profiles`, so without this the first
--    favourite of every new account would fail its foreign key.
-- 2. `delete_my_account()`: the only way a user removes themselves, so the
--    secret key never has to exist in app code.

-- ---------------------------------------------------------------------------
-- 1. profiles follow auth.users
-- ---------------------------------------------------------------------------

create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function handle_new_user() is
  'Creates the public.profiles row for a new auth user. SECURITY DEFINER because the signing-up user has no session yet, so RLS would refuse the insert.';

revoke all on function handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Accounts created before this trigger existed (none today; harmless if so).
insert into profiles (id)
select u.id from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- ---------------------------------------------------------------------------
-- 2. delete_my_account()
--
-- Deletes the caller's auth.users row. Cascades: profiles (on delete cascade)
-- -> favorites (on delete cascade). recipes.author_id is `on delete set null`,
-- so any recipe they authored is kept, anonymised (M5 decides whether to
-- offer outright deletion). Callable only by a signed-in user, and only ever
-- deletes auth.uid(): there is no id parameter to abuse.
-- ---------------------------------------------------------------------------

create function delete_my_account()
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
  delete from auth.users where id = uid;
end;
$$;

comment on function delete_my_account() is
  'Self-service account deletion. Removes the caller from auth.users; profile and favourites cascade.';

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
