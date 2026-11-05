# Manual test checklist — everything Minced does today

The full feature inventory as of waves 1–7 (2026-10-14), written as things to try. **Desktop first** (Chrome, ~1280 px wide, DevTools console open — any red error is a bug), then repeat the starred ★ items on a phone (~375 px).

For each item: ✅ works · ❌ broken (note the URL and what you saw) · ❓ unclear or ugly.
Live site: https://minced-app.vercel.app

---

## 1. Landing page — `/`
- [ ] ★ Hero shows "Find the recipe. Skip the life story.", a recipe search box, and a **"What's in my fridge?"** button — and only one fridge button on the page.
- [ ] 3×3 photo grid loads real photos; each tile opens its recipe.
- [ ] Stat line shows real numbers (≈959 recipes · filters · 0 backstories).
- [ ] "Photo credits" link goes to `/about#photos` (known bug: the list stays collapsed after the jump).
- [ ] Features band, "Why we built this", green "Ready when you are." band all render; their buttons work.
- [ ] Footer is one slim line (not a navbar); "How recipes are made" works.

## 2. Search (door 2) — `/recipes?q=`
- [ ] ★ Search "shakshuka" → Shakshuka first.
- [ ] Misspell "shakshouka" → still finds it.
- [ ] Synonyms: "aubergine" (eggplant), "courgette" (zucchini), "prawns" (shrimp) find recipes.
- [ ] "korean", "chickpea", "cacio" return sensible results.
- [ ] A very long nonsense word does not stretch the page sideways.
- [ ] Header search box keeps what you typed after searching.

## 3. Browse + filters — `/recipes`
- [ ] Grid of cards; recipes with photos come first; others show a designed placeholder tile (dish name on a colour), not grey stripes.
- [ ] "Show more" loads the next page with no repeated recipes (click it 3×).
- [ ] Desktop: filter rail on the left. Phone ★: green "Filters" button opens a bottom sheet; the page behind does not scroll while it's open.
- [ ] Each filter changes results and the URL: time, diet, free-of (allergens), cuisine, spice, calories, protein, **cookware** (e.g. wok).
- [ ] "Only what I can make with my cookware": pick your cookware, turn it on — recipes needing other cookware disappear. Refresh — still on.
- [ ] Changing a filter shows immediate feedback (top bar / dimmed results).
- [ ] Back button restores the previous filter state. Copy the URL into a new tab — same results.
- [ ] "clear all" resets.

## 4. Fridge door (door 1) — `/pantry`
- [ ] ★ "What's in my fridge?" opens the picker: aisle tabs, top items first, "Show all", picked count.
- [ ] Tap onion, garlic, egg (no typing) → "Show recipes".
- [ ] Results include recipes that use only one of them, ranked "you have X of Y · missing: …".
- [ ] Find box inside the picker: type "green onion" → scallion; "courgettes" → the "summer squash" chip (zucchini folds into its family parent by design; recipes with zucchini still count as a match).
- [ ] The **same filters as browse** work on these results.
- [ ] Refresh the page → your fridge picks are still there. Share the URL → same fridge.
- [ ] Filters that exclude everything → heading says "No recipe fits these filters".

## 5. Recipe page — `/recipes/<slug>`
- [ ] ★ Only ingredients, amounts, numbered steps, nutrition, allergens, diet, cookware — no essay.
- [ ] Servings stepper rescales quantities correctly (check one by hand).
- [ ] Photo with credit + licence link, or the designed placeholder.
- [ ] USDA recipes show a source link (archive.org copy); "Minced original" recipes show "Drafted with AI, reviewed by Minced" → `/about`.
- [ ] Opened from fridge results: ingredients are marked have / missing.
- [ ] Nutrition shows "≈ estimate · USDA data".
- [ ] `/recipes/does-not-exist` → a real "not found" page with a way back.

## 6. Shopping list — `/shopping`
- [ ] On a recipe page, "Add to shopping list" (works logged out).
- [ ] Staples (salt, oil…) are skipped by default; items already in your fridge are skipped and listed as "you already have".
- [ ] Add a second recipe sharing an ingredient → merged into one line with converted units (2 cloves + 3 cloves = 5 cloves; 1 tbsp + 1 tsp = 4 tsp).
- [ ] Grouped by aisle; tapping a row checks it; "N of M gathered · from K recipes" updates.
- [ ] "Clear checked" and "Print" work (print preview looks clean).
- [ ] Header "Shopping list" link works.

## 7. Accounts — `/signup`, `/login`, `/account`
- [ ] Sign up: password needs 8+ characters; the confirmation email arrives (Supabase's built-in sender is slow and limited — note how long it took).
- [ ] The confirm link lands you signed in on minced-app.vercel.app (not localhost).
- [ ] Signing up again with the same email gives a neutral "check your email" message.
- [ ] Log out / log in; wrong password shows a clear error. "Forgot password" email works.
- [ ] After signing in, your browser fridge is offered for import; your logged-out shopping list merges in.
- [ ] Favourite star (gold) on cards and recipe pages; `/account` → Library shows them.
- [ ] `/account` → export your data (JSON downloads) and delete-account flow (try it on a throwaway account only).

## 8. Fridge with dates — `/fridge` (signed in)
- [ ] Add items; set Bought and Use-by dates; suggested shelf life appears.
- [ ] A Use-by date before Bought is refused.
- [ ] List sorted by soonest expiry with "expires in N days" badges.
- [ ] "Use these first" → recipes containing the soonest-expiring items.

## 9. Admin review — `/admin/review` (after Claude makes you admin)
- [ ] Logged out or as a normal account → "not found".
- [ ] As admin: J/K to move, A approve, X reject (recipe disappears from search/browse/fridge within a few minutes), E edit, U undo; progress "N of 959 reviewed".
- [ ] There is no filter for the 116 cookware-edited recipes (only status and source); review a few by hand.
- [ ] `/admin/review?source=user` lists user recipes (only when the user-recipes switch is on).

## 10. Info pages
- [ ] `/about` (how recipes are made, AI disclosure, photo sources + credits), `/privacy`, `/terms` read correctly.

## 11. Things that should NOT be reachable
- [ ] `/kitchen-sink`, `/api/ingredients/suggest` and `/what-can-i-make` all return 404 (kitchen-sink and suggest were deleted in wave 7; combo pages are post-MVP).
- [ ] With `NEXT_PUBLIC_ENABLE_USER_RECIPES` unset: no "Create recipe", "My Recipe Book" or `/recipes/new` link anywhere; `/recipes/new` and `/recipes/<slug>/edit` show a 404 page (signed out they redirect to login first); `/account?tab=book` falls back to My Library.
- [ ] No page shows a raw error ("Application error"). If one does, copy the URL.

## 12. Wave 7 additions
### Shopping re-add (works signed out and in)
- [ ] ★ Add a recipe to the shopping list twice: a dialog "X is already on your list" opens with focus on "Keep one"; Escape or a backdrop click leaves the list unchanged ("Kept as is").
- [ ] "Add again (2 batches)" doubles the quantities on `/shopping`; a third time offers "3 batches". The dialog fits at 375 px with both buttons full width.
- [ ] A recipe that repeats an ingredient on several lines counts as 1 batch, not 2.
### Cookware either/or
- [ ] `/recipes/gazpacho` shows one cookware chip "Blender or food processor".
- [ ] "Only what I can make", with only a food processor ticked in My cookware: gazpacho and pea-pesto are listed on `/recipes`, `/recipes?q=gazpacho` and `/pantry`. With only a wok: they are not.
- [ ] Cookware filter "Food processor" also lists the grouped recipes. fried-rice and chicken-stir-fry (skillet or wok) show for a cook who owns only one of the two; cream-broccoli-soup needs a saucepan AND (blender or food processor).
### Search and SEO basics
- [ ] "mac and cheese" and "macaroni and cheese" find the macaroni recipes (known bug below: multi-word titles containing an alias word can rank low).
- [ ] View source of a recipe page: a schema.org Recipe JSON-LD block with `<` escaped; `twitter:card` is summary_large_image when the recipe has a photo.
- [ ] `/sitemap.xml` lists the home, `/recipes`, `/about`, `/privacy`, `/terms` and every published recipe, and none of `/pantry`, `/fridge`, `/shopping`, `/account`, `/admin`, `/recipes/new`.
- [ ] `/robots.txt` disallows `/api/`, `/account`, `/fridge`, `/pantry`, `/shopping` and the auth pages, and does not name `/admin`.
- [ ] Landing page title reads "Minced: recipes by name or by what's in your fridge" (owner to confirm the copy).
### Photos (only after the photo fixes are done and the seed is applied)
- [ ] country-style-potato-salad, coffee-cooler, microwave-potato-corn-chowder, oven-baked-sweet-potato-fries, perfect-pumpkin-pancakes and broccoli-salad each show a photo of the same dish, with credit and licence.
- [ ] garden-barley-soup, turnip-pancakes, parmesan-chive-biscuits and walleye-chowder show the placeholder tile.
- [ ] No two recipes share the same photo file; no photo shows the MyPlate.gov logo.
### User recipes (ONLY with both switches on: `NEXT_PUBLIC_ENABLE_USER_RECIPES=true` and `update feature_flags set enabled = true where name = 'user_recipes'`)
- [ ] Signed out, `/recipes/new` redirects to login and comes back to the form.
- [ ] `/account?tab=book` shows "Create recipe" (or the empty state). Save draft with an empty title: the error names the title and focuses it.
- [ ] An unknown ingredient ("dragonfruit zzqx") shows "not in our ingredient list" and save is refused naming the row. "eggs" saves as egg; "1 1/2" saves as 1.5. A bad amount focuses the amount field.
- [ ] Add, remove and reorder ingredient and step rows; at 375 px rows stack with no sideways scroll and buttons are 44 px.
- [ ] Submit without the rights tick is refused; with it the recipe shows "Pending review". As admin, approve it at `/admin/review?source=user`; the public page says "Shared by a Minced cook" and search finds it.
- [ ] Undo the approval: the recipe disappears from the public site. Reject with a note: the author sees "Sent back" and the note.
- [ ] Editing a published recipe sends it back to review (hidden until re-approved). Another account opening its `/edit` URL gets 404. Delete asks for confirmation (Escape closes it; focus returns to the Delete button).

## 13. Known bugs found by the wave 7 checklist pass (not fixed in this PR)
- Signed-in client state is dead: the header keeps showing "Log in / Sign up", favourite stars ask you to log in, and the shopping list and fridge are not imported after sign-in. Cause: `accountProvider.hasAuthCookie()` reads `document.cookie`, but the auth cookies are httpOnly (since wave 5/6). `/api/me` still returns the user. Section 7 items about import, stars and the header fail until this is fixed.
- Search: `rewriteSynonyms()` rewrites every alias word, so exact titles such as "Corn Tortillas", "Oatmeal Bread" and "Dan Dan Noodles" fall off page 1 (13 of 959 are not on page 1, about 12 more rank 3 to 7), and "mac and cheese" returns the wrong macaroni recipes.
- `/about` still says accounts and shopping lists "are not available".
- The "under 20 min" time filter counts recipes with unknown time (stored as 0) as matching.
- Fridge "Use these first" returns one page of 99.

## 14. Review wave (2026-10-15), check after the migration, dedupe and cleanup are live
- [ ] Landing: green nav, "Know what to cook tonight.", stat strip reads "No sign-up", three Coming soon cards (nutrition, workouts, share your own recipes), no horizontal scroll at 375.
- [ ] Signed out: header "What's in my fridge?" opens the picker; "Sign in to save your fridge" shows; nothing is stored; reload loses picks.
- [ ] Log in and Sign up open as a modal over the page; Esc, X and backdrop close and return focus; direct `/login` is a full page.
- [ ] Sign out from `/account` lands on `/`.
- [ ] `/me` shows a coming-soon page; "My recipes" shows a placeholder when the flag is off.
- [ ] Filters: time chips and From/To; Contains chips narrow results (also with `?q=` and on `/pantry`); calories and protein sliders move with arrow keys; max spice is gone.
- [ ] Signed in: cookware filter shows the toggle plus a collapsed list; signed out: no cookware group.
- [ ] Apple Cake: "12 servings", nutrition tiles, More nutrition, one allergen row, 12 px gap at the stepper, no amount in the butter note.
- [ ] Signed out with no fridge link: no have/missing marks. With `?pantry=` the staples sentence appears.
- [ ] Shopping list shows names, grouped by aisle, no cups or grams.
- [ ] `/about` no longer says accounts are unavailable.
- [ ] After dedupe: heavenly-deviled-eggs and tostadas-delgadas are 404; recipe count is 957.
- [ ] Landing and filters make no spice-level claim; "No sign-up" shows as normal text (no hex box); `/lab/hero` is 404.
- [ ] Sign out from the header on `/recipes`, from `/pantry` and from `/account`: header returns to Log in / Sign up, fridge picks are gone, Back does not show stale account content.
- [ ] Apple Cake at 12, 2 and 1 servings: amounts read in cups, tbsp and tsp (no decimals); eggs read "about 1/2 egg" at 1 serving; prep notes do not change with servings.
- [ ] After applying the prep-note cleanup: cranberry-salad shows no stray ". packages" note (known defect until `clean_prep_notes.py` is fixed).
- Still open: mac and cheese search, unknown-time recipes pass time ranges, kitchen-fraction oddities (19 tbsp, 1/8 egg), prep-note cleanup edge cases (cranberry-salad, 'about 3 cups', delicious-greens mustard), legacy photo rejections without file names (29) not guarded against rebuild.

## 15. Wave 8 (2026-10-16), check after the Me migration, photos and redirects are live
- [ ] Hero: the biggest landing tile (Japanese Curry Rice) is crisp at 1920 wide and on a retina phone. The other tiles are sharp, no blurry or ugly photo on the landing page.
- [ ] Open five random recipe cards on retina: no soft photos. (Known: about 80 photos are under 1000 px wide, see questions P2.)
- [ ] `minced-app.vercel.app/recipes?q=soup` redirects with a 308 to `minced.kevinpham.page/recipes?q=soup`. A Vercel preview URL does not redirect.
- [ ] Sign up, confirm from the email on a different browser or phone, land on /account. A second click on the link says it expired.
- [ ] Forgot password: email arrives from the new sender, link opens /reset-password, new password works.
- [ ] Google (only once the flag is on): "Continue with Google" on /login, /signup and the modal; cancel at Google shows the friendly message; a first login creates an account; the same email as an existing account signs into that account.
- [ ] Me, flag off: `/me` shows coming soon, no Me link in the header, no "Log this" on recipes.
- [ ] Me, signed out: sign-in prompt; Log in and Create account open the modal.
- [ ] Me, signed in: targets wizard (metric and imperial; Skip for now), edit targets; mockup example (34 y, 182 cm, 84 kg, male, moderately active, lose 0.5 kg/wk) gives 2300 kcal, 160 g protein, 245 g carbs.
- [ ] Log a workout (preset, Custom with muscles, Cardio) and sleep: the muscle map fills in, Male and Female and Front and Back toggle, hover or tap shows a tooltip, phone swipe works.
- [ ] Add a recipe at 1.5 servings and a quick add to a meal; remove one; the ring, macro bars and nutrient percentages update; over a limit shows the warning style.
- [ ] Calendar: month arrows, keyboard arrows, tap a day, add and remove, future days disabled.
- [ ] ★ Phone 375: /me has no horizontal scroll, cards fit, the FAB and quick-log sheet open and close.
- [ ] Recipe page "Log this" (signed in, flag on) writes to today's meal.
- [ ] /privacy lists health data and Google sign-in; /about credits the body-map artwork.
- [ ] Delete account removes Me data (type DELETE; fridge, shopping, favourites, Me rows are gone).
- [ ] Run `supabase/tests/me_rls_test.sql` on a throwaway database, never live.

## 16. Wave 9 (2026-10-17), check after both migrations are live (Me needs the flag on)
- [ ] Diet filter on /recipes and /pantry: Pescatarian shows vegetarian and vegan dishes too (about 55), Vegetarian includes vegan (about 42), Vegan about 22; counts match between browse, search (`?q=bean`) and the fridge matcher.
- [ ] Me wizard: mockup example (34 y, 182 cm, 84 kg, male, moderately active, lose 0.5 kg/wk) shows 2,810 minus 550 = 2,260 kcal, 160 g protein, and "Show each step". A small, sedentary woman at 0.75 kg/wk is raised to 1,200 with a plain-words note.
- [ ] Goal weight (lose or gain): wrong direction is refused; projected date shows in the wizard, weight card and check-ins.
- [ ] Goal days: lose 85 to 105 percent, maintain 90 to 110, gain 95 to 115, plus protein at least 90 percent; "partly" says which part missed; the day detail and /me/how-goal-days show the same numbers.
- [ ] Weigh-in from the quick-log sheet, the Weight card and the morning card; Clear (x) removes it. Chart: daily dots, 7-day average line, goal line; 30 days, 90 days, Weekly toggles (`?wr=`); hidden data table present.
- [ ] Check-ins: shows after a 2 kg drift, 28-day-old targets or goal reached; "Not now" stays gone after reload and on another device; saving targets brings it back.
- [ ] Streaks strip (food, sleep, weight): yesterday still counts; gentle copy.
- [ ] Weeks start Monday in the calendar and muscle map; legend reads 1-4 / 5-9 / 10+ sets; the "Workout plans and exercise library: coming soon" card is not clickable.
- [ ] Imperial users: weights, goal and chart read in pounds.
- [ ] ★ Phone 375: /me no horizontal scroll, "All nutrients today" collapsed behind "Show all nutrients", label reads "Fiber".
- [ ] Google "G" shows four brand colours (flag on); /about links all at least 44 px tall at 375 (known: body-art credit about 42 px).
- [ ] /privacy lists weigh-ins and goal weight; the data export includes weigh-ins.
- [ ] Run `supabase/tests/me_rls_test.sql` (93 checks) on a throwaway stack, never live.

## 17. Waves 10 + 11 (2026-10-17), check after the ten migrations, seeds and refresh are live
- [ ] Recipe page label (desktop): calories, fats, sodium, fiber, sugars, added sugars (estimated), protein with % Daily Value, then vitamins and minerals. A complete recipe (Chana Masala) has no "at least"; a partial one (Apple Salad) shows "at least" and a "Not counted" list naming the missing ingredient. Computed recipes say so in the footnote (not "published by MyPlate").
- [ ] A micronutrient shows only when most of the recipe reports it; otherwise "not enough data". Sodium has the "minimum" footnote.
- [ ] A recipe whose lines are all "no nutrition data" shows a short note instead of a label.
- [ ] Type-ahead in the recipe form (needs the user-recipes flags): typing `soy` lists soy sauce first; `kikkoman soy` lists Kikkoman with its serving; arrows, Enter, Esc work (Esc closes only the list); a "no nutrition data" option says so in text.
- [ ] Pick a brand in a recipe line, save, reopen: the brand is still shown ("Using: ..."); picking the plain ingredient clears it; calories move accordingly.
- [ ] Me, Add food, "Ingredient or brand" tab: 100 g of Kikkoman soy sauce logs about 91 kcal; a food with no nutrition cannot be added (button disabled, plain message).
- [ ] Me "All nutrients today": rows come from the nutrients table, no Atwater or IU rows; missing is a dash, "at least" when only some entries report it.
- [ ] /about cites USDA FoodData Central. `/lab/foods` is a 404 on live.
- [ ] Sign in, open /settings: name, units, week start, sex, food defaults, cookware, download my data, delete account all present; changes autosave ("Saved."), reload keeps them.
- [ ] Defaults on both doors: vegetarian + nuts saved gives a "Your defaults" chip on /recipes and /pantry (about 39 recipes; many vegetarian recipes are untagged). `?defaults=off` shows everything; "Turn off for this search" and "Use them" toggle; `?diet=vegan` replaces the saved diet but keeps saved allergens.
- [ ] Tap a Diet or Free-of chip while defaults apply: the URL becomes explicit (`diet=...&defaults=off`). A shared link never carries your saved defaults.
- [ ] Sign out: no chip, results unfiltered; sign in: defaults apply from the first list. Change defaults on one device, reload on another: matches after one refresh.
- [ ] Week start Sunday + imperial in Settings: /me calendar starts on Sunday, weights in lb; the Me wizard says "Using: ..., change in Settings" and asks sex only if Settings has none.
- [ ] Block the network and change a radio: it reverts and says it could not save.
- [ ] /account?tab=settings lands on /settings; the cookware filter link goes to /settings#cookware (known: does not scroll on a soft navigation).
- [ ] /privacy lists the `minced_prefs` cookie and the Settings data.
- [ ] Phone 375: /settings, recipe label and the Me add-food dialog have no horizontal scroll.
- [ ] Run on a throwaway stack: `supabase/tests/nutrition_compute_test.sql`, `nutrition_rls_test.sql`, `recipe_ingredient_foods_test.sql`, `user_settings_test.sql` (68 checks), then `scripts/nutrition/sql-checks.sql`, `check_usda_seeds.sql`.

## 18. Wave 10c (2026-10-19), check after the 22 migrations, seeds and refresh are live

- [ ] Landing: the hero button says "Choose ingredients"; pick two and go to `/recipes?include=...` signed out (nothing written to cookies or storage). "Cook from what you have" explains the feature; signed out it offers Create account / Log in, signed in it shows your fridge.
- [ ] `/pantry` and `/fridge` signed out show a sign-in gate. Signed in, add 10 items: groups appear as Make now, Missing 1, Missing 2 and a collapsed "Need a few more". Each card names its missing ingredients; "Add all" puts them on `/shopping`. "Only what I can make now" shows only Make now. Items expiring soon sort first inside a group. Staples are stated as assumed.
- [ ] Allergens: `/recipes?exclude=nuts` shows two chips (peanuts, tree nuts). Pad Thai with peanuts avoided still appears, labelled "peanuts optional: leave out". Kung Pao says "Contains peanuts" (everyone) and "which you avoid" (signed in with peanuts saved in Settings).
- [ ] Diets: with vegetarian saved, `/recipes` shows about 630 of 957 recipes; no meat dish appears.
- [ ] Recipe label: calories in the header equal the label; "at least" appears on partial micronutrients; a recipe using cheese says "nutrition assumes cheddar"; stand-in foods are listed under the label; a UK or Canadian food shows the Open Government Licence credit; `/about` carries the same credits.
- [ ] A gap in "Not counted" never reads "(no ...) (no nutrition data)".
- [ ] Me (flag on): give only weight, sex and birth year in Settings: Me shows a sedentary baseline; vitamins and minerals use age-banded targets; "All nutrients" hides low-coverage micros; mono/poly/trans fat sit under fats.
- [ ] Settings: peanuts, tree nuts, mollusks and wheat are separate choices; an old saved "nuts" shows as peanuts + tree nuts.
- [ ] `/robots.txt` disallows `/settings` and `/me`. `/privacy` says the fridge is account-only and describes birth year.
- [ ] Phone 375: landing, `/pantry`, `/settings` have no horizontal scroll.
- [ ] Known open (see `docs/review/2026-10-18-wave10c-questions.md`): black beans still default to the boiled record, 245 ingredients have no food, 5 gluten-free pasta brand links are wrong.

## 19. Wave 12 (2026-10-22), check after the migration, seeds, photos and refresh are live

- [ ] Landing: the hero button says "Select filters" and opens a pop-up; Tab stays inside it, Esc closes it and focus returns to the button; Enter in the find box does not submit. Pick vegetarian, peanuts, a time and an ingredient, press Show recipes: `/recipes` loads with matching chips. On a phone it is a bottom sheet.
- [ ] Landing order: hero, fridge, Settings, Shopping list, Me, "What you actually get", "Why we built this", on the way, closing CTA. The fridge section has a real photo and a warm sign-up line; no "evening" wording.
- [ ] Allergens: save peanuts in Settings. `/recipes` shows the chip "no peanuts" with the note that they stay hidden. "Show recipes with my allergens" opens a confirm dialog (focus on "Keep them hidden"); Esc keeps them hidden; confirming shows them for this search only with "Hide them again". `defaults=off` in a URL does NOT bring them back.
- [ ] Settings: unticking a saved allergen asks "Stop hiding recipes with peanuts?" and Esc keeps it ticked.
- [ ] Recipe form (flag on): type 2 cups rolled oats, 4 servings; a per-serving calories, protein, carbs and fat estimate appears within about a second and equals the recipe page after saving. An unknown ingredient makes every number "at least" and appears under "Not counted".
- [ ] Me (flag on): pick a past day from the calendar or the arrows; log a recipe and an ingredient or brand on it; edit an entry's amount and meal (figures scale together); remove one. "I trained" marks the day and can be undone. The month line reads "Trained N of M days". Sign out and in in the same tab: the date is still your local day.
- [ ] Me wizard asks sex and birth year only when Settings has none, and never asks age.
- [ ] 155 new recipes appear in `/admin/review` and NOT on `/recipes` or in search. Approve one with a photo: it shows an AI-drafted label, a cuisine, and nutrition (complete or a named gap).
- [ ] Stand-ins: a recipe with a declared stand-in names it under the label; Italian seasoning, Dijon mustard and scotch bonnet now show as named gaps.
- [ ] Counts on live: 1,112 recipes (published 619 complete / 335 partial / 3 unavailable), 44 cuisines, 1,984 ingredients, 12,034 foods.
- [ ] Phone 375: `/`, the pop-up, `/recipes`, `/me`, `/recipes/new` have no horizontal scroll.
- [ ] Known open: time filters keep recipes with no time (652 of 957); signed-out `/pantry` gate wording; Me edited-entry name keeps the old amount. See `docs/review/2026-10-22-wave12-questions.md`.

### Wave 13 (redesign)

- [ ] Fonts everywhere: headings in Young Serif (no smeared bold), text in Nunito Sans, numbers and small labels in Overpass Mono.
- [ ] Landing: solid green nav bar (Recipes, Fridge, Log in / Sign up). Hero photo rotates every 7 s; the caption names the dish with its time, kcal and protein and links to it; CC photos show "Photo: name · licence". Pause stops it. With reduced motion on, nothing rotates and there is no pause button.
- [ ] Hero headline "Narrow it down. Start cooking.", eyebrow "Recipes built around you"; search card with Select filters; stats line "957 recipes · 8 filters · no sign-up to search". Hero photos are crisp on a retina screen.
- [ ] Fridge section: two columns on desktop (text and three steps left, example fridge marked "Example" right), stacked on a phone; signed out offers Create account / Log in; signed in shows your fridge.
- [ ] Tiles (Me coming soon, Saved filters, Shopping list, Your recipes LATER), four recipe cards, What you get, Why we built this, dark Coming soon band and dark footer.
- [ ] Sign-up done screen: "You're almost in", names your email, never says "we sent". Expired link and deleted-account notices read warmly.
- [ ] Phone 375 and 900 px: no horizontal scroll; the hero caption never overlaps the search card.

### Wave 14 (Me, time filter, foods, new recipes)

- [ ] Time filter: `/recipes?maxTime=30`, a search with `maxTime`, the fridge and the landing pop-up "Under 15" return NO recipe without a stated time; with no time filter untimed recipes still appear. Expect far fewer results (about 652 of 957 have no time).
- [ ] Signed-out `/pantry` shows the warm gate ("saved to your account ... on your phone or your laptop") and the "Not ready for an account?" path still works.
- [ ] Me (Preview, flag on): sign in as a new user, set targets (the edit wizard asks only height and weight; sex and birth year come from Settings), log a recipe, an ingredient and a brand today and on a past day, edit an ingredient amount (the name follows: "banana, 150 g"), remove with two taps ("Remove?"), tap "I trained", log a weight.
- [ ] Me today reads "So far: N of M kcal" with no red marks; a finished past day shows its goal-hit or partly maths.
- [ ] Me Add-food dialog: the cursor starts in the search field. A recipe with no calories points to Quick add.
- [ ] Flag off: no Me link in header, account menu, footer or landing tile; `/me` shows coming soon; `/me/how-goal-days` is 404.
- [ ] Foods: `/recipes/overnight-oatmeal`, `/recipes/very-berry-muesli`, `/recipes/fruit-smoothie`, `/recipes/collard-green-gumbo-ham-hock` show a full label; type-ahead for borage, injera, haupia, mizithra shows the source (USDA, UK CoFID, Canadian CNF); a recipe with Italian seasoning still says "at least" and names it.
- [ ] `/admin/review` lists 26 new recipes (20 NHS, 6 rescues) in addition to the 155 originals; none appears on `/recipes` or in search. An NHS recipe shows the OGL sentence and a link to the original (DO NOT approve until the licence question is answered).
- [ ] Four auth emails pasted into Supabase: sign up, reset, magic link and email change each arrive warm, and each link works.
- [ ] `/lab/hero` is 404.
- [ ] Counts on live: published complete 625 / partial 329 / unavailable 3; 1,138 recipes; 1,548 of 1,984 ingredients have a food; 12,060 foods.
- [ ] Phone 375: `/`, `/recipes?maxTime=30`, `/me`, `/me/how-goal-days`, `/pantry` have no horizontal scroll.

### Wave 15 (launch readiness; check after the three migrations are applied and the PR is merged)

- [ ] Type a nonsense address (`/nope`): a real 404 inside the site header and footer, "That page isn't here", a search box, Browse and Home buttons. Same at 375 px with no sideways scroll.
- [ ] Share previews: view-source on a recipe WITH a photo shows that photo as `og:image` and `twitter:image`; a recipe without one shows `https://minced.kevinpham.page/og`; `/og` is a 1200 x 630 PNG.
- [ ] Google Rich Results Test on two photo recipes passes `Recipe` (owner step); then submit `/sitemap.xml` in Search Console.
- [ ] `/robots.txt` disallows `/admin`, `/lab`, `/recipes/new$`, `/recipes/*/edit`; the sitemap has about 963 URLs and no in-review slug.
- [ ] Turn the wifi off while on `/recipes?q=pasta` and reload, or use a bad URL for a route that fetches: the friendly "That didn't load" page appears with Try again, never a stack trace.
- [ ] Throttle the network (DevTools, Slow 4G) and open `/recipes`, `/fridge`, `/shopping`, `/account`: a skeleton shows, then the page, without a jump.
- [ ] `/me` (Preview): click through several days and the month arrows, then `/account` tabs. If navigation feels stuck after a hard reload, delete `src/app/(site)/me/loading.tsx` and `src/app/(site)/account/loading.tsx` (see LESSONS section 15).
- [ ] Rate limits (after the migration is applied): 12 wrong passwords in a row does NOT lock you out (the per-address limit is 30 in 5 minutes); 11 sign-up attempts in 10 minutes from one address shows "Too many tries just now. Please wait a minute and try again." A real login still works afterwards.
- [ ] Draft autosave (needs both flags, local or Preview): start a recipe, type a title: "Saved" appears and a draft exists in your account. Type an ingredient the app does not know: "Saved. 1 ingredient line is not saved yet." Close the tab right after typing a description, reopen the recipe: "We kept some changes from this device" offers them back.
- [ ] Autosave never publishes: after typing in a draft it is still a draft in My recipes; an in-review recipe shows the explicit Save only.
- [ ] `/accessibility` opens from the footer; a recipe page shows "Not medical advice" under the label and a "Report a problem" link.
- [ ] Old hosts: `minced-app.vercel.app/recipes?q=pasta` and `mise-two-xi.vercel.app/about` land on `minced.kevinpham.page` with the path and query kept.
- [ ] Phone 375: `/`, `/recipes`, `/recipes/new`, `/accessibility` and a 404 have no horizontal scroll.
- [ ] Phase 6 owner items: real Lighthouse numbers in `docs/review/2026-10-23-lighthouse-w15.md`; a real-phone pass; three people using it while you watch.

---
When something fails, tell Claude the section number, the URL, and what you saw.
