# Claude Design prompt — "Me" personal dashboard (desktop first)

Paste everything in the fenced block into Claude Design. It is self-contained.

```
Design a desktop screen (1440 × 900) and a phone version (390 wide) for "Me", the personal dashboard of Minced, a no-nonsense recipe web app. Match Minced's existing design system exactly:

DESIGN SYSTEM
- Background #F1F3EE (cool off-white, never warm cream); surface #FBFBF8 for cards; sunk surface #EAEDE6 for bands/panels; ink #1C2420; muted ink #4C5A53; hairlines rgba(28,36,32,0.07–0.12).
- Primary "bay green" #2F4B3C (selected states, today's date ring, filled icons, progress); hover #25402F.
- Paprika #C1481E ONLY for warnings/over-limit/destructive. Gold #E4B73F ONLY for streak/achievement accents. Neither is decorative.
- Type: Fraunces (serif) for headings and big numbers' labels; Public Sans for UI text; IBM Plex Mono for EVERY measured number (kcal, grams, hours, dates) and small uppercase eyebrow labels (10–11px, tracking 0.1em).
- Radii: cards 12, chips 16, buttons 8–10. Calm, precise, "mise en place" — measured and organized. No stock illustrations, no gradients, no emoji.

LAYOUT (desktop, 12-col grid, 24px gutters)
LEFT COLUMN (≈ 5 cols):
1. TOP LEFT — "This week's muscles": a flat grey line-art human figure, FRONT and BACK views side by side (anterior and posterior only), muscles drawn as separate shapes (traps, delts, chest, biceps, triceps, forearms, abs, obliques, lats, mid/upper back, lower back, glutes, quads, hamstrings, adductors, calves). Muscles trained between Sunday and Saturday of the current week are filled in bay green; intensity in 3 steps (light/medium/full = 1 / 2–3 / 4+ working sets). Untrained muscles stay light grey. Eyebrow "SUN 12 – SAT 18 OCT". Small legend for the 3 intensities. Hover/tap a muscle → tooltip "Lats · 9 sets · Tue, Thu".
2. BOTTOM LEFT — Monthly calendar, styled like a period-tracking app's calendar (Flo-like) but in Minced colours: 7-column month grid, today circled with a bay-green ring and bold date. Under each date, up to three tiny marks in a row:
   - Dumbbell icon = trained that day (filled green).
   - Plate/fork-and-knife icon = hit the day's nutrition goal (filled = hit; outlined = partly — calories ok but protein short; absent = not logged).
   - Sleep as mono text "7h" (or "6.5h"); a tiny crescent-moon icon before it when the date cell is wide enough.
   Days in the future are dimmed. A small legend under the calendar explains the three marks. Month switcher arrows.
RIGHT COLUMN (≈ 7 cols) — "Today's food" (MyFitnessPal-like, but calmer):
3. A large ring/donut: calories eaten vs goal, centre text in mono "1,640 / 2,300 kcal" with "660 left"; ring segments coloured by macro share (carbs / fat / protein in three green-to-steel tints; paprika only if over goal).
4. Under it, three macro bars side by side: Carbs, Fat, Protein — each "112 / 250 g" in mono with a thin progress bar.
5. Under that, "All nutrients today" — a compact two-column table of every nutrient from the logged meals: fibre, sugars, saturated fat, sodium, potassium, calcium, iron, vitamin C, vitamin D, B12, etc., each with amount, unit and % of daily value as a small bar; nutrients over a limit (sodium, sat fat, added sugar) use paprika text.
6. "Today's meals" list: Breakfast / Lunch / Dinner / Snacks, each with logged items (a Minced recipe card thumbnail when the item is a Minced recipe), kcal per item, "+ Add" per meal.

TOP BAR of the page: Minced logo, "Me" title (Fraunces), date "Monday 13 October", and a primary "+ Log" button that opens the quick-log sheet.

STATES / POPUPS TO SHOW (separate frames)
A. First-time setup ("Let's set your targets") — a 4-step modal: (1) sex for the formula, age, height, weight (metric/imperial toggle); (2) activity level (5 options with plain descriptions); (3) goal: lose / maintain / gain, and pace (e.g. 0.25 / 0.5 kg per week); (4) result: daily calories + protein/carb/fat targets explained in one line ("Mifflin-St Jeor, adjusted for activity and goal"), editable, "Save targets". Calm, one question group per step, progress dots.
B. Quick-log sheet from "+ Log": three big tiles — "Workout" (pick a session type: Upper / Lower / Push / Pull / Legs / Full body / Cardio / Custom, which fills the muscle map), "Food" (search Minced recipes or a food, or "I cooked this" from a recipe page), "Sleep" (hours slider 0–12 in 0.5 steps, default last night, mono "7.5h").
C. Day detail popover when clicking a calendar date: the three marks with what was logged, and edit buttons.
D. Morning prompt (a small toast-style card at the top of the dashboard, only before noon, only if not logged): "How did you sleep?" with a 5h–9h quick chip row and "Other".
E. Empty state for a brand-new user: muscle map all grey with "Log a workout to see what you've trained this week", calendar with today ringed, food ring at 0 with "Set your targets" button.

PHONE VERSION: stacked in this order — food ring + macros, today's meals, muscle map (front/back swipe), calendar; "+ Log" becomes a floating button bottom-right.

Accessibility: every icon has a text label in tooltips/legend; colour is never the only signal (filled vs outlined icons, text values); 44px touch targets on phone; contrast AA.
```

## Notes for us (not for the prompt)
- **Do not use the stock muscle-diagram image** from the chat (it is a watermarked stock image). We draw our own SVG figure — the prompt above asks for line art, and the build will use our own SVG paths.
- The muscle map's "which muscles a session hits" needs an exercise → muscle mapping (v2 workout plans). Until then, session types map to muscle groups (Upper → chest, back, delts, arms; Lower → quads, hamstrings, glutes, calves, adductors; etc.).
- "Hit the nutrition goal" proposal: **calories within ±10% of target AND protein ≥ 90% of target** = filled plate; calories OK but protein short = outlined plate. Simple, explainable, and protein is what most lifters track.
- Per-nutrient tracking needs per-ingredient nutrition (M1.5.4 pipeline already has FDC ids for 275+ ingredients) and a food log; logging a Minced recipe is easy (we know its nutrition per serving), logging arbitrary foods needs a USDA FoodData Central search.
