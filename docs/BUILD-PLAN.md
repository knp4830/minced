# Minced — Build Plan

> **What this file is:** the single source of truth for what gets built, in what order, and what "done" means for each piece.
> **How to use it:** work top to bottom. One milestone = one branch = one pull request = one Claude Code session. Check the box only when the Definition of Done is actually true.
> **Never delete a checked box.** This file is the project's memory.

## GitHub issue numbers

The address in this file (`M3.5`) maps to a GitHub issue number. Put `Closes #<number>` in every PR body — that keyword is the **only** thing that closes the issue and moves the board card. A PR that plainly does an issue's work is invisible to GitHub without it, and the link cannot be added retroactively once the PR is merged.

| Issue | Milestone | State |
|---|---|---|
| #1 | **M0.3** Scaffold Next.js app and deploy blank to Vercel | ☑ |
| #2 | **M0.4** Add CLAUDE.md and docs/ | ☑ |
| #3 | **M0.5** Enable branch protection on main | ☑ |
| #4 | **M1.1** Design schema and write SCHEMA-NOTES.md | ☑ |
| #5 | **M1.2** Supabase project and initial migration | ☑ |
| #6 | **M1.3** Row Level Security policies + test plan | ☑ |
| #7 | **M1.4** Seed script with the six mockup recipes | ☑ |
| #8 | **M1.6** Typed Supabase clients (server + browser) | ☑ |
| #9 | **M1.5.1** Canonical ingredients + alias table | ☐ |
| #10 | **M1.5.2** Ingredient parser (ingredient-parser-nlp) | ☐ |
| #11 | **M1.5.3** USDA MyPlate Kitchen bulk import | ☐ |
| #12 | **M1.5.4** USDA FoodData Central nutrition pipeline | ☐ |
| #13 | **M1.5.5** Recipe generation pipeline (Tier 2, Minced voice) | ☐ |
| #14 | **M1.5.6** Admin review queue at /admin/review | ☐ |
| #15 | **M1.5.7** Fill to 500+ and close pantry coverage gaps | ☐ |
| #16 | **M2.1** Extract Minced design tokens into globals.css | ☐ |
| #17 | **M2.2** Build UI primitives + /kitchen-sink route | ☐ |
| #18 | **M2.3** App shell: header, nav, footer, responsive | ☐ |
| #19 | **M3.1** Browse page with cursor-paginated recipe grid | ☐ |
| #20 | **M3.2** Recipe detail page with servings scaler | ☐ |
| #21 | **M3.3** PANTRY MATCHER — match_recipes RPC + autocomplete | ☐ |
| #22 | **M3.4** Conventional filters layered into match_recipes | ☐ |
| #23 | **M3.5** Postgres full-text search | ☐ |
| #24 | **M3.6** Landing page (pantry input above the fold) | ☐ |
| #25 | **M3.7** Programmatic /what-can-i-make/[combo] SEO pages | ☐ |
| #26 | **M4.1** Supabase Auth: email + Google, middleware, login/signup | ☐ |
| #27 | **M4.2** Favorites with optimistic updates | ☐ |
| #28 | **M4.3** Account page: Library / My Recipes / Settings | ☐ |
| #29 | **M5.1** Recipe form with dynamic ingredient and step rows | ☐ |
| #30 | **M5.2** Draft autosave and publish validation | ☐ |
| #31 | **M5.3** Edit and delete own recipes | ☐ |
| #32 | **M6.1** Error boundaries, not-found page, loading states | ☐ |
| #33 | **M6.2** Sentry error monitoring | ☐ |
| #34 | **M6.3** PostHog analytics on pantry queries and signups | ☐ |
| #35 | **M6.4** SEO: metadata, OG tags, sitemap, JSON-LD Recipe schema | ☐ |
| #36 | **M6.5** Pre-launch checklist and Lighthouse pass | ☐ |
| #37 | **M6.6** Custom domain | ☐ |

---

## How to read this document

**Milestone IDs — `M3.5`**

`M` = milestone, then the phase, then the position within that phase. `M3.5` is Phase 3, item 5. `M1.5.3` is Phase **1.5** (catalog fill, inserted between Phases 1 and 2), item 3.

It's an address, so the plan, the GitHub issues, and your branch names all point at the same thing:

```
docs/BUILD-PLAN.md   M3.5 — Search
GitHub issue         "M3.5 Postgres full-text search"
Branch               feat/m3-5-search
Commit               feat(search): weighted tsvector with trgm fallback
```

**Priority — `P0` through `P3`**

Standard industry convention. Counts *down* in importance — P0 outranks P1.

| Label | Means | Test |
|---|---|---|
| **P0** | Blocks launch | Ship without it and the product is broken or pointless |
| **P1** | Needed for a good launch | You'd ship without it, reluctantly |
| **P2** | Nice to have | Improves things, nothing breaks without it |
| **P3** | Post-launch | Real work, wrong time |

These are labels on the GitHub issues, so `gh issue list --label P0` answers "what's actually blocking launch."

**Other shorthand used here**

| Term | Means |
|---|---|
| **DoD** | Definition of Done — the observable condition that makes a milestone finished. Not "I wrote the code," but "this specific thing works when I try it." |
| **MVP** | Minimum Viable Product — the smallest version that proves the core idea works |
| **RLS** | Row Level Security — Postgres deciding, at the database level, which rows a given user may see or change |
| **RPC** | Remote Procedure Call — here, a Postgres function called from the app via `supabase.rpc()` |
| **WIP limit** | Work In Progress limit — the cap of one item in the board's `In progress` column |
| **Tier 1 / 2 / 3** | The three recipe-sourcing strategies in Phase 1.5, ordered by legal risk |

---

## The one-liner

**Minced tells you what to cook with what you already have.** You don't arrive knowing what you want — you arrive with chicken, half an onion, and no plan. Tell Minced what's in your kitchen and it shows you what you can actually make, ranked by how little you're missing. Every recipe is ingredients, amounts, and numbered steps. No essay.

*(Renamed from "Mise" — as in* mise en place *— in September 2026.)*

## Two doors, one catalog

People show up in one of two states, and Minced has to serve both:

| | **Door 1 — "I don't know what to make"** | **Door 2 — "I want cacio e pepe"** |
|---|---|---|
| They have | Ingredients, no plan | A dish in mind |
| They use | The pantry matcher | Search |
| Query shape | Set coverage — rank by what's missing | Text match — find the thing |
| Why it matters | **The differentiator.** Nobody else does this well | **Table stakes.** A recipe app that can't find a named recipe is broken |

**The pantry matcher is what makes Minced worth choosing. Search is what makes it worth keeping.** Both are P0. They share the same catalog, the same filters, and the same recipe pages — they're two entrances to one building, not two products.

The one place the distinction bites is the **landing page**: it leads with the pantry input, because that's the door nobody else offers, with search right beside it rather than buried. Someone who knows they want shakshuka can type it immediately; someone staring at a fridge gets the thing they actually needed.

## The core user flow (this is the MVP; everything else is a future feature)

**Entry — either door:**

1a. **Add the ingredients you have** → matches ranked by coverage, *"you have 7 of 8"* beating *"you have 3 of 11"*
1b. **Or search a dish, ingredient, or cuisine** → results ranked by relevance

**Then, identically from either door:**

2. Narrow with filters (time, macros, cookware, spice level, diet, allergens)
3. Open a recipe → ingredients + amounts + steps, nothing else
4. Favorite it → it's in your library next time
5. Write your own recipe → it saves to your account

If both doors and steps 2–5 work end to end, the MVP is done. Ship it.

**The pantry matcher deserves the most iteration** — it's novel, so there's no established pattern to copy and the ranking quality is a judgment call only you can make. Search is a well-understood problem with a known-good solution (Postgres full-text). Budget your *thinking* accordingly; both still ship in Phase 3.

## Scale target

**500+ recipes in the catalog at launch.** This is a stated requirement, not an aspiration, and it changes several decisions:

- **Browse must paginate or infinite-scroll.** Rendering 500 cards at once is a slow page and a bad phone experience. Page size 24, cursor-based.
- **Browsing stops being a viable entry point.** Nobody scrolls 21 pages of cards. At this size both real doors — the pantry matcher and search — become mandatory, not optional. Browse becomes a place you land after narrowing, not a way in.
- **Indexes are not a Phase 6 optimization.** They go into the initial migration. An unindexed filter query over 500 rows joined to ~4,000 ingredient rows is already slow enough to feel.
- **Static generation needs a strategy.** 500 prerendered pages at build time is fine (~2 min builds). 5,000 is not — at that point we switch to on-demand generation with caching. Building it right the first time means this is a config change later, not a rewrite.
- **Content sourcing becomes the critical path.** 500 hand-authored recipes is roughly 150+ hours of data entry. See `Phase 1.5`.

## The hard part is not the recipes — it's the ingredients

Pantry matching lives or dies on **ingredient normalization**, and this is the single most underestimated piece of work in the project.

A user types `green onions`. One recipe says `scallions`, another says `spring onion`, a third says `scallion, thinly sliced on the bias`. To a database those are four unrelated strings, and your match rate silently collapses.

So the schema needs a **canonical ingredient table with an alias table pointing at it**:

```
ingredients: id, canonical_name, category, is_pantry_staple, allergens[]
ingredient_aliases: alias, ingredient_id
recipe_ingredients: recipe_id, ingredient_id, quantity, unit, prep_note
```

Every recipe row points at a canonical ingredient id. Free text lives only in `prep_note` ("thinly sliced"), which never affects matching.

Two consequences worth internalizing now:

1. **A recipe whose ingredients failed to resolve to canonical ids is worse than no recipe** — it's invisible to matching but still clutters browse. Import must reject on unresolved ingredients, not warn.
2. **Pantry staples need a flag.** Nobody lists salt, pepper, water, or oil when describing their kitchen, and a recipe shouldn't be penalized for requiring them. `is_pantry_staple` excludes them from the "you're missing" count. Get this wrong and every match shows "you're missing 3 things" and the product feels broken.

## The "not building yet" list

Explicitly cut from v1. Writing these down is what lets us ship.

- Shopping list *(v1.1 — first thing after launch)*
- Nutrition/weight tracking, MyFitnessPal-style *(v1.2)*
- Workout plan catalog *(v2 — this is a second product, treat it as one)*
- Social features: comments, ratings, following, sharing
- Recipe photos uploaded by users (v1 uses a color-block placeholder system — the mockup already does this)
- Meal planning / calendars
- Mobile apps (the web app will be responsive; that's enough)
- Payments, subscriptions, anything monetized
- Admin dashboard beyond a seed script

---

## Tech stack (decided — see LEARNING-LOG Entry 00 for the reasoning)

| Layer | Choice | One-line why |
|---|---|---|
| Framework | **Next.js 15, App Router** | Recipe pages need to be indexed by Google; filtering needs to run server-side |
| Language | **TypeScript** | Catches the class of bug that wastes the most beginner hours |
| Styling | **Tailwind CSS v4** | The Minced mockup is already inline-styled; Tailwind is a direct translation |
| Components | **shadcn/ui** | Copy-paste, you own the code, restyle to Minced tokens |
| Database | **Postgres via Supabase** | Relational data (a recipe *has many* ingredients) and free tier |
| Auth | **Supabase Auth** | Same vendor as the DB, so row-level security "just works" |
| Hosting | **Vercel** | Made by the Next.js team; git-connected, zero config |
| Forms | **React Hook Form + Zod** | The recipe-creation form is the most complex UI in the app |
| Errors | **Sentry** | Free tier, catches what you can't reproduce locally |
| Analytics | **PostHog** | Free tier, tells you which filters people actually use |
| Nutrition data | **USDA FoodData Central** | Public domain, free, authoritative. The only recipe-adjacent dataset we can legally own |
| Ingredient parsing | **`ingredient-parser-nlp`** (Python) | Turns "2 cloves garlic, minced" into structured fields. MIT, ~95% accurate |

**Node 20+ and pnpm.** Package manager choice is not important; consistency is.

---

## Design system — extracted from `Minced.dc.html`

The mockup is the spec. These tokens go into `tailwind.config` / `globals.css` in Milestone 2.1 and nothing in the app uses a hex code outside that file.

| Token | Value | Used for |
|---|---|---|
| `--sage` | `#DFE2DB` | Page background |
| `--paper` | `#F1F3EE` | Cards, panels, the app frame |
| `--ink` | `#1C2420` | Body text, dark surfaces |
| `--brand` | `#2F4B3C` | Primary buttons, links, active states |
| `--gold` | `#E4B73F` | Accent, active-tab underline, spice dots |
| `--muted` | `#8C9A94` | Secondary text, meta labels |
| `--muted-light` | `#B9C2BC` | Text on dark surfaces |

| Type role | Family | Used for |
|---|---|---|
| Display | **Fraunces** (serif) | Logo, page headings, recipe titles |
| Body | **Public Sans** | Everything else |
| Mono | **IBM Plex Mono** | Uppercase micro-labels, quantities, times |

Screens already designed in the mockup: **Landing · Browse · Recipe Detail · Account · Create/Edit · Shopping List · Login/Signup**. Build them in that order of importance, not that order of appearance.

---

# PHASE 0 — Foundations

> **Time:** 1 day. **Goal:** an empty app deployed to a public URL. Nothing else.
> The rule from your build guide, and it's a real one: *if you can't deploy a blank app, you have an infrastructure problem, and it will only get harder to diagnose once there's code on top of it.*

### ☐ M0.1 — Accounts and tooling

Before any code. Check each off as you confirm it works.

- [ ] Node 20+ installed (`node -v`)
- [ ] pnpm installed (`npm i -g pnpm`)
- [ ] Git configured with your name/email (`git config --global user.name`)
- [ ] GitHub CLI installed and logged in (`gh auth status`)
- [ ] GitHub account
- [ ] Supabase account (free tier)
- [ ] Vercel account (sign in *with GitHub* — it makes deploys automatic)

### ☐ M0.2 — Repo and project board

Follow `GITHUB-SETUP.md` end to end. Done when: repo exists, board exists with all Phase 0–5 milestones as issues, and you can drag a card between columns.

**DoD:** `gh repo view` opens your repo. Project board has ≥20 issues in Backlog.

### ☑ M0.3 — Scaffold and deploy blank

**Claude Code prompt:**
```
Scaffold a new Next.js 15 app in this empty directory:
- App Router, TypeScript, Tailwind CSS v4, ESLint, src/ directory, @/* import alias
- pnpm as the package manager
- Do NOT add any features. I want the default starter page only.
Then create a .gitignore that covers .env*, .next, node_modules, and .vercel.
Explain what each top-level folder is for before you create anything.
```

Then, by hand (do this yourself once — it teaches you the deploy loop):
```bash
git add -A && git commit -m "chore: scaffold next.js app"
git push -u origin main
```
Import the repo at vercel.com/new → Deploy. Wait for the URL.

**DoD:** a public `*.vercel.app` URL loads the Next.js starter page. Pushing to `main` triggers a new deploy automatically.

### ☑ M0.4 — Project documentation in the repo

**Claude Code prompt:**
```
Create a CLAUDE.md in the repo root following the template in docs/BUILD-PLAN.md's
"CLAUDE.md contents" section. Fill the folder structure section with the real output
of `tree -L 3 -I node_modules`. Also create docs/ and move BUILD-PLAN.md,
LEARNING-LOG.md, and GITHUB-SETUP.md into it.
```

**DoD:** `CLAUDE.md` in root, three docs in `docs/`, committed and pushed.

### ☑ M0.5 — Branch protection

On GitHub: Settings → Branches → Add rule for `main` → require a pull request before merging.

**Why bother when you're solo?** Because it forces every change through a PR, which forces you to read your own diff before it ships. That single habit catches more bugs than any tool. It's also exactly how every professional team works.

**DoD:** pushing directly to `main` is rejected.

---

# PHASE 1 — Data model

> **Time:** 2–3 days. **Goal:** a database that can answer every filter question in the MVP.
> **This is the most important phase in the project.** UI is cheap to change; a schema with the wrong shape is expensive to change once there's data in it. Go slow here.

### ☑ M1.1 — Design the schema on paper first

Before writing SQL, answer these. Write the answers into `docs/SCHEMA-NOTES.md`.

- A recipe has *many* ingredients, each with a quantity and unit → that's a **join table**, not a text column. Why?
- "2 cloves garlic" — is `garlic` a row in an `ingredients` table shared across recipes, or free text on the recipe? (Answer: shared. Reason: you can't filter "recipes without nuts" on free text.)
- Nutrition: stored per recipe, or computed from ingredients? (Answer for v1: stored per recipe, computed later during import. Reason: computing correctly requires per-ingredient USDA data you don't have yet.)
- Cookware, diet tags, allergens, cuisine — one generic `tags` table or separate tables? (Discuss with Claude; there's a real tradeoff.)
- What does a *user's own* recipe look like? Same table with an `author_id`, or a separate table? (Answer: same table. Reason: one query powers browse, one detail page powers both.)

**Claude Code prompt:**
```
I'm designing the Postgres schema for Minced. Read docs/BUILD-PLAN.md for context.
Don't write SQL yet. Instead, walk me through the entity-relationship design as a
discussion: what tables, what columns, what relationships, and for each non-obvious
decision give me the two options and the tradeoff. Ask me questions where my answer
changes the design. I'm early in my learning — explain what a join table is and why
normalization matters, using the ingredients example.
```

**DoD:** `docs/SCHEMA-NOTES.md` exists with an ERD (mermaid diagram is fine) and a written rationale for each table.

### ☑ M1.2 — Supabase project + migrations

**Claude Code prompt:**
```
Set up Supabase for this project:
1. Add the supabase CLI as a dev dependency and run `supabase init`
2. Write the initial migration implementing the schema in docs/SCHEMA-NOTES.md
3. Add .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   (I'll paste the real values), and add .env.example with the keys but no values
Explain the difference between the anon key and the service role key, and why one is
safe in the browser and the other is never.
```

**DoD:** migration file committed; tables visible in the Supabase dashboard.

### ☑ M1.3 — Row Level Security

Do not skip this and do not defer it. RLS is Postgres deciding, at the database level, which rows a given user is allowed to see or change. Without it, your anon key — which is public, in the browser, by design — lets anyone read and write everything.

**Claude Code prompt:**
```
Write RLS policies for every table. Rules:
- Published recipes: readable by everyone, including logged-out users
- Draft recipes: readable only by their author
- A user can INSERT/UPDATE/DELETE only recipes where author_id = auth.uid()
- Favorites: a user can only see and modify their own rows
Explain each policy line by line, then write a test plan I can run in the Supabase
SQL editor to prove each policy actually blocks what it should.
```

**DoD:** RLS enabled on all tables; you have personally run the test plan and seen an unauthorized query fail.

### ☑ M1.4 — Seed data

The mockup already contains six complete, well-structured recipes: Gochujang-Glazed Salmon, Chana Masala, Cacio e Pepe, Shakshuka, Miso Mushroom Ramen, Harissa Roast Cauliflower. Free content — use it.

**Claude Code prompt:**
```
Read the RECIPES array in Minced.dc.html (the design mockup). Write a seed script at
supabase/seed.sql (or a TypeScript script, whichever you'd recommend and why) that
inserts all six recipes with their ingredients, quantities, units, nutrition rows,
cookware, diet tags, and allergens into our schema. Make it idempotent — I should be
able to run it twice without duplicates.
```

**DoD:** `pnpm db:seed` populates a fresh database with six complete recipes.

### ☑ M1.6 — Typed database client

**Claude Code prompt:**
```
Set up the Supabase client for Next.js App Router:
- Generate TypeScript types from the database schema, into src/types/database.ts
- Create a server client (src/lib/supabase/server.ts) and a browser client
  (src/lib/supabase/client.ts) using @supabase/ssr
- Add a pnpm script "db:types" that regenerates the types
Explain why the App Router needs two different clients and what breaks if I use the
wrong one.
```

**DoD:** you can write `const { data } = await supabase.from('recipes').select()` in a page and TypeScript autocompletes the column names.

---

# PHASE 1.5 — Filling the catalog

> **Time:** ~1 week of build + ongoing review. **Goal:** get from 6 recipes to 500+, legally and in Minced's voice.

This phase exists because 500 recipes is a *content* problem, not a code problem, and it is the single most likely thing to stall this project. A recipe with ingredients, quantities, units, steps, nutrition, cookware, allergens, and diet tags is roughly 15–20 minutes of careful entry by hand. 500 × 18 minutes ≈ **150 hours.**

## Sourcing — researched 2026-08-24, full details in LEARNING-LOG Entry 03

**There is no single API that hands you thousands of storable, ready-to-cook recipes.** Every large "free bulk recipe dataset" either has a non-commercial license or — worse — no stated license at all, which means it's an unlicensed copy of somebody's commercial site. The rate-limited APIs (Spoonacular, Edamam standard) cap caching at one hour regardless of what you pay.

So the catalog gets built in **three tiers, in this order**, each with a different risk profile:

### Tier 1 — Public domain, zero risk (~1,300–1,600 recipes)

This alone clears your 500+ floor with no licensing ambiguity whatsoever.

| Source | Count | Why it's clean | What you get |
|---|---|---|---|
| **USDA MyPlate Kitchen** | ~1,072 | US government work — public domain by statute | Structured ingredients, directions, **full USDA nutrition already attached**, servings, cook time |
| **Public Domain Recipes** ([publicdomainrecipes.com](https://publicdomainrecipes.com/)) | Low hundreds | Released under the Unlicense — contributors explicitly waive all ownership | Terse prose recipes, needs ingredient parsing |
| **USDA SNAP-Ed Recipe Finder** | Few hundred | US government work | PDF recipe cards, manual extraction required |

**Honest caveat on MyPlate:** these are federal nutrition-program recipes. They skew budget-conscious, family-sized, and plain — you will not find a gochujang glaze in there. For a pantry-matching tool that's *less* of a problem than it sounds, because breadth of everyday ingredients is what makes matching work. But it means Tier 1 alone gives you a functional catalog with a bland personality. Tiers 2 and 3 are where Minced gets a voice.

### Tier 2 — Original authored recipes (fills the personality gap)

LLM-drafted to a strict schema, in Minced's voice, reviewed by you. Nobody owns a technique or an ingredient list, so content you draft originally is unambiguously yours. This is where the cuisines and the interesting cooking come from.

### Tier 3 — Scrape-and-rewrite (scale beyond ~2,000)

`recipe-scrapers` (MIT, Python) reads the **schema.org Recipe markup** that 739+ recipe sites already publish for Google's benefit. The legal shape:

- **Facts are extractable**: ingredient lines, quantities, times, servings, yields. *Publications Int'l v. Meredith* (7th Cir. 1996) — an ingredient list is a statement of fact and carries no copyright.
- **Prose is not**: the instruction text is the site's creative expression. It gets **rewritten**, not stored.
- **Site terms are a separate question from copyright.** Check `robots.txt` and ToS per site. Some prohibit scraping contractually regardless of what copyright says. Skip those.

Defer this until Tiers 1 and 2 are exhausted. It's the highest-effort and highest-risk tier and you may never need it.

### Also worth one email

**[Edamam's data licensing product](https://developer.edamam.com/recipe-database-licensing)** — separate from their capped API — advertises 40,000+ licensed recipes with instructions and nutrition. No public pricing; it's a sales conversation. If they'll grant permanent storage in writing at a price you can stomach, it collapses Tier 3 entirely. Worth one email before building a scraper.

> **Not legal advice.** I'm not a lawyer. Tier 1 is genuinely risk-free — it's US government work. Tier 2 is risk-free because you author it. Tier 3 relies on a real and well-established principle that nonetheless has edges, and it carries separate contract-law risk from site terms. Build Tiers 1 and 2 first; revisit Tier 3 with actual legal input if you ever need it.

### ☐ M1.5.1 — Canonical ingredients and aliases **(do this first — everything depends on it)**

**Claude Code prompt:**
```
Build the canonical ingredient system described in docs/BUILD-PLAN.md under
"The hard part is not the recipes".
1. Migration for `ingredients` (canonical_name, category, is_pantry_staple,
   allergens[], usda_fdc_id) and `ingredient_aliases` (alias, ingredient_id),
   with a trigram index on alias for fuzzy autocomplete.
2. Seed ~400 common cooking ingredients with their real-world aliases —
   scallion/green onion/spring onion, cilantro/coriander/fresh coriander,
   eggplant/aubergine, garbanzo/chickpea, and so on. Mark salt, pepper, water,
   neutral oil, olive oil, butter, sugar, and flour as pantry staples.
3. A resolve(rawName) function: exact match, then alias, then trigram fuzzy
   above a confidence threshold, else return unresolved.
Explain pg_trgm and why fuzzy matching belongs in Postgres rather than in JS.
```

**DoD:** `resolve("green onions")`, `resolve("scallion")`, and `resolve("spring onion")` all return the same ingredient id.

### ☐ M1.5.2 — Ingredient parser service

`ingredient-parser-nlp` (Python, MIT, actively maintained, ~95% sentence accuracy) turns `"2 cloves garlic, minced"` into `{qty: 2, unit: "clove", name: "garlic", prep: "minced"}`.

**Claude Code prompt:**
```
Set up ingredient parsing for the import pipeline. Use the Python library
ingredient-parser-nlp (pip install ingredient-parser-nlp). Decide and justify:
a standalone Python script we run offline during import, or a small FastAPI
service the Node import script calls. I lean toward offline — argue me out of it
if you disagree.
Write it so it takes a JSON array of raw ingredient lines and returns structured
{quantity, unit, name, prep, comment} objects, plus a confidence score, flagging
low-confidence lines for manual review.
Explain what a sequence-labeling model is and why this problem needs one instead
of a regex.
```

### ☐ M1.5.3 — USDA MyPlate Kitchen bulk import **(this is your "large list of ready-to-make recipes")**

**Claude Code prompt:**
```
Build scripts/import-myplate.ts to import the USDA MyPlate Kitchen recipe
collection (~1,072 recipes, US government work, public domain).
First, investigate and tell me the best access route before writing the importer:
myplate.food's API wraps the collection but licenses bulk export separately —
the underlying USDA content is public domain, so check whether MyPlate Kitchen
itself offers a bulk export, a sitemap, or scrapeable schema.org markup. Report
what you find and recommend an approach before coding.
Then: for each recipe, map to our schema, run every ingredient line through the
parser and resolve() to canonical ids, and REJECT any recipe with unresolved
ingredients into a manual-fix queue rather than importing it broken.
Preserve the USDA nutrition values it already carries — do not recompute them.
Set source='usda_myplate' and source_url on every row for attribution.
Make it resumable: interrupting it must not lose progress or duplicate rows.
```

**DoD:** 800+ recipes imported with fully resolved canonical ingredients. Unresolved lines are in a queue with counts, so you can see which aliases to add next.

### ☐ M1.5.4 — USDA FoodData Central nutrition pipeline

**Claude Code prompt:**
```
Build nutrition computation using the USDA FoodData Central API (free key, 1000
req/hour, public domain data). Given a recipe's structured ingredients:
1. Fuzzy-match each ingredient name against /foods/search
2. Convert its quantity+unit to grams (needs a density/weight table for volume
   units like "1 cup flour" — handle this explicitly, don't hand-wave it)
3. Multiply by the food's per-100g nutrients, sum across the recipe, divide by servings
4. Cache every USDA lookup locally so we never re-request the same ingredient
Flag any recipe where an ingredient failed to match, so I can fix it by hand.
Explain where this will be inaccurate and how much that matters.
```

**DoD:** running it on the six seed recipes produces numbers within ~10% of the mockup's hand-written values.

### ☐ M1.5.5 — Recipe generation pipeline (Tier 2 — Minced's own voice)

A script that drafts structured recipes to a strict JSON schema — never free text — so output drops straight into the database.

**Claude Code prompt:**
```
Build scripts/generate-recipes.ts. It takes a brief (cuisine, meal type, constraints,
count) and produces recipes conforming to a Zod schema matching our DB: title, cuisine,
prep_time, servings, spice_level, cookware[], diet_tags[], allergens[], ingredients[]
with structured qty/unit/name, and steps[].
Hard rules for the generated content:
- Steps are imperative and functional. No headnotes, no anecdotes, no "this reminds
  me of." Match the voice of the six seed recipes exactly.
- Every step must contain a concrete cue: a time, a temperature, or a sensory signal
  ("until the edges char"). No step may be vague.
- Ingredients must be real, purchasable, and specific.
Output goes to status='pending_review', never straight to published.
Include a dedupe check against existing titles and ingredient signatures.
```

### ☐ M1.5.6 — Admin review queue

Everything lands in `pending_review` — imports included. Reviewing is ~1–2 minutes each rather than 18 minutes of typing, so 1,500 recipes is a few long weekends, not four months.

`/admin/review` — one recipe per screen, keyboard-driven: `J`/`K` to move, `A` to approve, `E` to edit inline, `X` to reject. Batch approve. Admin-gated by RLS. Show the resolved canonical ingredients prominently, since a bad resolve is the failure mode that actually hurts matching.

### ☐ M1.5.7 — Fill to 500+ and close coverage gaps

Tier 1 gets you to roughly 1,300. Tier 2 fills what Tier 1 is bad at: interesting cuisines, bold flavors, anything a federal nutrition program wouldn't publish. Generate in themed batches of ~25 (weeknight pasta, sheet-pan dinners, Korean, vegan high-protein, 15-minute breakfasts, one-pot).

**Coverage for a pantry-matching app means something different than for a search app.** You're not asking "do I have enough Thai recipes." You're asking: *given a realistic pantry, does the app return something good?* Build a test harness of 20 plausible pantries — the broke-student pantry, the chicken-rice-broccoli pantry, the vegetarian pantry, the nearly-empty fridge — and assert every one returns at least 10 strong matches. Empty results on a realistic pantry is the bug that kills this product.

**DoD for Phase 1.5:** 500+ published recipes (target ~1,500). All 20 test pantries return 10+ matches. Every recipe's ingredients resolve to canonical ids. You have personally reviewed every one.

---

# PHASE 2 — Design system

> **Time:** 2–3 days. **Goal:** the Minced look, as reusable pieces. No pages yet.

### ☐ M2.1 — Tokens

**Claude Code prompt:**
```
Read Minced.dc.html and extract the design system into Tailwind v4 CSS variables in
src/app/globals.css: the color tokens, the three Google Fonts (Fraunces, Public Sans,
IBM Plex Mono) loaded via next/font, border radii, and shadow values.
Rule going forward: no raw hex codes anywhere except globals.css.
Explain how Tailwind v4's @theme directive differs from the v3 config file.
```

### ☐ M2.2 — Primitives

Build these, in this order, each with a small demo on a `/kitchen-sink` route you delete before launch:

- [ ] `Button` (primary / secondary / ghost)
- [ ] `Card`
- [ ] `Chip` (filter pills, diet tags — including a selected state)
- [ ] `Input`, `Select`, `Textarea`
- [ ] `SpiceDots` (the 4-dot spice indicator from the mockup)
- [ ] `MetaRow` (the mono-font time / servings / calories / cost line)

**Claude Code prompt:**
```
Install shadcn/ui and restyle Button, Card, Input, Select, and Textarea to match the
Minced tokens. Then build SpiceDots, Chip, and MetaRow as custom components matching the
mockup exactly. Put a demo of every variant on /kitchen-sink.
For each component, explain the prop design choices — especially why variants are
better as a prop than as separate components.
```

### ☐ M2.3 — App shell

Header, nav, footer, mobile breakpoints. Matches the mockup's landing nav.

**DoD for Phase 2:** `/kitchen-sink` shows every primitive, in both desktop and mobile widths, and it looks like the mockup.

---

# PHASE 3 — The core loop

> **Time:** 2–3 weeks. **Goal:** the six-step user flow, working, ugly edge cases and all.
> This is the spine. Everything before was setup; everything after is addition. M3.3 is the single most important milestone in this document.

### ☐ M3.1 — Browse page (server-rendered grid, paginated)
`/recipes` — fetch recipes on the server, render `RecipeCard` grid. No filters yet.

**Paginate from day one.** 24 per page, cursor-based (`?cursor=`), not offset-based. Offset pagination (`LIMIT 24 OFFSET 480`) makes Postgres scan and discard 480 rows to reach page 21; cursor pagination (`WHERE created_at < $cursor`) uses the index and stays fast at any depth. Retrofitting this later means changing the query, the URL shape, and the UI at once.

### ☐ M3.2 — Recipe detail page
`/recipes/[slug]` — ingredients grouped by category, numbered steps, nutrition table, notes. Plus the **servings scaler** (the mockup has one — quantities recompute live). Generate static params so recipe pages are prerendered.

### ☐ M3.3 — **The pantry matcher** ← this is the product

Everything else in this plan is table stakes. This is the reason Minced exists, so it gets the most care and the most iteration.

**The query.** Given a set of ingredient ids the user has, rank recipes by coverage. This is a set-containment problem and it belongs in a Postgres function (RPC), not in application code — the ranking math has to happen next to the data.

```sql
-- sketch, not final: rank by how little you're missing
select r.id, r.title,
       count(*) filter (where ri.ingredient_id = any($1)) as have,
       count(*) filter (where not i.is_pantry_staple)      as needed,
       array_agg(i.canonical_name) filter (
         where ri.ingredient_id <> all($1) and not i.is_pantry_staple
       ) as missing
from recipes r
join recipe_ingredients ri on ri.recipe_id = r.id
join ingredients i on i.id = ri.ingredient_id
where r.status = 'published'
group by r.id
having count(*) filter (
  where ri.ingredient_id <> all($1) and not i.is_pantry_staple
) <= $2                                   -- max missing, user-controlled
order by (have::float / nullif(needed,0)) desc, r.prep_time asc;
```

**Claude Code prompt:**
```
Build the pantry matcher — the core feature of Minced. Read the sketch in
docs/BUILD-PLAN.md M3.3 first, then improve on it; it's a starting point, not a spec.

Requirements:
- A Postgres function match_recipes(pantry_ids, max_missing, filters...) called via
  supabase.rpc(). All ranking happens in SQL.
- Pantry staples (salt, oil, pepper, water) never count as "missing"
- Results return: coverage ratio, the list of what's missing, and total missing count
- Rank by coverage first, then shorter prep time as a tiebreak
- A "use it up" mode: user marks an ingredient as must-use (leftover cilantro), and
  only recipes containing it are returned
- Pantry state lives in the URL so a pantry is shareable and the back button works,
  AND in localStorage so it survives a refresh for logged-out users
- The ingredient input is a fast trigram-backed autocomplete over canonical names
  and aliases. Typing "green oni" must offer "scallion".

Explain: why an RPC instead of building this query in TypeScript; how the SQL ranking
works line by line; and what the performance characteristics are at 1,500 recipes
with ~12,000 recipe_ingredient rows. Show me the EXPLAIN ANALYZE output and tell me
which indexes are doing the work.
```

**Iterate on this one.** Build it, then load ten realistic pantries and read the results yourself. Is the top result something you'd actually cook? That judgment can't be automated and it's what makes the product good or mediocre.

**DoD:** enter chicken, rice, onion, garlic, soy sauce → get sensible recipes ranked by coverage, in under 200ms, with an accurate "you're missing: scallion, sesame oil."

### ☐ M3.4 — Conventional filters, layered on top
Time, macros, cookware, spice, diet, allergens. Same URL-state pattern, applied as additional `WHERE` clauses inside the same RPC — not as a second query.

**Claude Code prompt:**
```
Extend match_recipes with the remaining filters: max prep time, cuisine, diet tags,
exclude allergens, cookware, spice level, macro ranges (calories, protein, carbs, fat).
All filter state in URL search params via nuqs. All filtering inside the existing RPC,
never a second query and never in JavaScript.
Explain the "exclude recipes containing any of these allergens" case — it's a NOT EXISTS
correlated subquery and it's the one people get wrong.
```

### ☐ M3.5 — Search **(P0 — Door 2)**

A recipe app that can't find a recipe by name is broken. This ships with the MVP.

**Claude Code prompt:**
```
Build search for Minced using Postgres full-text search.
- A generated tsvector column on recipes combining title (weight A), canonical
  ingredient names (weight B), and cuisine + diet tags (weight C), with a GIN index
- Rank with ts_rank so title matches beat ingredient matches
- Handle the realistic failure cases: typos ("shakshuka" vs "shakshouka"), plurals,
  and partial words. Use pg_trgm similarity as a fallback when full-text returns
  nothing, and tell me the tradeoff you're making
- Search state in URL search params (/recipes?q=...), sharable and back-button safe
- Search composes with the SAME filters as the pantry matcher — searching "pasta"
  then filtering to under 20 minutes must work
- Results reuse the same RecipeCard as everywhere else

Explain what a tsvector is, what the weights do, why a GIN index is the right index
type here, and at what catalog size Postgres full-text would stop being enough.
```

**DoD:** searching "cacio", "shakshuka", "chickpea", and "korean" each return sensible ranked results in under 100ms. A typo still finds the dish.

### ☐ M3.6 — Landing page

Build it last — it's marketing for the thing, and you can't market a thing that doesn't exist yet.

**Both doors, above the fold.** The pantry input leads, because that's the entrance nobody else offers and it's what someone with no plan actually needs. The search box sits right beside it, not buried in a nav menu — someone who arrives knowing they want shakshuka should be able to type it in the first second.

Don't make the two feel like separate modes with a toggle. They're two inputs to the same catalog, and the results page is the same page either way.

### ☐ M3.7 — Programmatic ingredient landing pages **(the growth engine)**

Generate a server-rendered page for every high-value ingredient combination: `/what-can-i-make/chicken-rice-broccoli`, `/what-can-i-make/eggs-spinach`, and so on.

**Why this matters more than anything else in Phase 6's SEO checklist:** "what can I make with chicken and rice" is a query people type thousands of times a day, and it maps *exactly* onto what your app does. Each page is a real answer to a real question, prerendered, indexable. A few hundred of these is a compounding acquisition channel that costs nothing to run.

**Claude Code prompt:**
```
Build /what-can-i-make/[combo] as a statically generated route.
- generateStaticParams produces pages for the top ~300 ingredient combinations
  (pairs and triples of the most common pantry ingredients, ranked by how many
  recipes they unlock)
- Each page server-renders the matching recipes using match_recipes, with a real
  H1 ("What can I make with chicken, rice, and broccoli?") and an intro line
- Each page has a CTA into the full pantry matcher, prefilled with those ingredients
- Proper metadata, canonical URLs, and ItemList JSON-LD
Explain generateStaticParams, ISR, and how to keep build times sane if this grows
to thousands of pages.
```

**DoD for Phase 3 — both doors work:**

1. A stranger types four things from their fridge, gets recipes ranked by what they're missing, opens one, and cooks it.
2. A stranger types "shakshuka", finds it, opens it, and cooks it.

Logged out. On a phone. Under 200ms per query.

---

# PHASE 4 — Accounts

> **Time:** 3–5 days.

### ☐ M4.1 — Supabase Auth (email/password + Google OAuth)
Middleware for session refresh, `/login` and `/signup` matching the mockup, protected routes.

### ☐ M4.2 — Favorites
The heart button on cards and detail pages. Use an **optimistic update** — the heart fills instantly, and reverts if the server rejects it.

### ☐ M4.3 — Account page
`/account` with the tabs from the mockup: Library (favorites), My Recipes, Settings.

---

# PHASE 5 — User-created recipes

> **Time:** 1 week. The most complex UI in the app.

### ☐ M5.1 — Recipe form
Dynamic ingredient rows (add/remove/reorder), dynamic step rows, all the metadata fields. React Hook Form + Zod for validation.

### ☐ M5.2 — Draft / publish
Autosave to draft. Publishing runs validation: at minimum a title, one ingredient, one step.

### ☐ M5.3 — Edit and delete
Same form, prefilled. Delete with a confirm dialog.

**DoD for Phase 5:** you can write, save, publish, edit, and delete your own recipe, and it appears in browse alongside the seeded ones.

---

# PHASE 6 — Ship

> **Time:** 2–3 days.

- [ ] Error boundaries + a `not-found.tsx` that matches the design
- [ ] Loading states (`loading.tsx`, skeletons) on every route that fetches
- [ ] Sentry installed, error verified in the dashboard
- [ ] PostHog installed, tracking: filter usage, recipe views, signups, recipe creations
- [ ] Metadata + Open Graph tags + `sitemap.ts` + `robots.ts`
- [ ] **JSON-LD `Recipe` structured data** on every detail page — this is what puts you in Google's recipe carousel with the photo and star rating. It's a competitive advantage most small recipe sites skip.
- [ ] Lighthouse ≥ 90 on performance and accessibility
- [ ] Every env var set in Vercel production, not just `.env.local`
- [ ] `/kitchen-sink` route deleted
- [ ] Custom domain
- [ ] Tested on a real phone, not just devtools
- [ ] 3 real people used it while you watched silently

---

# PHASE 7+ — Post-launch (the features you listed)

Do not start these until real users have used the MVP. Order is deliberate.

### v1.1 — Shopping list
Already designed in the mockup. `shopping_list_items` table, "Add all ingredients" button on the recipe page, merge duplicates across recipes (2 cloves garlic + 3 cloves garlic = 5), group by aisle category.

### v1.2 — Nutrition tracking
`weight_logs` and `food_logs` tables. TDEE calculator (Mifflin-St Jeor). Daily macro targets vs. actuals. **This one has a real dependency:** it needs per-ingredient nutrition data, which means the USDA FoodData Central integration — build that first, and it retroactively improves recipe nutrition accuracy too.

### v1.3 — API-assisted recipe import
Admin-only tool that pulls from a recipe API, normalizes it into the Minced schema, and puts it in a review queue you approve by hand. Check the licensing terms of whichever API before storing anything.

### v1.4 — Weekly meal planner **(the ambitious one)**

> Added 2026-08-27 at Kevin's request. Flagged up front: **this is the hardest feature in the entire plan.** It is here so the data model doesn't accidentally rule it out — see the dependencies below.

**What the user asks for:** "Plan my week." They get seven dinners, one shopping list, and a total cost — chosen so that the ingredients bought get *used up* rather than half a bunch of cilantro rotting in the drawer, kept as cheap as possible, and hitting a goal they set (a calorie target, a protein floor, "vegetarian", "under $60").

**Why it's hard, stated honestly.** This is not a query. It's a *constrained optimisation* problem, and a known-hard one:

- **Maximise ingredient reuse** — choosing 7 recipes whose ingredient sets overlap heavily. This is a form of *maximum coverage*; picking the best subset is NP-hard, so at 1,500 recipes you cannot check every combination (1,500 choose 7 is about 10^18).
- **Minimise cost** — but cost is per *package purchased*, not per gram used. Buying a bunch of cilantro to use 2 tbsp charges you for the bunch. So the objective has to price **what you buy**, not what the recipe consumes — and that's precisely what creates the reuse incentive.
- **Minimise waste** — leftover quantity across the week, which is the same computation viewed from the other side.
- **Hit the goal** — nutrition targets as constraints, not preferences.

Four objectives that trade against each other. Cheapest and least-wasteful is seven variations of rice and beans, which nobody will cook. **Variety has to be an explicit constraint**, or the optimiser will produce a technically-optimal plan that's inedible in practice.

**The approach when we get there:** a greedy seed (pick the highest-scoring recipe, then repeatedly add the recipe with the best marginal score given what's already in the basket) followed by local search (swap one recipe at a time, keep improvements). Greedy alone is decent here; maximum-coverage has a known ~63% guarantee for greedy, and the local-search pass closes much of the rest. **Do not attempt exact optimisation.** Being 90% as good and instant beats optimal and 40 seconds.

**Hard dependencies — this cannot start before all four exist:**

| Needs | From | Why |
|---|---|---|
| Canonical ingredients | M1.5.1 | Overlap is meaningless if `scallion` and `green onion` are different rows |
| Unit conversion | M1.1 `units` table | Can't sum 2 tbsp + 1 tsp without a common base |
| Per-ingredient prices **and package sizes** | **new — doesn't exist yet** | The objective prices packages bought, not grams used |
| Per-ingredient nutrition | v1.2 / M1.5.4 | Goal constraints need per-ingredient USDA data |

**New tables it will need:** `ingredient_packages` (ingredient_id, package_size, unit, price, retailer, updated_at), `meal_plans` (user_id, week_of, goal_json, total_cost), `meal_plan_recipes` (plan_id, recipe_id, day, servings).

The price data is the real blocker, and it is a *data acquisition* problem, not a coding one — grocery prices are regional, change weekly, and no free clean national source exists. Start with a single-region static price table you populate by hand for the ~200 most common ingredients. That is enough to prove the optimiser works, and it degrades honestly: without prices, the feature can still optimise for reuse and waste alone.

**DoD:** given "7 dinners, vegetarian, ≥100g protein/day, under $70", returns a plan whose shopping list has fewer distinct ingredients than 7 randomly chosen recipes would, with a total cost under the cap, in under 3 seconds — and you'd actually cook all seven.

---

### v2 — Workout plans
Genuinely a second product: `exercises`, `workout_plans`, `plan_days`, `plan_exercises`, equipment-based substitution. Scope it as its own build plan when you get there. Don't let it creep into v1.

---

## CLAUDE.md contents

Create this in the repo root at M0.4. Keep it under one page — it's read at the start of every session, and a long one dilutes the important parts.

```markdown
# Minced

## What this is
A recipe web app for people who want the recipe, not the essay. Ingredients,
amounts, steps. Filterable by time, macros, ingredients, cookware, and diet.

## Tech stack
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Supabase (Postgres + Auth + RLS)
- Vercel hosting
- React Hook Form + Zod for forms

## Folder structure
[paste `tree -L 3 -I node_modules` output]

## Conventions
- Server Components by default. Add "use client" only when you need state,
  effects, or browser APIs — and push it as far down the tree as possible.
- Data fetching happens in Server Components or Server Actions, never in
  useEffect.
- Named exports only, no default exports (except Next.js pages/layouts,
  which require default).
- Components PascalCase, functions and files camelCase, DB columns snake_case.
- All colors come from CSS variables in globals.css. No raw hex codes.
- Filter and search state lives in URL search params, never useState.
- Every database query goes through src/lib/queries/ — no inline Supabase
  calls in components.

## Do NOT
- Do not install packages without asking me first.
- Do not modify files in supabase/migrations/ — write a new migration instead.
- Do not disable or weaken an RLS policy.
- Do not use the service role key anywhere in client-side code.
- Do not fetch all recipes and filter in JavaScript. Filter in Postgres.
- Do not add features that aren't in the current milestone in docs/BUILD-PLAN.md.

## Working agreement
- After completing a milestone, append an entry to docs/LEARNING-LOG.md
  explaining what was built and why, in the format that file establishes.
- Check the milestone's box in docs/BUILD-PLAN.md.

## Current status
Building [milestone number and name].
```

---

## How to run a session (the discipline that makes this work)

The single biggest difference between "AI wrote my codebase and I don't understand it" and "I built this with AI's help" is scope per session.

1. Pick **one** unchecked milestone.
2. `git checkout -b feat/m3-3-filters`
3. Open Claude Code. Paste the milestone's prompt from this file.
4. **Read the diff before accepting it.** If you don't understand a chunk, ask: *"Explain lines 40–70 of this file to me — what is it doing and why did you write it that way?"* This is the whole point.
5. Run it. Click through it yourself.
6. Ask for the learning-log entry.
7. Commit with a conventional message: `feat(filters): url-driven server-side filtering`
8. `gh pr create` → read your own diff on GitHub → merge.
9. Check the box here. Move the card on the board.

**When Claude gets it wrong** — and it will — don't ask it to "fix it." Tell it what you observed: *"When I select two cuisines, the results are empty. I expected recipes from either cuisine."* Symptoms produce better fixes than instructions.

---

## Agents — what they are and which ones this project wants

*Fuller explanation in LEARNING-LOG Entry 01. Short version here.*

A **subagent** is a separate Claude instance with its own context window, its own system prompt, and its own restricted tool access. You define one as a markdown file in `.claude/agents/`. The main session hands it a task; it works in isolation and reports back a summary.

Two reasons that's useful rather than just a novelty:

1. **Context isolation.** A code review that reads 40 files would flood your main session's context with detail you don't need. Run it as an agent and only the verdict comes back.
2. **Enforced specialization.** An agent with a narrow system prompt and read-only tools behaves differently from a general assistant told "please be careful." Constraints in the prompt are stronger than instructions in a message.

Agents we'll create, and when:

| Agent | Created at | What it does | Tools |
|---|---|---|---|
| `code-explainer` | Phase 0 | Reads a diff and writes the LEARNING-LOG entry. The agent that makes this project a learning project. | Read, Grep, Glob, Write |
| `schema-guardian` | Phase 1 | Reviews any DB migration for missing indexes, absent RLS, unsafe defaults, and destructive operations. | Read, Grep, Bash (read-only) |
| `design-checker` | Phase 2 | Diffs new UI against the Minced mockup and the token list. Flags raw hex codes and off-scale spacing. | Read, Grep, Glob |
| `perf-auditor` | Phase 6 | Hunts N+1 queries, missing indexes, oversized client bundles, unnecessary `"use client"`. | Read, Grep, Bash |

We write these when the phase that needs them arrives — an agent written before you understand the problem it solves is an agent you can't evaluate.
