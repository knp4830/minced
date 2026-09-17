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

- Work **one milestone at a time**, from `docs/BUILD-PLAN.md`. One milestone = one branch = one PR. Do not start the next milestone until the current one is closed out.
- When I ask you to explain code, assume I'm early in my learning — explain the concept, not just the syntax.
- Add any new terminal or git command to `docs/TERMINAL-LOG.md`, including the failures.

### Closing out a milestone

A milestone is done when its **DoD (Definition of Done) is observably true** — not when the code is written. "I implemented search" is not done; "searching 'shakshuka' returns it in under 100ms" is done. If you can't demonstrate the DoD, the milestone is still open — say so rather than checking the box.

When the DoD is met, do these four things in order, without being asked:

1. **Check the box** in `docs/BUILD-PLAN.md` — change `### ☐ M3.5` to `### ☑ M3.5`. Never delete a checked box; this file is the project's memory.
2. **Append a LEARNING-LOG entry** in the format `docs/LEARNING-LOG.md` establishes: what we built, key files, how it works, why this way and what we rejected, new concepts, gotchas. Written for me in three months, who won't remember any of it.
3. **Update "Current status"** at the bottom of this file to the next milestone.
4. **Tell me the PR body to use**, including the line `Closes #<issue number>` — that keyword is what makes GitHub close the issue and move the board card automatically when the PR merges. Issue numbers are mapped in `docs/BUILD-PLAN.md` under "GitHub issue numbers". **Never omit it**: the link cannot be added retroactively once the PR is merged, and a PR that plainly does an issue's work is invisible to GitHub without the keyword.

Then stop. I review the diff and merge. Do not begin the next milestone in the same session.

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
- Database live with three migrations applied and **RLS enforced**. Six recipes seeded; `pnpm db:seed` is idempotent.
- `docs/SCHEMA-NOTES.md` is the schema's rationale — read it before changing the database.
- Typed clients in `src/lib/supabase/`; generated types in `src/types/database.ts`.
- **Renamed Mise → Minced** (2026-09-16). Migration comments, TERMINAL-LOG history and the `mise-mise14` Vercel URL still say "Mise" on purpose — see LEARNING-LOG "Interlude".

### Next up: Phase 1.5, M1.5.1 — canonical ingredients and aliases (issue #9)

The plan orders Phase 1.5 before Phase 2, deliberately: M2 and M3 are far easier to judge against 500 real recipes than against 6, and the pantry matcher is meaningless at the current catalog size.

The tables (`ingredients`, `ingredient_aliases`, `ingredient_allergens`) already exist from M1.2. M1.5.1 is about **populating** them at a scale where hand-checking stops working. Today's 30 ingredients were eyeballed in minutes; the target is a vocabulary that survives ~1,000 USDA recipes.

**Two decisions to make before writing code:**

1. **`ingredient-parser-nlp` is Python** (M1.5.2), but the stack is TypeScript on Vercel. Options: a local-only Python step in the import pipeline, a small hosted service, or a JS alternative. Affects how M1.5.3 is built.
2. **How aliases get built** — hand-curated (slow, exact) vs. derived from USDA naming (fast, noisy), probably a hybrid. This sets the catalog's quality floor.

**The thing to build alongside the vocabulary: a coverage metric.** Unresolved ingredients do not error — they silently shrink the match rate. Without a way to measure "what fraction of recipe lines resolved, and which ones didn't," there is no way to know whether M1.5.1 actually worked. Per CLAUDE.md's import rule, unresolved ingredients reject the recipe rather than warn, so the metric is also the import gate.

**Open question deferred from M1.4:** should an *optional* ingredient contribute its allergens to the recipe? Miso Mushroom Ramen derives `Egg` from its optional soft-boiled egg. Decide in M3.4 when the allergen filter is built; the data supports either.
