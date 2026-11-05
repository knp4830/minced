-- Wave 15 security fix: the limiter no longer trusts the caller.
-- Before: anyone with the public key could pass p_limit = 1000 and lock a known email out of
-- logging in or resetting a password, and could pad the table with junk subjects.
-- Now: limits and windows are fixed per kind inside the function (the p_limit and p_window_seconds
-- arguments are kept only so existing callers keep working, and are ignored). The two email kinds are
-- counted only for service_role, so a visitor with the public key cannot lock anyone out; the server
-- calls them with SUPABASE_SECRET_KEY when it is set, and skips them when it is not. The table has a
-- per-kind-per-window cap on distinct subjects, and old rows are pruned more reliably.

create or replace function public.check_rate_limit(
  p_kind text, p_subject text, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lim      integer;
  w        integer;
  win      timestamptz;
  subj     bytea;
  new_hits integer;
  rows_now integer;
begin
  -- Keep these numbers in step with LIMITS in src/lib/rateLimit.ts.
  case p_kind
    when 'signup'      then lim := 10;  w := 600;
    when 'login'       then lim := 30;  w := 300;
    when 'login_email' then lim := 10;  w := 300;
    when 'reset'       then lim := 10;  w := 600;
    when 'reset_email' then lim := 3;   w := 600;
    when 'suggest'     then lim := 120; w := 60;
    else raise exception 'unknown rate limit kind';
  end case;

  if p_subject is null or p_subject = '' then
    return true; -- nothing to key on; the caller fails open
  end if;

  -- Per-email counters can be used to lock a person out, so only the server (service_role) may drive them.
  if p_kind in ('login_email', 'reset_email')
     and coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    return true;
  end if;

  win  := to_timestamp(floor(extract(epoch from now()) / w) * w);
  subj := sha256(convert_to(lower(left(p_subject, 320)), 'utf8'));

  -- Cap on distinct subjects per kind and window, so junk subjects cannot grow the table without bound.
  if not exists (select 1 from public.rate_limit_hits
                 where kind = p_kind and subject_hash = subj and window_start = win) then
    select count(*) into rows_now from public.rate_limit_hits where kind = p_kind and window_start = win;
    if rows_now >= 20000 then
      return true; -- fail open rather than store more
    end if;
  end if;

  insert into public.rate_limit_hits as r (kind, subject_hash, window_start, hits)
  values (p_kind, subj, win, 1)
  on conflict (kind, subject_hash, window_start) do update set hits = r.hits + 1
  returning r.hits into new_hits;

  if random() < 0.05 then
    delete from public.rate_limit_hits where window_start < now() - interval '2 hours';
  end if;

  return new_hits <= lim;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, text, integer, integer) to anon, authenticated, service_role;
