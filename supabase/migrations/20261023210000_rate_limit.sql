-- Wave 15 security: a small fixed-window rate limiter that needs no package.
-- The server actions call check_rate_limit() before sign-up, log-in, password reset and the
-- food type-ahead. The table is private (RLS on, no policies, no grants); only the function,
-- which runs as its owner, can touch it. Subjects (IPs, emails) are stored only as sha256 hashes.

create table public.rate_limit_hits (
  kind         text        not null,
  subject_hash bytea       not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (kind, subject_hash, window_start)
);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from public, anon, authenticated;
create index rate_limit_hits_window_idx on public.rate_limit_hits (window_start);

/*
 * Counts one attempt and answers whether it is allowed. Fixed window: the clock is cut into
 * p_window_seconds slices and each (kind, subject) gets p_limit attempts per slice.
 * Bounds are clamped and the kind is an allow-list so a caller with the public key cannot
 * fill the table with junk categories. Old rows are pruned on about 1 call in 100.
 */
create or replace function public.check_rate_limit(
  p_kind text, p_subject text, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w        integer := least(greatest(coalesce(p_window_seconds, 60), 1), 3600);
  lim      integer := least(greatest(coalesce(p_limit, 10), 1), 1000);
  win      timestamptz;
  subj     bytea;
  new_hits integer;
begin
  if p_kind not in ('signup', 'login', 'login_email', 'reset', 'reset_email', 'suggest') then
    raise exception 'unknown rate limit kind';
  end if;
  if p_subject is null or p_subject = '' then
    return true; -- nothing to key on; the caller fails open
  end if;

  win  := to_timestamp(floor(extract(epoch from now()) / w) * w);
  subj := sha256(convert_to(lower(left(p_subject, 320)), 'utf8'));

  insert into public.rate_limit_hits as r (kind, subject_hash, window_start, hits)
  values (p_kind, subj, win, 1)
  on conflict (kind, subject_hash, window_start) do update set hits = r.hits + 1
  returning r.hits into new_hits;

  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return new_hits <= lim;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, text, integer, integer) to anon, authenticated, service_role;
