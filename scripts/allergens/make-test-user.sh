#!/usr/bin/env bash
# Creates a confirmed test user on the private local stack and writes the app's local env file (.env.development.local,
# gitignored). The password is generated here and kept only in that file. Prints nothing secret.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API=http://127.0.0.1:55441
ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
PW="Tst-$(date +%s)-$RANDOM-Aa1"
EMAIL="allergen-test@example.test"
curl -s -X POST "$API/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"email_confirm\":true}" | head -c 200 | sed 's/"[^"]*token[^"]*":"[^"]*"/<redacted>/g'
echo
cat > "$ROOT/.env.development.local" <<EOF
NEXT_PUBLIC_SUPABASE_URL=$API
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON
SUPABASE_SECRET_KEY=$SERVICE
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55442/postgres
TEST_USER_EMAIL=$EMAIL
TEST_USER_PASSWORD=$PW
EOF
echo wrote env
