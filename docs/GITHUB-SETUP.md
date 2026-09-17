# GitHub Setup — repo, board, and the professional workflow

> **Your question was: "Should I create a GitHub repository first and then a project board?"**
> **Yes. Repo first, board second, code third.** Reasons below, then the exact commands.

---

## Why repo-before-code is not just ceremony

Three concrete payoffs, not vibes:

1. **The deploy pipeline gets built while it's trivial to debug.** Connect an empty repo to Vercel and if the deploy breaks, the problem is definitely the config — there's no code to blame. Wire it up in week 3 and you're debugging config *and* build errors *and* env vars simultaneously.
2. **Git history is documentation you get for free.** Six weeks from now, `git log` answers "why is this file shaped like this?" Only if you started committing from commit one.
3. **The board is where scope creep goes to die.** Your feature list is genuinely large. Without a visible backlog, "I'll just quickly add the shopping list" happens at 11pm during Phase 3 and costs you a week. With a board, that thought becomes a card in Backlog and you go back to what you were doing.

The fourth reason is the one you actually asked about: this **is** the big-tech workflow. Issue → branch → PR → review → merge → deploy is what every team you'd want to work at does. Practicing it solo on a project you care about is worth more than reading about it.

---

## Step 1 — Create the repo

```bash
mkdir ~/code/minced && cd ~/code/minced
git init -b main

gh repo create minced \
  --private \
  --source=. \
  --description "Recipe app for people who want the recipe, not the essay" \
  --remote=origin
```

`--private` for now. Flip to public at launch — a public repo with a clean commit history is a genuinely strong portfolio piece.

```bash
# first commit so the branch exists on GitHub
printf "# Minced\n\nRecipe app. See docs/BUILD-PLAN.md\n" > README.md
git add -A && git commit -m "chore: initial commit"
git push -u origin main
```

## Step 2 — Labels

Delete GitHub's defaults, create ones that mean something here.

```bash
# clear defaults
for l in bug documentation duplicate enhancement "good first issue" \
         "help wanted" invalid question wontfix; do
  gh label delete "$l" --yes 2>/dev/null
done

# type
gh label create "type:feature"  --color 2F4B3C --description "New capability"
gh label create "type:bug"      --color D64545 --description "Something is broken"
gh label create "type:chore"    --color 8C9A94 --description "Tooling, config, deps"
gh label create "type:docs"     --color 5B7FA6 --description "Documentation"
gh label create "type:refactor" --color 7A6FA8 --description "Same behavior, better code"

# area
gh label create "area:db"       --color E4B73F --description "Schema, migrations, RLS"
gh label create "area:ui"       --color E4B73F --description "Components and styling"
gh label create "area:auth"     --color E4B73F --description "Login, sessions, permissions"
gh label create "area:search"   --color E4B73F --description "Filtering and search"
gh label create "area:infra"    --color E4B73F --description "Deploy, CI, env, monitoring"

# priority
gh label create "P0" --color B60205 --description "Blocks launch"
gh label create "P1" --color D93F0B --description "Needed for a good launch"
gh label create "P2" --color FBCA04 --description "Nice to have"
gh label create "P3" --color C2E0C6 --description "Post-launch"
```

## Step 3 — Milestones

These mirror the phases in `BUILD-PLAN.md`. Milestones group issues; the board tracks their day-to-day state. You want both.

Milestones live in GitHub's issues system, so confirm issues are enabled first — otherwise all eight fail identically with a 422:

```bash
gh repo view --json hasIssuesEnabled
gh repo edit --enable-issues        # only if the above returned false
```

```bash
for m in "Phase 0 — Foundations" \
         "Phase 1 — Data model" \
         "Phase 1.5 — Catalog fill" \
         "Phase 2 — Design system" \
         "Phase 3 — Core loop" \
         "Phase 4 — Accounts" \
         "Phase 5 — Recipe creation" \
         "Phase 6 — Ship"; do
  gh api repos/{owner}/{repo}/milestones -f title="$m" --jq '.title'
done
```

Verify:

```bash
gh api repos/{owner}/{repo}/milestones --jq '.[].title'
```

> **Do not add `--silent` to a command you haven't proven works.** It suppresses the response body — including the message explaining why a request failed. If any of these error, re-run a single one without `--jq` to see GitHub's full reason. A 422 saying `already_exists` means the milestone is already there and you can move on.

## Step 4 — The project board

Board creation is one command; the custom fields are genuinely easier in the web UI, so do that part by clicking.

```bash
gh project create --owner @me --title "Minced"
# note the project number it prints — you'll need it below
```

**Projects are owned by an account, not a repository.** A new project won't appear on your repo's Projects tab until you link it — and `link` won't accept `@me`, unlike `create` and `list`. Spell the owner out:

```bash
gh project link <number> --owner <your-username> --repo <your-username>/minced
```

### Fields vs. views — get this straight first

Two different things, easy to confuse:

- **Fields** are properties *on each item*: Status, Phase, Size, Assignee. Every issue carries a value for each one.
- **Views** are saved *ways of looking* at the same items: a table grouped by milestone, a board grouped by status. Views hold no data — they're lenses.

`Backlog` / `Ready` / `In progress` / `In review` / `Done` are **options of the Status field**, not views. Set them once and a Board view renders them as columns automatically.

Then open the project on github.com and configure:

**Views** (tabs along the top — add with **+ New view**, rename via the tab's dropdown arrow):
- **Board** — type Board, *Group by* → Status. Your daily driver.
- **Table** — type Table, *Group by* → Milestone. Your "how much is left in this phase" view.

Create these *after* setting the fields below, so Board has real columns to group into.

**Status field options** — `...` (top right) → **Settings** → **Fields** → **Status**. Replace GitHub's defaults (`Todo`, `In Progress`, `Done`) with these five:

| Status | Means |
|---|---|
| `Backlog` | Agreed it should happen, not scheduled |
| `Ready` | Fully specified, could start right now |
| `In progress` | Branch exists. **Cap this at 1.** |
| `In review` | PR open, you haven't read your own diff yet |
| `Done` | Merged and deployed |

That `In progress` cap of one is the highest-leverage rule on this page. Professional teams call it a WIP limit. Solo developers with three half-finished branches are the single most common way a side project dies.

**Custom fields** to add (Settings → Fields → **+ New field**):
- `Phase` — single select: `0 Foundations`, `1 Data`, `1.5 Catalog`, `2 Design`, `3 Core`, `4 Auth`, `5 Create`, `6 Ship`, `7 Post-launch`
- `Size` — single select: `XS` (<1h), `S` (half day), `M` (1 day), `L` (2–3 days), `XL` (needs breaking down)

**`XL` is not a size, it's a signal.** Anything you'd label XL should be split into smaller issues before you start it.

**Workflows** (Settings → Workflows) — turn these on:
- *Item closed* → set Status to `Done`
- *Pull request merged* → set Status to `Done`
- *Item added to project* → set Status to `Backlog`

## Step 5 — Seed the backlog

Save this as `scripts/seed-issues.sh`, `chmod +x` it, run it once. It creates every Phase 0–6 milestone from the build plan as an issue.

```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT_NUMBER="1"   # <-- change to the number gh printed in Step 4

new () {  # new <title> <milestone> <labels> <body>
  url=$(gh issue create --title "$1" --milestone "$2" --label "$3" --body "$4")
  gh project item-add "$PROJECT_NUMBER" --owner @me --url "$url"
  echo "created: $1"
}

P0="Phase 0 — Foundations"
new "M0.3 Scaffold Next.js app and deploy blank to Vercel" "$P0" "type:chore,area:infra,P0" \
    "See docs/BUILD-PLAN.md M0.3. DoD: a public vercel.app URL loads the starter page."
new "M0.4 Add CLAUDE.md and docs/" "$P0" "type:docs,P0" \
    "See docs/BUILD-PLAN.md M0.4."
new "M0.5 Enable branch protection on main" "$P0" "type:chore,area:infra,P1" \
    "Require a PR before merging."

P1="Phase 1 — Data model"
new "M1.1 Design schema and write SCHEMA-NOTES.md" "$P1" "type:docs,area:db,P0" \
    "ERD plus written rationale per table. See docs/BUILD-PLAN.md M1.1."
new "M1.2 Supabase project and initial migration" "$P1" "type:feature,area:db,P0" ""
new "M1.3 Row Level Security policies + test plan" "$P1" "type:feature,area:db,P0" \
    "Security-critical. Must personally verify an unauthorized query fails."
new "M1.4 Seed script with the six mockup recipes" "$P1" "type:chore,area:db,P0" \
    "Source data is the RECIPES array in Minced.dc.html. Must be idempotent."
new "M1.5 Typed Supabase clients (server + browser)" "$P1" "type:feature,area:db,P0" ""

P15="Phase 1.5 — Catalog fill"
new "M1.5.1 Canonical ingredients + alias table" "$P15" "type:feature,area:db,P0" \
    "BLOCKS every importer. Pantry matching dies without this. Trigram index for fuzzy autocomplete."
new "M1.5.2 Ingredient parser (ingredient-parser-nlp)" "$P15" "type:feature,area:db,P0" \
    "Free-text ingredient lines to structured qty/unit/name/prep."
new "M1.5.3 USDA MyPlate Kitchen bulk import (~1072 recipes)" "$P15" "type:feature,area:db,P0" \
    "Public domain. This is the primary catalog source. Reject on unresolved ingredients."
new "M1.5.4 USDA FoodData Central nutrition pipeline" "$P15" "type:feature,area:db,P1" \
    "For recipes without nutrition. Needs a volume-to-grams table."
new "M1.5.5 Recipe generation pipeline (Tier 2, Minced voice)" "$P15" "type:feature,area:db,P1" \
    "Fills what MyPlate is bad at: interesting cuisines and bold flavors."
new "M1.5.6 Admin review queue at /admin/review" "$P15" "type:feature,area:ui,P1" \
    "Keyboard-driven. This is the quality bar and it cannot be automated."
new "M1.5.7 Fill to 500+ and close pantry coverage gaps" "$P15" "type:chore,P0" \
    "20 realistic test pantries must each return 10+ strong matches."

P2="Phase 2 — Design system"
new "M2.1 Extract Minced design tokens into globals.css" "$P2" "type:feature,area:ui,P0" ""
new "M2.2 Build UI primitives + /kitchen-sink route" "$P2" "type:feature,area:ui,P0" \
    "Button, Card, Chip, Input, Select, Textarea, SpiceDots, MetaRow."
new "M2.3 App shell: header, nav, footer, responsive" "$P2" "type:feature,area:ui,P0" ""

P3="Phase 3 — Core loop"
new "M3.1 Browse page with server-rendered recipe grid" "$P3" "type:feature,area:ui,P0" ""
new "M3.2 Recipe detail page with servings scaler" "$P3" "type:feature,area:ui,P0" ""
new "M3.3 PANTRY MATCHER — match_recipes RPC + ingredient autocomplete" "$P3" "type:feature,area:search,P0" \
    "THE product. Set-coverage ranking in Postgres. Everything else is table stakes. See docs/BUILD-PLAN.md M3.3."
new "M3.4 Conventional filters layered into match_recipes" "$P3" "type:feature,area:search,P0" \
    "Time, macros, cookware, spice, diet, allergens. Same RPC, not a second query."
new "M3.5 Postgres full-text search" "$P3" "type:feature,area:search,P0" \
    "Door 2. A recipe app that cannot find a named recipe is broken. tsvector + GIN + trgm fallback."
new "M3.6 Landing page (pantry input leads, search beside it)" "$P3" "type:feature,area:ui,P1" "Build last."
new "M3.7 Programmatic /what-can-i-make/[combo] SEO pages" "$P3" "type:feature,P1" \
    "The growth engine. ~300 static pages for common ingredient combos."

P4="Phase 4 — Accounts"
new "M4.1 Supabase Auth: email + Google, middleware, /login /signup" "$P4" "type:feature,area:auth,P0" ""
new "M4.2 Favorites with optimistic updates" "$P4" "type:feature,area:auth,P0" ""
new "M4.3 Account page: Library / My Recipes / Settings" "$P4" "type:feature,area:ui,P0" ""

P5="Phase 5 — Recipe creation"
new "M5.1 Recipe form with dynamic ingredient and step rows" "$P5" "type:feature,area:ui,P0" ""
new "M5.2 Draft autosave and publish validation" "$P5" "type:feature,area:ui,P1" ""
new "M5.3 Edit and delete own recipes" "$P5" "type:feature,area:ui,P0" ""

P6="Phase 6 — Ship"
new "M6.1 Error boundaries, not-found page, loading states" "$P6" "type:feature,area:ui,P0" ""
new "M6.2 Sentry error monitoring" "$P6" "type:chore,area:infra,P1" ""
new "M6.3 PostHog analytics on filters, views, signups" "$P6" "type:chore,area:infra,P1" ""
new "M6.4 SEO: metadata, OG tags, sitemap, JSON-LD Recipe schema" "$P6" "type:feature,P0" \
    "JSON-LD is what gets us into Google's recipe carousel."
new "M6.5 Pre-launch checklist and Lighthouse pass" "$P6" "type:chore,P0" ""
new "M6.6 Custom domain" "$P6" "type:chore,area:infra,P1" ""

echo "Done. Open the board and drag M0.3 into Ready."
```

---

## The daily loop

```bash
# 1. pick ONE issue, move its card to In progress
gh issue list --milestone "Phase 1 — Data model" --state open

# 2. branch, named after the issue
git checkout main && git pull
git checkout -b feat/m1-3-rls-policies

# 3. work with Claude Code — read every diff before accepting

# 4. commit in small, meaningful chunks (not one giant end-of-day commit)
git add -A
git commit -m "feat(db): add RLS policies for recipes and favorites

Published recipes readable by anon; drafts author-only. Writes gated
on auth.uid() = author_id.

Refs #7"

# 5. push and open a PR
git push -u origin HEAD
gh pr create --fill --body "Closes #7

## What changed
- ...

## How I tested
- ..."

# 6. READ YOUR OWN DIFF on github.com. This is not optional.
gh pr view --web

# 7. merge, clean up
gh pr merge --squash --delete-branch
git checkout main && git pull
```

### Commit message format

[Conventional Commits](https://www.conventionalcommits.org/) — `type(scope): summary`.

```
feat(filters): url-driven server-side recipe filtering
fix(auth): refresh session before checking user on protected routes
chore(deps): bump next to 15.1.2
docs(learning): add entry 04 on row level security
refactor(queries): extract recipe fetching into lib/queries
```

Why bother: it makes `git log --oneline` scannable, it's what every professional repo does, and changelogs can be generated from it later.

---

## Optional but recommended — CI

Add `.github/workflows/ci.yml` in Phase 0. It runs typecheck and lint on every PR, so a broken build gets caught before you merge rather than after Vercel deploys it.

**Claude Code prompt:**
```
Create .github/workflows/ci.yml — on pull requests to main, run pnpm install,
pnpm typecheck, pnpm lint, and pnpm build. Use pnpm caching. Explain what each
step in the YAML does; I've never written a GitHub Actions workflow.
```

Then in branch protection, require the CI check to pass before merging.

---

## What "working like a big-tech engineer" actually means here

Stripped of the ceremony, it's four habits:

1. **Nothing merges without a PR you read.** Even solo. Especially solo.
2. **One thing in progress at a time.** WIP limits are the whole reason kanban works.
3. **Every change is traceable to a reason.** Issue → branch → commit → PR. Six months later you can reconstruct *why*.
4. **The definition of done includes deployed.** Code merged but not live is inventory, not progress.

Everything else — the labels, the custom fields, the milestones — is scaffolding that makes those four habits easier to keep. If the scaffolding ever starts costing more than it saves, cut it. The four habits stay.
