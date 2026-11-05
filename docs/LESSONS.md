# Lessons

Every mistake this project has hit, and the rule that prevents it. **Read this before starting work.** Each item is symptom, cause, rule. Sources: `docs/TERMINAL-LOG.md`, `docs/LEARNING-LOG.md`, the wave 5+6 lane reports and review. Add an item when something new bites; keep the failures.

Map of the codebase: `docs/ARCHITECTURE.md`.

---

## 1. Shipping order and live data

**Merge before migrate broke live `/recipes` (wave 3).**
- Symptom: after the PR merged, production `/recipes` returned 500 until `supabase db push` ran.
- Cause: the code called an RPC argument the live database did not have yet. A PR cannot enforce order.
- Rule: apply additive migrations to live BEFORE merging the code that needs them. Every PR body opens with a MERGE ORDER WARNING. Order: backup, migrations in timestamp order, `pnpm db:types`, data uploads, seeds, then merge. A migration that drops and recreates a function (wave 6 `owned_cookware`) must land before the code, never after.

**Previews read the LIVE database.**
- Symptom: a Vercel preview 500s or shows old behaviour.
- Cause: previews use the production Supabase.
- Rule: a preview is not proof for pages that need new RPC arguments until the migrations are live.

**The live database belongs to the integrator.**
- Rule: lane agents use the snapshot (`.snapshot/restore.sh <name>`) or a local stack. They may read live, never write live, Storage or Auth.

**Wrong production URL.**
- Symptom: docs said the live site was `mise-mise14.vercel.app`, which serves a Next.js starter.
- Rule: production is `https://minced-app.vercel.app` (project `minced`). Check the body of a response, not only the 200 (Vercel Authentication once returned a login page with status 200).

**The Supabase project pauses after inactivity.**
- Rule: restore it and wait for `ACTIVE_HEALTHY` before pushing migrations. A paused database also fails `next build` (sitemap and landing prerender query it), so restore before a deploy, including a rollback-by-redeploy.

**Superuser timings hide RLS cost.**
- Rule: measure RPCs as `anon` (`set role anon`), median of several runs. Use `auto_explain.log_nested_statements = on; load 'auto_explain'` to see statements inside a SQL function, because plain `EXPLAIN` shows only a Function Scan.

---

## 2. Migrations and the database

**The snapshot runs as superuser and hid the `pg_trgm` placeholder error (wave 4).**
- Symptom: `permission denied to set parameter "pg_trgm.word_similarity_threshold"` on live; passed on the snapshot.
- Cause: `CREATE FUNCTION ... SET pg_trgm.x` before pg_trgm is loaded in the session is a placeholder setting, which needs superuser. Supabase migrations are not superuser.
- Rule: write migrations to run as a non-superuser. Call a pg_trgm function (`select similarity('a','a');`) at the top before any `SET pg_trgm.*`. No superuser-only statements. Prefer patterns already in applied migrations. Test with `create role mig nosuperuser`, or on a local Supabase stack as the `postgres` role.

**Migrations cannot rebuild the database from scratch.**
- Symptom: `supabase start` or `db push` on an empty DB fails at `20261010100000` with "expected 57 family members, got 0".
- Cause: that migration asserts seeded ingredients; the seed needs that migration's parent rows. Circular.
- Rule: build test environments from the snapshot dump (`.snapshot/live.sql`), loaded as `supabase_admin` (`-d postgres`), then apply newer migrations. Re-grant default privileges to `anon`, `authenticated`, `service_role` and recreate the `on_auth_user_created` trigger. A baseline migration or `docs/REBUILD.md` is still owed.

**Never edit an applied migration.**
- Rule: new migration only. Comments in old ones may still say "Mise" on purpose.

**Redefining a function from an old body loses later settings.**
- Symptom: the cookware draft lost photo-first ordering; `jit=off` and the trigram threshold disappeared.
- Rule: take the body from `pg_get_functiondef` on the live or snapshot database, not from an older migration. A new trailing parameter changes the signature: `DROP` then `CREATE`, or PostgREST reports an ambiguous function.

**Types are a snapshot.**
- Symptom: TypeScript agreed with a schema that no longer existed; lanes cast with `as unknown as` and the casts outlived the reason.
- Rule: `pnpm db:types` in the same commit as the migration. Remove the casts once the types exist (about 30 stale ones remain).

**"It didn't error" is not "it did something".**
- Symptom: an unauthorised `UPDATE` returns `UPDATE 0`; the SQL Editor says "Success. No rows returned" for a `DELETE` that removed nothing; PostgREST returns `[]` with 200 for a denied PATCH.
- Rule: count rows before and after. Use `.select()` on updates so "no row matched" is reported as failed. In SQL tests, assert the count.

**Postgres three-valued logic dropped rows silently.**
- Symptom: shopping-list add kept only 2 of 6 lines when one fridge item was owned.
- Cause: `NOT (ri.ingredient_id = ANY(have) OR i.family_id = ANY(have))`; `family_id` is NULL for most ingredients, so the expression is NULL and the row is filtered out. Same family: `import_local_shopping_list` inserted NULL into a NOT NULL column when a key was absent.
- Rule: wrap nullable comparisons in `coalesce(..., false)` whenever they are negated or fed to NOT NULL columns. Write the regression test with a mix of NULL and non-NULL values first.

**Unknown time stored as 0.**
- Rule: `recipes.total_time_min` is generated; 0 means unknown (653 of 959). Every query must special-case `= 0`. Fix by making it NULL when both parts are NULL (owed).

**Changing `normalize_ingredient_name` needs a REINDEX.**
- Rule: an expression index keeps values from the old body. REINDEX in the same migration. Fold accents with `translate()`, not `unaccent()` (not IMMUTABLE).

**Triggers and bloat.**
- Symptom: `recipes` grew to 32 MB for 978 rows.
- Rule: statement-level triggers for search-vector upkeep; `VACUUM (FULL, ANALYZE)` after bulk loads.

**Test migrations before pushing.**
- Rule: throwaway `postgres:17-alpine` (match the production major), stub `auth.users`, `auth.uid()` and the roles, apply with `-v ON_ERROR_STOP=1` (without it psql prints the error and keeps going with exit 0). A stubbed `auth.uid()` must read both `request.jwt.claim.sub` and the `request.jwt.claims` JSON (PostgREST 12+).

**The snapshot has no Supabase default grants.**
- Symptom: `permission denied for table recipes` or for schema `auth` in tests; `user_cookware_rls_test` and `perf_rls_equivalence_test` fail on a bare snapshot and on an untouched `main`.
- Rule: grant on the throwaway DB only, never live. Better, run role tests on a real local Supabase stack.

**Grants were wider than the policies assumed.**
- Symptom: `anon` held INSERT/UPDATE/DELETE/TRUNCATE on reference tables; any signed-in user could write the public recipe catalog through PostgREST (author policies only checked `author_id`).
- Rule: for each new table `revoke all from anon, authenticated`, then grant back only what is needed. The catalog is operator-written until a submission feature exists. Never weaken RLS. Add the "cannot publish / cannot set image_url" cases to the plan whenever author writes are reintroduced.

**RLS performance: per-row definer calls.**
- Symptom: matcher 172 ms as `anon`.
- Cause: `using (can_read_recipe(recipe_id))` is a non-inlinable SECURITY DEFINER call per row (8,089 calls for one fridge).
- Rule: use `recipe_id in (select id from recipes)`. Prove equivalence with `perf_rls_equivalence_test.sql`. Use `ALTER POLICY`, not drop and create, so no table is ever unprotected. `FOR ALL` author policies also apply to SELECT, and permissive policies run in name order.

**SECURITY DEFINER hygiene.**
- Rule: pin `search_path = public, pg_temp`; `revoke execute ... from public, anon, authenticated` on trigger functions; every `admin_*` function starts with `perform admin_assert()`. Roles that need the default grant must be revoked explicitly (default privileges grant anon).

**Admin as a flag on `profiles`.**
- Rule: `profiles` has an update-own-row policy, so a flag there lets anyone promote themselves. Admin is its own table (`admins`) with select-own-row and no write policy.

---

## 3. Data and pipelines

**Photo removals must be made in the source manifests.**
- Symptom: a photo the verifier rejected came back after the next build.
- Cause: `process_images.py` rebuilds `photos.json` from `commons.json` + `myplate.json` (+ openverse).
- Rule: remove with `scripts/photos/remove_photo.py <slug> "reason"` (it edits the source and `myplate_review_excludes.json`), never by editing `photos.json`. `commons.py build` overwrites; `commons_r2.py build` merges.

**Seeded photos must still match recipes.**
- Symptom: `seed-photos.sql` raised "manifest slugs with no recipe" after the duplicate merge.
- Rule: check manifest slugs against the live slug list before generating the seed. `seed-photos.sql` prunes removed rows; run it after the upload, not before.

**Photo credits.**
- Rule: reject brand, venue or receipt text, product shots, people as the subject, agency logos, files reused for two recipes, and dishes with extras the recipe lacks. Credits read "Author / Flickr", at most about 40 characters. `credits.py --check` misses truncated or "(talk)" credits; use an OVERRIDE. Never cut mid-word.

**archive.org throttles.**
- Symptom: `JOBS=4` made 953 of 1,201 connections fail; later whole-network 429 for 49 images.
- Rule: `JOBS=2` with retries; photo image fetches `--jobs 1 --delay 2.5`. When blocked, stop and wait. Do not switch the importer to myplate.food's API (contract forbids replication).

**Resolution order.**
- Rule: exact, singularised, alias, modifier-stripped, fuzzy; stripping runs last. Strip one word at a time. Never add a modifier that changes what you would buy (`ground`). Unresolved ingredients reject the recipe.

**Fuzzy resolution gives confident wrong answers.**
- Symptom: `chilli` became chili powder, `jack cheese` cheddar, `sunflower oil` sunflower seeds.
- Rule: tests assert `match_kind` is not fuzzy and the id equals the expected one. Synonym coverage is test-driven: add the pair to `synonyms_test.sql`, then the alias to the seed. A wrong existing alias needs an explicit idempotent `UPDATE` (the seed uses `on conflict do nothing`). Do not seed simple plurals as aliases. Alias terms with hyphens or apostrophes must appear verbatim, because the picker find box is a substring match.

**Generated sources beat the database.**
- Rule: the 100 original recipes come from `scripts/content/recipes/*.txt` via `build_original.py`; a DB-only edit is reverted on the next rebuild. Edit the source.

**Cookware means a vessel or appliance you must own.**
- Rule: not bowl, knife or colander. Never assign both halves of "X or Y" (the owned-cookware filter ANDs them). Resolve a bare "pan" from context. Seed files are strict (unknown slug aborts) and guard step edits on the old text.

**Review resets.**
- Rule: editing a recipe's steps removes its `recipe_reviews` row (restoring rejected to prior status) only when the edit is actually applied.

**Parser output is JSON and nothing else.**
- Symptom: `jq: parse error` from a `Warning:` line on stdout.
- Rule: library warnings go to stderr. Only bad input triggered it, so test bad input.

**Nutrition.**
- Rule: auto-matching alone gives median kcal error about 17% and sodium 41%; use reviewed mappings and a hand-calculation check (within 10%). Estimates are labelled estimated. Braised recipes compute high on kcal.

**Truncated imports.**
- Rule: a recipe with only "Preheat oven" steps needs review, not cookware guesses (mock-southern-sweet-potato-pie, picadillo-0, argentinean-grilled-steak-salsa-criolla, barley-jambalaya, chicken-and-dumplings, berry-bread-pudding).

---

## 4. App code

**ISR answers a caught `notFound()` with 200.**
- Symptom: `/recipes/<bad-slug>` returned 200 with noindex and was cached for an hour.
- Cause: Next sets 404 only when the error escapes the top-level render. Forcing dynamic inside ISR (`connection()`) gives 500 (`DYNAMIC_SERVER_USAGE`). A layout's `notFound()` is caught by the PARENT boundary.
- Rule: use the middleware gate (`recipeGate.ts` + rewrite with status 404, fails open). Do not use `dynamicParams = false` (admin publishes without deploys) or `force-dynamic`.

**`unstable_cache` rules.**
- Rule: cookie-free client only; results must be JSON-serialisable (a `Map` became a `Record`); entries survive deploys, so bump the key when the shape changes (`filter-options-v2`); only correct while lists show published recipes. Any action that changes visibility must `revalidatePath` every cached list (`/recipes`, `/pantry`, the recipe, ideally `/` and the sitemap).

**Per-user state must not break page caching.**
- Rule: pages stay cached; signed-in state (session, favourites, saved fridge) loads on the client from `no-store` routes (`/api/me`, `/api/fridge`). Middleware runs only on account/auth routes and the slug gate. Never fetch it twice (use `useFridgeIds`).

**Server Actions are public endpoints.**
- Rule: re-validate every argument (ids int4 and bounded, real dates, slugs by regex, list caps).

**URL is the truth for filters and fridge.**
- Rule: never `useState` for filter or pantry state. Precedence for restored state: URL, then account, then localStorage. A shared link overwrites localStorage but never the account. `useOptimistic` inside `startTransition` for instant chips. A param that changes only a cache key must not change the Suspense key (it refetched an identical list).

**Pending feedback.**
- Rule: pressing a link or chip must show feedback at once (`NavProgress`). `requestAnimationFrame` never fires in a hidden tab, so do not await it in test scripts or judge paint in the hidden Browser pane; use headless Chrome over CDP (`scripts/perf/cdp-metrics.mjs`).

**Stale closures lose rapid taps.**
- Rule: functional `setState`, plus a ref when a rollback needs the latest value.

**Hard-coded duplicates drift.**
- Examples: the staples sentence (3 places; the DB has 22), slug regexes (7 copies, two lengths), `daysUntil`. Rule: one constant or helper; refactor owed (`src/lib/validate.ts`).

**Native `<dialog>.showModal()` makes the page inert but not unscrollable.**
- Rule: `html:has(dialog:modal) { overflow: hidden }` in `polish.css`. A 10 px desktop shift remains.

**Next keeps the previous route's DOM in a hidden div.**
- Rule: tests must check visibility, not presence (`[hidden]` duplicates of `h1` and ids exist).

**Auth.**
- Rule: Supabase answers a repeat sign-up with success, so the UI must say "check your email" for both (do not leak existence). The callback prefers `x-forwarded-host`; keep `NEXT_PUBLIC_SITE_URL` set in Vercel. Auth cookies are httpOnly (no browser client reads them). Do not `supabase config push` `config.toml` (password minimum 6, confirmations off). Built-in Supabase email is rate-limited and team-only until custom SMTP.

**Dead and public by accident.**
- Rule: `/kitchen-sink` and `/api/ingredients/suggest` were deleted in wave 7; `robots.txt` does not name `/admin`. After deleting a page, grep each primitive it used for importers (`ui/select` was orphaned, then needed by the recipe form).

**Build and tooling.**
- Rule: pnpm 11 reads `allowBuilds` from `pnpm-workspace.yaml`, not `package.json`. Pin `create-next-app@15.5.24` (latest is 16). `--frozen-lockfile` on a second machine. ESLint ignores `design/**` and `scripts/**`. `next` 15.5.24 has two ISR cache-poisoning advisories (fixed in 15.5.27; needs approval to bump).

---

## 5. Windows and shell

**Python defaults to cp1252 and CRLF.**
- Symptom: Next failed with "stream did not contain valid UTF-8"; `UnicodeDecodeError`; garbled degree signs and accents; CRLF in generated SQL.
- Rule: `open(..., encoding='utf-8')`, write with `newline='\n'`, `PYTHONIOENCODING=utf-8`, `subprocess.run(..., encoding='utf-8')`. Regexes as `r''` strings (`"\b"` became a backspace). CRLF warnings on checked-in files are harmless.

**Python string escapes can write real control characters into source files.**
- Symptom (2026-10-13): a Python edit meant to insert the JS regex text `[\u0000-\u001f]` wrote actual NUL/control bytes into `filters.ts`; git then showed the file as "Binary" in `git diff --stat`.
- Rule: edit TypeScript/SQL with the Edit tool, not Python string replacement, whenever the new text contains backslashes. If you must use Python, use raw strings and check `git diff --stat` for "Bin" before committing. In JS prefer `\p{Cc}` with the `u` flag over `\u0000` ranges.
- Also: `python -I` ignores `PYTHONIOENCODING`; call `sys.stdout.reconfigure(encoding='utf-8')` instead.

**Git Bash rewrites paths.**
- Symptom: `docker exec ... -f /tmp/x.sql` looked for a Windows path; `node ... /recipes` became `C:/Program Files/Git/recipes`.
- Rule: `MSYS_NO_PATHCONV=1`, or pipe SQL on stdin (`docker exec -i ... < file`). Python on native Windows sees `C:/Users/<short>/AppData/Local/Temp/`, not bash `/tmp`; use the scratchpad directory.

**Killing a shell leaves node holding the port.**
- Symptom: a new server fails with EADDRINUSE while the OLD build keeps answering, so "the page loads" proves nothing about which build is serving.
- Rule: after stopping, `netstat -ano | grep :PORT` and `taskkill //PID <pid> //T //F` (or `Get-NetTCPConnection -LocalPort N | Stop-Process`). Run servers as the background command itself, not `cmd &; sleep`. Use a port outside other lanes' range.

**Docker Desktop does not autostart.**
- Symptom: `cannot find dockerDesktopLinuxEngine`; `docker version` prints a client but no `Server:` section.
- Rule: start it (`Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'`) and wait until `docker info` works. Hypervisor setup is in the memory note `minced-windows-setup`. Docker's own suggestion in the log was wrong; read the backend log.

**`set -a; . ./.env.local` overwrites exported variables.**
- Symptom: a script pointed at a test container hit LIVE.
- Rule: load `.env.local` only when `DATABASE_URL` is unset. `host.docker.internal` reaches the host from a container.

**`.env` placeholders.**
- Symptom: `[YOUR-PASSWORD]` left in a connection string; auth failures that look like network problems.
- Rule: replace placeholders completely, never print or log secrets, never commit them. Test with a read-only query.

**Personal data in code.**
- Symptom: a personal email appeared in a User-Agent string for an external API.
- Rule: no personal email or name in code, User-Agents or test data. Use a neutral project string.

**Worktree sandbox refuses compound commands.**
- Symptom: heredocs piped into docker or python, `$(...)`, loops composing docker input, variable-named commands, and text containing "git" were refused as too complex.
- Rule: use the Write tool for files; run plain single commands; `git worktree list` before creating lane branches (a branch can already be checked out in a sibling).

**Parallel agents share one browser, one cookie jar, one Docker.**
- Symptoms: another lane's dev server navigated my tab; auth cookie `sb-127-auth-token` is shared across ports on `localhost` and logged sessions out; another agent's `supabase stop` removed my stack; PostgREST bulk insert needed identical keys per object.
- Rule: `tabs_create` your own tab and close it; browse via `http://127.0.0.1:<port>` or a `<name>.localhost` host; give a local stack a unique `project_id` and ports and never stop one you did not start; `supabase stop --no-backup` only your own; remove containers you created.

**Resumed workflows renumber worktrees and collide.**
- Symptom: after a resume, lane worktrees and branch names pointed at the wrong lane and agents edited each other's checkouts.
- Rule: after a resume, `git worktree list` and `git branch -vv` first; confirm each lane's branch/HEAD against its report before touching it; never trust a worktree number from an earlier run.

**`gh api ... --silent` hid 8 identical failures.**
- Rule: never use `--silent` on an unproven command; eight identical failures mean a systemic cause.

---

## 6. Process

**"Done" means the DoD is observable.**
- Rule: verify on the integrated branch, not on the agent's word. Honest "blocked" beats a falsely checked box. M1.5.7 stays open until the user reviews.

**Do not start unrequested features.**
- Rule: only the current milestone. Product and design decisions go to the user as options (e.g. optional ingredients on the shopping list, "Use these first" semantics, cookware chip labels).

**Don't judge by status alone.**
- Rule: check the body (login page returned 200), the right build (port), and the right database (live vs snapshot).

**Lane reports hold the notes.**
- Rule: lanes do not edit shared docs (`CLAUDE.md`, `BUILD-PLAN`, `LEARNING-LOG`, `TERMINAL-LOG`, `database.ts`, `globals.css`); the integrator writes them from the reports.

**Verifier suites must be runnable.**
- Rule: a test that depends on grants or seed state the environment lacks proves nothing; say which environment a suite needs (snapshot vs local stack) in `RLS-TEST-PLAN.md`.

---

## 7. Wave 7 (2026-10-14)

**A feature flag in the UI is not a feature switch.**
- Symptom: `NEXT_PUBLIC_ENABLE_USER_RECIPES` hid the pages, but the Server Actions and the `save_my_recipe` RPC stayed callable by any signed-in user (the review caught it).
- Rule: gate the write path where the write happens. The DB switch is `feature_flags` (`user_recipes`, default off, no API access); the public RPC wrappers raise 42501 while it is off; Server Actions also check the env flag. Both must be on. `NEXT_PUBLIC_*` is inlined at build, so changing it needs a redeploy.

**An undo must undo the side effect.**
- Symptom: approving a user recipe sets `status = published`; undoing the approval left it public while the admin thought it was pending.
- Rule: every state change that has a visible side effect needs the reverse written and tested (`user_recipes_test.sql`).

**Authors write only through definer RPCs.**
- Rule: authors have no INSERT/UPDATE/DELETE on recipe tables. A `SECURITY DEFINER` function writes a fixed column list and can only produce `draft` or `in_review`, so a column added later is not author-writable by accident. Do not re-add author write policies.

**Aggregating over child rows cannot be a PostgREST filter.**
- Rule: put it in a `SECURITY INVOKER` SQL function returning `setof table` and call it with `.rpc(...).select(...)` (`makeable_recipes`); filters, embeds, order, paging and RLS still work. Group child rows by `coalesce(alt_group, -id)` so one predicate handles grouped and ungrouped requirements.

**Changing a function's arguments is DROP then CREATE, and the migration must be live before the code.**
- Rule: `add_recipe_to_shopping_list` gained `p_add_batch`; `/recipes/[slug]` calls `alt_group`. Code merged before the migrations returns 500. Order: backup, migrations, then merge.

**A snapshot test proves logic, not privileges.**
- Rule: run privilege-sensitive suites (`user_recipes`, `admin_review`, `security_hardening`, `user_cookware_rls`, `shopping_list`) on a local Supabase stack as the non-superuser `postgres` role. A bare snapshot has no default grants, so four suites fail there at baseline; that is the environment, not the code. Disable `on_auth_user_created` before `user_cookware_rls_test`, or its own profiles insert collides.

**After `SET ROLE`, other users' rows are invisible.**
- Rule: in tests, read ids and slugs as the owner role first (psql `\gset`), then switch.

**A new single-segment route under `/recipes` is swallowed by the middleware slug gate.**
- Rule: exempt it (`new`) and update `recipeGate.ts`.

**User text reaches public pages, so escape it everywhere.**
- Rule: JSON-LD, Open Graph and any `dangerouslySetInnerHTML` must escape `<` (`jsonLd.tsx` does).

**Control and bidi characters in source.**
- Rule: SQL regex classes use `\u` escapes, never literal invisible characters (Trojan Source). The original `user_recipes` migration still contains them (cannot be edited); `160000` supersedes the function.

**Do not search-rewrite every word.**
- Symptom: `rewriteSynonyms()` replaces each alias word, so "Corn Tortillas" becomes "Corn flour tortillas" and falls off page 1; 13 of 959 exact titles were lost, and "mac and cheese" was wrong.
- Rule: rewrite only when the whole query is one alias, or run the original query first and use the rewrite as a fallback. Before shipping a search change, search all 959 exact titles and assert each is on page 1.

**httpOnly cookies are invisible to `document.cookie`.**
- Symptom: after wave 5/6 made auth cookies httpOnly, `accountProvider.hasAuthCookie()` always says no, so signed-in users see "Log in / Sign up", dead stars, no shopping or fridge import.
- Rule: never gate client state on reading an auth cookie; call `/api/me`, or set a readable non-secret flag cookie. Test the signed-in UI in a real browser, not only the RPCs. Open bug.

**Photo rules that failed in wave 7.**
- Rule: `remove_photo.py` does not clean `commons_picks_w7.json`; rerunning `commons_w4.py build` re-adds a rejected file. After any removal, assert no rejected slug is in `photos.json`. Assert that no two recipes share a file hash and that no file is on a reject list. The verifier found 5 duplicated files and a rejected MyPlate-logo file back in. Put the recipe's steps next to each candidate photo, not only its title.

**Worktree and tooling.**
- Rule: a worktree cannot switch to a branch another worktree holds (`wave7/photos` was held by a dead earlier worktree); check `git worktree list` and delete stale ones. Git Bash rewrites URL paths such as `/recipes` into `C:/Program Files/Git/recipes`: set `MSYS_NO_PATHCONV=1`. Python on Windows needs `PYTHONUTF8=1` or `encoding="utf8"`. Docker `exec ... -f /tmp/x` is rewritten by Git Bash; pipe on stdin.

**Next 15.5 streams metadata for non-bot agents on dynamic pages.**
- Symptom: the description and canonical land in `<body>`, so Lighthouse reports no meta description on `/recipes` (SEO 92). Fix if wanted with `htmlLimitedBots` or blocking metadata.

**Programmatic SEO URL sets are committed data.**
- Rule: generate them with a reproducible read-only SQL script and `dynamicParams = false` only when the set changes solely with a deploy. (Parked on `wave7/seo-combos-later`.)

## 8. Review wave (2026-10-15)

**Apply the filters migration before the code.** `20261015120000` adds `ingredients.filter_group`; the landing build and filtered `/recipes` fail with 42703 without it. Redefine RPCs from `pg_get_functiondef` on the live database; new trailing parameters mean DROP then CREATE.

**Never pass a bare `[&>span]` override into a shared component.** Scope to a class unique to the element you mean (it boxed the signed-out "Log in" text).

**Browser pane tabs are shared between agents.** Create your own tab first and pass `tabId` on every call.

**Git Bash mangles `/tmp` paths for `docker exec`.** Pipe the file through stdin.

**A rejected photo can come back from a `*picks*.json` file.** Fixed: `common.rejected_refs()` is the one reader of `commons_r2_rejected.json`; `remove_photo.py` clears the slug from every `*picks*.json` (globbed), `commons_r2.py build` skips rejected picks, `process_images.py` drops any row whose (slug, file) is rejected (prints `DROPPED`), and `check_manifests.py` fails on a rejected pick left in any picks file. Proved by re-injecting 6 rejected rows into `commons.json`: all 6 dropped, 423 photos out.

**A photo shared by two recipes is the tell for duplicate recipes.** `check_manifests.py` now guards it.

**Escapes lost in scripted edits.** A unicode escape lost its backslash and shipped as "sign2011up". Grep visible text after any scripted edit.

**Soft navigation after sign-out is swallowed on auth pages** by the `@modal` slot; use a full page load there.

**Signed-out state must not be read from localStorage.** `src/lib/useFridgeIds.ts` now reads the URL only when signed out (fixed on review/integration).

## 9. Wave 8 (2026-10-16)

**Vercel PREVIEW builds prerender against the LIVE database.** A PR whose pages query a new column or table fails its preview until the migration is applied to live. After applying the migration, push an empty commit (`git commit --allow-empty`) to re-run the preview.

**A blurry hero can be a rendering cause, not a bad source.** The landing tile served a 400 px thumb into a 379 px box, which a 2x screen stretches 2x. Measure source pixels against rendered pixels times device pixel ratio before judging a photo. Sizes are now md 1200 and sm 640.

**The Laplacian sharpness number is a poor judge of food photos.** Smooth soups and deliberate shallow depth of field score low and look fine, and a 600 px photo upscaled 2x scores fine at the 480 px the audit measures. Every photo also needs a human look, at the size it is shown on a retina screen.

**Legacy photo rejections without a filename cannot be enforced.** `is_rejected()` matches on (slug, file); note-only entries from wave 3 let `fish-spinach` come back. Every reject entry needs the filename, and `check_manifests.py` should fail on a note-only reject slug that has a photo.

**Go templates evaluate `{{ }}` even inside HTML comments.** Supabase email templates must not mention a placeholder in a comment.

**Git Bash rewrites `/paths` in curl arguments.** Set `MSYS_NO_PATHCONV=1`.

**A local Supabase stack loaded from a snapshot needs `alter schema public owner to postgres`** before postgres can create tables.

**A CSS grid needs `minmax(0,1fr)` or `min-w-0` on its children.** Without it one wide child (a table, a long unbroken word) widens every card; `/me` was 439 px wide on a 375 px phone. Use `grid-cols-[minmax(0,1fr)]` for the single-column case.

**PKCE sign-in must start and finish on the same host.** The verifier cookie is host-bound, so Google sign-in and emailed `?code=` links break across hosts. The canonical 308 redirect and Supabase Site URL must agree, and email templates should use `token_hash` links, which work from any browser.

**A malformed cookie must not 500 a page.** `decodeURIComponent` throws on a stray `%`; wrap it (the `me_tz` cookie on `/me`).

## 10. Wave 9 (2026-10-17)

**Standard way to test a signed-in feature: a local Supabase stack built from the live snapshot.** (1) Copy `supabase/config.toml` to a temporary one with a UNIQUE `project_id` and ports; never stop a stack you did not start. (2) Move `supabase/migrations` and `seed.sql` aside (plain `supabase start` fails on the `20261010100000` family assertion), run `pnpm exec supabase start -x vector,logflare,imgproxy,edge-runtime,studio,realtime,storage-api,supavisor,postgres-meta`, then put the folders back. (3) Load `.snapshot/live.sql` into the db container as `supabase_admin` (first `create extension if not exists citext / pg_trgm schema public`, `drop schema supabase_migrations cascade`, strip the `CREATE SCHEMA public;` line). (4) As `supabase_admin`: `alter schema public` and every public table and non-extension function to owner `postgres`; grant usage on `public` and select to `anon`, `authenticated`; DML to `authenticated`, `service_role`; sequences; execute on functions; recreate trigger `on_auth_user_created` on `auth.users` executing `public.handle_new_user()`. (5) Apply your new migrations as `postgres`. (6) Point the app at it with a gitignored `.env.development.local` and create a test user through the admin API with `email_confirm` true. (7) Afterwards delete that env file and run `supabase stop --no-backup` for YOUR project_id.

**The snapshot dump carries no grants.** Blanket grants re-add privileges earlier migrations revoked, so role-based RLS tests (`me_rls_test.sql`) fail a few checks until you replay the migrations' own GRANT/REVOKE lines. Judge them against that, not as code failures.

**`me_targets_touch` overwrites `updated_at` on every UPDATE.** To fake old targets in a test, disable the trigger around the UPDATE.

**`node --experimental-strip-types` cannot resolve the `@/` alias.** `scripts/me-alias-hook.mjs` registers a resolve hook; load source files with dynamic `import()` after `register()`.

**Round percentages before checking bands**, so the number the user sees is the number the decision used.

**Keep streak maths in one TS function.** The RPC returns only days with entries (bounded to 400 days); two implementations drift.

**A diet rule belongs in one query-level function, not in re-tagged data.** `recipe_diets` says what a recipe is; `diet_satisfying()` says what a diet accepts. A PostgREST embed in `browse.ts` had silently bypassed any RPC change, so browse now goes through `filtered_recipes`.

**Changing a function's signature needs a DROP of the old overload.** A second overload makes PostgREST `rpc` calls ambiguous.

**Dead-code cleanup must be re-checked when merged after feature lanes.** Cleanup removed `dayDiff` and `dayMonth`, which the weight and check-in code then needed.

**A date stored as a UTC timestamp compared with a browser-local "today" is off by a day in the evening.** Convert `updated_at` with the `me_tz` cookie before day arithmetic.

**A clamped target changes the projected date.** The projection must use the pace the floored calories actually give.
## 11. Waves 10 + 11 (2026-10-17)

**JIT makes big plpgsql functions 100 times slower.** One wide CTE took 2.8 s per call (24 ms with `jit = off`); a full refresh of 957 recipes went from over an hour to about 90 s. Put `SET jit = off` on every heavy set-returning function, run the bulk refresh with `SET jit = off` in the same session, and `ANALYZE` after bulk loads.

**The recipes before-write trigger bumps `updated_at` and rebuilds `search_vector` on every UPDATE.** A nutrition refresh sets the transaction-local `minced.skip_touch` so it does not churn both. Expect row bloat after a full refresh; run `VACUUM (FULL, ANALYZE) recipes`.

**Brands are foods, never canonical ingredients.** A brand is a `usda_foods` row linked through `ingredient_foods`; the recipe line keeps the canonical ingredient plus an optional `fdc_id`. Every `usda_foods` row must be a real FDC id: never average products into a made-up food.

**Missing is not zero.** No `usda_food_nutrients` row means "not reported"; 0 is a true zero. A recipe nutrient shows only at 90 percent coverage by mass, and partial recipes say "at least". Never fill gaps with a guess.

**Identify nutrients in code by USDA `fdc_number`, not our own key text.** Layout survives renames.

**FDC Branded values are label values per serving.** Tiny servings round to 0 kcal or inflate; units include `GRM` and `MLT`, not only g and ml; ml-sold foods need a density, and every nutrient (not just energy and macros) must be converted. Reject label-rounded zeros unless the food is truly zero.

**Foundation Foods are sparse (10 to 17 of 35 nutrients), SR Legacy carries about 35.** Default to SR for completeness unless Foundation is the only drained or canned record. Foundation energy is Atwater and vitamin D is often IU; load raw, convert in SQL.

**A default food is judged by what a cook means, not what sorts first.** The audit found dried vs raw (kombu), stock vs concentrate (veal stock), mixes vs plain (pumpkin pie filling), skin-on vs skinless chicken thighs. Check forms (raw, cooked, canned, dried) for every ingredient sold more than one way.

**Import qualifiers are lost data.** "Low-fat", "cooked", "canned", "halves", "florets", and "A or B" alternatives disappeared at MyPlate import and inflate computed calories. The compute must turn an unmatched "cooked" or "canned" into a named gap, not silently fall back to the raw food.

**Do not redefine a function from a second migration.** Two lanes both wanted `save_my_recipe`; the later migration silently erases the earlier. Add a narrow RPC (`set_my_recipe_foods`) for the extra data.

**Three-valued logic in tests.** `NULL <> x` never raises; assert with `IS DISTINCT FROM`. A permission error and an RLS denial are both `42501`, so a test cannot tell which layer blocked.

**PostgREST cannot filter a to-many embed on an RPC result** (`42703`). Allergen exclusion on the `filtered_recipes` path now lives in the function (`exclude_slugs`).

**Allergen defaults must be applied on the server before the first byte.** That is why `minced_prefs` is an httpOnly cookie (the database stays the truth; `/api/me` heals drift). Rejected: client restore into the URL (flashes unfiltered results) and writing defaults into the URL (leaks the sender's allergies in shared links). Merge rule: diet is replaced per dimension by the URL, allergens are unioned.

**A floating dropdown inside a native `<dialog>` is clipped.** Render it inline there. Fixed-width grid columns in a narrow panel truncate labels; use a container query.

**The snapshot dump has no `private` schema and no grants.** Anything calling `private.*` (user recipes) fails locally; recreate the functions from `20261014120000` or test against a stub. The supabase CLI reads auth email templates relative to its `--workdir`, so copy `templates/` with `config.toml`.

**The agent shell refuses compound commands it cannot verify** (docker plus variables, heredocs with unbalanced quotes). Write a small script file and run it with a plain command.

## 12. Wave 10c (2026-10-19)

**A decision is not done until the data shows it.** The owner chose canned, full-panel black beans (SR 175188); the fixer left 175237 as the default "owner to confirm" and the final audit caught it. After any owner decision, query the table and show the row.

**Two accuracy numbers, never one.** "Complete" recipes (578) met the MyPlate targets while the 848 recipes counted from 90 percent of their mass did not. Report both, with the population, or the headline hides the misses.

**A word that reverses another word must win.** "6 oz uncooked" next to "cooked" in a prep note was read as cooked. Negated forms ("uncooked", "dry") need checking before the positive form, or the line becomes a gap.

**A count of one is not one part.** "1 cauliflower, cut in large florets" became one 25 g floret. A prep word that names a piece must not turn a bare whole-item count into that piece.

**Curated each-weights must match the USDA portion they claim.** Russet potato 230 g vs USDA medium 213 g produced a +7 percent bias on 45 recipes. Check a curated weight against the FDC portion list before trusting it.

**One predicate, one definition.** Allergen exclusion is `recipe_has_allergen()`; never paste the EXISTS text into a new RPC. Legacy slugs (`nuts`) are expanded inside the function so old cookies and saved settings keep working.

**A superuser snapshot hides production permission errors.** Start any migration that re-creates a function carrying `SET pg_trgm...` with `select similarity('a','a');`.

**Update tests in the same commit as the behaviour.** Adding `birthYear` to the settings validator, writing computed macros on refresh and adding a `light cream` ingredient each broke an old test that encoded the previous behaviour.

**Nested parentheses defeat a `[^()]*` regex.** Gap reasons like "no gram weight for head (floret)" printed a second "(no nutrition data)". Test the trailing `)` instead.

**Licence text before data.** Import government datasets only after reading the licence on the publisher's page; keep the text in `scripts/nutrition/national/LICENCES.md` and a visible attribution line.

## 13. Wave 12 (2026-10-22)

**An allergy is a safety setting, not a preference.** `defaults=off` used to drop saved diet and allergens together, and a chip tap materialised the effective lists with it, so one tap could lose a saved allergy. Now only `showAllergens=1`, reached through a confirm dialog and never stored, lifts them; chips for saved allergens are fixed. Anything that can widen results past a safety setting needs a deliberate step.

**A stand-in is only as good as the figures it cites.** Five earlier "keep" decisions (chili oil, tamarind paste, walnut paste, calamansi, veal stock) had notes the evidence did not support, and eleven "no trusted record" unmaps were wrong. `build_w12.py` now refuses a keep outside 12 percent of every cited figure. Before unmapping, search SR, Foundation, FNDDS, CoFID and CNF.

**Unmapping makes recipes partial by design.** 218 unmaps moved 50 MyPlate recipes from complete to partial and cut the 155 new originals from 127 complete to 77. That is honest, not a regression; the gaps are named per recipe.

**Brand discovery: search ingredients, not brands.** FDC search results already carry full label nutrients; 800 brand-name queries gave about 50 foods, ingredient searches plus an allowlist and a longest-name match gave 1,901. The key allows 3,600 requests an hour.

**Fresh worktrees lack older image caches.** `process_images.py` silently drops every `photos.json` row whose cached image is missing; run it only where the caches exist, and merge new rows by hand otherwise. `commons_w4.py build` writes `commons.json` only at the very end.

**A native `<dialog>` needs its `open` state set false after confirm,** or a second click never reopens it. A click outside closes it, so drive it by ref, not by coordinate. A client module's exports cannot be called from a Server Component; shared helpers go in a plain module (`listNames.ts`).

**A guard that outlives the thing it guards.** The Me time-zone refresh guard lived in `sessionStorage` while sign-out deleted the cookie, so the next sign-in in the same tab never reset the cookie and the page showed the UTC day. A once-only guard must be keyed to the state it protects.

**Round for the preview the way you round for the write.** The Add dialog showed 271 kcal, the diary stored 405 for 1.5 servings (a different rounding), the recipe page said 270. Compute the number once and show what will be saved.

**Never write a heredoc with a quoted apostrophe through the shell tool.** It is refused or silently skipped; use the Write tool for text and Edit for code, then grep to confirm.

**Seeds that copy rows are not idempotent.** `seed-nutrition-zzzzz-math-10c.sql` adds a reasonless `soy` tag to `hot cocoa mix` when re-run on a database that already has allergen tags. Never re-run it on live.
## 14. Wave 14 (2026-10-23)

**Judge a day only when it is over.** Today with one meal logged is not a failed day; show "So far" and keep the verdict (and the red marks) for finished days.

**A native `<dialog>` ignores React `autoFocus`.** It opens after React mounts, so focus the field in an effect after `showModal()`.

**Drop a duplicate column code first.** Stop reading and writing it, keep the old trigger filling it, merge, then drop. The reverse order hides data on the old build.

**A food record without energy is worse than a gap.** `food_has_nutrition()` needs energy, so linking one only turns "no USDA food linked" into "food has no nutrient data". Query energy with `food_nutrient_amount()` (Foundation reports it only as Atwater), not `nutrient_id = 1`.

**FNDDS portions are text.** Parse `portion_description`, not `modifier`, or recipes stay partial with "no gram weight for cup/each".

**FDC search and food endpoints can disagree,** and 429s count against the hourly key limit. Use append-only jsonl caches and one worker for food records.

**When a later wave legitimately links an earlier gap, update the earlier wave generator and test** (`build_w12.py`, `test_10c.sql`); never weaken the gate.

**The time filter is the one range filter that excludes unknowns.** A bound on time requires `total_time_min > 0`; spice, calories and protein still pass unknowns. The importer still stores unknown time as 0 (make it NULL).

**Public domain is decided by authorship, not by host.** A MyPlate page is federal only if its Source field names a federal body; 174 of 260 leftovers credit universities or states. An open licence can carry an exception: the NHS Healthier Families terms reserve all rights, so "OGL on nhs.uk" is not enough. Read the section-specific terms before importing.

**`resolve_ingredient` fuzzy at confidence 0.9 is the modifier-stripping pass and can be wrong** ("yellow pepper" became black pepper). Accept a stripped match only when every dropped word is on a safe list, and keep qualifiers (low sodium, skinless) in `prep_note` because the nutrition rules read it.

**Regex escapes in SQL strings.** A `regexp_replace` replacement that must put a backslash before a captured character needs three backslashes plus 1; two silently escape nothing.

**Never trust one source's own totals.** NHS JSON-LD fat was 79 g for a jalfrezi (typo); the NHS sweet-potato pasta kcal was for a different portion. Compare ours to theirs, but treat neither as ground truth.

**Tooling on this machine.** Give every `docker exec` a `timeout`; Docker Desktop can wedge for every lane at once and a restart restarts all containers. Disk reached 97 percent with old worktrees under `.claude/worktrees`; free space before a wave. Do not `taskkill` by image name (it kills other agents). Python heredocs in bash eat backslashes; write regex files with the Write tool.

## 15. Wave 15 (2026-10-23)

**The `opengraph-image` file convention overrides every page's own `openGraph.images`.** A root-level file would have replaced every recipe photo in share previews. Use a plain route handler (`/og`) and name it explicitly in `pageMeta`; recipes with a photo pass their own.

**Next merges metadata per top-level key.** A page's `openGraph` replaces the layout's whole object, so `pageMeta` restates siteName, title, description, url and image every time.

**robots `Disallow` is prefix matching.** `/recipes/new` would block any slug beginning with "new". Use `/recipes/new$`.

**Never move the address bar between `/recipes/new` and `/recipes/[slug]/edit` with `history.replaceState` while a form holds state.** Next syncs its router to the new URL and the next server-action response renders the other route, remounting the form and losing typing. Keep the URL and offer a resume banner.

**Timers and queued saves read refs, never render state, and saves go through one queue.** Otherwise a save fired from a timeout uses a stale id and creates a second draft.

**A limiter must not trust the caller.** `check_rate_limit` first took limit and window as arguments, so anyone with the public key could lock a known email out. Fix the numbers inside the function, let only `service_role` drive per-email counters, cap distinct subjects per window, and fail open.

**Per-email limits are off until `SUPABASE_SECRET_KEY` is on Vercel.** Without it `allow()` skips the email kinds (IP limits still apply). That is the owner's setting; do not add it from a lane.

**A `loading.tsx` can stall same-route navigation.** `/pantry` has none on purpose. `/me` (day and month links) and `/account` (tab links) got one in wave 15 and were not click-tested signed in: if they feel stuck after a hard load, delete their `loading.tsx` first. A `loading.tsx` also covers child segments, so `/recipes/[slug]/edit` and `/admin/review/list` need their own.

**An `error.tsx` never catches its own segment's layout.** The root `error.tsx` catches failing group layouts and the `@modal` slot; `global-error.tsx` catches the root layout, so it brings its own html and body, uses plain `<a>` (no router) and imports `globals.css` for tokens.

**Recipe rich results need an `image`.** JSON-LD omits it when a recipe has no photo (580 of 957), so those pages are valid but not eligible. Nutrition is emitted only when `nutrition_status = complete`.

**Decorative text glyphs fail contrast audits.** Draw the separator dot as an `aria-hidden` shape in a token colour.

**Vercel's bot challenge returns 429 to curl, PageSpeed Insights and any headless client.** Redirects and canonicals are checked in the browser; Lighthouse is run in a real Chrome (or after the owner allows it). A hidden built-in browser pane does not paint, so it reports no LCP, FCP or CLS and leaves `div#S:n[hidden]` templates that look like duplicate ids.

**`next build` queries the database, so a build is never offline.** With the real `NEXT_PUBLIC_SUPABASE_URL` it prerenders and builds the sitemap by reading live through the public key (read-only). To honour a no-live-reads rule, point that variable at a throwaway PostgREST or a mock before building.

**Local stack recipe for author-RPC tests.** The snapshot dumps schema `public` only, so `private.*` implementations are missing: rebuild them from `20261014120000_user_recipes.sql` renamed to `private.`, then re-apply the grant revokes, or user_recipes_test sections 1 and 14 fail for environment reasons. Use a separate `--workdir` with its own `config.toml` (unique project id and ports).

**`user_recipes_test.sql` counted every recipe as imported.** It now counts `author_id is null`, so existing user recipes do not break section 7.

