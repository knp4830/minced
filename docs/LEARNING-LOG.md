# Minced — Learning Log

> **What this file is:** the "why" companion to the codebase. `BUILD-PLAN.md` says what to build; this says what each piece is and why it's shaped that way.
> **Rule:** every milestone gets an entry, appended when the PR merges. Written for you-in-three-months, who will not remember any of this.

### Entry format

```markdown
## Entry NN — [Title]
**Milestone:** M#.# · **Merged:** YYYY-MM-DD · **PR:** #NN

### What we built
### Key files
### How it works
### Why this way (and what we rejected)
### New concepts
### Gotchas
```

---

## Entry 00 — Why this stack

**Milestone:** Pre-build · **Date:** 2026-08-24

### The decisions

Five choices were made before writing a line of code. Each one closed off alternatives, so here's what each buys and what it costs.

---

### 1. Next.js 15 (App Router) instead of React + Vite

Your build guide recommended React + Vite, which is a good default. Recipe apps are the specific case where it isn't.

**What Vite gives you** is a *single-page application*. The browser downloads one nearly-empty HTML file plus a bundle of JavaScript, and JavaScript builds the entire page in the browser after arriving.

**Two problems that creates for Minced:**

**Problem 1 — Google can't see your recipes.** Search crawlers do run JavaScript now, but slowly, inconsistently, and with lower priority. For most apps that's survivable. For a recipe site it's fatal, because search *is* the distribution channel. Nobody opens a recipe app and browses; they type "quick vegan dinner no nuts" into Google. If your recipe pages aren't in that index, the app might as well not exist.

**Problem 2 — the blank-page tax on first load.** An SPA's first request returns an empty shell. The browser then has to download the JS bundle, execute it, *then* ask Supabase for the recipe, *then* render. On a phone on cell data that's a spinner for a second or more, on every cold visit. With 500+ recipes, most visits are cold visits — someone arriving from Google at one recipe they've never seen. That first second is where people leave.

**What Next.js changes:** components render on the *server* by default. The server queries Postgres, renders finished HTML, and sends that. The browser receives a complete page — Google sees real text, and a human sees the recipe immediately instead of a spinner.

#### A correction to an earlier version of this entry

The first draft of this doc claimed a Vite SPA would have to "download all recipes and filter them in JavaScript." **That was wrong**, and it's worth understanding why, because the correction teaches something real.

Supabase exposes your Postgres database over a REST API. A browser can send it a filtered query directly:

```js
supabase.from('recipes').select('*').lte('prep_time', 30).gte('protein_g', 30)
```

Postgres does the filtering and returns only the matches. **That works identically from a Vite SPA and from Next.js.** Server-side filtering is a property of the *database*, not of the frontend framework. So "Vite can't handle 500 recipes" is not true, and I shouldn't have implied it.

The real, surviving arguments for Next.js are narrower but still decisive for this specific app: **search indexing** and **first paint**. Keep the distinction — knowing precisely which layer solves which problem is most of what architecture skill is.

**The cost, honestly:** you now have two kinds of components and have to know which is which.

| | Server Component (default) | Client Component (`"use client"`) |
|---|---|---|
| Runs where | Server only | Server once, then browser |
| Can do | `await` database queries, read env secrets | `useState`, `onClick`, `useEffect`, browser APIs |
| Cannot do | Any interactivity or hooks | Touch the database directly |
| Ships to browser | No JS at all | Its JS, in the bundle |

The rule we'll follow: **server by default, and push `"use client"` as far down the tree as it will go.** A recipe page is a Server Component; the little favorite-heart button inside it is a Client Component. The page's data never enters the JS bundle.

This confuses everyone at first. That's expected, not a sign you're behind.

---

### 2. TypeScript instead of JavaScript

TypeScript is JavaScript plus type annotations, checked before the code runs.

```js
// JavaScript — this is a bug, and you find it at runtime, in production
recipe.prepTime  // undefined. The column is called prep_time.
```
```ts
// TypeScript — red squiggle in VSCode, immediately
recipe.prepTime
// Property 'prepTime' does not exist. Did you mean 'prep_time'?
```

For a database-heavy app this is worth more than usual, because Supabase can **generate** types directly from your actual schema. Rename a column in a migration, regenerate, and every place in the app that used the old name lights up red. Without that, you find those spots one production error at a time.

It costs you some friction early — errors that feel pedantic. Nearly all of them are real bugs you'd otherwise meet later, at a worse moment.

---

### 3. Postgres (via Supabase) instead of Firebase or MongoDB

Minced's data is deeply **relational**. A recipe has many ingredients; each ingredient appears in many recipes; each pairing has its own quantity and unit. That's a textbook many-to-many relationship, and it's exactly what SQL databases were built for.

Every filter you want is a SQL query that Postgres answers efficiently:

```sql
-- "under 30 min, over 30g protein, no nuts, needs only a skillet"
select r.* from recipes r
join nutrition n on n.recipe_id = r.id
where r.prep_time <= 30
  and n.protein_g >= 30
  and not exists (
    select 1 from recipe_ingredients ri
    join ingredients i on i.id = ri.ingredient_id
    where ri.recipe_id = r.id and 'nuts' = any(i.allergens)
  )
  and r.cookware <@ array['skillet'];
```

In Firebase (a document database) that query is either impossible or requires you to duplicate data into pre-computed shapes for each filter combination — and combinatorial filters are precisely the case document databases handle worst.

**Supabase** is managed Postgres with auth, storage, and auto-generated APIs bolted on. You get a real SQL database plus the convenience layer, and no vendor lock-in on the part that matters: it's standard Postgres, so you can take a dump of it and move anywhere.

---

### 4. Tailwind CSS + shadcn/ui

Tailwind is utility classes — `className="flex items-center gap-3 rounded-lg"` — instead of writing separate CSS files.

The pragmatic reason here: **your Minced mockup is already written in inline styles.** Translating `style="display:flex;align-items:center;gap:10px"` into `className="flex items-center gap-2.5"` is nearly mechanical. Rebuilding it as hand-written CSS would be a translation, not a transcription.

The structural reason: Tailwind's design tokens are defined in one place. When we put the Minced palette into `globals.css`, `bg-brand` means `#2F4B3C` everywhere, forever, and changing it in one file changes it app-wide. Consistency stops depending on you remembering the hex code.

**shadcn/ui** is unusual and worth understanding: it is *not* a package you install and import from. It's a CLI that **copies component source files into your repo**. You own them. You edit them. There's no library version to fight with when you want a button to look slightly different. For a project where the design is already decided and specific, that ownership matters.

---

### 5. Vercel

Made by the same company as Next.js, so features land there first and there is no configuration step. Connect the GitHub repo once: every push to `main` deploys to production, every pull request gets its own preview URL. That preview-per-PR is genuinely useful — you can look at the change on a real URL, on your phone, before merging it.

Free tier covers far more traffic than a launching app sees.

---

### The meta-lesson

None of these are the newest or most interesting options available in 2026. That's deliberate, and it's the golden rule from your own build guide: **use the boring stack.** When you hit a problem at 1am — and you will — you want the version of the problem that ten thousand people have already had and answered on Stack Overflow. Novel tools mean novel problems, and novel problems mean you're the one who has to solve them.

Save the interesting technology for when the product is proven and the problem is real.

---

## Entry 01 — Agents, and how we'll use them

**Milestone:** Pre-build · **Date:** 2026-08-24

You asked about agents. Here's the honest picture: most of what people call "agents" you don't need, and two things you do.

### The vocabulary, sorted out

Four terms get used interchangeably and mean different things:

| Term | What it actually is |
|---|---|
| **Agent** | An LLM in a loop with tools — decides what to do, does it, looks at the result, decides again. Claude Code itself is an agent. |
| **Subagent** | A *second* Claude spawned by the first, with its own fresh context window and its own restricted tool list. Reports a summary back. |
| **Skill** | A folder of instructions + scripts that Claude loads when relevant. Reusable expertise, not a separate process. |
| **MCP server** | A standard way to give Claude access to an external system — your database, GitHub, Figma. It provides *tools*, not intelligence. |

For this project: **subagents** and **one MCP server**. Skills are worth learning later; you don't need them to ship.

### Why subagents are useful (the non-hype version)

A Claude session has a context window — a budget of text it can hold. Every file read spends it. When it fills, quality degrades: earlier decisions get forgotten, the model starts contradicting itself.

A subagent has **its own separate budget**. So when you need something that requires reading a lot but produces a little — "review this 600-line diff for security problems" — you send it to a subagent. It burns *its* context on the 600 lines and hands your main session back a ten-line verdict. Your main session stays sharp.

The second benefit is **enforced narrowness**. Compare:

- *"Please carefully check this migration for security issues"* — an instruction in a message, competing with everything else in context.
- A subagent whose entire system prompt is about migration safety, with **write tools removed entirely** — it structurally cannot do anything else.

The second is more reliable, because the constraint is in the architecture rather than in a request the model might deprioritize.

### How you actually write one

A markdown file at `.claude/agents/<name>.md` in your repo. YAML frontmatter, then the system prompt:

```markdown
---
name: schema-guardian
description: Reviews Postgres migrations for safety issues. Use PROACTIVELY whenever a file in supabase/migrations/ is created or changed.
tools: Read, Grep, Glob
model: sonnet
---

You are a database reviewer for Minced, a Next.js + Supabase recipe app.

When given a migration, check exactly these things and report on each:

1. RLS — is Row Level Security enabled on every new table? A table without
   RLS is readable by anyone holding the public anon key. This is the most
   common and most severe mistake. Flag it as CRITICAL.
2. Indexes — does every foreign key have an index? Does every column used
   in a WHERE or ORDER BY in src/lib/queries/ have one?
3. Destructive operations — any DROP, or any ALTER that narrows a type or
   adds NOT NULL to an existing column, must be flagged with the specific
   data-loss scenario it creates.
4. Defaults and constraints — NOT NULL where the app assumes a value
   exists; CHECK constraints on things like prep_time > 0.
5. Naming — snake_case, plural table names, singular column names.

Report as: CRITICAL / WARNING / NIT, each with file, line, and the fix.
If you find nothing, say so plainly. Do not invent problems to seem useful.

You have read-only tools. Never propose applying a fix yourself — describe it.
```

Then in Claude Code you say *"have schema-guardian review this migration"*, or — because the description says "use PROACTIVELY" — Claude will often invoke it on its own when it touches a migration file.

Three things that separate a good agent file from a useless one:

1. **The `description` is the trigger.** It's what the main session reads to decide whether to delegate. Vague description, never invoked.
2. **Restrict the tools.** A reviewer with `Write` will eventually "helpfully" edit your code instead of reviewing it. Give it `Read, Grep, Glob` and it can't.
3. **Enumerate the checks.** "Review for quality" produces generic output. A numbered list of specific things to check produces a specific report.

### The four agents this project gets

| Agent | Phase | Job |
|---|---|---|
| `code-explainer` | 0 | Reads a merged diff, writes the LEARNING-LOG entry in this file's format. **This is the one that makes this project a learning project instead of a code-generation project.** |
| `schema-guardian` | 1 | The migration reviewer above. |
| `design-checker` | 2 | Diffs new UI against `Minced.dc.html` and the token list. Flags raw hex codes, off-scale spacing, wrong fonts. |
| `perf-auditor` | 6 | Finds N+1 queries, missing indexes, unnecessary `"use client"`, oversized bundles. |

We write each one when its phase arrives. Writing an agent before you understand the problem it solves means you can't tell whether its output is good — and an agent whose output you can't evaluate is worse than no agent.

### The one MCP server worth adding

**The Supabase MCP server.** It lets Claude Code query your actual database — read the live schema, inspect real rows, check whether an index exists — instead of guessing from migration files.

The difference in practice: without it, Claude writes a query based on what it thinks the schema is. With it, Claude reads the schema and writes a query that matches. We'll add it in Phase 1.

Connect it **read-only** at first. An agent with write access to your production database is a bad trade for the convenience.

### What to skip for now

- **Multi-agent orchestration** — swarms of agents building features in parallel. Real, occasionally useful, and completely wrong for a project where the goal is that *you* understand the code.
- **Custom skills** — worth learning once you notice yourself pasting the same instructions repeatedly. Not before.
- **Autonomous background agents** — agents that open PRs unattended. You want to read every diff right now. That's the point.

The honest summary: agents are a context-management tool and a specialization tool. They are not a substitute for understanding your own codebase, and used as one they will produce a repo you can't maintain.

---

## Entry 02 — Why 500 recipes changed the architecture (and why it changed it less than expected)

**Milestone:** Pre-build · **Date:** 2026-08-24

You set the catalog target at 500+ recipes and asked whether React + Vite would be the easier choice. Working through it produced two useful results: one thing that changed, and one belief of mine that turned out to be wrong.

### The framework verdict: Next.js stays, and 500 recipes is the reason

At 6 recipes, Vite and Next.js are equivalent and Vite is simpler. At 500, two things separate:

**Search indexing.** 500 recipes is 500 pages Google can index — each one a landing page for a query like "gochujang salmon 25 minutes." That's not a marketing detail, that's the entire distribution model for a recipe site. People don't open recipe apps and browse; they search, land, and cook. A Vite SPA serves an empty shell to the crawler and gives up that channel.

**First paint on a cold visit.** With 500 recipes, most visits are cold — a stranger arriving at one recipe from a search result. In an SPA that's: empty HTML → download bundle → execute → query database → render. On cell data, a second-plus of blank screen. With server rendering, the HTML arrives with the recipe already in it.

You also asked which is "easier to use as a website." That question has two readings and they point opposite ways. *Easier for you to build* — Vite, modestly, because there's one kind of component instead of two. *Easier for someone to use as a website* — Next.js, clearly, because the pages load faster and can actually be found. The second is the one that decides it. The extra concept Next.js costs you is the server/client component split, which is one afternoon of confusion, once.

### Where I was wrong

The first draft of Entry 00 said a Vite SPA would have to "download all 500 recipes and filter them in JavaScript."

**That's false.** Supabase exposes Postgres over a REST API that a browser can query directly with filters attached — `.lte('prep_time', 30).gte('protein_g', 30)`. Postgres does the work and returns only matches. Identical from Vite or Next.js.

The lesson worth keeping: **server-side filtering is a property of the database layer, not the frontend framework.** I collapsed two independent layers into one argument and got a plausible-sounding conclusion that wasn't true. When you're weighing an architecture decision, force yourself to name *which layer* actually solves the problem. A reason that lives in the wrong layer is a reason that will mislead you later.

### What 500 recipes did change

- Browse **must paginate** — cursor-based, not offset. `OFFSET 480` makes Postgres count through 480 rows it's going to throw away.
- Search moves from P1 to **P0**. Nobody browses 21 pages.
- Indexes move from a Phase 6 optimization into the **initial migration**.
- A new **Phase 1.5** exists, because filling the catalog turned out to be harder than building the app.

---

## Entry 03 — The licensing wall, and the thing that got us over it

**Milestone:** Pre-build · **Date:** 2026-08-24

### What happened

The plan was to bulk-import recipes from an API into our own database. Before writing any of it, I checked what the licenses actually permit. Nearly all of it was blocked:

- **Spoonacular:** one-hour cache maximum, *at every price tier including $300+/mo Enterprise*. You may keep the recipe id, title, and image URL indefinitely — nothing else. On termination you must delete everything you ever received.
- **Edamam:** stricter. Paid tiers permit caching id, title, image, and four macro numbers. Never ingredients, never steps.
- **RecipeNLG** (1M+ recipes, free): non-commercial research and education only. Explicitly binds for-profit employees.
- **Recipe1M+:** research-only, gated behind an application from a university.
- **Wikibooks Cookbook:** CC-BY-SA — usable, but share-alike is viral. Publishing derivatives would oblige us to license our own catalog CC-BY-SA.
- **USDA FoodData Central:** public domain, no restrictions. Free and clean — but it's nutrient data, not recipes.

### Why it's like this

Commercial recipe APIs don't own most of their content — they aggregate and index other people's. They can grant you the right to *query*, not the right to *keep*, because keeping isn't theirs to give. Their whole business model depends on you coming back to the API. An architecture built on owning a catalog is fundamentally incompatible with a vendor whose product is renting you access to one.

**The general lesson, worth more than the specific finding:** check the license *before* the architecture, not after. Had we built the importer first, we'd have found this at the point where a week of work and the entire content strategy were already committed to it. The check took twenty minutes.

### The way through

Here's the part that's genuinely interesting, and it's specific to what Minced is.

**Under US copyright law, a list of ingredients isn't copyrightable.** It's a statement of fact, and facts can't be owned. The leading case is *Publications International v. Meredith Corp.* (7th Cir., 1996), where the court held that "the identification of ingredients necessary for the preparation of each dish is a statement of facts... there is no expressive element deserving copyright protection."

What copyright *does* protect in a cookbook is the creative expression layered on top: the headnote about a summer in Sicily, the photography, the voice.

Which is exactly the material your product exists to remove.

So the path forward isn't importing someone's recipes — it's **authoring our own at scale**, with an LLM drafting to a strict schema and you reviewing every one. Ingredients and techniques come from general culinary knowledge, which nobody owns. Steps get written fresh in Minced's flat, functional voice. Nutrition is computed from USDA public-domain data.

The result is a catalog we fully own, with no attribution obligations, no vendor who can revoke it, consistent voice across all 500, and every structured field our filters need — which imported data wouldn't have had anyway, since no source tracks cookware or spice level reliably.

The constraint produced a better answer than the original plan. That happens more often than you'd think.

> **Caveat, stated plainly:** I'm not a lawyer and this isn't legal advice. The principle above is well established, but it has edges — a step written with real literary flourish can carry protection, and a "substantially similar" selection and arrangement of a whole collection is a separate question from any individual recipe. Two practical guardrails: draft originally rather than paraphrasing specific published recipes, and spend an hour reading primary sources before launch.

---

## Entry 04 — Pantry matching, and the framework question settled for good

**Milestone:** Pre-build · **Date:** 2026-08-24

### The reframe — and a correction to it

You clarified that Minced's center of gravity is *"what can I make with this?"* — people arriving with chicken, half an onion, and no plan.

**I then over-corrected, and you caught it.** From "the landing page doesn't need a food search box" I concluded search was a secondary, returning-user feature and demoted it to P1. Wrong. You meant search shouldn't be the *only* door, not that it should be weak — and a recipe app that can't find a named recipe is simply broken.

The corrected framing, now in the build plan: **two doors, one catalog.** The pantry matcher is what makes Minced worth choosing; search is what makes it worth keeping. Both P0.

The debugging lesson generalizes past this project: **when someone tells you what they don't need, that's a statement about one thing, not a license to downgrade a whole category.** "No search box on the landing page" is a layout decision. I turned it into a priority decision about a core feature. When a constraint arrives, check how far its blast radius actually extends before you let it move things.

### What the pantry door changes technically

Even with search restored, Door 1 is architecturally the interesting one.

**Search and pantry matching are opposite operations.** Search takes a known answer and finds the document. Pantry matching takes a *set* of things you have and ranks documents by how well they're covered by it. In SQL, search is text matching against an index. Pantry matching is set containment with a ranking function:

```
score = ingredients_you_have / ingredients_needed
```

That query has to run in Postgres — it aggregates across every recipe's ingredient rows and sorts by a computed ratio. You cannot do it in application code without pulling the whole join table into memory. So it becomes a **Postgres function called via RPC**, and the app just calls `supabase.rpc('match_recipes', {...})`.

### Why this made Next.js *more* clearly right, not less

Reasonable expectation: "if there's no search, SEO matters less, so the SPA argument gets stronger." It went the other way, for a reason worth understanding.

**Pantry-match apps have no natural virality.** A recipe blog gets shared. A tool that answers a private question at 6pm on a Tuesday doesn't. So you need a discovery channel, and you have no marketing budget.

Here's the opportunity: **"what can I make with chicken and rice" is itself an enormous search query.** So are the thousands of variations of it. Those searches are people describing their pantry to Google because no better tool exists. Your app *is* the better tool.

Which means you can generate a page for every high-value ingredient combination — `/what-can-i-make/chicken-rice-broccoli` — each one server-rendered, indexed, and answering a real query with real results, with a CTA into the full matcher. A few hundred of those pages is a compounding acquisition channel that costs nothing to run.

**That strategy is impossible in a client-rendered SPA.** It's the entire reason server rendering exists. So the reframe that looked like it would weaken the Next.js case actually produced its strongest argument yet — and it's now `M3.7` in the build plan.

**Verdict: Next.js, settled.** No more revisiting this. The pantry matcher itself is a Client Component inside a Next.js app, so you lose nothing in interactivity.

### The general lesson

When a requirement changes, don't check whether it changes your *answer*. Check whether it changes the *reasons* for your answer. Here the reasons changed completely — the original argument (recipe pages indexed for dish-name queries) got weaker, and a new, better argument (programmatic pages for pantry queries) appeared. Same conclusion, different foundation. If I'd only re-checked the conclusion I'd have missed the growth strategy entirely.

---

## Entry 05 — Where 500+ recipes actually come from

**Milestone:** Pre-build · **Date:** 2026-08-24

You asked for an API that lets you import a large list of ready-to-make recipes. I looked hard. Here's the real answer.

### There is no such API

Every large recipe dataset falls into one of three buckets, and none of them is what you wanted:

**Bucket 1 — capped APIs.** Spoonacular and Edamam let you *query* but not *keep*. One-hour cache maximum at every price tier. They aggregate other people's content, so they can rent access but can't sell ownership — it isn't theirs to sell.

**Bucket 2 — non-commercial licenses.** RecipeNLG (1M recipes) and Recipe1M+ are research-and-education only, explicitly binding for-profit users.

**Bucket 3 — the dangerous one: no license at all.** Several large free datasets — Eight Portions (~125k), `corbt/all-recipes` on Hugging Face (~2.15M), and possibly the Kaggle Food.com dataset (~231k, license unverified) — are scrapes of AllRecipes, Epicurious, and Food Network with *no stated license whatsoever*.

**A missing license is worse than a restrictive one, and that's the counterintuitive bit.** A restrictive license at least tells you where the line is. No license means no grant of rights — the default is that you have none. "It was free to download" is not a defense; those are unlicensed copies of commercial publishers' content, and building your core data asset on them is building on something that can be taken away by a letter.

### What actually works: three tiers

**Tier 1 — public domain, zero risk, ~1,300 recipes.** The find that solves your problem: **USDA MyPlate Kitchen**, ~1,072 recipes, a US government work and therefore public domain by statute. Structured ingredients, real directions, and **USDA nutrition already attached**. Plus [publicdomainrecipes.com](https://publicdomainrecipes.com/) (released under the Unlicense — contributors explicitly waive ownership) and USDA SNAP-Ed's recipe cards.

That's your 500+ floor cleared, legally airtight, before writing a single scraper.

The honest tradeoff: these are federal nutrition-program recipes. Budget-conscious, family-sized, plain. No gochujang. For a *pantry-matching* app that hurts less than it would for a browse-driven one — breadth of everyday ingredients is exactly what makes matching work — but Tier 1 alone gives you a functional catalog with no personality.

**Tier 2 — original authored recipes.** LLM-drafted to a strict schema, in Minced's voice, reviewed by you. This is where the interesting cooking comes from. Unambiguously yours because you made it.

**Tier 3 — scrape-and-rewrite, only if you outgrow the first two.** `recipe-scrapers` (MIT) reads the schema.org Recipe markup that 739+ sites already publish for Google. Extract the *facts* (ingredients, quantities, times — not copyrightable), rewrite the *prose* (which is). Note that site terms of service are a **separate legal question from copyright** — a site can contractually forbid scraping even where copyright wouldn't stop you. Check each one.

**One email worth sending:** [Edamam's data-licensing product](https://developer.edamam.com/recipe-database-licensing) — distinct from their capped API — advertises 40,000+ licensed recipes. No public pricing. If they'll grant permanent storage in writing at a survivable price, Tier 3 disappears.

### The thing that's actually hard

Not the recipes. **The ingredients.**

A user types `green onions`. Your recipes say `scallions`, `spring onion`, and `scallion, thinly sliced on the bias`. To Postgres those are four unrelated strings, and your match rate silently collapses — silently being the operative word, because the app returns *fewer* results, not an error.

So every recipe's ingredients must resolve to rows in a **canonical ingredients table**, with an **alias table** mapping every real-world name onto it. Free text survives only in a `prep_note` field that never touches matching.

Two rules that follow, both in the build plan:

1. **Import rejects on unresolved ingredients**, never warns. A recipe with unresolved ingredients is invisible to matching but still clutters browse — worse than not importing it.
2. **Pantry staples get a flag.** Nobody lists salt, pepper, water, or oil when describing their kitchen. Without `is_pantry_staple`, every single match reports "you're missing 3 things" and the product feels broken on day one.

Whichever tier a recipe came from, it passes through the same normalization. That's why `M1.5.1` — canonical ingredients — comes before every importer in the plan. Get it wrong and every recipe you import afterward is wrong too.

---

## Entry 06 — The scaffold, and the deploy loop

**Milestone:** M0.3 · **Merged:** 2026-08-27 · **PR:** #38

### What we built

An empty Next.js 15 app, deployed to a public URL. No features — that's the point. The milestone exists to prove the pipeline works end to end (laptop → GitHub → Vercel → public URL) while there is no code on top to confuse a diagnosis.

Live at **https://mise-mise14.vercel.app**. Pushing to `main` redeploys automatically.

### Key files

| File | What it is |
|---|---|
| `src/app/layout.tsx` | The root layout. Renders `<html>` and `<body>`. Mandatory — every App Router app has exactly one. Wraps every page and persists across navigation |
| `src/app/page.tsx` | The `/` route. The starter page, to be replaced in M2 |
| `src/app/globals.css` | The single global stylesheet. Tailwind v4 config lives here, in `@theme` — this is where our CSS colour variables go |
| `next.config.ts` | Next config. Empty for now |
| `tsconfig.json` | Holds the `@/*` → `src/*` path alias |
| `eslint.config.mjs` | Flat-config ESLint. We added `design/**` and `scripts/**` to `ignores` |
| `postcss.config.mjs` | Wires `@tailwindcss/postcss` into the build |
| `pnpm-workspace.yaml` | Not a workspace — it's where pnpm 11 keeps `allowBuilds`. See Gotchas |
| `pnpm-lock.yaml` | Exact version of every transitive dependency. Committed on purpose: it's what makes Vercel build the same tree the laptop did |

### How it works

**The App Router is the folder structure.** There is no route table anywhere in the project. A folder under `src/app/` is a URL segment, and specially-named files inside it give that segment behaviour — `page.tsx` makes it routable, `layout.tsx` wraps it, `loading.tsx` and `error.tsx` handle those states. Files that aren't specially named aren't routes, which is why a component can safely sit next to the page that uses it.

`src/app/recipes/[slug]/page.tsx` will become `/recipes/shakshuka` with no configuration.

**`public/` vs `src/`.** Files in `public/` are served verbatim at the site root — `public/logo.svg` is `/logo.svg`, no processing, no import. Files imported from `src/` get optimised and fingerprinted by the build. Rule of thumb: `public/` is for things referenced by literal URL (`robots.txt`, `og-image.png`); everything else gets imported.

**`src/` exists to separate code from config.** Without it, `app/` sits in the root beside `package.json`, `next.config.ts`, and `tsconfig.json`. With it, root = config, `src/` = code. The `@/*` alias points at `src/`, so `@/lib/queries/recipes` stays stable no matter how deep the importing file is. That matters more than it sounds — relative imports (`../../../lib/...`) break every time you move a file.

**`.next/` is disposable.** Build output and cache, gitignored. If the dev server ever behaves impossibly, `rm -rf .next` is the correct first move, not a last resort.

**The deploy loop:** push to a branch → Vercel builds it as a *preview* deploy with its own URL → merge to `main` → Vercel builds *production*. Vercel watches the GitHub repo directly; nothing needs to run locally.

### Why this way (and what we rejected)

**Pinned `create-next-app@15.5.24` rather than `@latest`.** `@latest` now resolves to Next 16. The stack decision in Entry 00 was Next 15, and a major-version jump on the first commit is not a thing to discover later.

**Scaffolded into a scratch directory, then copied in.** `create-next-app` refuses to write into a non-empty folder, and this repo already had `CLAUDE.md`, `docs/`, `design/`, and `scripts/`. Three options existed: temporarily move the existing files aside, force the scaffold, or generate elsewhere and copy in. We generated in `/tmp` and copied with `rsync --ignore-existing`, which refuses to overwrite anything that already exists. The other two both put existing work at risk for no benefit.

**Kept our own `README.md` and wrote our own `.gitignore`** rather than taking the generated ones.

**Scoped ESLint to application code.** `design/support.js` is the mockup runtime — third-party-ish code we don't maintain — and it threw 2 errors and 8 warnings. Adding it to `ignores` was right; "fixing" a file that only exists to render the design mockup would have been busywork.

### New concepts

**Lockfile.** `package.json` says "React 19-ish"; `pnpm-lock.yaml` says "React 19.1.0 with this exact hash, and here are all 800 packages underneath it." Committing it is what makes builds reproducible across machines. It's machine-generated — never hand-edit it, and a large diff in it is normal.

**Static prerendering.** `pnpm build` printed `○ (Static)` next to both routes: they're rendered to HTML at build time, not per request. This is the property that makes Next the right call for recipe pages — see Entry 00 on why search crawlers matter here.

**Deployment Protection.** Vercel now defaults new projects to requiring a Vercel login for *all* deployments, including production. See Gotchas — this one nearly passed as done when it wasn't.

### Gotchas

**pnpm 11 blocks dependency install scripts, and it's a hard error.** `ERR_PNPM_IGNORED_BUILDS: unrs-resolver` — a transitive dependency of `eslint-config-next`. This is a supply-chain defence: a package's `postinstall` script is arbitrary code running on your machine, so pnpm now requires explicit approval. It also fails `pnpm build`, not just `pnpm install`.

The trap is *where* the approval goes. Adding `pnpm.onlyBuiltDependencies` to `package.json` — the answer everywhere online — does nothing now; pnpm 11 silently ignores that field. Only `pnpm rebuild` prints the warning that says so. The setting moved to `pnpm-workspace.yaml` (even in a non-workspace project) and the key is `allowBuilds`:

```yaml
allowBuilds:
  unrs-resolver: true
```

pnpm itself writes a placeholder block into that file when it hits this. Reading the file pnpm generated was the fix — after three wrong attempts based on the error message.

This had to be committed, not approved interactively, or Vercel would have hit the identical failure.

**A stale `.next` breaks `pnpm dev`.** Running `pnpm build` then `pnpm dev` gave `Cannot find module '.next/server/app/page.js'` on every request. `rm -rf .next`.

**"Port 3000 is in use … using 3001 instead" is a warning, not an error.** An orphaned dev server held 3000, the new one quietly moved to 3001, and requests to 3000 hit the *old* server — producing a 404 that looked like a routing bug. `lsof -ti:3000 | xargs kill -9`.

**HTTP 200 does not mean the page loaded.** The biggest one. The production URL returned 200 to an anonymous request, and the deploy was green — but the body was `<title>Login – Vercel</title>`. Vercel Authentication was on by default, so every visitor got an SSO wall. It looked perfect in the browser because we were logged into Vercel already.

Fixed in Settings → Deployment Protection → Vercel Authentication → **Only Preview Deployments** (production public, preview URLs still private).

The lesson generalises past Vercel: **check the response body, not just the status code.** A DoD verified by status code alone would have marked this milestone done while the site was invisible to every user.

---

## Entry 07 — Docs in the repo, and why the repo went public

**Milestone:** M0.4 + M0.5 · **Date:** 2026-08-27

### What we built

Nothing, in code terms. M0.4 was already satisfied — `CLAUDE.md` in the root and four docs in `docs/`, all on `main`. M0.5 required a decision, and the decision was to **make the repository public**.

Phase 0 is now closed. Next is M1.1.

### How it works

`main` is protected. Every change must arrive through a pull request — including yours:

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
 ! [remote rejected] main -> main (protected branch hook declined)
```

Settings applied:

| Setting | Value | Why |
|---|---|---|
| `required_pull_request_reviews` | enabled, **0 approvals** | Forces the PR, but doesn't demand an approver you don't have. You're solo |
| `enforce_admins` | **true** | The one that matters — see Gotchas |
| `allow_force_pushes` | false | A force-push to `main` can destroy commits irrecoverably |
| `allow_deletions` | false | Nobody deletes `main` by accident |

### Why this way (and what we rejected)

**GitHub Free does not offer branch protection on private repositories.** Both the branch-protection and the newer rulesets APIs return the same 403: *"Upgrade to GitHub Pro or make this repository public."* So M0.5 could not be met as written without changing something.

Four options were on the table:

1. **Make the repo public** — free, unlocks real server-side protection, and turns the project into something showable.
2. **GitHub Pro, $4/month** — meets the DoD exactly, costs money for a solo learning project.
3. **A local `pre-push` hook** — free and private, but client-side only: bypassable with `--no-verify` and invisible on any other machine. It would have *simulated* the DoD rather than meeting it.
4. **Defer it** — start Phase 1 without the guardrail.

We chose public. The reasoning: the protection is real rather than simulated, it costs nothing, and a recipe app built from public-domain USDA data has nothing to hide. Option 3 was the tempting one and the wrong one — a guardrail you can silently bypass isn't a guardrail, and marking the box checked on that basis would have made this file lie.

**Before flipping it, history was scanned, not assumed.** Going public exposes *every commit*, not just the current tip — so `git rev-list --all` was searched for service-role keys, JWTs, `sk-`/`ghp_` tokens, private keys, and AWS IDs, plus a check that no `.env` file was ever committed. Clean. `.env*` has been gitignored since the first commit, which is why.

One thing the scan did surface: commits were authored under a personal gmail, and commit metadata is public and scraped. The existing ~40 commits keep it; `git config user.email` is now set **repo-locally** to the GitHub `noreply` address so new ones don't. Rewriting history to scrub it was rejected — it changes every SHA and orphans the merge commits from #38 and #39, which is a lot of disruption for an address that isn't a secret.

### New concepts

**Branch protection is server-side.** This is the whole point, and the contrast with option 3 is the lesson. A git hook lives in `.git/hooks/`, which is not committed, not shared, and skippable. Branch protection is enforced by GitHub on receipt — there is no local flag that gets around it.

**`enforce_admins` is a separate switch.** Enabling protection does not, by default, apply it to repository admins. On a solo repo you *are* the admin, so protection without this flag protects `main` from precisely nobody.

**0 required approvals still requires a PR.** These are independent settings. You get the discipline of opening a PR and reading your own diff, without needing a second human to click approve.

### Gotchas

**Protection that doesn't apply to you is decoration.** The first `PUT` returned `"enforce_admins": {"enabled": false}` — the API default. Every other field looked right. Had we stopped at "the API returned 200 and the settings look correct," M0.5 would have been checked while direct pushes to `main` still sailed through.

Same failure mode as the Vercel login wall in Entry 06, and worth naming as a pattern: **a green response describing a configuration is not proof the configuration does anything.** Both times the fix was to test the actual behaviour — fetch the page anonymously; try the push and confirm it's rejected.

The push test itself is safe to repeat: commit `--allow-empty` on `main`, push, watch it bounce, then `git reset --hard origin/main`.

**Verify, don't assume, on inherited milestones.** M0.4 turned out to be already done — CLAUDE.md and the docs had been created along the way. It was still worth checking each item against the DoD rather than checking the box on the strength of "that sounds done."

---

## Entry 08 — The schema, on paper

**Milestone:** M1.1 · **Date:** 2026-08-27

### What we built

`docs/SCHEMA-NOTES.md` — 16 tables, a mermaid ERD, and a written argument for each one. No SQL. The build plan calls Phase 1 the most important phase in the project, for a reason worth restating: UI is cheap to change, and a schema with the wrong shape is expensive to change once there's data in it.

### Key files

- `docs/SCHEMA-NOTES.md` — the design. M1.2 implements it; this file explains it.

### How it works

The core is three tables and a join:

```
recipes ──< recipe_ingredients >── ingredients
(the dish)   (qty, unit, prep)      (the thing itself)
```

`recipe_ingredients` is the **join table**: one row per ingredient-in-a-recipe, holding what's true about that pairing. The word `garlic` is stored once, in `ingredients`, and every recipe points at that row.

Around that: `ingredient_aliases` (green onion → scallion), `units` (with conversion factors), `recipe_steps`, four lookup tables for cuisine/diet/cookware/allergens, and `favorites`.

### Why this way (and what we rejected)

**Four separate lookup tables, not one generic `tags` table.** The generic version is less SQL and one autocomplete covers everything. We rejected it because the four facets don't behave alike: cuisine is exactly one per recipe, diet and cookware are many, and allergens are *inverted* — you filter to exclude them. A generic table lets a recipe have three cuisines, which is meaningless, and makes the safety-critical filter look like every other one.

**Allergens derive from ingredients, cached on the recipe.** The mockup tags them per recipe (`allergens:['Fish','Soy']`), which is simpler and needs no trigger. We rejected it because it's a human-maintained claim with a silent, harmful failure: soy sauce contains **gluten** as well as soy, and missing that on one recipe out of 1,500 serves it to a coeliac user with no error anywhere. Tagging the ingredient once makes every recipe using it correct forever.

**A `units` table with conversion factors, not a text column.** Three features need to *add* quantities — the shopping list merging 2 cloves + 3 cloves, serving-scaling, and the v1.4 meal planner's cost objective — and text can't be added. Cheap now; a backfill of every row at 1,500 recipes later.

**Nutrition as six columns on `recipes`, per serving.** Rejected a 1:1 table and a key/value table: every macro filter is a range scan on the hot path, and columns keep it a plain `WHERE` with no join.

### New concepts

**Normalisation** — each fact lives in exactly one place. `garlic` is one row; 40 recipes reference it. Fix a typo once and it's fixed everywhere. The alternative stores the word 40 times and lets 40 copies drift apart.

**Many-to-many needs a third table.** One recipe has many ingredients; one ingredient appears in many recipes. Postgres has no way to express that with two tables — the join table *is* the relationship, and it's where per-pairing facts (quantity, unit, "finely minced") belong.

**Derived vs. authored data.** `recipe_allergens` holds no original information — it's computed from `ingredient_allergens`. Storing it anyway is a deliberate trade: query-time speed for the cost of a trigger and the risk of staleness. Worth knowing that's a normal, named tradeoff rather than a mistake.

### Gotchas

**A recipe can list the same ingredient twice.** "1 tbsp oil for the pan, 2 tbsp for the dressing" is two legitimate rows with the same `ingredient_id`. So there must be **no** `UNIQUE (recipe_id, ingredient_id)` — a constraint that looks obviously correct and would reject real recipes. Worse, the M3.3 matcher sketch in the build plan uses `count(*)`, which double-counts those rows and computes the wrong coverage ratio. It needs `count(DISTINCT ingredient_id)`.

**`search_vector` can't be a `GENERATED` column.** M3.5 asks for a generated tsvector combining title *and ingredient names*. Postgres generated columns may only reference the same row, so this needs a trigger. The trap: `GENERATED ALWAYS AS (to_tsvector('english', title)) STORED` compiles fine — it just silently indexes titles only, and ingredient search quietly doesn't work.

**Volume → mass needs the ingredient, not the unit.** A tablespoon of honey and a tablespoon of flour weigh different amounts, so `to_base_factor` gets you tbsp → ml but never ml → g. That's what `ingredients.density_g_per_ml` is for, and code must refuse the conversion when it's absent rather than guess.

**The build plan skips M1.5.** Phase 1 goes M1.4 → M1.6; there is no M1.5 (Phase *1.5* is a separate section). Left as-is — renumbering would break the issue and branch names that already point at these addresses.

---

## Entry 09 — The migration, and testing it before shipping it

**Milestone:** M1.2 · **Date:** 2026-08-27

### What we built

`supabase/migrations/20260828020846_initial_schema.sql` — 478 lines implementing `SCHEMA-NOTES.md`. 16 tables, 5 trigger functions, 17 indexes, RLS enabled everywhere, and the fixed reference vocabularies (units, allergens, diets, cookware, cuisines) seeded idempotently.

Applied to the live project with `pnpm db:push`.

### Key files

- `supabase/migrations/2026…_initial_schema.sql` — the schema. Never edit an applied migration; write a new one.
- `.env.local` — the project URL and publishable key. Gitignored.
- `.env.example` — the same keys with no values, committed, so a future clone knows what it needs.
- `package.json` — `db:push`, `db:diff`, `db:types`.

### How it works

**Two derived-data mechanisms, both triggers.**

`recipe_allergens` is a cache rebuilt from `ingredient_allergens` whenever a recipe's ingredients change *or* an ingredient's allergens change. The second case is the one per-recipe tagging cannot handle at all: tag `soy sauce` as containing gluten today, and all 40 recipes using it become correct immediately.

`search_vector` is computed in a **BEFORE** trigger on `recipes`. It has to be a trigger rather than a `GENERATED` column because it pulls ingredient names from two other tables, and generated columns may only see their own row. BEFORE rather than AFTER because an AFTER trigger that `UPDATE`s the row it fired on recurses forever. Child tables "touch" their parent recipe (`set updated_at = now()`), which re-runs that one BEFORE trigger — one mechanism, not two.

### Why this way (and what we rejected)

**RLS enabled in M1.2, with zero policies, rather than waiting for M1.3.** Enabled-with-no-policies denies everything. Rejected leaving it off until the policy milestone: the publishable key is live in `.env.local` from the moment the project exists, and RLS-off plus a public key means a world-writable database in the gap between two milestones. A safe default costs nothing.

**Reference vocabularies seeded in the migration**, not in M1.4's seed script. Units and allergens are fixed vocabulary the schema's constraints are meaningless without, not "data". Idempotent via `on conflict do nothing`.

**`sort_order`, not `position`.** `POSITION` is a reserved SQL keyword; naming a column that means quoting it forever.

### New concepts

**Migrations are append-only.** A migration is a timestamped SQL file that runs once and is recorded as having run. You never edit one that's been applied — the remote has already run the old text, and editing it makes the two histories disagree. Changing the schema means writing a *new* migration. This is also why CLAUDE.md forbids touching `supabase/migrations/`.

**Publishable vs. secret key.** The publishable key (`sb_publishable_…`, formerly `anon`) ships to browsers by design. It identifies the project; it does not grant access — every query it makes runs through RLS. The secret key (`sb_secret_…`, formerly `service_role`) holds `BYPASSRLS`: Postgres skips policy evaluation entirely. In a `NEXT_PUBLIC_` variable it would be baked into the JS bundle permanently. That asymmetry is the whole reason RLS has to be right.

**Trigger timing.** BEFORE triggers can modify the row being written (assign to `NEW`); AFTER triggers cannot, and must issue a separate `UPDATE` — which is how you accidentally write infinite recursion.

### Gotchas

**`NEW` is unassigned during `DELETE`, and `coalesce()` does not rescue you.** The first draft used `coalesce(new.recipe_id, old.recipe_id)` — the idiom everyone reaches for. It raises *"record new is not assigned yet"*, because the field access fails before `coalesce` runs. All three trigger functions now branch on `tg_op`. **This was caught by testing, not by reading**, and it would have broken every ingredient removal.

**Test the migration before pushing it.** No Docker was running, so: start a throwaway `postgres:16-alpine`, stub the `auth` schema (`auth.users`, `auth.uid()`), apply the migration, exercise every trigger and constraint, then delete the container. Roughly five minutes, and it caught the trigger bug plus confirmed six behaviours that would otherwise have been assumptions.

The single most useful assertion: inserting the same ingredient twice into one recipe gave `count(*) = 5` and `count(DISTINCT ingredient_id) = 4`. That's the M3.3 ranking bug from Entry 08, demonstrated rather than argued.

**A check constraint behind a trigger can be unreachable.** `recipes_published_has_date` never fires, because the BEFORE trigger fills `published_at` in first. Harmless, kept as a backstop — but worth noticing that a constraint you can't trigger isn't testing anything.

**Bulk import will be slow.** Row-level AFTER triggers mean a 10-ingredient recipe recomputes its search vector 10 times. Fine for 6 seed recipes; revisit before M1.5.3 loads ~1,000.

---

## Entry 10 — Row Level Security

**Milestone:** M1.3 · **Date:** 2026-08-27

### What we built

`supabase/migrations/20260828021933_rls_policies.sql` — policies for all 16 tables, and `docs/RLS-TEST-PLAN.md`, 10 tests to run in the Supabase SQL Editor.

Verified twice: 18 tests (10 read, 8 write) against a local Postgres with real `anon`/`authenticated` roles before pushing, then on the live database — reference data went from `[]` to 16 units and 8 allergens the moment the policies landed, while writes stayed refused with `42501`.

### How it works

A policy is a `WHERE` clause Postgres bolts onto every query against a table, per command, per role. If no policy grants a row, that row does not exist as far as the caller is concerned.

| Table group | Rule |
|---|---|
| Reference data (units, ingredients, aliases, allergens, cuisines, diets, cookware) | `select using (true)`; no write policy at all |
| `recipes` | published readable by all; drafts readable by author; write only where `author_id = auth.uid()` |
| Recipe children (steps, ingredients, diets, cookware, allergen cache) | visibility follows the parent via `can_read_recipe()` |
| `favorites` | fully private to `user_id` |
| `profiles` | publicly readable, self-writable |

Two helper functions — `can_read_recipe()` and `owns_recipe()` — keep the visibility rule in one place instead of copied across five child tables. Both are `security definer` so they can read `recipes` without being filtered by the very policies they exist to evaluate, which would recurse.

### Why this way (and what we rejected)

**Child tables get their own policies rather than relying on joins.** Rejected assuming that hiding `recipes` is enough: it isn't. Leave `recipe_ingredients` world-readable and a draft recipe is reconstructable through the back door — you can't see the title, but you can see exactly what's in it.

**One helper function instead of five copies of the same subquery.** If the visibility rule changes (say, "unlisted" recipes get added), it changes in one place. Five hand-copied `exists (...)` clauses is five chances to update four of them.

**`(select auth.uid())` rather than a bare `auth.uid()`.** Wrapping it in a scalar subquery lets Postgres evaluate it once per query rather than once per row. On a 1,500-row scan that's one call instead of 1,500.

**`security definer` functions have their `search_path` pinned** to `public, pg_temp`. A definer function with a mutable search path is a textbook privilege-escalation hole: the caller sets `search_path` to a schema they control, and the function runs their code with the owner's rights.

### New concepts

**`USING` vs `WITH CHECK`.** `USING` decides which *existing* rows a command may touch (SELECT/UPDATE/DELETE). `WITH CHECK` decides what a row is allowed to look like *after* a write (INSERT/UPDATE). `UPDATE` needs both — with only `USING`, a user could take a recipe they own and reassign `author_id` to someone else: the row they touched was legitimately theirs, and nothing examines what it became.

**Omitting a policy is how you deny.** There is no `deny` statement. Reference tables have a `SELECT` policy and no write policy, so writes are refused by absence. Anything not explicitly granted is refused.

**Superusers bypass RLS entirely.** The Supabase SQL Editor connects as `postgres`. Without `set local role authenticated`, every test appears to pass while nothing is tested at all.

### Gotchas

**An unauthorised UPDATE is not an error — it's `UPDATE 0`.** This is the one to remember. A row you may not touch isn't rejected, it's *invisible*, so the statement matches nothing and reports success against zero rows. Code that asks "did this throw?" concludes the update worked. **Check the affected-row count.** This will matter directly in M5.3 (edit and delete).

Only `INSERT` — and `UPDATE`'s `WITH CHECK` — produce the loud `42501: new row violates row-level security policy`, because there the offending row is right there to reject.

**`set local` dies with its transaction.** In the SQL Editor, `set local role` and `set local request.jwt.claim.sub` must be in the *same* `begin … rollback` block as the statement they apply to. A separate block is a fresh session with no uid, so `auth.uid()` returns NULL and the author tests fail for the wrong reason. The first local test run hit exactly this: `set_config(..., true)` is transaction-scoped, psql autocommits per statement, and two tests failed until it was changed to session scope. **The policies were right; the harness was wrong** — worth being slow to blame the code under test.

**Favorites can leak recipe ids.** The INSERT policy requires `can_read_recipe(recipe_id)` as well as ownership. Without it, favouriting becomes an oracle: try ids, and a success tells you a draft with that id exists.

---

## Entry 11 — Seed data, and canonicalisation in miniature

**Milestone:** M1.4 · **Date:** 2026-08-27

### What we built

`supabase/seed.sql` — the six mockup recipes, loaded idempotently. Plus `scripts/db-seed.sh` and a `db:seed` script, and a third migration adding the `portion` unit.

Loaded counts: 6 recipes, 37 recipe_ingredients, 25 steps, 9 diet tags, 8 cookware, 30 ingredients, 16 aliases, 12 ingredient-allergen links, and 10 rows of `recipe_allergens` that the seed never wrote.

### How it works

The recipes were **extracted from `design/Minced.dc.html` by evaluating its `RECIPES` array**, not retyped. Retyping 34 ingredient lines by hand is a guaranteed source of silent transcription errors in exactly the data everything else depends on.

Idempotency has two halves. Ingredients and aliases upsert on their natural key. Recipes upsert on `slug`, then their children are **deleted and rebuilt**. Rebuilding rather than upserting children means deleting a line from `seed.sql` actually removes it from the database — an upsert-only seed can add and change but never remove, so the file and the database silently drift apart.

### Why this way (and what we rejected)

**SQL rather than a TypeScript seed script.** Rejected TS: it would need a Postgres driver or the secret key, and this is pure data manipulation with no logic. SQL also runs unchanged in three places — the CLI, `psql`, or pasted into the SQL Editor.

**Seeding connects directly to Postgres, not through the API.** It has to bypass RLS: the publishable key has no write policies, deliberately. That's the same reason the script needs `DATABASE_URL` rather than the key already in `.env.local`.

**Allergens are never inserted by the seed.** Only `ingredient_allergens` is written; `recipe_allergens` is left to the trigger. Writing the cache by hand is precisely the mistake Decision 2 exists to prevent.

### New concepts

**Canonicalisation is the actual work.** 34 ingredient lines in the mockup became **30 canonical ingredients**. `garlic`, `garlic, grated`, and `garlic, minced` are one row with three `prep_note`s. Without that collapse, a pantry containing garlic would match one recipe out of the three that use it — and it would fail *silently*, returning fewer results rather than an error. This is M1.5.1's problem in miniature, at a scale where you can still check every row by hand.

**Direct vs. pooled connections.** Supabase offers three. *Direct* is a real TCP connection, IPv6-only on the free tier. *Session pooler* is pgBouncer over IPv4, behaving like a normal connection. *Transaction pooler* borrows a connection per transaction — right for serverless, but no prepared statements or session state.

### Gotchas

**Docker can't reach an IPv6-only host.** `pnpm db:seed` failed with *"Network unreachable"* against `db.<ref>.supabase.co`, because direct connections resolve to IPv6 and Docker's default bridge network is IPv4-only. The session pooler string fixes it. The error is distinctive: *unreachable* means no route, as opposed to *connection refused* (nothing listening) or an auth failure.

**Deriving allergens found two errors in the design mockup.** Gochujang-Glazed Salmon is tagged `Fish, Soy` but derives `Fish, Soy, Gluten, Sesame` — soy sauce and gochujang both contain wheat, and the recipe has sesame oil *and* sesame seeds. That is a real safety bug the mockup shipped with, caught automatically by tagging ingredients rather than recipes.

Miso Mushroom Ramen derives an extra `Egg` from its *optional* soft-boiled egg. That one is a genuine open question rather than a bug — deferred to M3.4, where the allergen filter is actually built.

**Test fixtures are not self-cleaning.** The RLS test plan's setup block persists by design, and its teardown has to be run deliberately. `rlstest-published` sat in the live catalog until it was noticed by counting rows through the API. Any test that writes to a shared database needs its teardown treated as part of the test, not an optional footnote.

---

## Entry 12 — The typed client, and why the App Router needs two

**Milestone:** M1.6 · **Date:** 2026-08-27 · **Closes Phase 1**

### What we built

- `src/types/database.ts` — 711 lines generated from the live schema by `pnpm db:types`. All 16 tables, both enums, the RLS helper functions.
- `src/lib/supabase/server.ts` — for Server Components, Server Actions, Route Handlers.
- `src/lib/supabase/client.ts` — for Client Components.
- `src/lib/queries/recipes.ts` — the first real query, `getRecipeCards()`.

### How it works

`supabase gen types typescript --linked` introspects the actual database and emits a `Database` type. Passing it as `createServerClient<Database>(...)` is what turns `.from("recipes").select("title")` from a string-based API into a checked one — the string literal is parsed at the type level and validated against the real columns.

### Why two clients

Both talk to the same database with the same key. The difference is entirely **where the session lives**.

A Supabase session is a JWT in a cookie. Reading and writing that cookie works differently on each side of the server/client boundary:

| | Server | Browser |
|---|---|---|
| cookie access | `cookies()` from `next/headers`, request-scoped | `document.cookie` |
| can it write cookies? | only in Server Actions and Route Handlers | yes |
| exists at all during render? | yes | no |

Use the browser client in a Server Component and it reaches for `document`, which doesn't exist — the render crashes. Use the server client in a Client Component and it imports `next/headers`, which isn't available in the browser bundle; the build fails.

The subtler rule: **the server client must be created inside the function that uses it, never at module scope.** `cookies()` is request-scoped. A client constructed once at import time captures one request's cookies and then serves that session to every subsequent visitor. It would work perfectly in local development with one user and leak sessions between strangers in production.

### Why this way (and what we rejected)

**No `.eq("status", "published")` in `getRecipeCards()`.** RLS already restricts reads to published rows plus the caller's own drafts. Rejected filtering again in the query: it duplicates a rule that lives in the database, and two copies of a security rule eventually disagree — usually when someone edits the easy one.

**Queries live in `src/lib/queries/`, not inline in components.** A CLAUDE.md rule. The payoff arrives in M3.3, when the pantry matcher becomes an RPC call with real ranking logic that several pages need.

**The `catch {}` in `setAll` is deliberate.** Server Components cannot set cookies. Supabase attempts to write refreshed tokens during render, which throws there. Swallowing it is correct — middleware refreshes the session on the next request. Without the catch, every expiring session crashes the page.

### New concepts

**Generated types are a snapshot, not a live link.** `database.ts` reflects the schema *at the moment it was generated*. Change the database and it is silently stale — TypeScript keeps agreeing with an outdated picture. Re-run `pnpm db:types` after every migration. Treat it as part of the migration, not a separate chore.

### Gotchas

**A clean typecheck proves nothing by itself.** It would also pass with the types wired up wrong, or not wired at all. The real check is the *negative* one: change a column to `cook_time_minutes` and confirm it fails:

```
error TS2322: Type 'SelectQueryError<"column 'cook_time_minutes' does not exist on 'recipes'.">[]'
```

That error is the evidence. Same pattern as the RLS test plan and the Vercel login wall — verify the failure, not just the success.

**`search_vector` generates as `unknown`.** `tsvector` has no TypeScript equivalent. That's correct: you query *through* it with `.textSearch()`, never read it.

---

## Interlude — Mise becomes Minced

**Milestone:** none (chore, between M1.6 and M1.5.1) · **Date:** 2026-09-16

### What we did

Renamed the project from **Mise** to **Minced** everywhere a name is *current*: the page `<title>` in `src/app/layout.tsx` (which still said "Create Next App"), `package.json`, `supabase/config.toml`, the README, CLAUDE.md, the build plan, this log, the mockup's wordmark, and the mockup file itself (`design/Mise.dc.html` → `design/Minced.dc.html`).

### What we deliberately did *not* rename

- **Migration files.** They still open with `-- Mise — …`. CLAUDE.md forbids editing an applied migration; a comment isn't worth breaking that rule. A migration is a record of what was run.
- **TERMINAL-LOG history.** `mkdir ~/code/mise` is what was actually typed. Rewriting a log makes it a lie.
- **The Vercel URL** `mise-mise14.vercel.app`. It's the real address. Changing text in the repo doesn't change it — that's a Vercel dashboard action.
- **GitHub issue titles** #13 and #16 still say "Mise". They live on GitHub, not in the repo.
- **The mockup's "mise en place" tagline** under the wordmark. It's a culinary phrase, not the brand — but it now explains a name we no longer use. A design decision for M2.1.

### Gotcha — a rename that would have broken the seed

`supabase/seed.sql` uses the source name as a **key**, not just a label: it finds the rows to rebuild with `where source_name like 'Mise design mockup%'`. A blind find-and-replace changed that to `'Minced …'` — but the six rows already in the live database still say `'Mise …'`, and the upsert didn't touch `source_name`. The next `pnpm db:seed` would have deleted nothing, then tried to re-insert every ingredient line on top of the old ones.

The fix: the upsert now also sets `source_name = excluded.source_name`. It runs *before* the deletes, so the old rows get renamed first and the deletes find them.

The lesson generalises: **before renaming a string, ask whether anything looks it up by value.** A label can change freely. A key needs a migration path.

---

## Entry 13 — Resolving free text to a canonical ingredient

**Milestone:** M1.5.1 · **Date:** 2026-09-17

### What we built

The thing that turns *whatever somebody typed* into *an ingredient id*. Three parts:

1. **`resolve_ingredient(raw_name)`** — a Postgres function: exact → alias → fuzzy, returning zero rows when nothing is good enough.
2. **A 409-ingredient vocabulary** with 273 aliases, seeded from `supabase/seed-ingredients.sql`.
3. **A coverage metric** — `ingredient_coverage()` plus `scripts/ingredient-coverage.sh` — that answers "what fraction resolved, and which ones didn't."

### Key files

| File | What it holds |
|---|---|
| `supabase/migrations/20260918013819_resolve_ingredient.sql` | `normalize_ingredient_name`, `singularize_ingredient_name`, `resolve_ingredient`, `ingredient_coverage` |
| `supabase/seed-ingredients.sql` | The vocabulary: 409 canonical ingredients, 273 aliases, self-checking |
| `src/lib/queries/ingredients.ts` | `resolveIngredient`, `getIngredientCoverage`, `getUnresolvedIngredientNames` |
| `scripts/ingredient-coverage.sh` | The report, and the import gate |

**The tables already existed.** `ingredients`, `ingredient_aliases` and *both trigram indexes* were built back in M1.2 — the build plan's prompt for this milestone assumed otherwise. Worth checking what exists before writing a migration that recreates it.

### How it works

`resolve_ingredient` runs four passes and returns on the first hit:

| Pass | Matches against | Confidence |
|---|---|---|
| 1 | normalised `canonical_name` | 1.0 |
| 2 | normalised **+ singularised** `canonical_name` | 1.0 |
| 3 | the same two probes against `ingredient_aliases` | 1.0 |
| 4 | best trigram similarity across both tables | the actual score |

Normalising means lowercase, punctuation to spaces, whitespace collapsed — applied to *both sides*, so the rules only need to be consistent, not clever.

**What a trigram is.** `pg_trgm` chops a string into overlapping three-character runs:

```
"scallion" -> {"  s", " sc", "sca", "cal", "all", "lli", "lio", "ion", "on "}
```

Similarity is how much two strings' trigram sets overlap, 0.0 to 1.0. This is why it survives typos and transposed letters: a wrong character damages three trigrams, not the whole word. The GIN index stores the trigrams, so Postgres never scores rows that share none.

**Why this is in Postgres and not TypeScript.** Fuzzy matching in JS means `SELECT` every ingredient, ship 400 rows over the wire, and score them in Node — per keystroke, per user. pg_trgm scores them against an index sitting next to the data and returns one row. This is exactly CLAUDE.md's "never fetch all rows and filter in JavaScript."

### Why this way (and what we rejected)

**Zero rows, not an error, not a fallback.** An unresolved name returns no row. Rejected returning a "best guess anyway" — a silently wrong ingredient is worse than a loud rejection, because it *looks* like the catalog is working.

**USDA supplies coverage; curation supplies names.** This was the decision behind the whole vocabulary. USDA FoodData Central names things `"Onions, raw"` and `"Peppers, sweet, red"`. Those are useless as something a cook types, so they became **aliases**, and the canonical names are the cook's words. That gives USDA's breadth without USDA's phrasing leaking into the pantry autocomplete — and it pre-wires the `fdc_id` join M1.5.4 needs.

**Simple plurals are NOT alias rows.** `singularize_ingredient_name` handles "tomatoes" → "tomato". Rejected seeding 400 plural aliases: it is maintenance forever, and it buries the real synonyms in noise. Aliases earn their place only as regional synonyms (aubergine), USDA phrasings, shorthand (evoo), or *irregular* plurals.

**Fresh vs dried herbs got split.** `fresh thyme` (Produce) and `dried thyme` (Spices) are separate rows, and the bare word is an alias pointing at whichever a recipe writing it bare almost always means — fresh for soft bunch herbs (parsley, cilantro, basil, mint, dill), dried for the woody jar herbs (oregano, thyme, rosemary, sage). Rejected one row per herb: a pantry holding dried thyme would match a recipe wanting fresh, and the user gets told to use dust where the dish needs a sprig.

**The Python question (M1.5.2) resolved to "offline script."** The reason belongs here because it is easy to re-litigate later: `ingredient-parser-nlp` runs at **import** time, once per recipe, on your machine. Nothing in the live product calls it. A hosted service would be a server kept warm for a job that runs a dozen times in the project's life. The boundary is a **file contract** — JSON lines in, JSON objects out — so whatever runs that Python later doesn't change the importer.

### New concepts

**`IMMUTABLE` is not decoration.** Postgres only allows an expression index on a function that promises the same input always yields the same output. `normalize_ingredient_name` is marked `IMMUTABLE` precisely so `create index ... on ingredients (normalize_ingredient_name(canonical_name))` is legal. Without it the normalised exact-match pass would scan every row.

**`LEFT JOIN LATERAL` is what keeps the misses.** `ingredient_coverage` uses it so an unresolved name comes back as a row with NULLs rather than vanishing. A plain join would drop it — and a coverage metric that silently discards its failures reports 100% forever. That is the single most load-bearing line in the migration.

**A seed can check itself.** The alias block stages into a temp table, then `RAISE EXCEPTION`s if any alias names a canonical ingredient that doesn't exist, or shadows one. See the gotcha below for why.

### Gotchas

**A seed that joins to look up ids fails silently.** The alias insert is `... from (values ...) join ingredients on canonical_name = ...`. A typo in a canonical name doesn't error — the join just matches nothing and that alias never exists. No error, no row, and a missing synonym you find out about months later as a slightly worse match rate.

This bit immediately: renaming the herb rows to `fresh cilantro` orphaned `('cilantro', 'chinese parsley')`, and the first run inserted 270 aliases instead of 271 **without complaining**. The fix is the guard block — it now fails the whole seed and names the offending ingredient. Same family as CLAUDE.md's "it didn't error is not it did something."

**Tighter singularising was safe because both forms are probed.** `eggs` initially fell through to a 0.50 fuzzy match, because the length guard skipped 4-letter words. Lowering the guard from 5 to 4 is safe *only* because every exact pass tests `in (probe, probe_s)` — a bad fold like "peas" → "pea" simply matches nothing while the raw probe still matches. Worth remembering: aggressive normalisation is cheap when you keep the original as a candidate.

**The fuzzy tier needs a human, and the report is how you find them.** The first coverage run surfaced `banana leaves` → **bay leaf** at 0.60. Confidently wrong, and invisible without the report. Every fuzzy match is either a missing alias to add or a wrong match to block — which is why the script lists them separately from the unresolved ones instead of counting them as a win.

**A restoring database answers SQL before its data is back — and lies to you while it does.** Supabase pauses free-tier projects after inactivity. The pooler reports a paused project as `FATAL: tenant/user ... not found`, which reads like a credentials problem and isn't.

The trap is what happens *after* you trigger the restore. The instance accepted connections and answered queries while `public` still had **zero tables**, `supabase_migrations` didn't exist, and even `pg_trgm` and `citext` were missing. Every signal said the database had come back empty and the catalog was gone. It hadn't — the status was still `COMING_UP`, then moved to `RESTORING`, and everything returned intact: 6 recipes, 30 ingredients, 3 migrations.

Two rules out of this. **Wait for `ACTIVE_HEALTHY` before believing anything you read**, because a responsive database is not a restored one. And **never push a migration into a database that is mid-restore** — the schema you are diffing against is not the schema you will get.

**`.env.local` was overriding an exported `DATABASE_URL`.** `set -a && . ./.env.local` clobbers variables already in the environment, so pointing a script at a test container was impossible without editing the env file. Both `db-seed.sh` and `ingredient-coverage.sh` now load it only when the variable is unset. Explicit should always beat ambient.

### Known gap, deliberately not built

`resolve_ingredient` returns **one** answer. The pantry autocomplete (M3.3) needs the top *N* — "chicken" currently resolves to `chicken broth` at 0.57, which is fine for an import gate that flags low confidence and wrong for a dropdown. A `suggest_ingredients(prefix, limit)` sibling belongs in M3.3, not here.

---

## Entry 14 — Parsing an ingredient line, and why a model beats a regex

**Milestone:** M1.5.2 · **Date:** 2026-09-17

### What we built

The other half of the import pipeline. M1.5.1 answered "what ingredient is this *name*?"; this answers "what are the parts of this *line*?"

```
"2 cloves garlic, minced"
   -> {quantity: 2, unit: "cloves", name: "garlic", prep: "minced", confidence: 0.998}
```

### Key files

| File | What it does |
|---|---|
| `scripts/parser/parse_ingredients.py` | The parser. JSON array of lines on stdin → JSON array of parsed objects on stdout |
| `scripts/parser/setup.sh` | Builds the venv from pinned requirements |
| `scripts/parser/run.sh` | Runs the parser without needing to know where the venv is |
| `scripts/parser/fixtures/ingredient-lines.txt` | 40 realistic lines, MyPlate-flavoured |
| `scripts/parse-and-resolve.sh` | **The seam**: parse → resolve → report |

The Python lives in a gitignored venv (76 MB) and is **not** a Node dependency, not in `package.json`, and never deployed.

### How it works

**What a sequence-labelling model is.** A regex asks "does this string match this shape?" A sequence-labelling model walks the sentence token by token and assigns each token a tag — QTY, UNIT, NAME, PREP, COMMENT — choosing the highest-probability *sequence of tags*, not the best tag for each word in isolation.

That distinction is the whole game. In `"1 lb chicken breast, cut into 1-inch pieces"` there are two `1`s. The first is a quantity, the second is part of a preparation. Nothing about the character `1` distinguishes them — only the tokens around them do, and only a model that scores whole sequences can use that. A regex has no notion of "more likely"; every new phrasing is another branch, and the branches eventually contradict each other.

The practical payoff: **every field arrives with a confidence score**, which is what makes a review queue possible at all. You cannot build "flag the uncertain ones" on top of a regex, because a regex is never uncertain — it is only ever right or silently wrong.

**Confidence is the weakest field, not the average.** A line is only as trustworthy as its least certain part. Averaging would let a confident quantity (1.0) mask a coin-flip on the ingredient *name*, which is the field that actually matters.

### Why this way (and what we rejected)

**Offline script, not a FastAPI service.** The build plan asked to be argued out of "offline" and could not be. Parsing happens at *import* time — once per recipe, ever, on a developer machine. Nothing in the live product calls it; the live path is `resolve_ingredient()` in Postgres. A service would be a server kept warm for a job that runs a handful of times in this project's life.

**But the boundary is a file contract, not a function call.** stdio JSON in, JSON out. If this ever must run elsewhere — a Vercel Python function, a container — only the transport changes and the importer keeps reading the same objects. That is what makes "offline" a cheap decision rather than a bet.

**The first amount wins.** `"1 (14.5 ounce) can diced tomatoes"` parses to *two* amounts: 1 can, and 14.5 ounces. The first is the one a cook acts on, so it becomes the quantity; the rest are kept in `other_amounts` for the importer to look at rather than thrown away.

**A bad line never kills the batch.** Every parse is wrapped: a failure becomes a flagged row with the error in `review_reasons`. One malformed line in a 1,000-recipe import must not lose the other 999.

### New concepts

**The parser ships USDA FoodData Central linkage — for free.** `parse_ingredient(..., foundation_foods=True)` returns a real `fdc_id`:

```
"2 cloves garlic, minced" -> fdc_id 1104647, "Garlic, raw", Vegetables and Vegetable Products
```

This was not expected and it substantially de-risks M1.5.4, which assumed a separate matching pass against USDA. The parser output now carries it — and **nothing consumes it yet**, on purpose. Writing `ingredients.fdc_id` is M1.5.4's milestone; capturing a field the parser already returns is this one's.

It is also the honest correction to a claim made during M1.5.1: the USDA-style aliases seeded there were written from knowledge of USDA's conventions, *not* fetched from USDA. This is the first real USDA data in the project.

### Gotchas

**The library prints warnings to STDOUT.** `"Warning: parsing empty text"` goes to standard output, lands in the middle of the JSON array, and makes the whole document unparseable — silently, and only for the inputs that trigger it. It was found by piping the output through `jq` on a deliberately nasty input; the happy path never shows it.

The fix is `contextlib.redirect_stdout(sys.stderr)` around the parse loop, so only our JSON reaches stdout. **The general lesson: when a tool's output is a contract, test it with input designed to break it.** A parser that works on good data and corrupts its own output format on bad data is worse than one that just fails.

**A hardcoded summary line becomes a lie.** `db-seed.sh` ended with `echo "Seeded. 409 ingredients, 273 aliases, 6 recipes."` — accurate the day it was written, wrong the moment ten aliases were added. It now queries the counts. Same family as the stale-types problem: **anything that restates a fact stored elsewhere will eventually disagree with it.**

**Coverage went 97.5% → 100% by reading the report.** The first end-to-end run left `nonfat milk` unresolved and four names resolving *correctly but fuzzily* (`low-sodium chicken broth` → `chicken broth` at 0.56). Fuzzy-but-right is still a warning: it happened to work through trigram overlap, not because anything asserted the equivalence. Ten aliases later the fixture resolves 100% with zero fuzzy matches.

**The real pattern underneath is modifiers, and it is not solved.** `low-sodium X`, `fresh X`, `nonfat X`, `X threads` are a *shape*, not four synonyms, and 1,000 MyPlate recipes will produce dozens more. Ten aliases fixed this fixture; they will not fix the corpus. Stripping known modifiers before resolving is the systematic answer — a change to `resolve_ingredient`, deliberately not made here.

### Handoff to M1.5.3

The unit gap is now **measured rather than discovered mid-import**. The parser emits `cloves`, `ounce`, `pinch`, `pound`, `tablespoon`, `teaspoon`; `units` stores `clove`, `oz`, `lb`, `tbsp`, `tsp`, and has no `pinch` at all. Six mappings plus a decision about `pinch`. `scripts/parse-and-resolve.sh` prints this as section 3 on every run, so it stays visible.

---

## Entry 15 — Importing a catalog, and the day the source disappeared

**Milestone:** M1.5.3 · **Date:** 2026-09-18

### What we built

A four-stage pipeline that turns archived web pages into catalog rows, and the vocabulary work required to make it not reject most of them.

```
fetch.sh        archived HTML          -> scripts/myplate/cache/
extract.py      HTML + JSON-LD         -> artifacts/recipes.json
build_import.py + parsed lines         -> artifacts/import.sql
psql            resolve + gate + load  -> the database + two CSV queues
```

### Key files

| File | What it does |
|---|---|
| `scripts/myplate/slugs.txt` | 1,201 recipe slugs, from the Wayback CDX index |
| `scripts/myplate/fetch.sh` | Downloads archived pages. Resumable, parallel, polite |
| `scripts/myplate/extract.py` | HTML + JSON-LD → normalised recipe JSON |
| `scripts/myplate/build_import.py` | Parses every ingredient line, emits the import SQL |
| `scripts/myplate/import.sh` | Runs all of it |
| `20260918204601_unit_aliases.sql` | `unit_aliases`, `resolve_unit()`, four new units |
| `20260918205149_modifier_stripping.sql` | `ingredient_modifiers`, progressive stripping |
| `20260918205657_normalize_accents.sql` | Accent folding in the normaliser |

### The source was gone

The build plan said to import from MyPlate Kitchen's API. **USDA retired myplate.gov on 2026-01-07** and replaced it with RealFood.gov. There is no official bulk download and nothing on data.gov.

What remains:

- **myplate.food**, a third-party preservation of the same recipes, with a free API — whose terms state plainly that "replicating the recipe catalog into your own database or storage requires a license agreement." Minced must store recipes. That is a direct hit on CLAUDE.md's sourcing rule.
- **The Internet Archive's capture of the original myplate.gov** — 1,201 recipe pages.

**The distinction that decided it:** the recipes are US federal works and carry *no copyright*. Nobody can stop you copying them. myplate.food's restriction is a **contract on their service**, not a claim on the content. Taking the same public-domain pages from the Archive means we are not party to those terms at all. This is the same copyright-versus-site-terms split the build plan already applies to Tier 3.

The lesson that generalises: **when a source says "you may not store this," ask what they actually own.** Sometimes the answer is "the convenience, not the content."

### How it works

**Two sources per page, because neither is complete.** USDA's schema.org JSON-LD carries nutrition, yield, times, description and image — but *omits* `recipeIngredient` and `recipeInstructions` entirely. A JSON-LD-only importer would have produced hundreds of recipes with no ingredients and thrown no error. The ingredients come from the HTML, where Drupal's stable field classes put prep notes in their own `<span class="notes">` — which maps directly onto `prep_note`.

**The gate runs in SQL.** The payload goes to Postgres as one dollar-quoted JSON blob and the accept/reject decision happens there, in the same transaction as the insert, because `resolve_ingredient()` and `resolve_unit()` live there. A gate evaluated anywhere else is a gate that can disagree with the database it protects. Dollar quoting also means no value is ever escaped by hand — the bug class that turns an importer into an injection hole.

**Rejection is per recipe, never per line.** Half a recipe is not a recipe.

### Why this way (and what we rejected)

**Units got the ingredient treatment, not the parser's spelling.** The parser says `cloves`, `pound`, `Tablespoons`; the `units` table says `clove`, `lb`, `tbsp`. Following the parser was tempting and wrong: `units` is a *conversion system* — every row carries `kind` and `to_base_factor`, which is what will let recipes scale by servings and cross volume to mass through `density_g_per_ml`. Storing `tablespoon` beside `tbsp` fragments that for nothing. So: `unit_aliases`, mirroring `ingredient_aliases`.

**`citext` on that table is load-bearing.** The parser's unit normaliser is case-sensitive and fails *silently*:

```
"2 tablespoons butter"  -> tbsp        (recognised)
"2 Tablespoons butter"  -> "Tablespoons"  (a bare string)
"2 TABLESPOONS butter"  -> nothing       (unit lost entirely)
```

USDA recipe cards capitalise. A case-sensitive mapping would have dropped units across a large slice of the catalog and reported nothing.

**No fuzzy tier on units, deliberately.** `tsp` and `tbsp` are three characters apart and threefold apart in the kitchen. An unknown unit gets flagged; a confidently wrong one ruins the dish.

**We did not alias `t`.** Traditional shorthand is `t` = teaspoon, `T` = tablespoon — and `citext` folds them together. The alias that would make `"2 t"` work would silently turn `"2 T butter"` into a third of the butter. Left unresolved on purpose.

### New concepts

**Modifier stripping, and why the ORDER is the entire safety argument.** The first real import rejected ~75% of recipes. The unresolved queue was not exotic food; it was ordinary food wearing adjectives: `red apples`, `cod fillets`, `canned yellow corn`, `reduced sodium sliced carrots`. These are a *shape*, not a list of synonyms — `low-sodium` and `no salt added` multiply against every ingredient they can modify, so curating them by hand is a treadmill.

Stripping adjectives is dangerous in general: M1.5.1 deliberately split `dried thyme` from `fresh thyme`, and a naive stripper collapses them. **It cannot happen here because stripping runs LAST**, after exact and alias both fail. `dried thyme` matches its own row on pass 1 and never reaches the stripper. Only a name that resolves to *nothing* gets touched.

That ordering is also why the colour words are safe. `red onion`, `green beans`, `white rice` all match exactly; only an unrecognised `red apples` loses its adjective.

**Strip one word at a time, and stop at the first match.** The first version stripped every modifier and *then* looked, which turned `"no salt added diced tomatoes"` into `tomato` — the fresh vegetable, not the can. `diced tomatoes` is its own row and was skipped straight past. Removing one word at a time and testing after each finds it. **The longest name that still matches is the most specific one**, and specificity is the whole point of a canonical vocabulary.

### Gotchas

**Accented characters were being shredded.** `normalize_ingredient_name('Jalapeño Chilies')` returned `'jalape o chilies'` — the normaliser replaced everything outside `[a-z0-9]` with a space, so an accent became a *word break*. The name did not fail to match; it matched a different, nonsense string, and the trigram tier could then resolve it to something confidently wrong.

The fix is `translate()`, not `unaccent()`. The `unaccent` extension is the obvious tool and is `STABLE`, not `IMMUTABLE`, because it reads a rules file — and Postgres refuses to build an expression index on a non-`IMMUTABLE` function. `ingredients_normalized_name_idx` depends on this one.

**And changing that function REQUIRED a reindex.** An expression index holds values computed by the *old* definition. Postgres does not notice and does not rebuild it; lookups would silently miss. `reindex index` is in the migration, and any future change to that function needs the same.

**`total_time_min` is a generated column.** The first import run died on `cannot insert a non-DEFAULT value into column "total_time_min"`. Worth knowing before writing any insert against `recipes`. USDA's own `totalTime` is untrustworthy anyway — it emits `"PT20S"` on a recipe that cooks for twenty minutes, which is why `minutes()` refuses ISO durations and reads the human string instead.

**A gate can be too strict, and the queue tells you.** After the vocabulary work, the single largest rejection cause became `multi-ingredient line` — 37 recipes thrown out because one line said `"salt and pepper to taste"`, mostly over pantry staples that do not affect matching at all. The parser already returns *both* names, so the honest fix was to split the line into two rows rather than discard a good recipe. The quantity is dropped when a line splits: `"1 cup carrots and celery"` gives no way to know how the cup divides, and inventing a split would be exactly the confident wrongness the pipeline exists to prevent.

**Import rate, measured at each step:**

| After | Imported |
|---|---|
| First run, M1.5.1 vocabulary only | 27% |
| + modifier stripping, + MyPlate vocabulary | 57% |
| + splitting multi-ingredient lines | 69% |
| + second vocabulary pass from the queue | 82% |

Every one of those steps was chosen by reading the rejection queue, not by guessing. That queue is the reason M1.5.1 insisted on building the coverage metric before anything used it.

---

## Entry 16 — [next entry goes here after M1.5.4]
