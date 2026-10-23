# Wave 15 questions and owner steps (2026-10-23)

Wave 15 was launch readiness behind the scenes: no new features. Each item below has a default, so if you say nothing the default applies.

## Say "go" to this one first

**Back up live and apply the three migrations before merging the PR.** Claude does it from `scripts/nutrition/LIVE-STEPS.md` "Wave 15": run `bash scripts/backup/backup-live.sh --live pre-wave15` (the storage half has only been syntax-checked, so if it fails the database dump is still the important part), apply `20261023200000`, `210000`, `220000` in order (live goes 62 to 65), verify by counting, then merge. Default: wait for your "go".

## Owner-only steps (Claude cannot or must not do these)

| Step | Why | Where |
|---|---|---|
| Real Lighthouse run (DevTools, Lighthouse tab, mobile and desktop) on `/`, `/recipes`, a recipe page; paste the numbers into the table | Vercel's bot challenge blocks every non-browser tool, so no score exists yet. A stand-in audit scored performance 91 to 100 and accessibility near-clean, but that is not an official score | `docs/review/2026-10-23-lighthouse-w15.md` |
| Real-phone test | M6.5 needs a real device, not devtools | `docs/TEST-CHECKLIST.md` section "Wave 15" |
| Three people use it while you watch silently | M6.5 | none |
| Supabase Auth: Site URL exactly `https://minced.kevinpham.page`, Redirect URLs include `https://minced.kevinpham.page/**`, then a throwaway signup | Claude cannot read the dashboard | `docs/setup/DOMAIN.md` |
| Supabase Auth dashboard: check its own rate limits, CAPTCHA and leaked-password protection | A second layer under our limiter | Supabase dashboard |
| Optional Vercel firewall rate-limit rule on `/login` and `/signup` | A third layer; a Vercel setting, so Claude does not touch it | Vercel dashboard |
| Google Rich Results Test on two photo recipes, then submit the sitemap in Search Console | Needs the live URL and your Google account | after deploy |
| Create a real contact mailbox (Resend plus Porkbun) | `CONTACT_URL` is still a public GitHub issue form | `docs/LEGAL-COMPLIANCE.md` item 10 |

## Decisions, with a default

1. **Per-email rate limits (log-in 10 per 5 min, reset 3 per 10 min) are OFF in production** because they need the server-only `SUPABASE_SECRET_KEY` on Vercel. The per-address limits (sign-up 10, log-in 30, reset 10, type-ahead 120) are active. Recommendation: leave it off for now (Supabase Auth has its own limits, and the key is powerful). Set it as a Production, server-only variable only if you want per-email limits. Default: off.
2. **Photo-less recipes in Google's recipe results.** 580 of 957 recipes have no photo, so their Recipe markup is valid but not eligible for rich results (Google requires an image); the site verifier counted this as a gap. Recommendation: ship as is; photos are the lever, not a fake image. Default: ship as is.
3. **Cook-submitted recipes credit "Minced" as author in JSON-LD** so no private account id is exposed. Default: keep until the `author_id` decision (Entry 35).
4. **MyPlate "partial" nutrition (about 280 recipes) is left out of JSON-LD** though the page shows the published calories. Default: keep withheld.
5. **Sentry and PostHog (M6.2, M6.3) need new packages.** Recommendation: Sentry only (free tier, scrub personal data, update the privacy page); PostHog after launch, cookieless. Needs your go-ahead; nothing is installed.
6. **`next` 15.5.x security advisories**: a package bump needs your go-ahead. Recommendation: yes, in the next small wave.
7. **Lighthouse route.** Options: (a) you run DevTools Lighthouse and paste 18 numbers (recommended, free, no package); (b) add the `lighthouse` CLI as a devDependency plus a firewall bypass; (c) a PageSpeed API key plus a bypass. Default: (a).
8. **Accessibility in CI (axe).** Needs a devDependency such as `@axe-core/playwright` or `jest-axe`. Default: not now.
9. **Error and 404 copy** ("A hiccup on our side", "That didn't load", "That page isn't here"). Say if the voice should change; the files are `errorView.tsx`, `global-error.tsx` and the two `not-found.tsx`.
10. **Autosave copy and behaviour.** Should in-review recipes autosave too? Recommendation: no (saving one voids its review decision; the explicit Save stays). Should the "stopped" message offer a sign-in link? Default: not now.
11. **Inline source and licence links** under 24 px tall (WCAG 2.2 exempts inline links). Default: leave.
12. **`NEXT_PUBLIC_ENABLE_ME` for Production.** Default: only after your Me review on Preview, then a redeploy.
13. **Keep the old `*.vercel.app` hosts** attached as redirect sources. Default: keep.

## Please check on a preview

- `/me` (click several days and the month arrows) and `/account` tabs: they got a `loading.tsx` and were not click-tested signed in. If navigation feels stuck after a hard reload, delete `src/app/(site)/me/loading.tsx` and `src/app/(site)/account/loading.tsx` (the same thing broke `/pantry`).

## What the verifiers found (why only M5.2 is checked)

- **M5.2 autosave: passed** on a local stack with the flags on and two real users. Minor, not blocking: with the DB switch off and a signed-in user the stopped message wrongly says "signed out"; the device backup key is not scoped to a user or cleared on sign-out (a shared browser could offer the previous person's unsaved text); a duplicate-key console warning in the food picker (two USDA rows share an id; file unchanged by this wave).
- **M6.1 and M6.4: not passed.** Error boundaries and the 404 passed. Gaps: Recipe JSON-LD has no `image` on photo-less recipes (decision 2); `/account`, `/settings`, `/recipes/new`, `/recipes/[slug]/edit` share the site description and several noindex routes have no canonical; `/pantry` and `/lab/foods` have no loading file by design; signed-in skeletons and the ISR recipe skeleton were not shown; an unknown recipe slug shows the generic 404 because the middleware rewrites twice (this predates wave 15); the 404's first HTML carries the title "Minced" until hydration.
- **M6.6 domain: not passed, mostly on paperwork.** The domain, TLS, redirects and canonicals check out. Fixed at close-out: `DOMAIN.md` wrongly said the app never reads `SUPABASE_SECRET_KEY` (decision 1). Still open: Supabase Auth URLs and a throwaway signup (yours), HSTS not seen on live, and the 308 on old hosts was seen only in the browser.
- **M6.5: not passed** (needs the owner steps above). Stand-in audit: performance 91 to 100, axe clean apart from one heading-order notice on recipe cards (`h3` with no `h2`). The desktop landing page shows a layout shift of about 0.11 around 7 seconds (footer wrapper), which a real Lighthouse run will tell us whether to chase.

## Security glance (integrator)

No high findings. New SECURITY DEFINER functions: `autosave_my_recipe` (authenticated only, flag-gated, drafts only, ownership checked) and `check_rate_limit` (fixed limits, private table with RLS on and no grants, hashed subjects). Medium or low, accepted: a visitor with the public key can burn another address's per-address bucket if they know the address (a one-window lockout of that address, same as hammering the form); someone could fill a kind's 20,000 distinct-subject cap in a window, which makes the limiter fail open for new subjects until the window ends; the limiter fails open by design. Backup script refuses non-local URLs in dry run, never prints the key, and its output folder is git-ignored. No secrets in the diff.

## Idea logged

Your workouts-page idea is now under "v2 — Workout plans" in `docs/BUILD-PLAN.md`, in your words, as an idea and not a milestone.

## Disclosure

The integrator's `next build` read live Supabase through the public anon key (read-only) because `.env.local` was copied into the worktree. Nothing was written and `DATABASE_URL` was not used. LESSONS section 15 says how to avoid it.
