# Wave 9 questions and owner steps (2026-10-17)

Every open question from the lanes and the verifiers, with the default that was built and a recommendation. Answer by number. Nothing here blocks the merge.

## OWNER STEPS (in order)

1. Say "go". Claude backs up live, applies `20261017100000_me_dashboard_v2.sql` and `20261017110000_diet_implications.sql` (live goes from 35 to 37 migrations), and only then do you merge. If you merge first, `/recipes?diet=` errors.
2. After applying, push an empty commit so the Vercel preview re-runs against the new schema.
3. `NEXT_PUBLIC_ENABLE_ME` stays off on live until you turn it on (use `true`).

## Me dashboard

**Q1. Goal weight is optional for lose and gain.** Blank means no projected date and no "goal reached" check-in. Recommend keep optional.

**Q2. The calorie floor (1,200 F / 1,500 M) applies to every goal, including maintain and gain.** A small, older, sedentary man could have maintenance under 1,500 and be suggested 1,500 (a slight surplus). Recommend keep (safer); alternative is to floor only Lose.

**Q3. Targets round to the nearest 10 (was 50)** so the shown maths adds up exactly (2,810 minus 550 = 2,260). Recommend keep.

**Q4. Check-ins:** 14-day snooze per reason, 2 kg drift, targets 28+ days old. "Goal reached" uses the 7-day average at or past goal, or the projected date arriving. Recommend keep.

**Q5. Weekly chart covers the last 26 weeks; 30 and 90 day views are daily.** Recommend keep.

**Q6. Streak "best" is limited to the last 400 days** (the RPC cap). Recommend keep.

**Q7. Imperial pace chips show pounds only** (0.6 / 1.1 / 1.7 lb) while the database stores 0.25 / 0.5 / 0.75 kg. Recommend keep unless you want round-pound paces (needs a constraint change).

**Q8. Calendar day cells show no weight mark** (kept uncluttered); weight is in the day detail and the cell's accessible label. Recommend keep.

**Q9. Existing saved targets keep the old 1,000 kcal numbers until the person re-saves.** The disclosure says they "differ a little from the suggestion". Recommend keep; no automatic migration.

**Q10. Morning card:** the weight prompt only shows when today's weight is missing; sleep and weight share one dismissal per day in localStorage. Recommend keep.

**Q11. When targets already exist, the wizard prefills weight from the 7-day average** (83.7 kg instead of the stored 84 kg), with a visible note. This can change the result (2,250 vs 2,260). Recommend keep, or prefill the stored weight if you want identical numbers on re-save.

**Q12. Terms page does not mention health data (S4).** Recommend a lawyer-reviewed pass before the Me flag goes on.

## Bugs found in verification (not fixed; recommend a small wave)

**B1. Check-in age uses the UTC date of `updated_at`** (`src/lib/queries/me.ts`) against the browser-local today, so in the evening in a western time zone the 28-day card appears a day late. Same base for the projected date. Fix: convert with the `me_tz` cookie.

**B2. The projected date uses the chosen pace even when the calorie target was raised to the floor.** The result step says the pace will be slower, but the date does not. Fix: derive the pace from the floored calories.

**B3. Copy nits:** "a 825 kcal daily deficit" should read "an 825"; the weigh-in input shows "83.2 kg" placeholder next to a separate "kg" suffix; "vs a week ago" -0.85 displays as -0.8 (float rounding).

**B4. Dismissing a check-in drops keyboard focus to the body** (the card unmounts). Move focus to the next card or heading.

**B5. /about: the body-art credit link has a 41.7 px tap area** (target 44). Use a larger inset.

**B6. `NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN` accepts only `true`; `NEXT_PUBLIC_ENABLE_ME` accepts `true` or `1`.** Recommend making them consistent.

## Diet nesting

**D1. Pescatarian now includes vegetarian and vegan dishes (13 to 55); Vegetarian includes vegan (40 to 42).** This is the only consistent reading of the pescatarian rule. Please confirm.

**D2. Add a hint under the Pescatarian filter ("includes vegetarian and vegan")?** Recommend yes, one line of copy; not added.

**D3. A `diet_implications_test.sql` suite was not written.** Recommend adding one in the small wave.

## Not verified

- Signed-in Me flows and `/recipes?diet=` were verified on a local stack built from a snapshot, never on live.
- "Log this" on a recipe page and the food dialog were not browser-tested in wave 9 (only the Fiber spelling changed).
- The before-noon morning weigh-in prompt was not exercised (gated on the browser clock).
- Existing snapshot-only failures (no grants, no `private` schema) are environment, not regressions; see LESSONS section 10.

## Carried over from wave 8

Photos (P1, P2), M1.5.7 review, Google Cloud, Resend and DNS steps remain as in `docs/review/2026-10-16-wave8-questions.md`.

## Waves 10 and 11

Specs wait in `docs/research/wave10-micronutrients-plan.md` and `docs/research/wave11-settings-spec.md`. Not built.
