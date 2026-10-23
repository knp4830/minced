-- Wave 15: rate limiter. Throwaway database only.
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/rate_limit_test.sql
begin;
do $$
declare i int; allowed int := 0; denied boolean; n int;
begin
  -- 1. limit of 3 per window: first 3 pass, 4th and 5th are refused
  for i in 1..5 loop
    if check_rate_limit('login', '203.0.113.9', 3, 3600) then allowed := allowed + 1; end if;
  end loop;
  if allowed <> 3 then raise exception 'expected 3 allowed, got %', allowed; end if;

  -- 2. another subject and another kind are independent
  if not check_rate_limit('login', '203.0.113.10', 3, 3600) then raise exception 'other subject blocked'; end if;
  if not check_rate_limit('reset', '203.0.113.9', 3, 3600) then raise exception 'other kind blocked'; end if;

  -- 3. case-insensitive subjects (emails)
  perform check_rate_limit('login_email', 'A@x.com', 1, 3600);
  if check_rate_limit('login_email', 'a@X.com', 1, 3600) then raise exception 'case not folded'; end if;

  -- 4. unknown kind rejected; empty subject allowed
  begin
    perform check_rate_limit('bogus', 'x', 1, 60);
    raise exception 'bogus accepted';
  exception when others then
    if sqlerrm = 'bogus accepted' then raise; end if;
  end;
  if not check_rate_limit('signup', '', 1, 60) then raise exception 'empty subject blocked'; end if;

  -- 5. subjects are stored hashed, not in clear
  select count(*) into n from rate_limit_hits where subject_hash = convert_to('203.0.113.9', 'utf8');
  if n <> 0 then raise exception 'plaintext stored'; end if;

  -- 6. anon can call the function but cannot read or write the table
  set local role anon;
  if not check_rate_limit('suggest', '198.51.100.1', 5, 60) then raise exception 'anon call failed'; end if;
  denied := false;
  begin perform 1 from rate_limit_hits; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon can read table'; end if;
  denied := false;
  begin delete from rate_limit_hits; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'anon can delete'; end if;
  reset role;

  -- 7. an old window row does not count toward the current one
  insert into rate_limit_hits values ('signup', sha256(convert_to('old', 'utf8')), now() - interval '2 days', 99);
  if not check_rate_limit('signup', 'old', 1, 60) then raise exception 'old window counted'; end if;

  -- 8. pruning removes old rows (about 1 call in 100, so loop)
  for i in 1..1500 loop perform check_rate_limit('suggest', 'prune', 100000, 60); end loop;
  select count(*) into n from rate_limit_hits where window_start < now() - interval '1 day';
  if n <> 0 then raise exception 'prune did not run (% old rows)', n; end if;

  raise notice 'rate_limit_test: all passed';
end $$;
rollback;
