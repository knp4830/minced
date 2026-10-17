# Wave 11 spec: Settings page

Status: proposal for owner review. Written 2026-10-16. Read-only research; no code, migration or database was changed.

Decisions already approved by the owner: one Settings page; display name; units; week start (default Monday); body/sex; default diet and allergen filters that apply everywhere (search/browse and the fridge); owned-cookware management; profiles stay private. Everything else below is a recommendation, and section 13 lists what still needs a yes.

## 0. Baseline this spec was written against

- `origin/main` has waves 1-8 (the Me dashboard v1, migration `20261016100000`, is live).
- `wave9/integration` (not merged into main when this was written) has Me v2, `diet_implications` (vegetarian also accepts vegan; pescatarian accepts both), the time-range and "contains ingredient" filters (`minTime`, `include`), `CookwareEditor` on the account Settings tab, and the typed `me_*` tables. **Wave 11 must be built on top of wave 9 once it is merged.** It edits `filters.ts`, `account/page.tsx`, the Me date helpers and `/api/me`, all of which wave 9 changed.
- Line numbers and file names below are from `wave9/integration`.

What exists today that this wave builds on or replaces:

| Today | Where |
|---|---|
| `/account?tab=settings` holds cookware, "Your data" (download), delete account | `src/app/(site)/account/page.tsx`, `components/account/cookwareEditor.tsx` |
| Display name: stored in `profiles.display_name`, set at signup only, **no edit UI** | `queries/account.ts` |
| Sex and units: columns on `me_targets`, created only when the Me setup wizard finishes | `20261016100000_me_dashboard.sql` |
| Week start: hard-coded Monday in `src/lib/me/dates.ts` (`mondayIndex`, `weekRange`, `monthGrid`) | wave 9 |
| Cookware: `user_cookware` (owner-only RLS) plus localStorage twin plus `CookwareSync` restoring into the URL | `queries/userCookware.ts`, `recipe/cookwareSync.tsx` |
| Diet / allergen: URL only (`diet`, `exclude`), no persistence | `src/lib/filters.ts` |
| Profiles: owner-read only since `20261013160000` | RLS |

---

## 1. Information architecture

### 1.1 Where Settings lives

- **New route `/settings`** (in the `(site)` group, signed-in only, `noindex`, middleware redirect to login like `/account`).
- `/account` keeps what is about *your stuff*: **My Library** and **My recipes** tabs, the avatar header, Sign out. Its "Settings" tab becomes a link to `/settings`, and `/account?tab=settings` redirects (308) to `/settings` so old links and the Delete flow keep working.
- Header avatar menu / account link gets a second entry, "Settings". (Minimal: a link next to Sign out on `/account`, and "Settings" in `headerAccount`.)
- `/me` keeps what is about *your goals and logs*: age, height, weight, activity, goal, pace, targets maths. It does **not** own sex, units or week start any more.

Why a route and not a tab: the page is long (7 sections), needs deep links (`/settings#food` from the "Your defaults" chip, `/settings#cookware` from the filter panel), and keeps `/account` light. Deep links to tabs with `?tab=` re-run the account's data queries; the settings page only loads what it shows.

### 1.2 Sections (top to bottom, each an `<h2>` and a landmark-ish `<section aria-labelledby>`)

1. **Profile**: display name. (Email shown read-only with "Change email / password" pointing at the existing auth flows; do not rebuild them.)
2. **Units and week**: units (metric / imperial), week starts on (Monday / Sunday).
3. **Body**: sex (female / male). Explains exactly what it is used for.
4. **Food defaults**: eating style, allergens to avoid. Preview chip: "Your defaults: vegetarian, no peanuts".
5. **My cookware**: the existing chip editor, moved.
6. **Your data**: download (existing `/api/me/export`), link to privacy policy.
7. **Delete your account**: existing `DeleteAccountForm`, moved unchanged.

Section 3 and the Me setup wizard share the field; see 1.3.

### 1.3 One source of truth for sex and units

Problem: `me_targets.sex` and `me_targets.units` are `NOT NULL` columns on a row that only exists after the wizard, and `getCurrentUser()`/`/api/me` know nothing about them. Adding sex/units to Settings would create two copies.

**Proposal: Settings owns `sex`, `units` and `week_start`, in a new owner-only table `user_settings` (section 2). `me_targets` stops being their source.**

- Everything that reads `targets.units` / `targets.sex` (weight card, morning prompt, muscle card default body, targets maths) reads `user_settings` instead. One query helper `getMySettings()`.
- The Me setup wizard step 1 no longer *asks* sex and units as separate truths. If `user_settings.sex` is empty it asks inline and writes **to `user_settings`** (same server action as Settings); if set, it shows "Using: female, metric. Change in Settings" with a link. The Mifflin-St Jeor formula needs a binary value, so the wizard cannot finish without one. The copy says so honestly.
- Migration path with no breakage (see 2.3): backfill `user_settings` from `me_targets`, then keep `me_targets.sex/units` populated by a `BEFORE INSERT OR UPDATE` trigger that copies from `user_settings`, so the existing `NOT NULL` constraints and any wave 9 SQL keep working. A **follow-up migration (wave 12)** drops the two columns once nothing reads them. This is deliberate: dropping columns in the same wave as the code change makes merge order fragile (LESSONS 1 and 7).
- Display name stays in `profiles.display_name` (it is already read everywhere through `getCurrentUser()`); it is the only profile field this wave touches.

Why not put the new columns on `profiles`: `profiles` has an update-own-row policy (a column added there is user-writable by default) and the owner has said profiles will become public once user recipes exist. Private health-adjacent fields (sex, allergens) must not sit on a table that is about to get a public SELECT policy. LESSONS: "Admin as a flag on `profiles`" is the same class of mistake. A separate table is private by construction.

---

## 2. Data model

### 2.1 `public.user_settings` (new, one row per user)

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` PK, FK `auth.users(id) on delete cascade` | same pattern as `me_targets` |
| `units` | `text not null default 'metric'` | `check (units in ('metric','imperial'))` |
| `week_start` | `text not null default 'monday'` | `check (week_start in ('monday','sunday'))` (add `'saturday'` only if the owner asks) |
| `sex` | `text null` | `check (sex in ('female','male'))`; null = not set yet |
| `diet_slugs` | `text[] not null default '{}'` | at most 1 eating style (see 4.2) + gluten-free etc.; cardinality <= 8 |
| `allergen_slugs` | `text[] not null default '{}'` | cardinality <= 16 |
| `updated_at` | `timestamptz not null default now()` | set by trigger |

Slug validation: arrays cannot carry foreign keys, so a `BEFORE INSERT OR UPDATE` trigger (`SECURITY INVOKER`, `search_path = public, pg_temp`) rejects any slug not present in `diets.slug` / `allergens.slug`, and dedupes and sorts the array (stable output makes the cookie hash stable). Error code `22023`.

Display name: `profiles.display_name` gets `check (char_length(display_name) <= 60)` added `NOT VALID` then `VALIDATE` (existing rows come from `left(trim(...),60)` in `handle_new_user`, so validation should pass; confirm on the snapshot first). Editing goes through the server action (trim, collapse whitespace, strip control characters with `\p{Cc}`, 1-60 chars, empty = clear back to email-prefix). Uses the existing "users update their own profile" policy, so no new grant.

### 2.2 RLS and grants (follows ARCHITECTURE "Add a per-user table")

```
alter table public.user_settings enable row level security;
revoke all on public.user_settings from public, anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;   -- no delete: cascade only
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_insert on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
```

The `(select auth.uid())` form is the repo's hashed-subquery convention. No `anon` access at all. No public read ever, even after profiles go public.

### 2.3 Migration outline (new files only; never edit applied ones)

One migration, timestamp after the last wave 9 file, e.g. `20261018100000_user_settings.sql`, written to run as a non-superuser (no placeholder GUCs, no extensions):

1. `create table user_settings` + checks + `updated_at` trigger + slug-validation trigger.
2. RLS + grants (2.2).
3. Backfill: `insert into user_settings (user_id, units, sex) select user_id, units, sex from me_targets on conflict (user_id) do nothing;`
4. `me_targets` mirror trigger: `BEFORE INSERT OR UPDATE ON me_targets` sets `new.sex := coalesce(us.sex, new.sex)`, `new.units := coalesce(us.units, new.units)` from `user_settings`; plus an `AFTER UPDATE OF sex, units ON user_settings` trigger updating the same user's `me_targets` row. (Two small triggers, documented as temporary, removed with the columns in wave 12.)
5. `profiles` display-name length check.
6. `delete_my_account()` needs no change (cascade); `/api/me/export` adds a `settings` object.

After applying: `pnpm db:types` in the same commit (LESSONS), remove any `as unknown as` casts for the new table. **Apply to live before merging the code** (MERGE ORDER WARNING in the PR body); the code calls the new table, so code-first returns 500 on `/settings` and on `/recipes` for signed-in users.

Test the migration on a throwaway `postgres:17-alpine` with `auth.users`/`auth.uid()` stubs, with `-v ON_ERROR_STOP=1`, and as a non-superuser role (LESSONS section 2).

---

## 3. Server actions and queries

All Supabase calls through `src/lib/queries/settings.ts` (new); actions in `src/lib/actions/settings.ts` (new). Server Actions are public endpoints, so each re-validates every argument (LESSONS section 4).

| Function | Notes |
|---|---|
| `getMySettings()` | `select units, week_start, sex, diet_slugs, allergen_slugs` for the signed-in user; returns defaults when no row yet. |
| `saveProfileName(name)` | validate, update `profiles`, `revalidatePath('/account')`; returns `{ok}` or `{ok:false, reason}`. |
| `saveUnits(units)`, `saveWeekStart(w)`, `saveSex(sex \| null)` | validate against the literal sets; upsert one column. Use `.select()` on the write so "no row matched" is reported as failure (LESSONS: "didn't error is not did something"). |
| `saveFoodDefaults({diet, allergens})` | validate slugs with the same regex as `filters.ts` (`^[a-z0-9][a-z0-9-]{0,63}$`), caps (8 / 16), check they exist in the cached filter options, upsert, **then set the prefs cookie** (section 5.2), then `revalidatePath` for `/recipes`, `/pantry`, `/fridge` (defensive; those pages are dynamic). |

Cookware keeps `loadMyCookware` / `saveMyCookware` unchanged.

---

## 4. Settings page behaviour

### 4.1 Interaction model

- **Radios and chips autosave on change** (units, week start, sex, eating style, allergens, cookware). Same pattern `CookwareEditor` already uses: optimistic UI, one save in flight at a time, last write wins, an `aria-live="polite"` status line per section.
- **Display name uses an explicit Save button** (text input; autosave-on-keystroke is hostile). Enter submits.
- No page-level "Save all". Each section stands alone, so a failure in one never blocks another.

### 4.2 Food defaults design

- **Eating style** is a radio group, because the diets nest (`vegan` accepted by `vegetarian` accepted by `pescatarian`): *No preference / Pescatarian / Vegetarian / Vegan*. Stored as one slug in `diet_slugs`.
- **Also**: independent checkbox chips for non-nested diets (today only *Gluten-free*; the table is data, so new diets appear automatically if they are not in the nested set).
- **Allergens to avoid**: checkbox chips from the `allergens` table (today 8: gluten, dairy, egg, fish, soy, nuts, shellfish, sesame). Paprika styling is allowed here (allergen warnings are one of its two permitted uses per the design rules).
- Under the allergen group, the required one-line disclaimer from `docs/LEGAL-COMPLIANCE.md` section 6: *"Allergen information comes from the ingredients listed and may be incomplete. It doesn't cover brands or cross-contact. Always read labels. If you have a serious allergy, don't rely on Minced."* Never "safe for" or "allergen-free"; use "doesn't list X".
- A live preview line: "Your defaults: vegetarian, no nuts" (the same component as the chip in section 5.4), or "No defaults set" when empty.

### 4.3 Layout

- Max width like the existing settings column (`max-w-xl`), sections separated by hairlines; `h1` "Settings" in Fraunces; section headers Fraunces 22 (design handoff type scale), eyebrow labels in Plex Mono. All colours from `globals.css` tokens, no raw hex.
- Phone: single column, chips wrap, all targets `min-h-11` (44 px).

---

## 5. Default filters: how they merge with URL params

### 5.1 Requirements restated

1. Defaults apply automatically on both doors: `/recipes` (browse and `?q=`) and `/pantry` (matcher; `/fridge` links into it).
2. The URL always wins and stays shareable; a shared link must not carry or leak the sender's allergies.
3. Signed-out visitors are unaffected, including on a shared computer after sign-out.
4. Visible chip: "Your defaults: vegetarian, no peanuts · change".
5. Must not make cached pages per-user in a way that breaks the architecture.

### 5.2 Architecture fit (the key decision)

Facts from the repo: `/recipes` and `/pantry` already render per request (they read `searchParams`); the CDN/ISR layer only covers `/`, `/about`, `/recipes/[slug]`, sitemap. The expensive part is the data, cached in `unstable_cache` keyed on the filters, using the cookie-free client. So per-user defaults can be applied **on the server, before the cache key is built**, with no new caching problem: two users with the same defaults share a cache entry; a user with none shares the plain one.

What must *not* happen: calling `supabase.auth.getUser()` plus a DB read on every list request (extra 50-150 ms, and LESSONS says list pages stay cheap). And what is *wrong for allergens*: the existing `CookwareSync` pattern (render unfiltered, then `router.replace` the URL from the client). That would flash recipes containing the user's allergen for a moment, then swap. Acceptable for cookware, **not acceptable for an allergen filter**.

**Recommendation: a small server-readable "prefs" cookie, written whenever the account state is known, read synchronously by the two list pages.**

- Name `minced_prefs`, value a compact JSON `{"v":1,"d":["vegetarian"],"x":["nuts"],"u":"<first 8 hex of user id>"}` (base64url). `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7 days, rolling`. The client never reads it (the chip is rendered by the server from it), so httpOnly is correct and matches the project's cookie hardening.
- **Written by**: sign-in / sign-up server actions and the `/auth/callback` route (later Google sign-in), `saveFoodDefaults`, and `GET /api/me` (the provider already calls it on first load and after auth-page navigation; the route handler re-reads `user_settings` and re-sets the cookie, which heals drift between devices). Shared helper `setPrefsCookie(userId, settings)` in `src/lib/prefsCookie.ts`.
- **Cleared by**: sign out, delete account, and `/api/me` returning `user: null`.
- **Honoured only if** a Supabase auth cookie is also present (`sb-*-auth-token`, presence test only, no verification) **and** the `u` marker is shaped right. So a leftover cookie after the session expires cannot filter a signed-out visitor's results, and the 7-day rolling expiry bounds the worst case.
- **Trust**: the cookie is user-controlled input like the URL. Parse it with the same slug regex and caps as `slugList`, and drop slugs not in the cached vocabulary. Worst case a tampered cookie filters the tamperer's own results.
- Privacy: this is a strictly functional cookie (no tracking), but `/privacy` currently says logging in sets only the auth cookies. Update the Cookies section and the data list in the same PR (also covers the `me_tz` cookie if it is not already listed).

Rejected alternatives:
- **Client restore into the URL** (cookware pattern): flash of unfiltered results; unsafe for allergens. Kept only as the graceful path if the cookie is missing (see 5.6).
- **Read `user_settings` on the server per request**: correct but adds an auth round trip and a query to every list view; the cookie gives the same answer with zero cost, and the DB stays the truth (the cookie is a cache of it).
- **Write defaults into the URL on arrival**: makes every link the user shares carry their allergens and diet, and the URL stops being a faithful record of what the user chose.

### 5.3 Merge rules (pure function, unit-tested)

New in `src/lib/filters.ts`:

```
withDefaults(urlFilters: RecipeFilters, defaults: FoodDefaults | null)
  -> { effective: RecipeFilters; applied: FoodDefaults | null }
```

New URL param **`defaults`** (value `off` only), added to `RecipeFilters` and `FILTER_PARAMS` so it survives every chip toggle and link built with `filtersToQuery`.

| URL has | Result |
|---|---|
| nothing for `diet`/`exclude`, no `defaults=off` | `diet` and `exclude` come from the defaults; `applied` = those defaults (chip shown). |
| `diet=` and/or `exclude=` non-empty | URL value wins **per dimension**. The other dimension still takes its default (a URL `diet=vegan` does not discard the user's allergen defaults). |
| `defaults=off` | No defaults at all; `applied = null`; chip shows "Defaults off · Use them". |
| signed out / no valid cookie | `defaults = null`; behaviour identical to today. |

`diet` and `exclude` from a URL are *replaced*, never unioned with the defaults, so a user can see "vegan" even if the default is "vegetarian". Allergens: union would be the safe direction, but replacing is the consistent rule and the user sees the effective chips; see Open Question Q5.

`cursor` is already dropped by `withFilters` on any filter change; the cursor stays valid while defaults are unchanged because it is derived from the effective filters.

### 5.4 UI

**The chip** (new `components/recipe/defaultsChip.tsx`, a Server Component, no client JS):
`Your defaults: vegetarian, no nuts · Change · Turn off for this search`
- Rendered at the top of the filter rail (desktop), at the top of the filter sheet and as a one-line strip above the results on phone, and on `/pantry`.
- "Change" links to `/settings#food`.
- "Turn off for this search" is a link to the same URL plus `defaults=off`. When off, the strip reads "Your defaults are off for this search · Use them" (link removes the param).
- Styling: neutral sunk surface (`surface-sunk`), mono eyebrow; allergen names in text, not colour only.

**The filter panel / sheet** (`filterPanel.tsx`, `filterSheet.tsx`, `filters.ts` helpers): the diet and allergen chips display the **effective** selection, so what you see selected is what is being applied. Default-sourced chips get a small "default" suffix in their accessible description (`aria-description="from your defaults"`), not a new visual treatment.

Toggling a diet or allergen chip **materialises** the URL: it writes the full effective `diet` and `exclude` explicitly **and** `defaults=off`. That removes any need for an "explicit empty" URL value (`exclude=` with nothing), keeps URLs honest and shareable, and means "uncheck peanuts" simply yields `defaults=off` with the remaining chips. Toggling anything else (time, cuisine, calories, cookware) leaves defaults alone.

**Clear filters**: clears what the user set; defaults keep applying (they are not filters you set). The empty-state copy changes when defaults are active: "No recipes match these filters and your defaults. Turn off your defaults to see more." with a second button.

**Counts**: `activeFilterCount` and the "Filters (n)" badge exclude defaults, so the badge does not claim filters the user never chose. The results header says "Showing recipes that fit your defaults" via the chip.

**Pantry/fridge**: `/pantry` merges defaults the same way before `matchRecipes`. The `/fridge` page and the landing/hero forms link to `/pantry` and `/recipes`, so they inherit it with no change. Matches the contract rule "never build a feature that works for one door and not the other": a test (section 10) asserts both doors drop an allergen-containing recipe under the same default.

**Not affected on purpose**: My Library (explicitly saved recipes), recipe detail pages (cached, identical for everyone), the shopping list, sitemap, canonical URLs and robots. `generateMetadata` keeps reading the *raw* URL filters so indexability never depends on who is looking.

### 5.5 Recipe page (stretch, P1)

The recipe page is ISR and the same HTML for everyone, so a personal flag must come from the client. `/api/me` already runs on every page via `AccountProvider`; extend its payload with `prefs: {diet, exclude}` and render a small "Contains nuts, which are on your avoid list" line near the existing allergen box on the client. This is the same pattern as the favourite star and have/missing marks. It reuses the same data and gives the allergen default a second safety net. Cut it if the wave runs long; the list filter is the requirement.

### 5.6 Failure and edge cases

- **Cookie missing but signed in** (new device before first `/api/me` returns, cookie blocked): the first render is unfiltered. When `AccountProvider` learns the user is signed in, `/api/me` sets the cookie and returns `prefsHash`; the provider compares it with `data-prefs-hash` on the chip (or its absence) and calls `router.refresh()` once. Honest copy in the chip area while pending is not needed; the flash exists only on the very first request after login on a new device. Because the sign-in action sets the cookie at login, this is rare. Document it.
- **Cookie stale** (changed on another device): same hash comparison fixes it on the next page load; the staleness window is one view.
- **Defaults exclude everything** (e.g. vegan + fish + nuts on a small pantry): the empty state offers "Turn off your defaults".
- **Concurrent tabs**: last write wins; cookie is set by the server in the same action as the DB write, so a tab never sees a half-saved state.
- **Router cache**: setting a cookie in a Server Action invalidates the Next client router cache; dynamic pages have `staleTimes.dynamic = 0` by default in Next 15. Verify with a browser test after saving defaults and pressing Back.

### 5.7 Caching summary

| Layer | Change |
|---|---|
| CDN / ISR | None. Defaults never touch ISR pages. Test that `/recipes` still answers `private, no-cache` and is not cached across users (cookie vs no cookie return different bodies from the same URL). |
| `unstable_cache` (browse, search, matcher) | Key already includes diet/exclude. Pass the *effective* filters in; read the cookie **outside** the cache function. Cookie-free client rule respected. |
| React `cache()` | The page's `pageFor` takes effective filters. |
| `/api/me` | Still `no-store`; now also sets the prefs cookie and returns `prefs`. |
| Middleware | Unchanged. `/settings` added to the redirect-if-signed-out list. |

---

## 6. Units, week start and sex: where each takes effect

- **Units** (metric/imperial): Me weight, height, goal weight (`formatWeight`, the weigh-in form, targets wizard). **Recipe pages do not change in this wave** (see Q3): converting quantities on an ISR-cached page is a separate client-side feature and `src/lib/shopping.ts` already has the unit maths if the owner wants it later.
- **Week start**: thread a `weekStart` argument through `weekRange`, `mondayIndex` (rename `weekdayIndex(iso, weekStart)`), `monthGrid`, the streak calculation and the week label. The SQL needs no change: `me_week_muscles` already takes `p_from/p_to`. Copy that says "Monday" in the Me UI becomes dynamic. Default `monday` keeps behaviour identical for everyone until they change it.
- **Sex**: Me targets formula (`restingRate`), the minimum-calorie floor (`MIN_KCAL`), and `MuscleCard`'s `defaultSex` (body figure). The muscle card's own front/back-and-sex toggle stays as a local view override; it does not write to Settings.
- All three come into Me pages through `getMySettings()` (one query, server) so there is no client fetch.

---

## 7. Accessibility

- Radios/checkboxes are native inputs (or the existing `Chip` primitive with `aria-pressed` for the multi-select chip groups, same as filters); every group is a `<fieldset><legend>`; a hint paragraph is tied with `aria-describedby`.
- Autosave status: one `role="status"` (`aria-live="polite"`) element per section, always in the DOM, text changes ("Saved." / "Couldn't save. Try again."). Not announced on first render.
- Focus: visible ring on every control; after a failed save, focus stays on the control; no focus traps; the "Your defaults" chip links are ordinary links.
- Targets >= 44 px; chips wrap rather than scroll horizontally; works at 200% zoom and 360 px width.
- No information by colour alone: allergens are text; the Paprika tint is decoration on top of the label.
- `prefers-reduced-motion`: no transitions beyond the existing token durations.
- Page is keyboard-complete: tab order follows section order; skip link not required (short page), but the section headings are real `h2`s for screen-reader navigation.
- Run the repo's axe/Lighthouse check on `/settings` signed in (target >= 95) and a manual keyboard-only pass.

---

## 8. Copy (warm, plain, sentence case)

Page: **Settings**. Lead: "Set these once and Minced uses them everywhere."

| Where | Copy |
|---|---|
| Name | Label "Display name". Hint "What Minced calls you. Only you see it." Button "Save name". Saved: "Saved." Empty field: falls back to "Your email name". |
| Units | Legend "Units". Options "Metric (kg, cm)" / "Imperial (lb, ft and in)". Hint "Used for your weight and height on Me." |
| Week | Legend "Week starts on". Options "Monday" / "Sunday". Hint "Changes your Me week and calendar." |
| Body | Legend "Body". Options "Female" / "Male". Hint "Used for your calorie estimate and which body we draw on your muscle map. Nothing else." Unset hint on Me: "Pick one to finish your targets." |
| Eating style | Legend "How do you eat?" Options "No preference", "Pescatarian", "Vegetarian", "Vegan". Hint "Vegetarian recipes include vegan ones too." |
| Allergens | Legend "Leave out recipes with" + chips. Disclaimer under the group (section 4.2). |
| Preview | "Your defaults: vegetarian, no nuts" / "No defaults set." |
| Chip | "Your defaults: vegetarian, no nuts · Change · Turn off for this search" |
| Chip off | "Your defaults are off for this search · Use them" |
| Cookware | Keep the existing copy: "Tap what you own. Switch on 'Only what I can make with my cookware' in the recipe filters and Minced hides anything that needs a pan or pot you don't have." |
| Saved | "Saved." (per section) |
| Error | "Couldn't save that just now. Try again." |
| Offline | "You're offline. Your change wasn't saved." |
| Loading | Skeleton rows; no text spinner. |
| Empty list with defaults | "No recipes match these filters and your defaults. Turn off your defaults to see more." |

Do not use "safe", "free of" or "allergy-friendly" anywhere. Do not write "we care about your health".

---

## 9. States

| State | Behaviour |
|---|---|
| Loading | `/settings` is a Server Component; data arrives with the HTML. `loading.tsx` shows section skeletons for the cookware vocabulary fetch only. |
| Idle | Controls reflect the DB values. |
| Saving | Control is optimistic; status text "Saving..." appears after 400 ms only (avoids flicker); `aria-busy` on the section. |
| Saved | "Saved." for 3 s, then clears (the text node stays in place to avoid layout shift). |
| Error | "Couldn't save that just now. Try again." in `text-paprika-deep`; the control reverts to the last confirmed value; no toast. |
| Signed out mid-session | The action returns `signed-out`; show "You've been signed out. Log in to save." with a login link (`next=/settings`). |
| No JS | Radios and name field submit as normal forms to the same actions (progressive enhancement: use `<form action>` for the name and each radio group; chips need JS and fall back to a Save button inside `<noscript>`). Nice to have, not a gate. |
| Row missing | `getMySettings()` returns defaults; the first write upserts. |

---

## 10. Tests

### 10.1 SQL (new `supabase/tests/user_settings_test.sql`, plus a `docs/RLS-TEST-PLAN.md` entry)

Run as non-superuser roles on a local Supabase stack (privilege suite, see LESSONS "A snapshot test proves logic, not privileges"); read other users' ids as the owner role first, then `SET ROLE`.

1. `anon` has no SELECT/INSERT/UPDATE (permission denied).
2. User A inserts and reads own row; **A cannot read B's row (count = 0)**; A cannot update B's row (`UPDATE 0`, asserted by count); A cannot insert with `user_id = B` (policy violation).
3. `authenticated` has no DELETE; row removal only through account deletion cascade (assert row count drops after `delete_my_account`).
4. Check constraints: bad `units`, `week_start`, `sex`; oversize arrays; unknown diet and allergen slugs rejected; duplicate slugs deduped and sorted.
5. Backfill: seeded `me_targets` rows produce matching `user_settings`; mirror triggers keep `me_targets.sex/units` equal after a settings update; updating `me_targets.sex` directly cannot diverge.
6. `profiles.display_name` > 60 rejected; another user's profile row cannot be updated.
7. Equivalence: with `diet_slugs = {vegetarian}` the existing `search_recipes` / `match_recipes` calls return only vegetarian-or-vegan recipes (regression for the defaults path through the RPCs, using the wave 9 `diet_satisfying`).

### 10.2 Unit (`scripts/test-filters-defaults.mts`, run with `node --experimental-strip-types`)

- `withDefaults` truth table from 5.3, including: URL `diet` wins per dimension; `defaults=off`; null defaults; hostile input (`diet=<script>`, 51 slugs, NUL byte); `defaults=on` or any other value ignored.
- Cookie parser: valid, tampered, wrong version, missing auth cookie, oversize, unknown slugs dropped.
- Round-trip: `filtersToQuery(parseFilters(x))` keeps `defaults=off`; materialise-on-toggle yields explicit `diet` and `exclude`.
- Chip label builder: ordering, pluralisation, empty cases.
- Week start: `weekRange`, `monthGrid`, streaks for Monday and Sunday on month boundaries and leap day.
- Units and sex: targets maths unchanged for the same inputs (golden values from the wave 9 targets tests).
- Settings action validators: reject non-arrays, wrong types, over-long names, control characters.

### 10.3 Browser (signed-in, real browser, headless Chrome over CDP for paint; LESSONS says test signed-in UI in a real browser)

1. Sign in, `/settings`, set Vegetarian + Nuts. Reload: values persist. `/recipes` shows the chip, no recipe containing nuts, no meat recipe; the count matches a direct DB query for the same filters.
2. `/recipes?diet=vegan` shows vegan results and still excludes nuts (per-dimension rule); chip still says "no nuts".
3. Click "Turn off for this search": URL gains `defaults=off`, results widen, chip flips; "Use them" restores.
4. Toggle the nuts chip in the panel: URL becomes explicit (`exclude=` removed, `defaults=off`), results match.
5. Same on `/pantry?pantry=...` and via the `/fridge` "use these first" link (both doors).
6. Copy the URL from step 3, open it in a private window signed out: unfiltered by defaults, no chip.
7. Sign out, then visit `/recipes`: no chip, no filtering (cookie cleared and also ignored without the auth cookie).
8. Two contexts (device A, device B): change defaults on A; reload on B; within one reload B reflects the change (cookie healed by `/api/me` and `router.refresh()`).
9. Cache: `curl` `/recipes` with and without the prefs cookie returns different bodies and `Cache-Control: private`; no `x-vercel-cache: HIT` for the cookie request.
10. Me: change units to imperial and week start to Sunday; the weight card and calendar change; change sex; the muscle map body and calorie result change; the wizard on a fresh account asks for sex once and writes Settings.
11. Accessibility: tab through `/settings` with the keyboard only; axe has no serious violations; 360 px and 200% zoom screenshots; screen-reader label check on the chip group.
12. Settings error path: block the network call in devtools, change a radio, see the reverted value and the error text.
13. Cookware: toggle on `/settings`, the filter's "Only what I can make" result changes (existing behaviour not regressed).

Manual checklist items to add to `docs/TEST-CHECKLIST.md` in the integration step, with the phone ones starred.

---

## 11. Lanes, files and ownership (non-colliding wave)

Prereqs: wave 9 merged; migration applied to live by the integrator only (CLAUDE.md "The live database belongs to the integrator"). Lanes use throwaway Postgres or a local stack. Shared files (`CLAUDE.md`, `docs/BUILD-PLAN.md`, `LEARNING-LOG`, `TERMINAL-LOG`, `src/types/database.ts`, `globals.css`) are edited only at integration; lanes put their notes in their final report.

| Lane | Owns (create/edit) | Does not touch |
|---|---|---|
| **A. Data + actions** | `supabase/migrations/2026101810xxxx_user_settings.sql`, `supabase/tests/user_settings_test.sql`, `src/lib/queries/settings.ts`, `src/lib/actions/settings.ts`, `src/lib/prefsCookie.ts`, `src/lib/settingsValidate.ts` (shared validators), `scripts/test-settings.mts`, the `/api/me` and `/api/me/export` route handlers, `src/lib/actions/auth.ts` (set/clear cookie on sign-in/out/delete), `src/app/auth/callback/route.ts` | Any component or page |
| **B. Settings page UI** | `src/app/(site)/settings/{page,loading}.tsx`, `src/components/settings/*` (new folder: `settingsSection`, `nameForm`, `unitsWeekForm`, `bodyForm`, `foodDefaultsForm`), moving `cookwareEditor.tsx` here (re-export from the old path is not needed), `src/app/(site)/account/page.tsx` (remove Settings content, keep a link/redirect), `src/middleware.ts` (add `/settings`), `headerAccount.tsx` link, `src/app/(site)/privacy/page.tsx` (cookie + data lists) | Filters, Me |
| **C. Defaults plumbing** | `src/lib/filters.ts` (`defaults` param, `withDefaults`), `src/components/recipe/defaultsChip.tsx`, `filterPanel.tsx`, `filterSheet.tsx`, `src/app/(site)/recipes/page.tsx`, `src/app/(site)/pantry/page.tsx`, `scripts/test-filters-defaults.mts`, optional recipe-page note (`servingsScaler` neighbour component + `accountProvider` prefs field) | Settings page, Me |
| **D. Me threading** | `src/lib/me/dates.ts` (weekStart), `streaks.ts`, `targets.ts` call sites, `src/lib/queries/me.ts` (read settings, drop sex/units reads), `src/app/(site)/me/**`, `src/components/me/{targetsWizard,weightCard,weightLogForm,calendarCard,muscleCard,morningPrompt,streakStrip}.tsx`, the matching Me unit tests | `filters.ts`, settings UI |

Contract between lanes (agreed up front, so B, C and D can start before A merges): the TypeScript types `UserSettings = { units, weekStart, sex: Sex | null, diet: string[], allergens: string[] }` and `FoodDefaults = { diet: string[]; exclude: string[] }`, and the function names `getMySettings()`, `readPrefsCookie()`, `setPrefsCookie()` in A's files. A lands the table + types first (half a day); the rest can code against stubs.

Collision watch-outs:
- C and B both touch the filter vocabulary options (`getFilterOptions` in `queries/browse.ts`); only C may edit that file, B calls it.
- D and wave 9 own the Me files; D must start after wave 9 merges.
- `account/page.tsx` belongs to B alone.
- Integration order: A (apply migration live, regenerate types) then B/C/D merges, then verifier runs section 10 against the integrated branch. One PR with `Closes #N` lines for every milestone that passes (new milestone numbers to be assigned in BUILD-PLAN at integration; this wave is not currently in the plan).

---

## 12. Effort and cost

| Lane | Estimate (one engineer-day ~ focused day) |
|---|---|
| A. Data + actions + cookie | 1 day |
| B. Settings page UI | 1-1.5 days |
| C. Defaults plumbing (the risky one) | 1-1.5 days |
| D. Me threading | 0.5-1 day |
| Integration, tests 10.2/10.3, privacy/test-checklist docs, fixes | 1 day |
| **Total** | **about 4.5-6 engineer-days, 3-4 calendar days when run as four parallel lanes** |

Token cost for CLAUDE.md's "state a rough cost" rule: four lanes at roughly 400-700k tokens each plus integration and verification, so **about 2.0-3.5M tokens** for the wave. Per the working rules, ask before spawning more than one agent and confirm the cost then.

Main risks: (1) the merge dependency on wave 9; (2) the materialise-on-toggle behaviour in the filter panel, which touches the most-used UI; (3) getting the cookie lifecycle exactly right (set on every sign-in path, cleared on every sign-out path, including expired sessions); (4) privacy-policy wording.

---

## 13. Open questions for the owner (with recommendations)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Route `/settings` and the old `/account?tab=settings` redirecting to it? | Yes. |
| Q2 | Sex field: one field for both the calorie formula and the body figure, as approved? Mifflin-St Jeor needs male/female; an "other / prefer not to say" option is possible if it asks which formula constant to use. | Keep binary female/male now with honest copy ("used for the calorie estimate"); add a separate optional "body figure" choice (female / male / neutral) later if you want one. |
| Q3 | Should metric/imperial also convert recipe ingredient quantities and the shopping list? Not decided in the brief. | **No in this wave** (Me only); recipe pages are ISR-cached so this would be a client-side conversion feature. Spec it next wave if wanted. |
| Q4 | Week start options: Monday and Sunday only, or also Saturday? | Monday and Sunday. |
| Q5 | When the URL says `exclude=soy`, should the user's default `nuts` still apply (union, the safe direction) rather than be replaced? | Replace per dimension for diet; for **allergens use union** unless `defaults=off`, so a hand-edited or shared link can never silently drop a saved allergy. Cost: slightly more complex rule; benefit: safety. Needs your yes. |
| Q6 | Unchecking one of your own default allergens in the filter panel: show a one-line confirmation ("Show recipes with nuts? You've set nuts to avoid")? | Yes, inline and dismissible, not a modal. Cheap and the safe direction. |
| Q7 | Cookie vs reading the DB every time. | Cookie (section 5.2). Requires a privacy-policy line. |
| Q8 | "Only what I can make with my cookware" as a saved default too (today it is restored from the account/device via `CookwareSync`)? | Keep as is; do not fold into defaults this wave. |
| Q9 | Recipe-page "Contains nuts, which you avoid" note (5.5)? | Include if time allows; it is the second safety net for allergens. |
| Q10 | Diets beyond today's four (vegan, vegetarian, pescatarian, gluten-free) and allergens beyond today's eight (US nine includes tree nuts and peanuts separately; Minced has "nuts" and no "peanuts"; the example chip in your brief says "no peanuts")? | Peanuts and tree nuts should be separate allergens per `LEGAL-COMPLIANCE.md` section 6. That is a data + matcher change (recipe allergen tagging), outside this wave. Decide whether to schedule it before launch; the chip shows whatever the table has. |
| Q11 | Should a first sign-up prompt for defaults ("Any foods you avoid?") or just point to Settings? | Point to Settings from the empty chip area on the first `/recipes` visit; a one-time prompt can come with the Phase 6 onboarding. |
| Q12 | Email/password changes live on Settings? | Link to the existing flows only; do not rebuild them. |
| Q13 | OK to change `/privacy` to list the new cookie and the settings data? | Yes; ship in the same PR. |

---

## 14. How comparable apps handle dietary preferences (brief)

Research was thin: public help centres were hard to reach and search results were mostly store listings. What was verified:

- **Yummly**: the vendor's App Store listing says the app excludes recipes containing ingredients you are allergic to and tailors recommendations to your diet once set ([App Store listing](https://apple.co/3x0Ru7U)). A dietitian-written review found foods listed as allergies still appearing in recipes and in search, and rated the allergy filter as not working sufficiently on the version tested ([Healthify NZ review](https://healthify.nz/apps/y/yummly-app/)). Lesson taken: a saved allergen preference that does not reliably apply to *search* destroys trust, which is why section 5 applies defaults on the server on both doors and tests them.
- **Centr**: dietary preference (All, Vegetarian, Vegan, Pescatarian) is set in Profile > Profile Settings and applies from the next weekly plan ([Centr help](https://help.centr.com/en-US/how-do-i-set-my-dietary-preferences-3233646)). Lesson: one setting in a settings page, with plain statements about when it takes effect; Minced's version takes effect on the next request and says so.
- **Real Plans**: saved dietary preferences are applied through a visible "Show recipes in my diet" toggle in recipe search, plus one extra diet filter ([Real Plans support](https://support.realplans.com/hc/en-us/articles/27671183489549-How-to-Find-Recipes)). Lesson: keeping the saved preference *visible and switchable* at the point of use is the right pattern, which is the "Your defaults: ... · Turn off for this search" chip.
- **Sorted Food** stores dietary requirements in settings and applies them by adding the cooking-preferences filter to a search ([Sorted help](https://help.sortedfood.com/hc/en-gb/articles/8822343840540-How-do-I-add-my-cooking-preferences-Dietary-requirements-and-dislikes)), i.e. saved but not automatic, the weaker pattern that the owner explicitly did not choose.
- **Samsung Food** lists 14 diets as filters in its store listing; it does not describe a saved, automatic preference in that listing, so nothing is claimed here beyond that ([App Store listing](https://apps.apple.com/us/app/-/id1133637674)).

Searches for MyFitnessPal, Cronometer, NYT Cooking and Allrecipes returned nothing usable; they are not cited.

Takeaways baked into this spec: save once, apply automatically, make it visible and overridable per search, never block the user from seeing what was hidden, and be modest about allergen accuracy.
