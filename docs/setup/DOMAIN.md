# Custom domain and production environment

Checked read-only on 2026-10-23 (Vercel MCP, real HTTPS requests in the built-in browser). Nothing was changed.

## What is set where

| Thing | Where | Value |
|---|---|---|
| Production domain | Vercel project `minced` (team `minced`) | `minced.kevinpham.page`, verified |
| DNS | Porkbun (nameservers `*.ns.porkbun.com`) | CNAME to `cname.vercel-dns.com.`; Vercel reports `misconfigured: false`, no conflicts |
| Certificate | Vercel (automatic, http-01) | Valid: TLS verifies cleanly; HSTS not yet confirmed in dev tools |
| Old hostnames | Vercel domains `minced-app.vercel.app`, `mise-two-xi.vercel.app` | Still attached to the project; `next.config.ts` `redirects()` sends them to the new domain with a 308 (path and query kept; set in config, not yet seen as a raw status header because the security checkpoint blocks curl, so confirm once in browser dev tools) |
| Canonical origin in code | `src/lib/site.ts` (`SITE_URL`) | `NEXT_PUBLIC_SITE_URL`, falling back to `https://minced.kevinpham.page` |
| Redirect hosts | `next.config.ts` (`CANONICAL_ORIGIN`, `CANONICAL_REDIRECT_HOSTS`) | Exact host match, so previews and localhost are never redirected |
| Auth email links | `src/lib/actions/auth.ts` `siteOrigin()` | `NEXT_PUBLIC_SITE_URL`, else the request host (previews, local) |
| Auth callback redirect | `src/app/auth/callback/route.ts` | The request host first (the cookie was set there), `NEXT_PUBLIC_SITE_URL` as fallback |

## Verified today

- `https://minced.kevinpham.page` serves production (latest production deployment READY, commit `dd556bf`, wave 14).
- `http://` answers 308 to `https://`.
- `https://minced-app.vercel.app/recipes?q=pasta` and `https://mise-two-xi.vercel.app/about` both end on `minced.kevinpham.page` with path and query kept (checked in the browser; curl cannot see the status, see below).
- On the live site: `<link rel="canonical">`, every `<loc>` in the sitemap and the `Sitemap:` line in `robots.txt` use `https://minced.kevinpham.page`; the login page contains no `vercel.app` link.
- `curl` gets 429 from Vercel's security checkpoint on every host; that is bot protection, not an outage. Use a browser for page checks. The certificate check still works with curl (`ssl_verify_result` 0).

## What the owner must confirm in the Supabase dashboard (not readable from here)

Authentication, URL Configuration:
1. **Site URL** is exactly `https://minced.kevinpham.page` (no trailing slash). The branded email templates build their links from it.
2. **Redirect URLs** include `https://minced.kevinpham.page/**`. Old `*.vercel.app` entries can stay or go; they are no longer used for sign-in because those hosts redirect.
3. If Google sign-in is turned on later: the Google Cloud redirect URI is the Supabase callback (`GOOGLE-SIGNIN.md`), not the site.
4. Custom SMTP (`EMAIL-SMTP.md`) sends from this domain's sender once set up.

Quick end-to-end test: on `https://minced.kevinpham.page` (not an old host), sign up with a throwaway address and open the confirmation email; the button should land on `/account` on the new domain.

## Environment variables: code versus Vercel

Every `process.env` read in `src/` and `next.config.ts`, against the Vercel variable names per target (names and targets only):

| Variable | Read by | Production | Preview | Development | What it does |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all Supabase clients, `photos.ts`, `recipeGate.ts`, CSP in `next.config.ts` | set | set | set | Database and Storage endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | all Supabase clients, `recipeGate.ts` | set | set | set | Public API key (RLS protects the data) |
| `NEXT_PUBLIC_SITE_URL` | `site.ts`, `auth.ts`, `auth/callback` | set | not set | not set | Canonical origin. Unset on preview/dev on purpose: `site.ts` falls back to production and auth links use the request host |
| `NEXT_PUBLIC_ENABLE_ME` | `lib/me/flag.ts` | not set (off) | `true` | not set | Me dashboard. Off on live by the owner's choice |
| `NEXT_PUBLIC_ENABLE_USER_RECIPES` | `lib/flags.ts` | not set (off) | not set | not set | User recipes; also needs `feature_flags.user_recipes` in the database |
| `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN` | `lib/flags.ts` | not set (off) | not set | not set | "Continue with Google" button |
| `SHOW_LAB` | `lab/foods/page.tsx` | not set (404) | not set | not set | Opens the internal lab page; leave unset in production |
| `NODE_ENV` | `lab/foods`, `prefsCookie.ts` | automatic | automatic | automatic | Set by Next and Vercel |

Findings:
- **Nothing the code needs is missing in production.** The two required variables (Supabase URL and publishable key) and the site URL are set. The three flags are unset by design, and an unset flag means off.
- **No extra variables.** Vercel holds exactly the four app variables above.
- Not in Vercel, correctly: `DATABASE_URL` is used only by local scripts (`pnpm db:seed`, imports) and must never be added to the app's environment.
- **`SUPABASE_SECRET_KEY` is a deliberate gap (decision for the owner).** The app reads it in one place, `src/lib/rateLimit.ts`, for the per-email rate limits (log-in 10 per 5 minutes, password reset 3 per 10 minutes). It is NOT set on Vercel, so in production those two limits are silently off; the per-address limits (sign-up 10, log-in 30, reset 10, type-ahead 120) are active and Supabase Auth has its own limits underneath. Adding it as a server-only (not `NEXT_PUBLIC_`) Production variable turns the email limits on. It is a powerful key: set it only if you accept that, and never expose it to the browser.
- `NEXT_PUBLIC_` values are inlined at build time: changing one needs a redeploy.
- When the owner is ready: set `NEXT_PUBLIC_ENABLE_ME=true` for Production and redeploy (after the Me checks); same for Google sign-in once `GOOGLE-SIGNIN.md` is done.

## How to re-verify later

1. Vercel, project `minced`, Settings, Domains: all three domains show Valid Configuration.
2. In a browser, open each old hostname with a path and query; the address bar should end on `minced.kevinpham.page` with the same path.
3. View source on the home page: canonical and `og:url` start with `https://minced.kevinpham.page`. Open `/sitemap.xml` and `/robots.txt` and scan the hosts.
4. `curl -sS -o /dev/null -w "%{ssl_verify_result}\n" https://minced.kevinpham.page/robots.txt` prints 0 for a valid certificate.
