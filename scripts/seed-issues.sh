#!/usr/bin/env bash
set -euo pipefail

PROJECT_NUMBER="3"
OWNER="knp4830"

gh auth status >/dev/null 2>&1 || { echo "run: gh auth login"; exit 1; }
gh repo view >/dev/null 2>&1 || { echo "not inside a GitHub repo"; exit 1; }

EXISTING="$(gh issue list --state all --limit 500 --json title --jq '.[].title')"
created=0; skipped=0

while IFS='|' read -r title milestone labels; do
  [ -z "$title" ] && continue
  if grep -Fxq "$title" <<< "$EXISTING"; then
    echo "  skip: $title"; skipped=$((skipped+1)); continue
  fi
  url=$(gh issue create --title "$title" --milestone "$milestone" \
        --label "$labels" --body "See docs/BUILD-PLAN.md for the full spec and DoD.")
  gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" >/dev/null
  echo "  created: $title"; created=$((created+1))
done <<'DATA'
M0.3 Scaffold Next.js app and deploy blank to Vercel|Phase 0 — Foundations|type:chore,area:infra,P0
M0.4 Add CLAUDE.md and docs/|Phase 0 — Foundations|type:docs,P0
M0.5 Enable branch protection on main|Phase 0 — Foundations|type:chore,area:infra,P1
M1.1 Design schema and write SCHEMA-NOTES.md|Phase 1 — Data model|type:docs,area:db,P0
M1.2 Supabase project and initial migration|Phase 1 — Data model|type:feature,area:db,P0
M1.3 Row Level Security policies + test plan|Phase 1 — Data model|type:feature,area:db,P0
M1.4 Seed script with the six mockup recipes|Phase 1 — Data model|type:chore,area:db,P0
M1.6 Typed Supabase clients (server + browser)|Phase 1 — Data model|type:feature,area:db,P0
M1.5.1 Canonical ingredients + alias table|Phase 1.5 — Catalog fill|type:feature,area:db,P0
M1.5.2 Ingredient parser (ingredient-parser-nlp)|Phase 1.5 — Catalog fill|type:feature,area:db,P0
M1.5.3 USDA MyPlate Kitchen bulk import|Phase 1.5 — Catalog fill|type:feature,area:db,P0
M1.5.4 USDA FoodData Central nutrition pipeline|Phase 1.5 — Catalog fill|type:feature,area:db,P1
M1.5.5 Recipe generation pipeline (Tier 2, Minced voice)|Phase 1.5 — Catalog fill|type:feature,area:db,P1
M1.5.6 Admin review queue at /admin/review|Phase 1.5 — Catalog fill|type:feature,area:ui,P1
M1.5.7 Fill to 500+ and close pantry coverage gaps|Phase 1.5 — Catalog fill|type:chore,P0
M2.1 Extract Minced design tokens into globals.css|Phase 2 — Design system|type:feature,area:ui,P0
M2.2 Build UI primitives + /kitchen-sink route|Phase 2 — Design system|type:feature,area:ui,P0
M2.3 App shell: header, nav, footer, responsive|Phase 2 — Design system|type:feature,area:ui,P0
M3.1 Browse page with cursor-paginated recipe grid|Phase 3 — Core loop|type:feature,area:ui,P0
M3.2 Recipe detail page with servings scaler|Phase 3 — Core loop|type:feature,area:ui,P0
M3.3 PANTRY MATCHER — match_recipes RPC + autocomplete|Phase 3 — Core loop|type:feature,area:search,P0
M3.4 Conventional filters layered into match_recipes|Phase 3 — Core loop|type:feature,area:search,P0
M3.5 Postgres full-text search|Phase 3 — Core loop|type:feature,area:search,P1
M3.6 Landing page (pantry input above the fold)|Phase 3 — Core loop|type:feature,area:ui,P1
M3.7 Programmatic /what-can-i-make/[combo] SEO pages|Phase 3 — Core loop|type:feature,P1
M4.1 Supabase Auth: email + Google, middleware, login/signup|Phase 4 — Accounts|type:feature,area:auth,P0
M4.2 Favorites with optimistic updates|Phase 4 — Accounts|type:feature,area:auth,P0
M4.3 Account page: Library / My Recipes / Settings|Phase 4 — Accounts|type:feature,area:ui,P0
M5.1 Recipe form with dynamic ingredient and step rows|Phase 5 — Recipe creation|type:feature,area:ui,P0
M5.2 Draft autosave and publish validation|Phase 5 — Recipe creation|type:feature,area:ui,P1
M5.3 Edit and delete own recipes|Phase 5 — Recipe creation|type:feature,area:ui,P0
M6.1 Error boundaries, not-found page, loading states|Phase 6 — Ship|type:feature,area:ui,P0
M6.2 Sentry error monitoring|Phase 6 — Ship|type:chore,area:infra,P1
M6.3 PostHog analytics on pantry queries and signups|Phase 6 — Ship|type:chore,area:infra,P1
M6.4 SEO: metadata, OG tags, sitemap, JSON-LD Recipe schema|Phase 6 — Ship|type:feature,P0
M6.5 Pre-launch checklist and Lighthouse pass|Phase 6 — Ship|type:chore,P0
M6.6 Custom domain|Phase 6 — Ship|type:chore,area:infra,P1
DATA

echo
echo "Done. Created $created, skipped $skipped."