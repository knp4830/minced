#!/usr/bin/env bash
# Saved-fridge RLS regression (wave 6): fridge_items is owner-only.
# LOCAL stack only: it signs up users. Refuses to run against anything else.
#
#   API=http://127.0.0.1:54321 KEY=<local publishable key> DB=supabase_db_<project> \
#     bash supabase/tests/fridge_rls_test.sh
#
# Prerequisites: a local stack with confirmations OFF (sign-up returns a
# session), the 20261013140000_fridge migration applied, and ingredients loaded.
# Creates two users and deletes them (delete_my_account) when it finishes.
# Prints PASS/FAIL per check and exits non-zero on any FAIL.
set -u
API="${API:?set API to the local Supabase API URL}"
KEY="${KEY:?set KEY to the local publishable key}"
DB="${DB:?set DB to the local Postgres container name}"
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing: API is not local" >&2; exit 1;; esac
PSQL="docker exec $DB psql -U postgres -tA"
PW="correct-horse-battery"
FAILS=0
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }
check() { # name want got
  if [ "$2" = "$3" ]; then echo "PASS $1"; else echo "FAIL $1 (want '$2', got '$3')"; FAILS=$((FAILS+1)); fi
}
signup() { curl -s "$API/auth/v1/signup" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$PW\"}" >/dev/null; }
login() { curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | j "['access_token']"; }
rest() { # token method path [body] -> prints "<http code> <body>"
  local tok="$1" m="$2" path="$3" body="${4:-}"
  local auth=(); [ -n "$tok" ] && auth=(-H "Authorization: Bearer $tok")
  if [ -n "$body" ]; then
    curl -s -w ' %{http_code}' -X "$m" "$API/rest/v1/$path" -H "apikey: $KEY" "${auth[@]}" -H 'content-type: application/json' -H 'Prefer: return=representation' -d "$body"
  else
    curl -s -w ' %{http_code}' -X "$m" "$API/rest/v1/$path" -H "apikey: $KEY" "${auth[@]}" -H 'Prefer: return=representation'
  fi
}
code() { echo "${1##* }"; }

signup fridge-a@example.test; signup fridge-b@example.test
TA=$(login fridge-a@example.test); TB=$(login fridge-b@example.test)
IDA=$($PSQL -c "select id from auth.users where email='fridge-a@example.test'")
IDB=$($PSQL -c "select id from auth.users where email='fridge-b@example.test'")
ING1=$($PSQL -c "select id from ingredients where canonical_name='spinach'")
ING2=$($PSQL -c "select id from ingredients where canonical_name='milk'")
ING3=$($PSQL -c "select id from ingredients where canonical_name='egg'")
$PSQL -c "delete from fridge_items where user_id in ('$IDA','$IDB')" >/dev/null

check "profiles exist for both users" "2" "$($PSQL -c "select count(*) from profiles where id in ('$IDA','$IDB')")"

# A saves two items.
R=$(rest "$TA" POST fridge_items "{\"user_id\":\"$IDA\",\"ingredient_id\":$ING1,\"expires_on\":\"2026-10-20\"}")
rest "$TA" POST fridge_items "{\"user_id\":\"$IDA\",\"ingredient_id\":$ING2}" >/dev/null
check "A inserts own items (201)" "201" "$(code "$R")"
check "A has 2 rows in db" "2" "$($PSQL -c "select count(*) from fridge_items where user_id='$IDA'")"

# Isolation.
R=$(rest "$TB" GET "fridge_items?select=id")
check "B reads fridge_items: empty list" "[] 200" "${R}"
R=$(rest "$TB" GET "fridge_items?user_id=eq.$IDA&select=id")
check "B filters by A's user_id: still empty" "[] 200" "${R}"
R=$(rest "" GET "fridge_items?select=id")
case "$(code "$R")" in 401|403) echo "PASS anon read denied ($(code "$R"))";; 200) check "anon read returns nothing" "[] 200" "$R";; *) check "anon read denied" "401" "$(code "$R")";; esac

R=$(rest "$TB" POST fridge_items "{\"user_id\":\"$IDA\",\"ingredient_id\":$ING3}")
check "B inserts a row AS A: refused (403)" "403" "$(code "$R")"
check "A still has 2 rows" "2" "$($PSQL -c "select count(*) from fridge_items where user_id='$IDA'")"

R=$(rest "$TB" PATCH "fridge_items?user_id=eq.$IDA" '{"notes":"pwned"}')
check "B updates A's rows: nothing changes" "[] 200" "$R"
check "A notes untouched" "0" "$($PSQL -c "select count(*) from fridge_items where user_id='$IDA' and notes is not null")"

R=$(rest "$TB" DELETE "fridge_items?user_id=eq.$IDA")
check "B deletes A's rows: nothing deleted" "[] 200" "$R"
check "A still has 2 rows after B's delete" "2" "$($PSQL -c "select count(*) from fridge_items where user_id='$IDA'")"

# A cannot hand a row to B by rewriting user_id (with check).
ROW=$($PSQL -c "select id from fridge_items where user_id='$IDA' limit 1")
R=$(rest "$TA" PATCH "fridge_items?id=eq.$ROW" "{\"user_id\":\"$IDB\"}")
check "A moves a row to B: refused (403)" "403" "$(code "$R")"

# Owner can edit and delete.
R=$(rest "$TA" PATCH "fridge_items?id=eq.$ROW" '{"notes":"mine","expires_on":"2026-10-25"}')
check "A edits own row (200)" "200" "$(code "$R")"
check "A edit stuck" "mine" "$($PSQL -c "select notes from fridge_items where id='$ROW'")"

# One row per ingredient.
R=$(rest "$TA" POST fridge_items "{\"user_id\":\"$IDA\",\"ingredient_id\":$ING1}")
check "A duplicate ingredient: conflict (409)" "409" "$(code "$R")"

# Field limits.
LONG=$(python3 -c "print('x'*201)")
R=$(rest "$TA" PATCH "fridge_items?id=eq.$ROW" "{\"notes\":\"$LONG\"}")
check "notes over 200 chars: rejected (400)" "400" "$(code "$R")"

# Shelf-life data is public read, not public write.
R=$(rest "$TB" GET "shelf_life_defaults?select=aisle_category")
check "shelf_life_defaults readable" "200" "$(code "$R")"
R=$(rest "$TB" PATCH "shelf_life_defaults?aisle_category=eq.Produce" '{"days":1}')
check "shelf_life_defaults not writable by users" "0" "$($PSQL -c "select count(*) from shelf_life_defaults where days=1")"
R=$(rest "$TB" POST ingredient_shelf_life "{\"ingredient_id\":$ING3,\"days\":1}")
check "ingredient_shelf_life insert refused" "0" "$($PSQL -c "select count(*) from ingredient_shelf_life where ingredient_id=$ING3 and days=1")"

# The item cap (150), enforced by a trigger.
$PSQL -c "insert into fridge_items (user_id, ingredient_id) select '$IDB', id from ingredients order by id limit 150" >/dev/null
LAST=$($PSQL -c "select max(id) from ingredients")   # outside the first 150, so only the cap can refuse it
R=$(rest "$TB" POST fridge_items "{\"user_id\":\"$IDB\",\"ingredient_id\":$LAST}")
check "B's 151st item refused" "150" "$($PSQL -c "select count(*) from fridge_items where user_id='$IDB'")"

R=$(rest "$TA" DELETE "fridge_items?id=eq.$ROW")
check "A deletes own row (200)" "200" "$(code "$R")"

# Cascade: deleting the account removes the fridge.
curl -s -o /dev/null "$API/rest/v1/rpc/delete_my_account" -H "apikey: $KEY" -H "Authorization: Bearer $TB" -H 'content-type: application/json' -d '{}'
check "B's fridge rows cascade on account delete" "0" "$($PSQL -c "select count(*) from fridge_items where user_id='$IDB'")"
curl -s -o /dev/null "$API/rest/v1/rpc/delete_my_account" -H "apikey: $KEY" -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{}'
check "A's fridge rows cascade on account delete" "0" "$($PSQL -c "select count(*) from fridge_items where user_id='$IDA'")"

echo
[ "$FAILS" -eq 0 ] && echo "ALL PASS" || { echo "$FAILS FAILED"; exit 1; }
