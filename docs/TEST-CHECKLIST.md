# Manual test checklist — everything Minced does today

The full feature inventory as of waves 1–6 (2026-10-13), written as things to try. **Desktop first** (Chrome, ~1280 px wide, DevTools console open — any red error is a bug), then repeat the starred ★ items on a phone (~375 px).

For each item: ✅ works · ❌ broken (note the URL and what you saw) · ❓ unclear or ugly.
Live site: https://minced-app.vercel.app

---

## 1. Landing page — `/`
- [ ] ★ Hero shows "Find the recipe. Skip the life story.", a recipe search box, and a **"What's in my fridge?"** button — and only one fridge button on the page.
- [ ] 3×3 photo grid loads real photos; each tile opens its recipe.
- [ ] Stat line shows real numbers (≈959 recipes · filters · 0 backstories).
- [ ] "Photo credits" link goes to `/about#photos` and the credits list opens.
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
- [ ] Find box inside the picker: type "green onion" → scallion; "courgettes" → zucchini.
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
- [ ] Filter to the 116 cookware-edited recipes and review a few.

## 10. Info pages
- [ ] `/about` (how recipes are made, AI disclosure, photo sources + credits), `/privacy`, `/terms` read correctly.

## 11. Things that should NOT be reachable
- [ ] `/kitchen-sink` exists (internal component page) — note it; it gets deleted before launch.
- [ ] No page shows a raw error ("Application error"). If one does, copy the URL.

---
When something fails, tell Claude the section number, the URL, and what you saw.
