#!/usr/bin/env bash
# Admin review queue, end to end through the real REST API with real JWTs.
# LOCAL stack only: it signs up users and promotes one. Refuses anything else.
#
#   API=http://127.0.0.1:54721 KEY=<local publishable key> DB=supabase_db_<project> \
#     bash supabase/tests/admin_review_api_test.sh
#
# Prerequisites: local stack with all migrations + the recipe data loaded,
# email confirmations OFF. Each check prints PASS or FAIL; exit status is the
# number of failures. It cleans up the two users it creates.
set -u
API="${API:?set API to the local Supabase API URL}"
KEY="${KEY:?set KEY to the local publishable key}"
DB="${DB:?set DB to the local Postgres container name}"
case "$API" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "refusing: API is not local" >&2; exit 1;; esac
PSQL="docker exec -i $DB psql -U supabase_admin -d postgres -tA"
FAILS=0
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1  (got: $2)"; FAILS=$((FAILS+1)); }
want() { case "$3" in *"$2"*) ok "$1";; *) bad "$1" "$3";; esac; }
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }

PW="correct-horse-battery"
signup() { curl -s "$API/auth/v1/signup" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$PW\"}" >/dev/null; }
login()  { curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | j "['access_token']"; }
rpc()    { # token fn json
  curl -s -w ' [http %{http_code}]' "$API/rest/v1/rpc/$2" -H "apikey: $KEY" ${1:+-H "Authorization: Bearer $1"} -H 'content-type: application/json' -d "${3:-{\}}"; }

signup admin-w4@example.test; signup user-w4@example.test
TA=$(login admin-w4@example.test); TU=$(login user-w4@example.test)
IDA=$($PSQL -c "select id from auth.users where email='admin-w4@example.test'")
IDU=$($PSQL -c "select id from auth.users where email='user-w4@example.test'")
$PSQL -c "insert into admins (user_id) values ('$IDA') on conflict do nothing" >/dev/null
SLUG=$($PSQL -c "select slug from recipes where author_id is null and status='published' order by slug limit 1")
SLUG2=$($PSQL -c "select slug from recipes where author_id is null and status='published' order by slug offset 1 limit 1")
echo "slugs under test: $SLUG, $SLUG2"

echo "--- anon"
want "anon cannot call admin_review_progress"  "42501" "$(rpc '' admin_review_progress)"
want "anon cannot call admin_set_review"       "42501" "$(rpc '' admin_set_review "{\"p_slugs\":[\"$SLUG\"],\"p_state\":\"rejected\"}")"
want "anon cannot read recipe_reviews"         "42501" "$(curl -s "$API/rest/v1/recipe_reviews?select=*" -H "apikey: $KEY")"
want "anon cannot read admins"                 "42501" "$(curl -s "$API/rest/v1/admins?select=*" -H "apikey: $KEY")"

echo "--- ordinary signed-in user"
want "user is_admin() is false"                "false" "$(rpc "$TU" is_admin)"
want "user cannot call admin_review_progress"  "42501" "$(rpc "$TU" admin_review_progress)"
want "user cannot call admin_recipe_detail"    "42501" "$(rpc "$TU" admin_recipe_detail "{\"p_slug\":\"$SLUG\"}")"
want "user cannot reject a recipe"             "42501" "$(rpc "$TU" admin_set_review "{\"p_slugs\":[\"$SLUG\"],\"p_state\":\"rejected\"}")"
want "user cannot edit a recipe"               "42501" "$(rpc "$TU" admin_update_recipe "{\"p_slug\":\"$SLUG\",\"p_title\":\"pwned\"}")"
want "user sees no admins rows"                "[]"    "$(curl -s "$API/rest/v1/admins?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $TU")"
want "user sees no review rows"                "[]"    "$(curl -s "$API/rest/v1/recipe_reviews?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $TU")"
R=$(curl -s -w ' [http %{http_code}]' "$API/rest/v1/admins" -H "apikey: $KEY" -H "Authorization: Bearer $TU" -H 'content-type: application/json' -d "{\"user_id\":\"$IDU\"}")
want "user cannot make themselves admin (insert)" "42501" "$R"
R=$(curl -s -w ' [http %{http_code}]' -X PATCH "$API/rest/v1/profiles?id=eq.$IDU" -H "apikey: $KEY" -H "Authorization: Bearer $TU" -H 'content-type: application/json' -d '{"is_admin":true}')
want "profiles has no flag to flip"            "is_admin" "$R"
R=$(curl -s -w ' [http %{http_code}]' "$API/rest/v1/recipe_reviews" -H "apikey: $KEY" -H "Authorization: Bearer $TU" -H 'content-type: application/json' -d "{\"recipe_id\":\"$($PSQL -c "select id from recipes where slug='$SLUG'")\",\"review_status\":\"approved\"}")
want "user cannot insert a review row"         "42501" "$R"
want "still zero reviews in db"                "0" "$($PSQL -c 'select count(*) from recipe_reviews')"
want "recipe unchanged"                        "published" "$($PSQL -c "select status from recipes where slug='$SLUG'")"

echo "--- admin"
want "admin is_admin() is true"                "true" "$(rpc "$TA" is_admin)"
want "admin progress returns counts"           "usda" "$(rpc "$TA" admin_review_progress)"
want "admin reads own admins row"              "$IDA" "$(curl -s "$API/rest/v1/admins?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $TA")"
want "admin rejects a recipe"                  "1 [http 200]" "$(rpc "$TA" admin_set_review "{\"p_slugs\":[\"$SLUG\"],\"p_state\":\"rejected\",\"p_note\":\"test\"}")"
want "rejected recipe now draft in db"         "draft" "$($PSQL -c "select status from recipes where slug='$SLUG'")"
want "anon no longer sees rejected recipe"     "[]" "$(curl -s "$API/rest/v1/recipes?slug=eq.$SLUG&select=slug" -H "apikey: $KEY")"
want "search_recipes (anon) hides it too"      "false" "$(rpc '' search_recipes "{\"q\":\"$SLUG\"}" | python3 -c "import sys,re; t=sys.stdin.read(); print('\"slug\":\"$SLUG\"' in t)" | tr 'TF' 'tf' | sed 's/true/true/')"
want "rejected row kept (not deleted)"         "1" "$($PSQL -c "select count(*) from recipes where slug='$SLUG'")"
want "admin un-rejects, status restored"       "1 [http 200]" "$(rpc "$TA" admin_set_review "{\"p_slugs\":[\"$SLUG\"],\"p_state\":\"unreviewed\"}")"
want "recipe published again"                  "published" "$($PSQL -c "select status from recipes where slug='$SLUG'")"
want "batch approve two"                       "2 [http 200]" "$(rpc "$TA" admin_set_review "{\"p_slugs\":[\"$SLUG\",\"$SLUG2\"],\"p_state\":\"approved\"}")"
want "admin edit title"                        "[http 204]" "$(rpc "$TA" admin_update_recipe "{\"p_slug\":\"$SLUG\",\"p_title\":\"Edited by test\"}")"
want "title persisted"                         "Edited by test" "$($PSQL -c "select title from recipes where slug='$SLUG'")"
want "unresolved ingredient refused"           "does not resolve" "$(rpc "$TA" admin_update_recipe "{\"p_slug\":\"$SLUG\",\"p_ingredients\":[{\"id\":$($PSQL -c "select ri.id from recipe_ingredients ri join recipes r on r.id=ri.recipe_id where r.slug='$SLUG' limit 1"),\"ingredient_name\":\"zzqx not a food\"}]}")"

echo "--- cleanup"
$PSQL -c "update recipes set title = initcap(replace(slug,'-',' ')) where slug='$SLUG'" >/dev/null
$PSQL -c "delete from recipe_reviews; delete from admins where user_id='$IDA'; delete from auth.users where email in ('admin-w4@example.test','user-w4@example.test')" >/dev/null
echo "failures: $FAILS"
exit $FAILS
