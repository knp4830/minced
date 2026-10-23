# Minced

## What this is

**Minced tells you what to cook — whether or not you already know.** Every recipe is ingredients, amounts, and numbered steps. No headnotes, no anecdotes, no essay.

**Two doors into one catalog, both P0:**

1. **Pantry matcher** — the user enters what's in their kitchen; Minced ranks recipes by how little they're missing. This is the differentiator.
2. **Search** — the user knows they want cacio e pepe and types it. This is table stakes; a recipe app that can't find a named recipe is broken.

They share the same catalog, the same filters, and the same recipe pages. Never build a feature that works for one door and not the other.

Target catalog: 500+ recipes (aiming for ~1,500).

## Tech stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Supabase** — Postgres, Auth, Row Level Security
- **Vercel** hosting
- **React Hook Form + Zod** for forms
- **USDA FoodData Central** for nutrition (public domain)
- `ingredient-parser-nlp` (Python) for parsing free-text ingredient lines

## Folder structure

<!-- Fill this in at M0.3 with the real output of: tree -L 3 -I node_modules -->
```
minced/
├── src/
│   └── app/              # App Router — folders are URL segments
│       ├── layout.tsx    # root layout (renders <html>/<body>)
│       ├── page.tsx      # /
│       ├── globals.css   # Tailwind v4 + all colour variables
│       └── favicon.ico
├── public/               # served verbatim at site root (/file.svg)
├── docs/                 # BUILD-PLAN, LEARNING-LOG, GITHUB-SETUP, TERMINAL-LOG
├── design/               # Minced.dc.html — the visual spec + its runtime
├── scripts/              # repo tooling (seed-issues.sh)
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
├── pnpm-workspace.yaml   # pnpm 11 `allowBuilds` lives here, not package.json
├── pnpm-lock.yaml
└── tsconfig.json         # @/* → src/*
```

Not yet created, but committed to by the conventions below: `src/lib/queries/`,
`src/components/`, `supabase/migrations/`.

## Conventions

- **Server Components by default.** Add `"use client"` only for state, effects, or browser APIs — and push it as far down the tree as possible.
- Data fetching happens in Server Components or Server Actions, **never in `useEffect`**.
- Named exports only, no default exports (except Next.js pages/layouts, which require them).
- Components `PascalCase`, functions and files `camelCase`, DB columns `snake_case`.
- All colors come from CSS variables in `globals.css`. **No raw hex codes anywhere else.**
- Filter, search, and pantry state lives in **URL search params**, never `useState`.
- Every database query goes through `src/lib/queries/` — no inline Supabase calls in components.
- Complex ranking queries (the pantry matcher) are **Postgres functions called via RPC**, not assembled in TypeScript.

## Domain rules that are easy to get wrong

- **Every recipe ingredient must resolve to a canonical `ingredients` row.** Free text lives only in `prep_note` and never affects matching. A recipe with unresolved ingredients is rejected at import, not warned about.
- **Pantry staples** (salt, pepper, water, oil, butter, sugar, flour) carry `is_pantry_staple = true` and never count toward "you're missing." Forgetting this makes every match report missing items and the product feel broken.
- **Never fetch all recipes and filter in JavaScript.** Filtering and ranking happen in Postgres.
- Pagination is **cursor-based**, not offset-based.

## Do NOT

- Do not install packages without asking me first.
- Do not modify files in `supabase/migrations/` — write a new migration instead.
- Do not disable or weaken an RLS policy.
- Do not use the Supabase service role key anywhere client-side.
- Do not import recipe data from a source without a confirmed commercial-storage license. See `docs/BUILD-PLAN.md` Phase 1.5 — most recipe APIs and datasets forbid this.
- Do not add features that aren't in the current milestone in `docs/BUILD-PLAN.md`.

## Working agreement

- Milestones come from `docs/BUILD-PLAN.md`. **Independent milestones may run in parallel** (see "Parallel work" below). A milestone whose dependency hasn't passed its DoD does not start.
- When I ask you to explain code, assume I'm early in my learning — explain the concept, not just the syntax.
- Add any new terminal or git command to `docs/TERMINAL-LOG.md`, including the failures.

### Closing out a milestone

A milestone is done when its **DoD (Definition of Done) is observably true** — not when the code is written. "I implemented search" is not done; "searching 'shakshuka' returns it in under 100ms" is done. If you can't demonstrate the DoD, the milestone is still open — say so rather than checking the box.

When the DoD is met, do these four things in order, without being asked:

1. **Check the box** in `docs/BUILD-PLAN.md` — change `### ☐ M3.5` to `### ☑ M3.5`. Never delete a checked box; this file is the project's memory.
2. **Append a LEARNING-LOG entry** in the format `docs/LEARNING-LOG.md` establishes: what we built, key files, how it works, why this way and what we rejected, new concepts, gotchas. Written for me in three months, who won't remember any of it.
3. **Update "Current status"** at the bottom of this file to the next milestone.
4. **Tell me the PR body to use**, including the line `Closes #<issue number>` — that keyword is what makes GitHub close the issue and move the board card automatically when the PR merges. Issue numbers are mapped in `docs/BUILD-PLAN.md` under "GitHub issue numbers". **Never omit it**: the link cannot be added retroactively once the PR is merged, and a PR that plainly does an issue's work is invisible to GitHub without the keyword.

Then stop. I review the diff and merge. Do not start the next wave until I have merged this one.

### Parallel work

Several milestones can be built at once by separate agents, as long as they cannot interfere with each other. The rules that make that true:

- **One wave at a time.** A wave is a set of milestones with no dependency between them. Plan it, tell me the milestones and a rough token cost, then run it.
- **One agent per milestone, each in its own git worktree and branch.** Agents never edit the same checkout.
- **File ownership.** Each agent touches only the files its milestone needs. Shared files — `CLAUDE.md`, `docs/BUILD-PLAN.md`, `docs/LEARNING-LOG.md`, `docs/TERMINAL-LOG.md`, `src/types/database.ts`, `globals.css` — are edited **only at integration**. Agents write their log notes into their final report instead.
- **The live database belongs to the integrator.** Lane agents test migrations and data scripts against their own throwaway Docker Postgres and may only *read* the live database. Migrations are applied to live one at a time, in timestamp order, at integration, followed by `pnpm db:types`.
- **Integration ("congregate").** When every agent in the wave reports done: merge their branches into one integration branch, apply migrations, then a verifier checks each milestone's DoD **observably, on the integrated branch** — not on the agent's word. Milestones that pass get the four close-out steps above; milestones that fail are marked blocked and left unchecked.
- **One PR per wave**, with a `Closes #N` line for **every** milestone that passed, and none for those that didn't. I merge it.

### Marking a milestone blocked

If the DoD can't be met — a dependency is missing, a decision is needed from me, an approach didn't work — do **not** check the box or half-finish it. Instead: state plainly what's blocking, what you tried, and what decision you need. A milestone honestly marked blocked is more useful than one marked done that isn't.

### Working on the database

- **Re-run `pnpm db:types` after every migration**, in the same commit. The generated types are a snapshot, not a live link — a stale `src/types/database.ts` means TypeScript confidently agrees with a schema that no longer exists.
- **Re-run `docs/RLS-TEST-PLAN.md` after any policy change.** It is the regression suite, and its setup block writes to the live database — running its teardown is part of running it, not a footnote.
- **"It didn't error" is not "it did something."** An unauthorised `UPDATE` returns `UPDATE 0`, not an error. A `DELETE` in the SQL Editor reports "Success. No rows returned" whether it removed four rows or none. Verify by counting afterwards.
- **Test migrations before pushing.** `docker run -d postgres:16-alpine`, stub `auth.users` and `auth.uid()`, apply the migration, exercise the triggers, delete the container. This caught a trigger bug in M1.2 that would have broken every ingredient removal.

## Reference docs

- `docs/BUILD-PLAN.md` — the roadmap. What to build, in what order, with the definition of done.
- `docs/LEARNING-LOG.md` — why the code is the way it is.
- `docs/GITHUB-SETUP.md` — repo, board, and PR workflow.
- `docs/TERMINAL-LOG.md` — terminal and git command reference.
- `docs/ARCHITECTURE.md` — the map: routes, queries, components, migrations (and which file currently defines each RPC), scripts, data flow, caching, and "where do I change X".
- `docs/LESSONS.md` — every mistake this project has hit and the rule that prevents it. **Read this before starting any work.**
- `docs/TEST-CHECKLIST.md` — the manual test pass over every shipped feature (desktop first, then ★ items on a phone). Update it whenever a feature ships.
- `docs/design-prompts/` — prompts for Claude Design (mockups before building). `personal-dashboard.md` is the "Me" page (BUILD-PLAN v1.5).
- `design/Minced.dc.html` — the design mockup: 7 screens, real tokens, and 6 complete seed recipes in its `RECIPES` array. **This is the visual spec.** Read it before building any UI. (`design/support.js` is its runtime — open the HTML in a browser to view it.)

## Current status

**Phase 0 — Foundations: complete.** M0.1–M0.5 all closed.

- Live at **https://minced-app.vercel.app**; pushes to `main` redeploy automatically.
- Repo is **public**, and `main` is protected — every change goes through a PR, including yours.

**Phase 0 and Phase 1: complete.** M0.1–M0.5 and M1.1–M1.6 all closed.

- Live at **https://minced-app.vercel.app** (Vercel project `minced`, renamed from `mise` on 2026-10-10; `mise-two-xi.vercel.app` still aliases it). **`mise-mise14.vercel.app` was never this project** — older docs and LEARNING-LOG entries that call it the live URL are wrong; it serves a Next.js starter. Repo public, `main` protected — every change goes through a PR.
- Database live with **seven** migrations applied and **RLS enforced**. `pnpm db:seed` is idempotent and seeds the ingredient vocabulary before the six mockup recipes; the USDA catalog is loaded separately by `scripts/myplate/import.sh`.
- `docs/SCHEMA-NOTES.md` is the schema's rationale — read it before changing the database.
- Typed clients in `src/lib/supabase/`; generated types in `src/types/database.ts`.
- **Renamed Mise → Minced** (2026-09-16). Migration comments and TERMINAL-LOG history still say "Mise" on purpose — see LEARNING-LOG "Interlude".

### Phase 1.5 progress

**M1.5.1 — canonical ingredients and aliases: complete (2026-09-17).**

- **409 canonical ingredients, 283 aliases**, seeded by `supabase/seed-ingredients.sql` (runs before `seed.sql`; `pnpm db:seed` runs both).
- `resolve_ingredient(raw_name, min_similarity default 0.45)` — exact → alias → trigram fuzzy, **returns zero rows when unresolved**. Callers must reject, not warn.
- `ingredient_coverage(raw_names[])` + `pnpm ingredients:coverage <file>` — the coverage metric, and the import gate.
- Query layer: `src/lib/queries/ingredients.ts`.

**Vocabulary rules — read before adding ingredients:**

- `canonical_name` is what a **cook** types. USDA FoodData Central phrasings (`"Peppers, sweet, red"`) are **aliases**, never canonical. USDA supplies coverage; curation supplies names.
- **Do not seed simple plurals as aliases** — `singularize_ingredient_name()` handles them. Aliases are for regional synonyms, USDA phrasings, shorthand, and *irregular* plurals only.
- Herbs sold both ways are split (`fresh thyme` / `dried thyme`); the bare word is an alias pointing at the form a recipe writing it bare usually means.
- A row earns its own canonical entry only when a cook shops for it separately **and** swapping it changes the dish.

**M1.5.2 — ingredient parser: complete (2026-09-17).**

- `scripts/parser/` holds an **offline Python parser** (`ingredient-parser-nlp`, gitignored venv, pinned `requirements.txt`). Set up with `bash scripts/parser/setup.sh`, run with `bash scripts/parser/run.sh`.
- **It is not a Node dependency and is never deployed.** It runs at import time on your machine; the live product's path is `resolve_ingredient()` in Postgres.
- Contract: JSON array of raw lines on stdin → JSON array of `{raw, names[], quantity, unit, prep, comment, confidence, needs_review, review_reasons, usda}` on stdout. **stdout is JSON and nothing else** — the library's own warnings are redirected to stderr, and breaking that corrupts every downstream consumer.
- `bash scripts/parse-and-resolve.sh <file>` is the seam between M1.5.2 and M1.5.1: parse → resolve → report. Three sections, because three things fail silently: parse confidence, name coverage, unit coverage.

**The parser returns USDA `fdc_id`s.** `foundation_foods=True` gives real FoodData Central ids (`garlic → 1104647, "Garlic, raw"`). The output carries it; **nothing writes it to the database yet** — that is M1.5.4, and doing it early would be building an unstarted milestone.

**M1.5.3 — USDA MyPlate bulk import: complete (2026-09-18).**

- **The catalog is real: 878 published recipes** (872 USDA MyPlate + the 6 mockup originals), 7,083 ingredient rows, 5,250 steps, all with USDA nutrition preserved.
- **USDA retired myplate.gov on 2026-01-07.** The importer reads the **Internet Archive's** capture of the original public-domain pages. The surviving mirror (myplate.food) forbids replicating its catalog into another database without a license — a contract on their service, not a copyright claim on federal works. **Do not switch the importer to their API.**
- Pipeline in `scripts/myplate/`: `fetch.sh` → `extract.py` → `build_import.py` → `import.sh`. Each stage writes an artifact you can inspect. Idempotent and resumable; `cache/` and `artifacts/` are gitignored.
- **`fetch.sh` must stay gentle.** At `JOBS=4` the Internet Archive refused 953 of 1,201 connections. `JOBS=2` with retries is stable. This is a measurement, not an opinion.
- Queues: `artifacts/rejected-recipes.csv` (recipes not imported, with reasons) and `artifacts/unresolved-ingredients.csv` (names to alias next, ranked by frequency).

**Resolution now has five passes** — exact, singularised, alias, **modifier-stripped**, fuzzy:

- **Stripping runs LAST on purpose.** M1.5.1 deliberately split `dried thyme` from `fresh thyme`; those match on pass 1 and never reach the stripper. Only a name that resolves to *nothing* gets its adjectives removed. Colour words are in the list for the same reason — `red onion` matches exactly, only an unrecognised `red apples` gets stripped.
- **One word at a time, stopping at the first match.** Stripping everything first turned `no salt added diced tomatoes` into the fresh tomato instead of the can. The longest name that still matches is the most specific.
- Modifiers live in `ingredient_modifiers` (tuning data, editable in the seed). **Never add a word that changes what you would buy** — `ground` is not there, because ground beef is not beef.

**Units resolve like ingredients, not like the parser spells them.** `units` is a conversion system (`kind`, `to_base_factor`), so `unit_aliases` maps `tablespoon`/`Tablespoons` onto `tbsp` rather than adding rows. `citext` is load-bearing: the parser silently loses capitalised units and USDA recipe cards capitalise. **No fuzzy tier on units**, and **`t` is deliberately unaliased** (t=teaspoon but T=tablespoon, and citext folds them). `pinch`/`dash` are not units — they become `quantity NULL`, the schema's "to taste".

**`normalize_ingredient_name` folds accents** via `translate()`, not `unaccent()` (which is not `IMMUTABLE`, and an expression index depends on this function). **If you ever change that function, REINDEX in the same migration** — an expression index keeps values computed by the old body and Postgres will not rebuild it.

### Wave 1 (2026-10-09): applied to live

Design system and shell (M2.1-M2.3) closed. Live now has **eleven** migrations, **978 recipes** (872 MyPlate, 100 "Minced original" AI-drafted, 6 mockup), allergens, 32 cuisines, and the `match_recipes` / `search_recipes` / `suggest_ingredients` RPCs. The `recipes` bloat was fixed with `VACUUM (FULL, ANALYZE)` (32 MB to 2.1 MB). Six packages were added by the design lane (clsx, tailwind-merge, class-variance-authority, lucide-react, tw-animate-css, @radix-ui/react-slot).

### Waves 1-3 (2026-10-09 to 10-12): live

Live at https://minced-app.vercel.app with **19 migrations**, **959 recipes** (duplicates merged), **260 photos**, computed nutrition, ingredient families, 22 pantry staples, and email accounts (sign-up, favorites, `/account`, `/privacy`, `/terms`). Routes: `/`, `/recipes` (browse, `?q=`, filters), `/recipes/[slug]` (ISR), `/pantry` (tap-to-pick fridge), `/account`, `/about`. One `RecipeCard`/`RecipeList` and one URL filter contract (`src/lib/filters.ts`) serve both doors. Google sign-in, a domain and custom SMTP come LAST, by the user's choice.

### Waves 1-4 (2026-10-09 to 10-12): live

Live at https://minced-app.vercel.app. Wave 4 (perf, cookware filter, admin review at `/admin/review`, `jit=off`) is applied and merged (PR #52). Live has **23 migrations** as of wave 4. Admin review (M1.5.6) is built; M1.5.7 stays open (your review).

### Waves 5+6 (2026-10-13): live

Live has **29 migrations**, **959 recipes**, **352 photos** (607 placeholders), 705 aliases, 610 ingredients, cookware on about 762 recipes. Shopping list, fridge with dates, "only cookware I own", synonym coverage, security hardening and httpOnly cookies are live. **M1.5.7 stays open** (owner review of 247 rejected recipes and unresolved ingredients). Navigation docs: **`docs/ARCHITECTURE.md`** (map, where to change X) and **`docs/LESSONS.md`** (every mistake and the rule). Read LESSONS first.

### Wave 7 (2026-10-14): integrated on `wave7/integration`, PR open, NOT applied to live

**Not on live yet. Four new migrations must be applied BEFORE merging, in order:** `20261014100000_cookware_alt_groups`, `100100_shopping_list_add_batch`, `120000_user_recipes`, `160000_user_recipes_hardening` (then live has **33**). Code merged first returns 500 on recipe pages. Back up first. Then `pnpm db:types` (committed types predate `160000`), `supabase/seed-cookware.sql` (expect 29 added, 73 grouped), and only after the photo fixes: upload and `seed-photos.sql`.

- **Checked:** M5.1 and M5.3 (closes #29, #31). **Open:** M5.2 (no draft autosave), M3.7 (post-MVP, combo pages parked on branch `wave7/seo-combos-later`), M1.5.7.
- **User recipes are built but NOT connected.** Both `NEXT_PUBLIC_ENABLE_USER_RECIPES` (build-time, default off) and the DB switch `feature_flags.user_recipes` (default off) must be on. Before turning on: DMCA agent registration, lawyer-reviewed Terms, decide `author_id` exposure, approval-by-slug race. See LEARNING-LOG Entry 35.
- **Shipped in the PR:** shopping re-add dialog, cookware either/or (`alt_group`, 36 recipes), Recipe JSON-LD and canonicals, sitemap/robots fixes, `/kitchen-sink` and `/api/ingredients/suggest` removed, food-science brief (`docs/research/`), 56 new photos (not yet safe to apply).
- **Verification failures carried forward, fix in the next small wave:** (1) signed-in client state is dead (`accountProvider.hasAuthCookie()` reads `document.cookie`, but cookies are httpOnly), (2) `rewriteSynonyms()` pushes 13 exact titles off page 1 and breaks "mac and cheese", (3) photos: 5 duplicate files, 1 rejected file back, 5 MyPlate logos, (4) `/about` says accounts do not exist. Also open: `next` 15.5.24 advisories, no rate limiting, backups lack `auth.users` and Storage, `next build` fails while Supabase is paused, fridge `sort=expiry` is one page of 99, "under 20 min" counts unknown times.

### Review wave (2026-10-15): merged in PR #55, live has 34 migrations

Owner's 19-item desktop review. **Before merging:** back up live, apply `supabase/migrations/20261015120000_filters_time_ingredients.sql` (live then has **34** migrations; code merged first breaks the landing page and filtered `/recipes`), run `pnpm db:types`, run `scripts/dedupe-near-duplicates.sql` (dry run first; deletes 2 recipes, 959 to 957), apply `scripts/cleanup/prep-notes-cleanup.sql` after reviewing the CSV, then photo upload and `seed-photos.sql`. Live is currently 33 migrations, 959 recipes, 352 photos. Status per item: `docs/review/2026-10-15-feedback.md`. Open: mac and cheese search, unknown-time recipes in ranges, 5 mismatched photos, 3 rejected picks that can return, `useFridgeIds` localStorage read, font choice at domain and Google sign-in next.

### Wave 8 (2026-10-16): integrated on `wave8/integration`, PR open, NOT applied to live

**MERGE ORDER: back up live, apply `20261016100000_me_dashboard.sql` (live then has 35 migrations), merge, then push an empty commit if the Vercel preview ran too early (LESSONS section 9).** Types are already regenerated. Photos: upload and `seed-photos.sql` wait on questions P1 and P2.

- **Shipped, all behind flags or inert:** Me dashboard at `/me` (`NEXT_PUBLIC_ENABLE_ME=true`), Google sign-in (`NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN=true`), 308 redirect from the two old hostnames to `minced.kevinpham.page`, four email templates, sharper landing photos (hero fixed at its root), /privacy and /about updated. Setup docs in `docs/setup/`.
- **Checked boxes: none.** M4.1 stays open until a real Google login works on live. Me has no issue number; it is built, not signed off.
- **Owner steps and every open question:** `docs/review/2026-10-16-wave8-questions.md`.
- **Open from verification:** photos (fish-spinach shows a rejected photo, six swaps worse than before, 80 photos under 1000 px), pescatarian filter excludes vegetarian dishes, Me phone layout fix not re-verified in a browser.

### Wave 9 (2026-10-17): integrated on `wave9/integration`, PR open, NOT applied to live

**MERGE ORDER: back up live, apply `20261017100000_me_dashboard_v2.sql` and `20261017110000_diet_implications.sql` (live then has 37 migrations), merge, then push an empty commit to re-run the Vercel preview (LESSONS section 9).** Merging first breaks `/recipes?diet=` (browse calls the new 3-argument `filtered_recipes`). Types are already regenerated.

- **Shipped:** Me dashboard v2 (behind `NEXT_PUBLIC_ENABLE_ME`): targets from pace x 7,700 kcal/kg with 1,200/1,500 floors and the maths shown, goal-aware goal days with an explainer page (`/me/how-goal-days`), goal weight and projected date, daily weigh-in (`me_weights`) with a 7-day-average SVG chart (30/90 days, weekly), check-ins (DB-stored snoozes), streaks, Monday weeks, muscle legend by weekly sets, workout-plans placeholder. Diet nesting in one place (`diet_satisfying`: pescatarian includes vegetarian and vegan), Google brand colour tokens, /about tap targets, code-health cleanup.
- **Checked boxes: none.** Me has no issue number and is verified only on a local stack with the flag on; it is not live.
- **Open from verification:** 28-day check-in age uses the UTC date of `updated_at`; projected date ignores a clamped (floor) target; two copy nits ("a 825", doubled "kg"); body-art credit link 41.7 px tall; Google flag accepts only `true`. Questions: `docs/review/2026-10-17-wave9-questions.md`.
- **Waves 10 and 11 are specified, not built:** `docs/research/wave10-micronutrients-plan.md`, `docs/research/wave11-settings-spec.md`.

### Waves 10 + 11 (2026-10-17): integrated on `w10/integration`, PR open, NOT applied to live

**Not on live yet. Ten new migrations (`20261017120000` to `190000`, live goes 37 to 47) must be applied BEFORE merging, then the seeds and a jit-off refresh, exactly as in `scripts/nutrition/LIVE-STEPS.md`.** Back up first. Code merged first gives 500s on `/settings`, signed-in `/recipes` and the Me panel.

- **Built:** USDA nutrition for every ingredient (about 10.4k foods incl. 2.2k branded, 1,979 canonical ingredients, 3,000 aliases), computed recipe nutrition with coverage, recipe label with %DV, Me all-nutrients panel, ingredient/brand type-ahead, `/settings` with default diet and allergen filters (cookie `minced_prefs`). Brands are foods linked to a canonical ingredient, never separate ingredients. Details: `docs/ARCHITECTURE.md` section 13, `docs/SCHEMA-NOTES.md` decisions 6 to 12.
- **Accuracy is honest, not great:** audits found food data faithful to USDA, but computed calories differ from published MyPlate by a median 12 percent. Labels say estimated. No BUILD-PLAN box checked.
- **Open:** your mapping review (CSVs listed in `docs/review/2026-10-17-wave10-11-questions.md`), M5.2, M3.7, M1.5.7.

### Wave 10c (2026-10-19): integrated on `w10c/integration`, carried on PR #58, NOT applied to live

**PR #58 now holds waves 10, 11 and 10c. Live has 37 migrations; the PR adds 22 (live goes to 59). Apply them, the seeds and the jit-off refresh exactly as in `scripts/nutrition/LIVE-STEPS.md` BEFORE merging (back up first), then push an empty commit to re-run the preview.** Code first gives 500s on `/settings`, `/pantry`, signed-in `/recipes`, recipe pages and Me.

- **Built:** nutrition math accuracy (strict forms, qualifiers, size words, stand-ins flagged), UK CoFID and Canada CNF foods (Open Government Licence, credited on `/about` and under the label), allergens split into 11 with optional-only handling and one `recipe_has_allergen()` predicate, every ingredient tagged, diet tagging complete, fridge account-only with `fridge_recipes_grouped` and one-tap add-missing, "Choose ingredients" hero, age-banded DRIs (`nutrient_dris`) and a sedentary baseline from weight + sex + birth year.
- **Audit numbers (final round):** MyPlate complete recipes (578) median kcal error 6.2%, 81.3% within 15%; all recipes counted from 90%+ of mass (848): median 8.7%, 66.9% within 15%. Food values match the FDC API (0 unexplained). Allergen and diet audit passed. No BUILD-PLAN box checked.
- **Open defects (fixes listed in `docs/review/2026-10-18-wave10c-questions.md`):** black beans should default to SR 175188 canned, CoFID/CNF import unfinished (245 ingredients still without a food), 5 gluten-free pasta links to wheat pasta, potato each-weight 230 g vs USDA 213 g, "uncooked" read as cooked on 3 pasta recipes, cauliflower "florets" counted as one floret, canned "drained and rinsed" weights.
- **Security glance:** no high findings. New tables have RLS on and reference tables are select-only; new functions are SECURITY INVOKER except `refresh_recipe_nutrients` (revoked from public) and `my_recipe_foods` (checks `auth.uid()` and ownership).

### Wave 12 (2026-10-22): integrated on `w12/integration`, PR open, NOT applied to live

**Not on live yet. One new migration must be applied BEFORE merging:** `20261022140000_me_day_log` (live goes 59 to 60), then the Wave 12 seeds, jit-off refresh, `ANALYZE`, `VACUUM (FULL, ANALYZE) recipes`, and the photo upload and seed, in the order in `scripts/nutrition/LIVE-STEPS.md` ("Wave 12: ORDERED LIVE STEPS"). Back up first. Never re-run `seed-nutrition-zzzzz-math-10c.sql` on live.

- **Shipped in the PR:** landing "Select filters" pop-up and warm fridge section; saved allergens always applied (only `showAllergens=1`, via a confirm dialog and for one search, lifts them); live nutrition preview in the recipe form; stand-in audit (declared stand-ins 305 to 33) and 1,901 brand foods; 155 new Minced originals (`in_review`, 12 new cuisines, 130 photos staged but not uploaded); Me for any day (edit, remove, "I trained", month tally).
- **Numbers after applying:** 1,112 recipes (published 619 complete / 335 partial / 3 unavailable; in review 77 / 78), 44 cuisines, 1,984 ingredients, 12,034 foods. MyPlate accuracy unchanged (median kcal error 6.0 percent on complete recipes).
- **Open:** time filters keep recipes with no time (652 of 957), M1.5.7 review plus the 155 new recipes, owner questions in `docs/review/2026-10-22-wave12-questions.md`, `NEXT_PUBLIC_ENABLE_ME` still off on live.
- **Next:** wave 13 redesign (`design/handoff-2026-10-22/README.md`), then domain, Google sign-in, custom SMTP and launch. Handoff for a new chat: `docs/HANDOFF.md`.

### Next up

1. **You:** read `docs/review/2026-10-18-wave10c-questions.md`, say "go" so Claude backs up live and applies migrations, seeds and refresh, then merge PR #58.
2. Small wave (10d): the open defects above (black beans, CoFID/CNF remainder, brand links, potato weight, "uncooked", florets, drained cans), plus the mapping review CSVs.
3. Recipe import qualifiers at the source, draft nutrition preview in the recipe form, wave 12 drop of `me_targets.sex/units`.
4. Owner setup: Google Cloud, Resend plus Porkbun DNS, Vercel env vars; then turn the flags on. Paste-a-blog import.
5. Post-MVP (end of BUILD-PLAN): workout plans and exercise library, SEO combo pages, food-science follow-ups.

### Wave 13 (2026-10-22): PR open on `w13/redesign`, no DB changes

Warmer auth copy, new fonts site-wide, and the photo-led landing (rotating hero of nutrition-complete dishes with static 1280/2560 px photos, green nav bar, two-column fridge section, tiles, recipe strip, dark coming-soon band and footer). **Next:** owner merges; owner runs the admin SQL for kevinpham4830@gmail.com (live DB access is blocked for Claude in auto mode); open decisions in `docs/review/2026-10-22-wave12-questions.md`; scroll-world "how the fridge works" is an idea awaiting art direction.

### Wave 14 (2026-10-23): integrated on `w14/integration`, PR open, NOT applied to live

**Not on live yet. Back up first, then follow "Wave 14: ORDERED LIVE STEPS" in `scripts/nutrition/LIVE-STEPS.md`: migration `20261023140000` (any time), the three seeds, the jit-off refresh, THEN merge, THEN `20261023110000_me_targets_drop_sex_units` (applying it before the merge hides saved Me targets on main). Live goes 60 to 62 migrations. `20261022140000_me_day_log` must already be on any database a flag-on Preview uses. Then push an empty commit to re-run the preview.**

- **Shipped:** Me fixes (eleven bugs, today shows "So far", `me_targets.sex`/`units` dropped, Settings is the single source), the time filter now hides recipes with no stated time, 22 more foods (1,548 of 1,984 ingredients have one; 436 named gaps), 26 new `in_review` recipes (20 NHS, 6 MyPlate rescues), warm fridge gate and auth emails, `/lab/hero` removed, cooking-effects research brief (proposal only). Me is on for Preview builds only.
- **Numbers after applying:** 1,138 recipes; published 625 complete / 329 partial / 3 unavailable; in review 91 / 90; MyPlate median calorie error 5.9 percent.
- **Checked boxes: none.** **Blocked:** do not approve the 20 NHS recipes until DHSC permission or a lawyer ruling (Healthier Families terms reserve all rights). Questions and review files: `docs/review/2026-10-23-wave14-questions.md`.
- **Next:** owner review, then domain, Google sign-in, custom SMTP and launch.

### Wave 15 (2026-10-23): launch readiness, PR open on `w15/integration`, NOT applied to live

**Three migrations must be applied BEFORE merging, in order:** `20261023200000_autosave_my_recipe`, `210000_rate_limit`, `220000_rate_limit_hardening` (live goes 62 to 65). Back up first with `bash scripts/backup/backup-live.sh --live pre-wave15`, then follow `scripts/nutrition/LIVE-STEPS.md` "Wave 15". Types are already regenerated. Code merged first is safe (autosave shows a retry message, the limiter fails open) but there is no limiting until the migrations are applied.

- **Shipped (no product features):** shared error boundaries and a warm 404, loading skeletons on every fetching route (not `/pantry`), per-page metadata and share cards (`/og`), Recipe JSON-LD, tighter robots, the domain check (`docs/setup/DOMAIN.md`), draft autosave for user recipes, Postgres rate limits on sign-up, log-in, reset and type-ahead, a live backup script, an `/accessibility` page, "Not medical advice" and "Report a problem" on recipes.
- **Checked box: M5.2 (#30) only** (its verifier passed). M6.1, M6.4, M6.6 are built but their verifiers found gaps, so they stay open. M6.5 stays open (real Lighthouse, real-phone pass, three watched users). M6.2 Sentry and M6.3 PostHog not started (new packages).
- **Open:** per-email rate limits are off until `SUPABASE_SECRET_KEY` is set on Vercel (owner call); recipe JSON-LD has no `image` on photo-less recipes; click through `/me` days and `/account` tabs on a preview (delete their `loading.tsx` if navigation sticks). Questions and owner steps: `docs/review/2026-10-23-wave15-questions.md`.
- **Idea logged:** workouts page connected to Me (log the day's workout, follow a multi-week plan with muscles hit and substitutions), under "v2 — Workout plans" in BUILD-PLAN.

**Operational note:** the Supabase project pauses after inactivity. Restore it and wait for `ACTIVE_HEALTHY` before pushing migrations, and before any deploy (the build queries the database).
