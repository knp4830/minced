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

---
When something fails, tell Claude the section number, the URL, and what you saw.
