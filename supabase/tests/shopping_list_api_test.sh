#!/usr/bin/env bash
# Shopping list RLS through the real API (PostgREST + JWTs), not SET ROLE.
# LOCAL stack only: it signs up users. Refuses to run against anything else.
#
#   API=http://127.0.0.1:55321 KEY=<local publishable key> DB=<local db container> \
#     bash supabase/tests/shopping_list_api_test.sh
#
# Prerequisites: all migrations applied, seed loaded (needs the shakshuka
# recipe), email confirmations OFF. Every "want" is the expected value.
set -u
API="${API:?set API to the local Supabase API URL}"
KEY="${KEY:?set KEY to the local publishable key}"
DB="${DB:?set DB to the local Postgres container name}"
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing: API is not local" >&2; exit 1;; esac
PSQL="docker exec $DB psql -U postgres -tA"
PW="Local-test-$(date +%s)-pw"
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }
signup() { curl -s "$API/auth/v1/signup" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | j "['access_token']"; }
c() { local t="$1"; shift; curl -s -H "apikey: $KEY" -H "Authorization: Bearer $t" -H 'content-type: application/json' "$@"; }

TA=$(signup shop-api-a@example.test); TB=$(signup shop-api-b@example.test)
IDA=$($PSQL -c "select id from auth.users where email='shop-api-a@example.test'")
RID=$($PSQL -c "select id from recipes where slug='shakshuka'")
ING=$($PSQL -c "select min(id) from ingredients")

echo "--- T1 A adds shakshuka via RPC (want added > 0)"
c "$TA" -s "$API/rest/v1/rpc/add_recipe_to_shopping_list" -d "{\"p_recipe_id\":\"$RID\",\"p_servings\":3}"; echo
N=$($PSQL -c "select count(*) from shopping_list_items where user_id='$IDA'"); echo "A rows: $N (want > 0)"
echo "--- T2 B reads the table (want [])"
c "$TB" -s "$API/rest/v1/shopping_list_items?select=*" ; echo
echo "--- T3 B filters by A's user_id (want [])"
c "$TB" -s "$API/rest/v1/shopping_list_items?user_id=eq.$IDA" ; echo
echo "--- T4 B ticks A's rows (want 0 rows changed)"
c "$TB" -s -X PATCH "$API/rest/v1/shopping_list_items?user_id=eq.$IDA" -H 'Prefer: return=representation' -d '{"checked":true}'; echo
echo "A checked rows: $($PSQL -c "select count(*) from shopping_list_items where user_id='$IDA' and checked") (want 0)"
echo "--- T5 B deletes A's rows (want 204, zero removed)"
c "$TB" -s -w ' [http %{http_code}]' -X DELETE "$API/rest/v1/shopping_list_items?user_id=eq.$IDA" ; echo
echo "A rows after: $($PSQL -c "select count(*) from shopping_list_items where user_id='$IDA'") (want $N)"
echo "--- T6 B inserts AS A (want RLS violation)"
c "$TB" -s -w ' [http %{http_code}]' "$API/rest/v1/shopping_list_items" -d "{\"user_id\":\"$IDA\",\"ingredient_id\":$ING}"; echo
echo "--- T7 A edits a quantity directly (want permission denied: only 'checked' is updatable)"
c "$TA" -s -w ' [http %{http_code}]' -X PATCH "$API/rest/v1/shopping_list_items?user_id=eq.$IDA" -d '{"quantity":999}'; echo
echo "--- T8 anon reads the table (want denied)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/shopping_list_items?select=*" -H "apikey: $KEY"; echo
echo "--- T9 anon calls add_recipe_to_shopping_list (want denied)"
curl -s -w ' [http %{http_code}]' "$API/rest/v1/rpc/add_recipe_to_shopping_list" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"p_recipe_id\":\"$RID\",\"p_servings\":3}"; echo
echo "--- T10 A deletes own account: items cascade (want 0 rows)"
c "$TA" -s -o /dev/null "$API/rest/v1/rpc/delete_my_account" -d '{}'
echo "A rows after account deletion: $($PSQL -c "select count(*) from shopping_list_items where user_id='$IDA'") (want 0)"
c "$TB" -s -o /dev/null "$API/rest/v1/rpc/delete_my_account" -d '{}'
