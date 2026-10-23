# Wave 15: pre-launch pass (M6.5), 2026-10-23

Branch `w15/integration`, preview `minced-bdqnkbbcb-minced.vercel.app` (commit 59c5a53).

## 1. Lighthouse: NOT obtained, and why

BUILD-PLAN Phase 6 asks for Lighthouse >= 90 on performance and accessibility. **I could not produce a real Lighthouse score without a new package or an owner action, so no score below is a Lighthouse score.**

| Route tried | Result |
|---|---|
| Google PageSpeed Insights API, no key | HTTP 429, "Queries per day" quota exhausted for the shared keyless project. Needs an API key (owner, a secret). |
| PSI or any bot against production, preview, or `minced.kevinpham.page` | Vercel returns **429 with `X-Vercel-Mitigated: challenge`** to non-browser clients. PSI's Lighthouse would score the challenge page, not the site. The firewall would need a bypass rule for PSI (owner, a Vercel setting). |
| `lighthouse` CLI | Not in `package.json`, not in `node_modules`, not installed globally. Installing one is forbidden this wave. |

**Fastest owner route, no package:** Chrome DevTools, Lighthouse tab, on the preview or production, Mobile then Desktop, in an Incognito window with extensions off. A real browser passes the Vercel challenge. Pages to run: `/`, `/recipes`, `/recipes?q=shakshuka`, `/recipes/bean-enchiladas` (photo), `/recipes/2-step-chicken` (placeholder), `/recipes/kung-pao-chicken` (long, 34 list items), `/pantry`, `/about`, `/login`. Paste the 18 numbers into the table at the bottom.

## 2. What I measured instead (not a Lighthouse substitute)

Method: built-in browser pane on the preview, mobile 375x812 and desktop, a script that applies the same rule families as Lighthouse's accessibility category (axe: names, labels, alt, lang, title, landmarks, heading order, duplicate ids, zoom lock, colour contrast with background resolved up the tree) plus Navigation Timing and resource sizes. **The pane is not painted while hidden, so LCP, FCP and CLS were not reported and no performance score can be inferred.** Real-device timing needs the owner's run above.

Before (preview, all 9 routes x mobile and desktop):

| Check | Result |
|---|---|
| html lang, title, one `<main>`, viewport zoom allowed | pass on every route |
| Images without `alt`; buttons, links, inputs without a name or label | 0 on every route |
| Horizontal scroll at 375 px | none |
| Heading order | no skips |
| Duplicate ids / second `<h1>` | only Next's hidden streaming template (`div#S:n[hidden]`), which React removes when the page paints; not a real defect |
| Transfer, per route (encoded) | JS 153 to 167 KB, TTFB 21 to 30 ms (cached), DOMContentLoaded 71 to 1078 ms (pantry 304 to 747 ms; the 1078 ms outlier was `?q=shakshuka`, a dynamic search) |
| **Colour contrast** | **One real failure family**: the decorative "·" between meta parts (`#c7cec7` on `#fbfbf8`, ratio 1.55, and 1.44 on the recipe header). Present on `/`, `/recipes`, `/recipes?q=`, every recipe page. All body text and links passed. |
| Small tap targets (under 24 px) | inline source and licence links: "Drafted with AI, reviewed" 228x19, "USDA MyPlate Kitchen" 135x18, "CC BY-SA 3.0" 81x14, "How we make recipes" 128x18, OGL links 20 px tall, login "Terms" / "Privacy Policy" 16 px tall, an icon button 20x20 on recipe pages. WCAG 2.2 target-size (AA) exempts inline links in running text; I did not change these. |

## 3. Fix made on the branch

`src/components/ui/metaRow.tsx`: the decorative separator is now a 3 px drawn dot (`bg-stone-line`, `aria-hidden`) instead of the "·" character, so it is no longer scored as low-contrast text. Same colour token, same place, no visual change. ESLint clean. Not re-measured in a browser (needs a preview rebuild); the owner's Lighthouse run will show it.

Nothing else needed changing on the evidence above. I did not touch images, fonts or client JS: without LCP data any change would be a guess.

## 4. Lighthouse scores to fill in (owner)

| Route | Mobile perf | Mobile a11y | Desktop perf | Desktop a11y |
|---|---|---|---|---|
| `/` | | | | |
| `/recipes` | | | | |
| `/recipes?q=shakshuka` | | | | |
| `/recipes/bean-enchiladas` | | | | |
| `/recipes/2-step-chicken` | | | | |
| `/recipes/kung-pao-chicken` | | | | |
| `/pantry` | | | | |
| `/about` | | | | |
| `/login` | | | | |

## 5. Compliance: LEGAL-COMPLIANCE.md section 11, "Blocks launch"

Status key: done (in code, evidence given), missing (code work left), owner-only.

| # | Item | Status | Evidence / what is left |
|---|---|---|---|
| 1 | Source audit of the 872 MyPlate recipes | **owner-only** | M1.5.7 is still unchecked in BUILD-PLAN (owner review of rejected recipes, unresolved ingredients and the in-review recipes). |
| 2 | Credits page, per-recipe source line, no-endorsement | **done** | `/about` has the credits and "not affiliated with, endorsed by" (`about/page.tsx` line 205); recipe page shows a source line ("USDA MyPlate Kitchen", "CC BY-SA 3.0", "How we make recipes"); footer credits USDA MyPlate and FoodData Central; CNF and OGL credit under the nutrition label (`nutritionPanel.tsx` line 162). |
| 3 | Privacy policy | **done in code** | `/privacy` exists with cookies section and Google login wording. The wording itself is not lawyer-reviewed (owner). |
| 4 | Terms with clickwrap at signup | **done in code** | Signup has an "I agree to the Terms" checkbox, validated (`authForms.tsx` line 247 onward); `/terms` exists with 13+ line. Lawyer review is owner-only. |
| 5 | Real domain and Google OAuth consent screen | **owner-only** | `minced.kevinpham.page` is live and the sitemap uses it. Google Cloud consent screen, verification and enabling `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN` are owner steps. |
| 6 | Allergen, nutrition, food-safety disclaimer | **done** | "Per serving, estimated" and "Not medical advice" on the label; terms say read the label and cross-contact; allergen filters carry "can miss brands and cross-contact, so always read" (`allergenConfirm.tsx`). |
| 7 | Cookie posture | **done, one gap** | Privacy lists the cookies and states there is no banner; auth-only cookies, no analytics installed. **PostHog is not installed** (M6.3); when it is, it must be cookieless or consent-gated and the policy updated. |
| 8 | Trademark decision on "Minced" | **owner-only** | Clearance and rename-or-keep decision. |
| 9 | Account deletion and data export | **done** | `DeleteAccountForm` and `deleteMyAccount()` (`authForms.tsx`, `lib/queries/account`); export route `src/app/api/me/export/route.ts` and a Settings link (privacy page mentions it). Live deletion cascade was not exercised by me (no live writes). |
| 10 | Contact mailbox and "Report a problem" | **missing / owner-only** | `CONTACT_URL` is `https://github.com/knp4830/minced/issues/new` (`legalPage.tsx` line 50): a public GitHub issue form, no `legal@`/`copyright@` mailbox, and there is no per-recipe "Report a problem" link. Needs the owner to create a mailbox (Resend/Porkbun step); then a small code change. |
| 11 | Accessibility baseline (WCAG 2.1 AA, axe in CI, statement) | **partly missing** | Structure and names pass my checks (section 2), skip link, focus rings exist. **No axe in CI** (no axe package, no workflow in the repo) and **no accessibility statement page**. Both need either a package decision (owner) or a short statement page (code, small). |

Section 11 items 12 to 15 (user-generated content) stay off while `NEXT_PUBLIC_ENABLE_USER_RECIPES` and `feature_flags.user_recipes` are off: DMCA agent registration, repeat-infringer wording, report link, DSA contact.

Also from Phase 6: a 13+ line is present (item 19). GPC/DNT and Sentry PII scrubbing (item 17) are moot until Sentry and PostHog exist.

## 6. Phase 6 items only the owner can do

- Lighthouse run in Chrome DevTools (section 1), or provide a PSI API key / allow a PSI bypass in the Vercel firewall, or approve adding `lighthouse` as a dev dependency.
- Sentry (M6.2) and PostHog (M6.3): decide whether to install at all (both are new packages and new third parties; the privacy page and cookie posture change), create accounts and DSNs, and approve the packages.
- Test on a real phone, not devtools.
- Watch three real people use it, silently.
- Every env var set in Vercel Production (names can be checked read-only with the Vercel tools; setting them is yours): `NEXT_PUBLIC_ENABLE_ME`, Google flag, SMTP.
- Custom domain finishing (`minced.kevinpham.page` works; decide the final domain), Google OAuth consent screen, trademark decision, lawyer review of Terms and Privacy, M1.5.7 review, contact mailbox, DMCA agent registration before user recipes.
