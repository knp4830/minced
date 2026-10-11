# Handoff: Minced — Recipe Search Web App (7 screens)

## Overview
Minced is a recipe search web app built for precision and speed. People can filter recipes by ingredients, nutrition, cookware, time, servings, cuisine, allergens, diet, spice, and cost, then get a shopping list in seconds. Warmth and storytelling appear **only on the Landing page**. Every other screen should feel fast, structured, and unfussy. The visual metaphor is a chef's *mise en place*: everything measured and organized before you commit.

## About the Design Files
The files in this bundle are **design references made in HTML**. They're prototypes that show the intended look and behavior, not production code to copy directly. Recreate these designs in the target codebase's existing environment (React, Vue, SvelteKit, etc.) using its established patterns. If no codebase exists yet, pick a suitable stack (e.g. React + Next.js + a CSS approach of choice) and build the designs there.

- `Minced.dc.html` — opens directly in a browser (it needs `support.js` beside it). The dark toolbar at the top is **review-only chrome, not part of the product**. Use it to switch screens, toggle Desktop (1280px) / Mobile (400px), and toggle signed-in/out.
- Every style is inline on the elements. All data and state live in the `class Component` script near the bottom of the file.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and core interactions are final. Recreate them pixel-accurately. Image areas are striped placeholders that will be replaced with real food photography.

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| bg | `#F1F3EE` | App background (cool off-white, never warm cream) |
| surface | `#FBFBF8` | Cards, inputs |
| surface-sunk | `#EAEDE6` | Feature band, nutrition panel, chips, stepper buttons |
| input-fill | `#E7EAE3` | Search fields |
| ink | `#1C2420` | Primary text (green-undertone near-black) |
| ink-2 | `#26302A` | Long-form body/method text |
| ink-muted | `#4C5A53` / `#42504A` | Secondary text |
| primary | `#2F4B3C` | Bay green: primary buttons, selected chips, step numbers, quantities. Hover `#25402F` |
| steel | `#8C9A94` | Labels, meta text, inactive icons |
| divider-dot | `#C7CEC7` | `·` separators, empty spice dots |
| border | `rgba(28,36,32,0.07–0.25)` | Hairlines 0.07–0.12; input borders 0.18; outline buttons 0.2–0.25 |
| **paprika** | `#C1481E` | **ONLY** spice indicators, allergen warnings, and destructive actions (Sign out, Clear checked, remove ×). Allergen box: bg `rgba(193,72,30,0.05)`, border `rgba(193,72,30,0.3)`, text `#8a3416` |
| **gold** | `#E4B73F` | **ONLY** saved/favorite stars and cost/pending badges. Badge fill `#F4E4B6`, badge text `#7a5c10` / `#8a6a12` |
| page-behind | `#DFE2DB` | Review canvas only |

Rule: paprika and gold are never decorative. (The one exception is the small gold-outlined icon squares in the Landing feature cards, which can be swapped for steel if you want strict adherence.)

### Typography
- **Display serif — Fraunces** (Google Fonts, opsz 9..144, wght 400–700). Used for logo, headlines, recipe titles, section headers, and the Landing "why" quote and notes (italic).
- **UI sans — Public Sans** (400–700). Used for body text, labels, and buttons.
- **Mono — IBM Plex Mono** (400/500/600). Used for **every measured number** (time, servings, calories, cost, quantities, counts, nutrition) plus small uppercase eyebrow labels.

Type scale (px / weight / tracking):
- Hero h1: Fraunces 56 / 600 / -0.025em / lh 1.02
- Detail title: Fraunces 40 / 600 / -0.025em / lh 1.05
- Footer CTA h2: Fraunces 34 / 600
- Page h1 (Create, Shopping): Fraunces 32 / 600 / -0.02em
- Auth h1: Fraunces 30
- Account name / Results h1: Fraunces 26 / 600
- Why-quote: Fraunces 26 / 400 / lh 1.4
- Section h2 (Ingredients, Method): Fraunces 22 / 600
- Feature title: Fraunces 20 / 600
- Card title: Fraunces 18 / 600 / lh 1.15 / -0.01em
- Logo: Fraunces 21–24 / 600 / -0.02em
- Hero subhead: Public Sans 17 / lh 1.55
- Body: Public Sans 14–15 / lh 1.5–1.55
- Button: Public Sans 13–15 / 600
- Eyebrow label: Plex Mono 10–11 / uppercase / tracking 0.08–0.14em / steel
- Spec strip: Plex Mono 11.5 (card), 14 (detail)

### Radius
Chips and pills 14–20 · buttons 8–10 · inputs 8–9 · cards 11–12 · large image 14 · app frame 14 · avatar 50%.

### Shadows
- Card hover: `0 10px 24px -12px rgba(28,36,32,0.35)` plus `translateY(-2px)`, 150ms transition
- Primary button: `0 2px 0 rgba(28,36,32,0.15)`

### Spacing
4px-based. Common values are 6, 8, 10, 12, 14, 16, 18, 20, 22, 26, 30, 40. Page gutters are 26–40px on desktop. Card grid gap is 18px. Column gap on detail is 26px.

## Signature Element: Spec Strip
A single-line mono row: `24m · 4 srv · 520 cal · ●●●○ · $4.60`
- `·` separators in `#C7CEC7`
- Spice: 4 dots, 7px (card) / 9px (detail). Filled `#C1481E`, empty dots have a 1px `#C7CEC7` ring
- Cost: gold badge (`#F4E4B6` bg, `#7a5c10` text, weight 600, radius 5–6)
- Card version: 11.5px with a top hairline. Detail version: 14px with steel inline labels ("time", "serves", "cal", "spice"), bordered top and bottom, cost reads "$4.60 / serving"

## Global Nav
- **Signed out:** logo (left) … "Log in / Sign up" button (top right)
- **Signed in:** that button is replaced by a 32px green avatar circle with an initial, which links to Account. On Landing it shows as an "Account" pill with the avatar.
- App screens use a sticky 61px bar: logo, search field (Browse) or back link (Detail/Create/Shopping), "Shopping list" link, auth control.

## Screens

### 1. Landing (the only warm/story screen)
- Nav: logo with the mono eyebrow "mise en place", "Browse recipes" text link, auth control.
- Hero (max-width 1180, 2-col `1.1fr 0.9fr`, gap 48, padding 64/40/56): eyebrow "Recipe search, measured & fast" · h1 "Find the recipe. Skip the life story." · subhead · CTAs "Browse recipes" (primary) and "Sign up free" (outline) · mono stat line "1,240 recipes · 18 filters · 0 backstories". Right side: 3×3 grid of square image placeholders (mise en place bowls).
- Features band (`#EAEDE6`, auto-fit min 230px): 4 cards (Filter by what matters / Read the spec, not a story / Shopping list in seconds / Your private recipe book).
- "Why we built this": centered, max 720, a Fraunces quote plus one paragraph.
- Footer CTA band (primary green): "Ready when you are." with "Browse recipes" and "Create an account".
- Mobile: the hero goes to one column.

### 2. Search / Browse
- Layout: grid `248px 1fr`. The **filter rail** is a sticky sidebar with a right hairline.
- Rail groups (in order), each with a mono eyebrow label: Ingredients (text input) · Total time (mono chips < 20 / < 30 / < 45 / any) · Servings (1–2 / 3–4 / 5+) · Cuisine · Dietary type · Cookware (chips) · Max spice (paprika slider plus a dot readout) · Max cost / serving (slider plus a mono gold-text value) · **Avoid allergens** (paprika label, helper "Recipes containing these are hidden.", checkboxes). "clear all" sits at the top right.
- Selected chip: primary fill with off-white text. Unselected chip: 1px border, which turns primary on hover.
- Results: "Recipes" plus a mono count, sort "Quickest first", and a card grid `repeat(auto-fill, minmax(232px,1fr))`.
- **Recipe card**: 4:3 image, star button at the top right (30px circle; gold ★ when saved, steel ☆ when not) · mono cuisine eyebrow · title · spec strip · optional paprika "contains Fish, Soy" line.
- **Mobile:** the rail is hidden. A green "Filters" button opens a **bottom sheet** (radius 16 at the top, 40% ink scrim, max-height 80vh) with the same groups and a full-width "Show N recipes" button. Grid min is 150px.

### 3. Recipe Detail
- Eyebrow cuisine, h1 title, detail spec strip.
- Desktop: 4 columns `0.9fr 1fr 1.2fr 0.85fr`, gap 26:
  1. Image (4:5) + "Add to shopping list" (primary) + "Save to library" / "Saved to library" (outline, gold star) + diet line.
  2. **Ingredients** with a servings stepper (– / `4 srv` / +). Rows show the mono quantity + unit (primary green, min-width 66) and the name, with hairline dividers. Footnote: "quantities scale with servings".
  3. **Method**: numbered steps (24px green circles with mono numerals).
  4. Nutrition / serving panel (sunk bg, label/value rows, footnote "auto-calculated · est.") · Cookware chips · Allergen warning box (paprika) · collapsible Notes (Fraunces italic).
- For recipes with little content, column 4 should collapse into column 1 below the actions.
- Mobile: single stacked column (a 2-column ingredients/method layout is acceptable on wider phones).

### 4. Account (signed in)
- Header: 60px avatar, name, email, "Edit profile" (outline), "Sign out" (outline, paprika text).
- Tabs (pill buttons; active is ink-filled): **My Library** and **My Recipe Book**.
- My Library: "Saved recipes" plus a mono count, using the same card grid as Search.
- My Recipe Book: "Your recipes · private to you" and a prominent primary **"+ Create recipe"** button. Rows show a thumbnail, title, mono meta, a status pill (**"Pending review"** gold badge with dot, or "Published" neutral), and "Edit".

### 5. Create / Edit Recipe
- Top bar: back to "Recipe book", "Save draft" (outline), "Submit for review" (primary).
- Max-width 820 form with numbered mono section headers: **01 Basics** (title, cuisine/region, short description) · **02 Time & yield** (total min, servings, est. cost; mono inputs) · **03 Ingredients** (row grid `70px 90px 1fr 120px 32px`: qty, unit, name, category select, remove ×; plus a dashed "+ Add ingredient") · **04 Cookware** (toggle chips) · **05 Method** (numbered textareas, "+ Add step") · **06 Dietary & spice** (diet chips, a 4-dot spice picker with the label "3 / 4 — hot", allergen chips in paprika outline) · **07 Nutrition**: **read-only**, "Auto-calculated from ingredients", 4 mono stats.
- No photo upload field (intentional).

### 6. Shopping List
- Max-width 720. h1, "Print" and "Clear checked" (paprika). Mono progress line: "5 of 11 gathered · from 3 recipes".
- Grouped by category (Produce, Protein, Pantry, Spices) with a mono green header and hairline.
- Row: 20px checkbox (checked = green fill with ✓), mono qty + unit (min-width 80), name, and a source-recipe tag on the right (mono 10px pill on `#EAEDE6`). The whole row toggles the checkbox.

### 7. Log In / Sign Up
- Logo only, then a centered 380px column: "Welcome back", a one-line subhead, Email, Password, "Forgot password?", "Log in" (primary), an "or" divider, "Create an account" (outline), and the footnote "No newsletters. No 2,000-word intros. Just recipes." No marketing content.

## Interactions & Behavior
- Clicking a card opens Detail. Star toggles saved (and stops click propagation in production).
- Servings stepper (range 1–12) rescales every ingredient quantity by `servings / baseServings`.
- Shopping rows toggle checked, and the gathered count updates.
- Account tabs switch views. Sign out goes to Landing, signed out.
- Log in / Create an account sets the signed-in state and goes to Browse.
- Mobile Filters button opens the bottom sheet. Tapping the scrim, ×, or the submit button closes it.
- Notes on Detail collapse/expand (▲/▼).
- Hover: outline buttons change to a primary border, primary buttons darken to `#25402F`, cards lift.

### Copy and empty/error states (still to build; follow this tone)
Use sentence case, active-voice labels that name the action, and direct, specific messages. Examples:
- No results: "No recipes match these filters. Remove one to see more."
- Empty library: "Nothing saved yet. Tap ☆ on any recipe."
- Login error: "That email and password don't match."

## State Management
- `signedIn: boolean`
- `screen` (route)
- `filters` {ingredients[], maxTime, servings, cuisines[], diets[], cookware[], maxSpice, maxCost, excludeAllergens[]}
- `saved: Record<recipeId, boolean>` (server-persisted)
- `servings` (per Detail view)
- `shoppingList: {id, qty, unit, name, category, sourceRecipeId, checked}[]` (merge duplicate ingredients across recipes)
- `accountTab: 'library' | 'book'`
- `userRecipes` with `status: 'draft' | 'pending' | 'published'`

## Data Model (from the mock)
A recipe has id, title, cuisine, time (min), servings, cal, spice (0–4), cost (per serving), diet[], allergens[], cookware[], nutrition[{label, value, unit}], ingredients[{category, qty, unit, name}], steps[], and notes. See the `RECIPES` array in `Minced.dc.html` for sample data.

## Assets
None. All imagery is striped placeholders that will be replaced with real photography. Fonts come from Google Fonts. Glyphs used: ★ ☆ ✓ × ← ▲ ▼ ▾.

## Files
- `Minced.dc.html`: all 7 screens, desktop + mobile, with interactive state
- `support.js`: the runtime needed to open the HTML reference locally (not for production)
