#!/usr/bin/env bash
# Load the live snapshot into the private local stack (see stack.sh), per docs/LESSONS.md section 10.
set -u
CT=supabase_db_w10c-allergens
SNAP="/c/Users/Kevin Pham/minced/.snapshot/live.sql"
sa() { docker exec -i "$CT" psql -q -U supabase_admin -d postgres "$@"; }

sa -c "create extension if not exists citext schema public; create extension if not exists pg_trgm schema public; drop schema if exists supabase_migrations cascade;" 2>&1 | tail -2
sed '/^CREATE SCHEMA public;$/d' "$SNAP" | sa -v ON_ERROR_STOP=1 > "${TMPDIR:-/tmp}/allergens-load.log" 2>&1 || { echo "LOAD FAILED"; tail -8 "${TMPDIR:-/tmp}/allergens-load.log"; exit 1; }
echo loaded

sa -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r record;
begin
  execute 'alter schema public owner to postgres';
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I owner to postgres', r.tablename);
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('alter sequence public.%I owner to postgres', r.sequencename);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('alter function %s owner to postgres', r.sig);
  end loop;
  for r in select viewname from pg_views where schemaname = 'public' loop
    execute format('alter view public.%I owner to postgres', r.viewname);
  end loop;
end $$;
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
create or replace trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
SQL
echo granted
