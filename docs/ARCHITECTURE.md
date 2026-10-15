# Minced architecture map

Where things live and where to change them. Written 2026-10-13 (end of wave 6). Read `docs/LESSONS.md` first; this file is the map, that one is the list of ways the project has already hurt itself.

If this file and the code disagree, the code wins. Fix this file in the same PR.

---

## 1. The shape in one paragraph

A Next.js 15 App Router site on Vercel reads a Supabase Postgres database. The recipe catalog (959 recipes) is public data, read through the anon key and cached hard. Anything that depends on the person (account, saved fridge, favourites, shopping list, owned cookware) sits behind Row Level Security and is loaded on the client from small `no-store` API routes, so the cached pages stay cached. Ranking and filtering happen in Postgres functions called by RPC. TypeScript only builds arguments and renders rows.

Two doors, one catalog: the **pantry matcher** (`/pantry`, `match_recipes`) and **search** (`/recipes?q=`, `search_recipes`). They share `src/lib/filters.ts`, `RecipeCard`/`RecipeList` and the recipe page.

---

## 2. Routes (`src/app`)

Folders in parentheses are route groups: they share a layout and do not appear in the URL.

| Group | Layout gives | Routes |
|---|---|---|
| `(landing)` | landing nav + footer | `/` |
| `(site)` | `SiteHeader`, `SiteFooter`, `ShoppingSync`, error boundary | `/recipes`, `/recipes/[slug]`, `/pantry`, `/fridge`, `/shopping`, `/account`, `/about`, `/privacy`, `/terms`, `/recipes/new` and `/recipes/[slug]/edit` (user recipes: built, **flag-gated**, 404 while `NEXT_PUBLIC_ENABLE_USER_RECIPES` is off, noindex, not in the sitemap), `/recipe-not-found` (internal 404 target). `/kitchen-sink` was deleted in wave 7. |
| `(auth)` | centred auth card | `/login`, `/signup`, `/forgot-password`, `/reset-password` |
| `admin` | `is_admin()` gate, 404 for everyone else | `/admin/review`, `/admin/review/list` |
| `api` | none | `/api/me`, `/api/me/export`, `/api/fridge` (`/api/ingredients/suggest` was deleted in wave 7) |
| `auth/callback` | none | email-link code exchange |

Top level: `layout.tsx` (html, body, `NavProgress`), `not-found.tsx` (global 404, brings its own header and footer), `global-error.tsx`, `sitemap.ts`, `robots.ts`, `polish.css` (scroll lock, nav progress), `globals.css` (all colour tokens; **no raw hex anywhere else**).

`src/middleware.ts` runs on only these: `/recipes/<slug>` (real HTTP 404 for unknown slugs via `lib/recipeGate.ts`; `new` is exempt, and `/recipes/new` plus `/recipes/<slug>/edit` redirect signed-out visitors to login), `/account` and `/fridge` (redirect to login), and the auth routes (session refresh). It does no work on `/`, `/recipes`, `/pantry`.

---

## 3. Data access (`src/lib`)

Rule: every Supabase call goes through `src/lib/queries/`. Components never call `.from()`.

### `src/lib/queries/` (one line each)

| File | Purpose |
|---|---|
| `account.ts` | Current user, display name, initial. Reused by `/api/me` and the export. |
| `adminReview.ts` | Calls the `admin_*` RPCs for `/admin/review`. |
| `browse.ts` | `/recipes` list via PostgREST, filter options, cached card extras. `unstable_cache`, 5 min. With `ownedOnly` it reads the `makeable_recipes(owned)` RPC (PostgREST cannot express "any member of an alt group is owned"). |
| `favorites.ts` | Saved recipes for the signed-in user. |
| `fridge.ts` | Read the saved fridge, shelf-life suggestions, `recipe_expiry_days`. |
| `fridgeWrite.ts` | Fridge writes (replace, update dates). Validated upstream by `actions/fridge.ts`. |
| `ingredientCatalog.ts` | The tap-picker catalog (aisles, families, aliases). Cached 1 h. |
| `ingredients.ts` | `resolve_ingredient`, coverage, ingredient names. Import-gate helpers. |
| `landing.ts` | Landing hero photos and the paged photo-credits list for `/about`. |
| `matcher.ts` | `match_recipes` wrapper, cached 5 min. (`suggestIngredients` was deleted in wave 7; the RPC stays in the database.) |
| `myRecipes.ts` | User recipes: wrappers for `my_recipes`, `my_recipe_for_edit`, `save_my_recipe`, `delete_my_recipe`, `withdraw_my_recipe`, and the ingredient/unit name lists for the form (paged 1000 at a time). Still uses a loose cast; remove after `pnpm db:types`. |
| `recipeDetail.ts` | One recipe with steps, ingredients, photo, nutrition. React `cache()`d. |
| `recipes.ts` | Shared card types. Some dead exports (see review findings). |
| `search.ts` | `search_recipes` wrapper and word resolution. |
| `shopping.ts` | Shopping-list reads and the `add_recipe_to_shopping_list` RPC. |
| `sitemap.ts` | Every published slug, paged. |
| `userCookware.ts` | The cookware a signed-in cook owns. |

### Other `src/lib`

| File | Purpose |
|---|---|
| `filters.ts` | **The filter contract.** URL params <-> typed filters for both doors. Change a filter here first. |
| `scaling.ts` | Servings scaling and kitchen fractions. Pure. Tested by `scripts/test-scaling.mts`. |
| `shopping.ts` | Merge, unit conversion, aisle grouping. Pure. Tested by `scripts/test-shopping.mts`. |
| `shoppingStorage.ts`, `fridgeStorage.ts`, `cookwareStorage.ts` | localStorage twins for signed-out users. Client-only. |
| `fridgeClient.ts`, `useFridgeIds.ts` | Client fetch of the saved fridge; one shared hook (URL, then localStorage, then account). |
| `fridgeDates.ts` | Date maths on UTC midnights. |
| `recipeGate.ts` | Middleware existence check for recipe slugs (fails open, remembers known slugs 1 h). |
| `photos.ts`, `placeholderTone.ts` | Which photo URLs may be shown; colour of the placeholder tile. |
| `adminReviewShared.ts` | Client-safe types and labels for admin review. |
| `actions/*` | Server Actions: `auth`, `favorites`, `fridge`, `shopping`, `cookware`, `adminReview`. Public endpoints: each re-validates every argument. |
| `supabase/` | `server.ts` (cookie client, httpOnly auth cookies), `static.ts` (cookie-free, for `unstable_cache`), `client.ts` (browser), `middleware.ts` (session refresh). |
| `auth/validate.ts` | Server-side validation for auth forms, `safeNext()`. |

---

## 4. Components (`src/components`)

| Folder | What is in it |
|---|---|
| `ui/` | shadcn-style primitives: `button`, `card`, `chip`, `input`, `label`, `select`, `textarea`, `metaRow`, `spiceDots`. (`/kitchen-sink` is gone; `select` is used by the recipe form.) |
| `shell/` | `siteHeader`, `siteFooter`, `headerSearch`, `fridgeNavButton`, `navProgress` (top bar + dimmed results), `notFoundView`, `legalPage`, `skeletons`, `wordmark`. |
| `recipe/` | `recipeForm` (user-recipe form, client), `recipeCard`, `recipeList`, `recipePlaceholder`, `filterPanel`, `filterSheet` (phone), `servingsScaler` (+ have/missing marks), `myCookware`, `cookwareSync`, `backToResults`, `rememberList`. |
| `pantry/` | `fridgePicker` (tap bottom sheet, find box), `fridgeList` (the `/fridge` page), `localFridgeImport`. |
| `shopping/` | `addToShoppingList`, `shoppingList`, `shoppingSync` (hands the local list to the account on sign-in). |
| `seo/` | `jsonLd` (Recipe JSON-LD; escapes `<`). |
| `account/` | `myRecipeBook` (flag-gated tab), `accountProvider` (session + favourites via `/api/me`; known bug: gates on `document.cookie`, which is empty because auth cookies are httpOnly), `authForms`, `favoriteButton`, `headerAccount`. |
| `admin/` | `reviewScreen`, `batchTable`, `reviewFilters`. |
| `landing/` | `landingNav`, `landingCta`. |

Server Components by default. `"use client"` appears where there is state, effects or browser APIs, and is pushed down the tree.

---

## 5. Database (`supabase/`)

### Migrations timeline

33 files (29 on live; the last four are wave 7 and are NOT applied to live until the owner says go). Never edit an applied one; add a new one. Where a function was redefined, **the current definition is in the newest file listed**.

| Phase | Files (prefix) | What |
|---|---|---|
| Schema and RLS (Aug 2026) | `20260828*` | tables, RLS, `can_read_recipe`, `owns_recipe`, triggers, portion unit |
| Resolver (Sep 2026) | `20260918*` | `resolve_ingredient`, unit aliases, modifier stripping, accent folding |
| Wave 1: matcher + search (Oct 9) | `20261009110000`, `120000`, `120100`, `120200`, `140000` | `match_recipes`, `suggest_ingredients`, search vector and `search_recipes`, `recipe_photos` |
| Wave 2: families + filters (Oct 10) | `20261010100000`-`100400` | ingredient families, filter args, NULL semantics, score float4, suggest latency |
| Wave 3: photos first + accounts (Oct 11) | `20261011110000`, `120000` | `has_photo` tie-break, profiles/favourites/`delete_my_account` |
| Wave 4: perf + admin (Oct 12) | `20261012100000`-`130000` | hashed RLS visibility, cookware filter, admin review, `jit=off` on RPCs |
| Wave 7 (Oct 14) | `20261014100000` cookware alt groups, `100100` shopping add-batch, `120000` user recipes, `160000` user recipes hardening | `recipe_cookware.alt_group`, `makeable_recipes`, `p_add_batch`, author RPCs behind `feature_flags` |
| Waves 5+6 (Oct 13) | `20261013100000` cookware vocabulary, `110000` photo sources, `130000` owned cookware, `140000` fridge, `150000` shopping list, `160000` security hardening | see below |

### Where each RPC is currently defined

| Function | Current definition |
|---|---|
| `match_recipes` | `20261014100000_cookware_alt_groups.sql` (copy the body from the live database, not an older file: `jit=off` and the trigram threshold live only in the newest) |
| `search_recipes` | `20261014100000_cookware_alt_groups.sql` |
| `makeable_recipes` | `20261014100000_cookware_alt_groups.sql` |
| `suggest_ingredients` | `20261010100400_suggest_latency.sql` |
| `resolve_ingredient`, `strip_ingredient_modifiers` | `20260918205149_modifier_stripping.sql` |
| `resolve_unit` | `20260918205149_modifier_stripping.sql` |
| `normalize_ingredient_name` | `20260918205657_normalize_accents.sql` |
| `expand_ingredient_family` | `20261010100000_ingredient_families.sql` |
| `compute_recipe_search_vector`, `search_fold` | `20261009120100_search_vector_fold.sql` |
| `can_read_recipe`, `owns_recipe` | `20260828021933_rls_policies.sql` (policies later switched to a hashed subquery in `20261012100000`) |
| `trg_sync_recipe_has_photo` | `20261011110000_photos_first.sql` (search_path pinned in `20261013160000`) |
| `handle_new_user`, `delete_my_account` | `20261011120000_accounts.sql` |
| `is_admin`, `admin_*` | `20261012120000_admin_review.sql` |
| `suggested_shelf_life`, `recipe_expiry_days` | `20261013140000_fridge.sql` |
| `add_recipe_to_shopping_list` (now 5 arguments, `p_add_batch`) | `20261014100100_shopping_list_add_batch.sql` |
| `import_local_shopping_list` | `20261013150000_shopping_list.sql` |
| `save_my_recipe`, `delete_my_recipe`, `withdraw_my_recipe`, `my_recipes`, `my_recipe_for_edit` | real bodies in schema `private` and thin `public` wrappers that raise 42501 while `feature_flags.user_recipes` is off: `20261014160000_user_recipes_hardening.sql` (first defined in `20261014120000_user_recipes.sql`) |
| `admin_set_review` (undo of an approved user recipe returns it to `in_review`), `admin_review_list`, `admin_review_neighbors`, `admin_recipe_detail`, `admin_update_recipe`, `admin_review_progress`, `recipe_source_key` | `20261014160000` for `admin_set_review`; the rest `20261014120000_user_recipes.sql` (`admin_in_scope` hides never-submitted drafts) |
| `delete_my_account` (also deletes the person's recipes) | `20261014120000_user_recipes.sql` |
| `user_recipe_text` (control and bidi characters stripped) | `20261014160000_user_recipes_hardening.sql` (ASCII-only escapes) |

A new trailing argument changes a function's signature: `DROP` then `CREATE`, or PostgREST reports an ambiguous function.

### Seeds (`supabase/seed-*.sql`, idempotent, data only)

Order matters on a fresh database, and **a fresh database cannot currently be rebuilt from migrations alone** (see LESSONS, migrations). In practice: restore the snapshot, then apply newer migrations, then seeds.

`seed-ingredients.sql` (vocabulary, aliases, families) then `seed.sql` (mockup recipes) are run by `pnpm db:seed`. Others run by hand: `seed-allergens`, `seed-cuisines`, `seed-original-recipes`, `seed-nutrition-fdc`, `seed-cookware` (generated by `scripts/cookware/build.py`), `seed-photos` (generated by `scripts/photos/apply_manifest.py`).

### Tests (`supabase/tests/`)

SQL suites run with `psql -v ON_ERROR_STOP=1` against a snapshot or local stack. `.sh` suites need a **local** Supabase stack and real JWTs; never run them against live.

| File | Proves |
|---|---|
| `matcher_test.sql`, `matcher_quality_test.sql` | ranking, staples, families (27 + 80 assertions) |
| `pantry_harness.sql` | 20 realistic fridges: results exist and are fast |
| `cookware_filter_test.sql`, `owned_cookware_test.sql` | "uses cookware" and "only what I own" predicates |
| `photos_first_test.sql` | photo tie-break never outranks a better score |
| `synonyms_test.sql` | 264 regional synonym pairs resolve as alias, not fuzzy |
| `perf_rls_equivalence_test.sql` | hashed-subquery RLS shows the same rows as before |
| `admin_review_test.sql`, `admin_review_api_test.sh` | admin gate |
| `accounts_rls_test.sh` | favourites and profile isolation |
| `fridge_rls_test.sh`, `shopping_list_test.sql`, `shopping_list_api_test.sh`, `user_cookware_rls_test.sql` | owner-only data |
| `security_hardening_test.sql` | author cannot write the catalog; grants narrowed |
| `cookware_alt_groups_test.sql` | 45 assertions: either/or cookware in matcher, search and browse |
| `shopping_add_batch_test.sql` | replace by default, `p_add_batch` keeps and sums |
| `user_recipes_test.sql` | author RPC-only writes, caps, validation, review lifecycle, feature switch, undo-approval un-publishes. Run as a non-superuser on a local stack too |

The written regression plan is `docs/RLS-TEST-PLAN.md` (+ `-admin`).

---

## 6. Scripts (`scripts/`)

| Folder / file | Pipeline |
|---|---|
| `parser/` | Offline Python ingredient parser (`ingredient-parser-nlp`). Not deployed. `setup.sh`, `run.sh`. |
| `parse-and-resolve.sh`, `ingredient-coverage.sh` | Parse, resolve, report. The import gate. |
| `myplate/` | `fetch.sh` (gentle, JOBS=2) -> `extract.py` -> `build_import.py` -> `import.sh`. Internet Archive source. |
| `content/` | The 100 "Minced original" recipes: text in `recipes/*.txt`, `build_original.py`, `apply.sh`. Edit the `.txt`, not the DB. |
| `nutrition/` | USDA FDC pipeline for non-MyPlate recipes. |
| `cookware/` | `assignments.tsv` + `step_edits.tsv` + `alt_groups.tsv` (36 either/or recipes) -> `build.py` -> `supabase/seed-cookware.sql`. |
| `photos/` | Candidate search (Commons, Openverse, MyPlate) -> manifests -> `process_images.py` -> `upload_photos.py --apply` -> `apply_manifest.py > seed-photos.sql`. Remove with `remove_photo.py`. README inside. |
| `seo/` | Reserved; the combo generator `combos.sql` lives only on branch `wave7/seo-combos-later`. |
| `perf/` | TTFB, CDP paint metrics, round-trip timing. |
| `dedupe-recipes.sql`, `seed-issues.sh`, `db-seed.sh` | One-offs and seeding. |
| `test-scaling.mts`, `test-shopping.mts`, `test-recipe-form.mts` | `node --experimental-strip-types scripts/test-*.mts` |

---

## 7. Data flow

**Door 1, pantry.** Picker (`fridgePicker`) writes ids to the URL (`?pantry=1,2,3`) and mirrors them to localStorage (or the account when signed in). `/pantry/page.tsx` parses with `filters.ts`, calls `matcher.ts` -> `match_recipes` (cached 5 min) -> `RecipeList`. Family expansion and the staple rule are inside Postgres.

**Door 2, search.** `HeaderSearch` / hero box -> `/recipes?q=` -> `search.ts` -> `search_recipes`. Browse without `q` uses PostgREST in `browse.ts`. Same filters, same card.

**Recipe page.** `/recipes/[slug]` is ISR (3600 s) and identical for everyone. Have/missing marks, the favourite star and the shopping box are filled in on the client from the URL (`?pantry=`), localStorage, or `/api/fridge` + `/api/me`.

**Fridge (signed in).** `fridge_items` (owner-only RLS, 150-row cap). Dates are plain dates. "Use these first" links to `/pantry?use=..&sort=expiry`, ordered by `recipe_expiry_days`.

**Shopping.** Raw lines in `shopping_list_items`; merge happens on read in `src/lib/shopping.ts`. Signed out: localStorage, moved into the account by `ShoppingSync` on sign-in via `import_local_shopping_list`.

---

## 8. Caching layers

| Layer | What | TTL | Gotcha |
|---|---|---|---|
| Vercel CDN / ISR | `/`, `/about`, `/recipes/[slug]`, sitemap | 3600 s | A boundary-caught `notFound()` is a cached 200; the middleware gate exists for this. |
| `unstable_cache` | browse, search, matcher, filter options, ingredient catalog | 300 s to 3600 s | Cookie-free client only. Bump the cache key when the value's shape changes. |
| React `cache()` | `getRecipeBySlug` | per request | Lets metadata and page share one read. |
| `no-store` | `/api/me`, `/api/fridge`, `/fridge`, `/shopping`, `/account` | none | Per-user. |
| Middleware memo | known recipe slugs | 1 h per instance | A rejected recipe can answer for up to an hour. |
| Browser | localStorage (fridge, cookware, shopping) | none | Wrap every read in try/catch. |

Anything that changes visibility must `revalidatePath` every cached list path (`/recipes`, `/pantry`, the recipe).

---

## 9. Auth flow

Email + password (Google waits for a domain). Sign-up/log-in are Server Actions in `lib/actions/auth.ts`. Cookies are httpOnly, written by `lib/supabase/server.ts` and `middleware.ts`. `/auth/callback` exchanges the emailed code. `AccountProvider` fetches `/api/me` after load, so cached pages stay cached. Account deletion is `delete_my_account()` (cascades). Admin: a row in `admins`; `/admin/*` answers 404 otherwise. Keep `NEXT_PUBLIC_SITE_URL` set in Vercel production.

---

## 10. Where do I change X?

| I want to... | Start here |
|---|---|
| Add or change a filter | `lib/filters.ts`, then `filterPanel.tsx`, `match_recipes` AND `search_recipes` (and `browse.ts` for the no-`q` list). One new migration. |
| Add a synonym | Add the pair to `supabase/tests/synonyms_test.sql`; add the alias to `seed-ingredients.sql`; run `pnpm db:seed`. |
| Add an ingredient | `seed-ingredients.sql` (read the vocabulary rules in CLAUDE.md). |
| Change ranking | New migration redefining `match_recipes`, copied from the live definition. Run `matcher_*`, `pantry_harness`, `photos_first`. |
| Add a cookware item | New data migration (insert into `cookware`), then `assignments.tsv` and `build.py`. |
| Add or remove a recipe photo | `scripts/photos/README.md`. Remove with `remove_photo.py`, never by editing `photos.json`. |
| Change shelf-life defaults | `UPDATE shelf_life_defaults / ingredient_shelf_life`, no code. |
| Add a per-user table | Owner-only RLS, `revoke all ... from anon, authenticated` first, grant back what is needed, a `*_rls_test`, an entry in `RLS-TEST-PLAN.md`, then `pnpm db:types`. |
| Change a colour | `globals.css` variable. Never hex elsewhere. |
| Change servings maths | `lib/scaling.ts` and re-run `test-scaling.mts`. The shopping SQL must stay in step with `shopping.ts`. |
| Add a page | Put it in the right route group; add to `sitemap.ts` if public; decide `noindex` and the robots rule. |
| Understand why | `docs/LEARNING-LOG.md` (decisions), `docs/SCHEMA-NOTES.md` (schema; stale on newer tables, check migrations). |
