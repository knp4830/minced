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
- `design/Minced.dc.html` — the design mockup: 7 screens, real tokens, and 6 complete seed recipes in its `RECIPES` array. **This is the visual spec.** Read it before building any UI. (`design/support.js` is its runtime — open the HTML in a browser to view it.)

## Current status

**Phase 0 — Foundations: complete.** M0.1–M0.5 all closed.

- Live at **https://mise-mise14.vercel.app**; pushes to `main` redeploy automatically.
- Repo is **public**, and `main` is protected — every change goes through a PR, including yours.

**Phase 0 and Phase 1: complete.** M0.1–M0.5 and M1.1–M1.6 all closed.

- Live at **https://mise-mise14.vercel.app**. Repo public, `main` protected — every change goes through a PR.
- Database live with **seven** migrations applied and **RLS enforced**. `pnpm db:seed` is idempotent and seeds the ingredient vocabulary before the six mockup recipes; the USDA catalog is loaded separately by `scripts/myplate/import.sh`.
- `docs/SCHEMA-NOTES.md` is the schema's rationale — read it before changing the database.
- Typed clients in `src/lib/supabase/`; generated types in `src/types/database.ts`.
- **Renamed Mise → Minced** (2026-09-16). Migration comments, TERMINAL-LOG history and the `mise-mise14` Vercel URL still say "Mise" on purpose — see LEARNING-LOG "Interlude".

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

### Wave 2 (2026-10-09): integrated on `wave2/integration`, PR open, NOT yet applied to live

**Checked:** M3.1, M3.2, M3.3, M3.4, M3.5, M3.6, and M1.5.4 (under the user-approved reframed DoD: hand-calculation within 10%). **Phase 3 DoD passed** (a logged-out stranger on a phone finds a recipe through both doors). **M1.5.7 stays open** (500+ reviewed recipes and the 247 rejected recipes need your review).

- **Routes:** `/`, `/recipes` (browse + `?q=` search + filters), `/recipes/[slug]` (ISR, 3600 s), `/pantry`, `/about`, `/api/ingredients/suggest`. One `RecipeCard`/`RecipeList` and one URL filter contract (`src/lib/filters.ts`) serve both doors.
- **DB:** 4 new migrations (`20261009140000` photos, `20261010100000` families, `...100100` match filters, `...100200` search NULL semantics). Ingredient families are one hop deep. 11 new pantry staples (22 total). Unknown time, spice, calories and protein pass range filters and sort last.
- **Nutrition** is computed from USDA for the 106 non-MyPlate recipes (`scripts/nutrition/`). **Photos:** 99 (1 federal, 98 Wikimedia with attribution); the rest use the colour-block placeholder. AI-drafted recipes show a "Drafted with AI, reviewed by Minced" badge linking to `/about`.
- **Live steps pending** (in the PR body, in order): backup, migrations, `pnpm db:seed`, nutrition, photo upload, `seed-photos.sql`, the destructive duplicate merge (978 to 959), `VACUUM`, smoke tests. The Vercel preview reads the LIVE database, so pages needing new RPC arguments only fully work after those steps.

**Known issues carried forward:** `match_recipes` is 130-165 ms as `anon` (RLS runs `can_read_recipe()` per row) against a 200 ms budget; fix before ~1,500 recipes. `/pantry?pantry=<id above int4>` returns 500 (clamp ids). The pages list seven staples; the database has 22. `/shopping /login /privacy /terms` 404; header "Log in" is a dead link. Cuisine is NULL on about 742 recipes, so the cuisine filter hides them. Salmon and ramen now list non-staple rice and broth. Braised recipes compute high on kcal. Deleted duplicate slugs 404 (no redirects). Delete `/kitchen-sink` before launch.

### Next up: Wave 3, accounts (M4.1-M4.3) plus privacy and terms pages

**Blocked on you: buy a domain first.** Google OAuth will not verify a `vercel.app` host, and it needs a real homepage and privacy policy. Then: M4.1 Supabase Auth, M4.2 favorites, M4.3 account page, and `/privacy` and `/terms` (see `docs/LEGAL-COMPLIANCE.md`; the Vercel Hobby plan is non-commercial only).

**Operational note:** the Supabase project pauses after inactivity. Restore it and wait for `ACTIVE_HEALTHY` before pushing migrations.
