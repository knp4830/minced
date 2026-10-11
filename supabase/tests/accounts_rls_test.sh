#!/usr/bin/env bash
# Accounts RLS regression: favourites, profiles and delete_my_account().
# LOCAL stack only: it signs up users. Refuses to run against anything else.
#
#   API=http://127.0.0.1:54321 KEY=<local publishable key> DB=supabase_db_minced \
#     bash supabase/tests/accounts_rls_test.sh
#
# Prerequisites: `supabase start` with confirmations OFF (so sign-up returns a
# session), all migrations applied, seed.sql loaded (needs the shakshuka and
# cacio-e-pepe recipes), and a user cook-a@example.test with password
# correct-horse-battery and exactly one favourite (cacio-e-pepe). Every "want"
# in the output is the expected value; anything else is a failure.
set -u
API="${API:?set API to the local Supabase API URL}"
KEY="${KEY:?set KEY to the local publishable key}"
DB="${DB:?set DB to the local Postgres container name}"
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing: API is not local" >&2; exit 1;; esac
PSQL="docker exec $DB psql -U postgres -tA"
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }

login() { curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"correct-horse-battery\"}" | j "['access_token']"; }

# user B
curl -s "$API/auth/v1/signup" -H "apikey: $KEY" -H 'content-type: application/json' -d '{"email":"cook-b@example.test","password":"correct-horse-battery"}' >/dev/null
TA=$(login cook-a@example.test); TB=$(login cook-b@example.test)
IDA=$($PSQL -c "select id from auth.users where email='cook-a@example.test'")
IDB=$($PSQL -c "select id from auth.users where email='cook-b@example.test'")
RID=$($PSQL -c "select id from recipes where slug='shakshuka'")
CACIO=$($PSQL -c "select id from recipes where slug='cacio-e-pepe'")
echo "profile rows for A,B: $($PSQL -c "select count(*) from profiles where id in ('$IDA','$IDB')") (want 2)"
echo "A favourites in db: $($PSQL -c "select count(*) from favorites where user_id='$IDA'") (want 1)"

echo "--- T1 B reads favorites (want [])"
curl -s "$API/rest/v1/favorites?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $TB"; echo
echo "--- T2 B targets A's row by id filter (want [])"
curl -s "$API/rest/v1/favorites?user_id=eq.$IDA" -H "apikey: $KEY" -H "Authorization: Bearer $TB"; echo
echo "--- T3 B inserts a favourite AS A (want 401/403, RLS violation)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/favorites" -H "apikey: $KEY" -H "Authorization: Bearer $TB" -H 'content-type: application/json' -d "{\"user_id\":\"$IDA\",\"recipe_id\":\"$RID\"}"; echo
echo "A favourites now: $($PSQL -c "select count(*) from favorites where user_id='$IDA'") (want 1)"
echo "--- T4 B deletes A's favourite (want 204 but zero rows)"
curl -s -w ' [http %{http_code}]' -X DELETE "$API/rest/v1/favorites?user_id=eq.$IDA" -H "apikey: $KEY" -H "Authorization: Bearer $TB"; echo
echo "A favourites after B's delete: $($PSQL -c "select count(*) from favorites where user_id='$IDA'") (want 1)"
echo "--- T5 anon reads favorites (want [] or permission denied)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/favorites?select=*" -H "apikey: $KEY"; echo
echo "--- T6 anon inserts favourite (want denied)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/favorites" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"user_id\":\"$IDA\",\"recipe_id\":\"$RID\"}"; echo
echo "--- T7 B updates A's profile (want 0 rows changed)"
curl -s -w ' [http %{http_code}]' -X PATCH "$API/rest/v1/profiles?id=eq.$IDA" -H "apikey: $KEY" -H "Authorization: Bearer $TB" -H 'content-type: application/json' -H 'Prefer: return=representation' -d '{"display_name":"pwned"}'; echo
echo "A display_name: '$($PSQL -c "select coalesce(display_name,'') from profiles where id='$IDA'")' (want empty)"
echo "--- T8 B favourites own (want 201)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/favorites" -H "apikey: $KEY" -H "Authorization: Bearer $TB" -H 'content-type: application/json' -d "{\"user_id\":\"$IDB\",\"recipe_id\":\"$CACIO\"}"; echo
echo "B favourites: $($PSQL -c "select count(*) from favorites where user_id='$IDB'") (want 1)"
echo "--- T9 anon calls delete_my_account (want error)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/rpc/delete_my_account" -H "apikey: $KEY" -H 'content-type: application/json' -d '{}'; echo
echo "users before: $($PSQL -c "select count(*) from auth.users") (want 2)"
echo "--- T10 B deletes own account (want 204)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/rpc/delete_my_account" -H "apikey: $KEY" -H "Authorization: Bearer $TB" -H 'content-type: application/json' -d '{}'; echo
echo "users after: $($PSQL -c "select count(*) from auth.users") (want 1)"
echo "B profile rows: $($PSQL -c "select count(*) from profiles where id='$IDB'") (want 0)"
echo "B favourite rows: $($PSQL -c "select count(*) from favorites where user_id='$IDB'") (want 0)"
echo "A still intact: users $($PSQL -c "select count(*) from auth.users where id='$IDA'"), favourites $($PSQL -c "select count(*) from favorites where user_id='$IDA'") (want 1, 1)"
echo "--- T11 user can't call handle_new_user (want denied)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/rpc/handle_new_user" -H "apikey: $KEY" -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{}'; echo
