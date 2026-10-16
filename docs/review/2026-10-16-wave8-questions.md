# Wave 8 questions and owner steps (2026-10-16)

Every open question from every lane, with the default that was built and a recommendation. Answer by number. Nothing here blocks the merge unless marked.

## OWNER STEPS (in order)

Nothing below has been done for you. No lane touched live, DNS, Google, Resend or Vercel.

**A. Before merging the PR**
1. Say "go". Claude then backs up live, applies `20261016100000_me_dashboard.sql` (live goes from 34 to 35 migrations), and only then do you merge. After applying, push an empty commit to re-run the Vercel preview (see LESSONS section 9).
2. Supabase dashboard, Authentication, URL Configuration: Site URL = `https://minced.kevinpham.page`; add `https://minced.kevinpham.page/**` to Redirect URLs. Do this before merge, or the 308 host redirect will break sign-in.
3. Vercel, Production env: `NEXT_PUBLIC_SITE_URL=https://minced.kevinpham.page`.

**B. Photos (P1 is fixed; run after you answer P2 or accept it as is)**
4. Back up live (database dump and the `recipe-photos` bucket listing).
5. `python scripts/photos/process_images.py`, then `python scripts/photos/upload_photos.py --apply`, then run `supabase/seed-photos.sql`. The seed deletes `recipe_photos` rows for recipes not in the manifest.

**C. Google Cloud (only when you want Google sign-in; it stays last)**
6. Follow `docs/setup/GOOGLE-SIGNIN.md`: project, consent screen, Web client, redirect URI from Supabase, paste client id and secret into Supabase (never into chat or git).
7. Only then set `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN=true` in Vercel and redeploy. This is what closes M4.1.

**D. Email provider and Porkbun DNS**
8. Follow `docs/setup/EMAIL-SMTP.md`: Resend account, add the sending subdomain, create DNS records at Porkbun on child names of `minced` only. Never add a record at `minced` itself (it is a CNAME to Vercel) and do not touch the apex. Skip Resend's optional `inbound.minced` MX.
9. Supabase, Auth, SMTP settings: paste the Resend SMTP details; paste the four templates from `supabase/templates/`; raise the email rate limit.
10. After Resend is live, add Resend to the "Who handles the data" list on `/privacy`.

**E. Vercel env vars for turning features on (build-time, redeploy after each)**
11. `NEXT_PUBLIC_ENABLE_ME=true` (use the string `true`). The privacy text, about credit and account export already cover Me in this PR.
12. `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN=true` (step 7).

---

## Me dashboard

| # | Question | Default built | Recommendation |
|---|---|---|---|
| M1 | Pace maths: mockup uses pace kg x 1000 kcal/day (0.5 kg/week = 500 kcal). Common rule is about 1100. | 1000, one constant `KCAL_PER_KG_PER_WEEK` | Keep, it is gentler |
| M2 | Calorie floor: never suggest under 1200 (you can type lower, DB allows 800). | 1200 | Keep |
| M3 | "Goal hit" on the calendar: calories 85 to 110 percent of target AND protein at least 90 percent; other days with food are "partly". No targets means "logged". | As stated, in `src/lib/me/foodStatus.ts` | Confirm or give your numbers |
| M4 | Nutrient panel: recipes store only calories, protein, carbs, fat, fibre, sodium, so only those show as percent of FDA Daily Value. The mockup shows about 19 vitamins and minerals. A later wave could compute micronutrients from USDA data. | 6 nutrients plus an honest note | Yes, do it post-launch |
| M5 | Muscle split per session (e.g. Push = chest 35, shoulders 30, triceps 35) and defaults of 15 sets / 45 min are my starting values. | `src/lib/me/muscles.ts` | Review the table; tell me changes |
| M6 | Sleep logs under today's date (the night just ended). | Today | Keep |
| M7 | Week starts Sunday (matches mockup). | Sunday | Keep unless you train Monday-first |
| M8 | Phone: nutrients panel always expanded; the mockup had an "All nutrients today" button. | Expanded | Collapse on phone for a shorter page |
| M9 | Food in the quick-log sheet opens an Add food dialog (recipe search plus quick add); recipes save immediately there, while Log saves workout plus sleep. | Split as stated | Keep |
| M10 | Skip on the targets wizard: leave no calorie goal forever, or re-prompt after a few days? | Never re-prompt | Keep; a gentle line on the page is enough |
| M11 | Muscle map style: the owner mockup shows a flat mannequin with white seams; the build uses MIT-licensed anatomical line art (react-native-body-highlighter), male and female, front and back, accurate muscle groups. Not 1-for-1. | MIT artwork | Accept, or ask for a redraw in the mannequin style (our own art, more work) |
| M12 | Muscle map defaulted to Male even after targets saved sex=female. | **Fixed (a2750b7)**: follows the saved sex, toggle still works | Done, verified in a browser |
| M13 | Mockup details not matched: no "I cooked this" button on the Food card; the empty state keeps an "All nutrients" card; quick-add placeholders can clip in narrow macro fields. | Left as built | Fine for now |
| M14 | Phone layout overflowed to 439 px. | **Fixed and verified** at 375 px signed in on a local stack (scrollWidth 375) | Done |
| M15 | "Fibre" spelling on /me (the site is US-leaning, USDA says fiber). | Fibre | Switch to Fiber? |

Not driven in a browser after the last changes: "Log this" on a recipe page, and the phone quick-log sheet and FAB.

## Google sign-in, email, domain

| # | Question | Default built | Recommendation |
|---|---|---|---|
| A1 | Google brand colours: add `--google-blue/-green/-yellow/-red` tokens to globals.css so the G is coloured. | Monochrome G | Add the tokens (globals.css is yours to approve) |
| A2 | Should a Google user's name seed `profiles.display_name`? | No | Keep off until the author_id/display decision for user recipes |
| A3 | Sign-up confirmation emails now always land on /account (token_hash links cannot carry `next`). | Accept | Keep, it makes confirm work across devices |
| A4 | Supabase Site URL change timing. | Before merge | See step 2 |
| A5 | Is `NEXT_PUBLIC_SITE_URL` set on Vercel Production? | Code falls back to the subdomain | Set it (step 3) |
| A6 | Email provider. | Resend (100 a day free) | Keep; Brevo only if you need a higher daily cap |
| A7 | Old email links sent from `minced-app.vercel.app` will fail after the 308 (the PKCE cookie is bound to the old host). | Accept | Change Site URL and expect old emails to need a resend |
| A8 | Phone header had no Recipes or Me links (footer only). A nav change landed in 542c39c. | See header | Look at it on your phone |

## Photos

| # | Question | Default | Recommendation |
|---|---|---|---|
| P1 | fish-spinach showed a previously rejected photo; several swaps were worse than before. | **Fixed (c7271da)**: fish-spinach, tofu-broccoli, stir-fried-beef, baked-trout back to their USDA photos, menemen back to its old photo; shepherds-pie, rice-pudding1, cafe-mocha, banh-mi removed; `check_manifests.py` now fails if a note-only reject slug gets an unreviewed photo | No longer blocks the photo step (377 photos) |
| P2 | 80 of 381 photos are under 1000 px wide (55 are USDA 600x400). Recipe pages show about 590 CSS px, so they are 2x upscaled on retina and soft. | As is | Accept USDA 600 px for now, or cap the display size of small photos. Your call |
| P3 | Photo-less recipes (534): none added, because no honest match was found for generic USDA titles. | Striped placeholders | Accept for generic titles; add named dishes only when a clear match appears |
| P4 | 24 photos removed (placeholder shown). Want any back? Sheets are in the photos worktree, `scripts/photos/cache/w8/owner_sheets/removed_*.jpg` (gitignored). | Stay removed | Keep removed |
| P5 | 21 photos swapped; sheets `replaced_*.jpg` (old left, new right). | Approved as is | Glance, then approve |
| P6 | USDA-logo photos allowed on the landing page? | No | No |
| P7 | Recipe cards load the 640 px file (was 400): sharper on retina, about 1.6x bytes per card. | 640 | Keep |
| P8 | `quality-audit.csv` was stale. | **Fixed (c7271da)**: derived from photos.json; 354 keep, 23 replace, 46 remove | Done |

## Site-wide findings from verification (not decided by a lane)

| # | Question | Default | Recommendation |
|---|---|---|---|
| S1 | Pescatarian filter returns 13 recipes while Vegetarian returns 40, because only fish dishes are tagged pescatarian. Should pescatarian include vegetarian and vegan? | As tagged | Yes, include them |
| S2 | A leftover hidden streaming `<div id="S:1">` duplicates the page body in the DOM (also on live; a Next streaming artefact). | Ignore | Ignore |
| S3 | Signed-in avatar invisible on the green landing header. | **Fixed (a2750b7)**: light avatar on green | Done |
| S4 | `/terms` does not mention Me or health data (`/privacy` does). | Not changed | Cover it in the lawyer pass before user recipes launch |
| S5 | `/about` has about 50 credit links smaller than 44 px at 375. | Not changed | Pad them in a polish wave |
