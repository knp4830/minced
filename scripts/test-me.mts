// Run: node --experimental-strip-types scripts/test-me.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
// Covers the pure helpers behind the Me dashboard (src/lib/me/*).
//
// Some of those files import "@/lib/..." (the tsconfig alias). Node does not know it, so a tiny resolve hook
// (scripts/me-alias-hook.mjs) maps it to src/, and the modules are loaded after it is registered.
import assert from "node:assert/strict";
import { register } from "node:module";

register("./me-alias-hook.mjs", import.meta.url);

const { addDays, daysInMonth, dayMonthYear, isIsoDate, mondayIndex, monthGrid, parseMonthParam, shiftMonth, todayInZone, weekRange, weekLabel, longDate } =
  await import("../src/lib/me/dates.ts");
const { nutrientLines } = await import("../src/lib/me/dv.ts");
const { dayFoodStatus, GOAL_BANDS } = await import("../src/lib/me/foodStatus.ts");
const { SESSION_MUSCLES, distributeSets, intensity } = await import("../src/lib/me/muscles.ts");
const { cmToFtIn, computeTargets, dailyAdjustment, daysToGoal, explainTargets, formatWeight, ftInToCm, kgToLb, kgToLb1, lbToKg, paceLabel, paceNote } =
  await import("../src/lib/me/targets.ts");
const { averageOn, changeVsWeekAgo, toGoal, weeklyAverages, withRollingAverage } = await import("../src/lib/me/weight.ts");
const { computeStreak, computeStreaks } = await import("../src/lib/me/streaks.ts");
const { pickCheckIn, projectedDateIso, goalReached } = await import("../src/lib/me/checkin.ts");

// ---- targets: the worked example (34 y, male, 182 cm, 84 kg, moderately active, lose 0.5 kg/wk) ----
const ex = { sex: "male", age: 34, heightCm: 182, weightKg: 84, activity: 2, goal: "lose", paceKg: 0.5 } as const;
const t = computeTargets(ex);
assert.equal(t.bmr, 1813); // 10*84 + 6.25*182 - 5*34 + 5 = 1812.5
assert.equal(t.factor, 1.55);
assert.equal(t.maintenance, 2810); // 1812.5 x 1.55 = 2809.4, to the nearest 10
assert.equal(t.adjustment, 550); // 0.5 kg x 7,700 / 7
assert.equal(t.rawKcal, 2260);
assert.equal(t.kcal, 2260);
assert.equal(t.clamped, false);
assert.equal(t.proteinG, 160);
assert.equal(t.fatG, 76);
assert.equal(t.carbsG, 235);
assert.equal(explainTargets(ex, t).oneLine, "Resting 1,813 kcal × 1.55 moderately active = 2,810; minus 550 for 0.5 kg/week = 2,260");
assert.ok(explainTargets(ex, t).lines.length >= 4);

// Pace: 7,700 kcal per kg / 7 days (3,500 per lb is the same rule in pounds).
assert.equal(dailyAdjustment(0.25), 275);
assert.equal(dailyAdjustment(0.5), 550);
assert.equal(dailyAdjustment(0.75), 825);
assert.equal(paceNote("lose", 0.5), "About 0.5 kg per week · a 550 kcal daily deficit.");
assert.equal(paceNote("gain", 0.25, "imperial"), "About 0.6 lb per week · a 275 kcal daily surplus.");
assert.equal(paceNote("maintain", 0), "Eat at maintenance — no deficit or surplus.");
assert.equal(paceLabel(0.5, "imperial"), "1.1 lb");

// Female constant, maintain has no delta, gain adds.
const f = computeTargets({ sex: "female", age: 30, heightCm: 165, weightKg: 60, activity: 1, goal: "maintain", paceKg: 0 });
assert.equal(f.bmr, Math.round(600 + 1031.25 - 150 - 161));
assert.equal(f.maintenance, 1820);
assert.equal(f.kcal, 1820);
assert.equal(f.adjustment, 0);
const gain = computeTargets({ sex: "male", age: 25, heightCm: 180, weightKg: 75, activity: 3, goal: "gain", paceKg: 0.25 });
const keep = computeTargets({ sex: "male", age: 25, heightCm: 180, weightKg: 75, activity: 3, goal: "maintain", paceKg: 0 });
assert.equal(keep.kcal, 3030);
assert.equal(gain.kcal, 3305); // + 275
// Floors: 1,200 (female) and 1,500 (male). The goal is clamped and the explanation says so.
const tiny = computeTargets({ sex: "female", age: 60, heightCm: 150, weightKg: 45, activity: 0, goal: "lose", paceKg: 0.75 });
assert.equal(tiny.rawKcal, 285); // 1,110 - 825
assert.equal(tiny.kcal, 1200);
assert.equal(tiny.clamped, true);
assert.equal(tiny.floor, 1200);
assert.ok(tiny.carbsG >= 0); // macros never go negative
assert.match(explainTargets({ sex: "female", age: 60, heightCm: 150, weightKg: 45, activity: 0, goal: "lose", paceKg: 0.75 }, tiny).oneLine, /under the 1,200 kcal minimum we suggest/);
const smallMan = computeTargets({ sex: "male", age: 60, heightCm: 150, weightKg: 45, activity: 0, goal: "lose", paceKg: 0.5 });
assert.equal(smallMan.kcal, 1500);
assert.equal(smallMan.clamped, true);
const okMan = computeTargets({ sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: 1, goal: "lose", paceKg: 0.5 });
assert.equal(okMan.clamped, false);
assert.ok(okMan.kcal >= 1500);

// ---- projected date ----
assert.equal(daysToGoal(84, 76, "lose", 0.5), 112); // 8 kg at 0.5 kg/week = 16 weeks
assert.equal(daysToGoal(70, 75, "gain", 0.25), 140);
assert.equal(daysToGoal(80, 79.9, "lose", 0.5), 2); // rounds up to a whole day
assert.equal(daysToGoal(84, 90, "lose", 0.5), null); // wrong side for losing
assert.equal(daysToGoal(84, 76, "maintain", 0.5), null);
assert.equal(daysToGoal(84, null, "lose", 0.5), null);
assert.equal(daysToGoal(84, 76, "lose", 0), null);
assert.equal(dayMonthYear(addDays("2026-10-01", 112)), "21 January 2027");

// ---- units ----
assert.deepEqual(cmToFtIn(182), { ft: 6, inch: 0 }); // 71.65 in rounds to 72
assert.deepEqual(cmToFtIn(180), { ft: 5, inch: 11 });
assert.equal(ftInToCm(5, 11), 180.3);
assert.equal(kgToLb(84), 185);
assert.equal(kgToLb1(84), 185.2);
assert.equal(lbToKg(185), 83.9);
assert.equal(formatWeight(83.4, "metric"), "83.4 kg");
assert.equal(formatWeight(84, "imperial"), "185.2 lb");

// ---- muscles: every session's shares sum to 1; distribution adds up exactly ----
for (const [name, shares] of Object.entries(SESSION_MUSCLES)) {
  if (shares.length === 0) continue;
  const sum = shares.reduce((a, [, s]) => a + s, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `${name} shares sum to ${sum}`);
}
for (const session of ["push", "pull", "legs", "lower", "upper", "full_body"] as const) {
  for (const total of [1, 2, 3, 7, 15, 16, 40, 300]) {
    const parts = distributeSets(session, total);
    assert.equal(parts.reduce((a, p) => a + p.sets, 0), total, `${session} ${total}`);
    assert.ok(parts.every((p) => Number.isInteger(p.sets) && p.sets > 0));
    assert.equal(new Set(parts.map((p) => p.muscle)).size, parts.length);
  }
}
assert.deepEqual(distributeSets("cardio", 10), []);
assert.deepEqual(
  distributeSets("push", 20).map((p) => [p.muscle, p.sets]),
  [["chest", 7], ["deltoids", 6], ["triceps", 7]],
);
// Weekly sets per muscle: 1-4 light, 5-9 medium, 10+ full.
assert.deepEqual([0, 1, 4, 5, 9, 10, 15].map(intensity), [0, 1, 1, 2, 2, 3, 3]);

// ---- dates: weeks start on Monday ----
assert.ok(isIsoDate("2026-10-13"));
assert.ok(!isIsoDate("2026-02-31"));
assert.ok(!isIsoDate("2026-1-3"));
assert.ok(!isIsoDate("1999-01-01"));
assert.ok(!isIsoDate(20261013));
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
assert.equal(addDays("2026-03-01", -1), "2026-02-28");
assert.equal(mondayIndex("2026-10-12"), 0); // Monday
assert.equal(mondayIndex("2026-10-18"), 6); // Sunday
assert.deepEqual(weekRange("2026-10-13"), { from: "2026-10-12", to: "2026-10-18" }); // a Tuesday
assert.deepEqual(weekRange("2026-10-12"), { from: "2026-10-12", to: "2026-10-18" }); // a Monday
assert.deepEqual(weekRange("2026-10-18"), { from: "2026-10-12", to: "2026-10-18" }); // a Sunday belongs to the week before
assert.deepEqual(weekRange("2026-10-11"), { from: "2026-10-05", to: "2026-10-11" });
assert.equal(weekLabel("2026-10-12", "2026-10-18"), "Mon 12 – Sun 18 Oct");
assert.equal(longDate("2026-10-13"), "Tuesday 13 October");
assert.equal(daysInMonth(2028, 2), 29);
assert.deepEqual(parseMonthParam("2026-10"), { year: 2026, month: 10 });
assert.equal(parseMonthParam("2026-13"), null);
assert.equal(parseMonthParam("nope"), null);
assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
const grid = monthGrid(2026, 10); // 1 Oct 2026 is a Thursday: Monday-first column 3
assert.equal(grid.length % 7, 0);
assert.equal(grid.findIndex((c) => c.day === 1), 3);
assert.equal(grid.filter((c) => c.day !== null).length, 31);
const sunStart = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday: the last column of the first row
assert.equal(sunStart.findIndex((c) => c.day === 1), 6);
const monStart = monthGrid(2026, 6); // 1 Jun 2026 is a Monday: first column
assert.equal(monStart.findIndex((c) => c.day === 1), 0);
// Time zones: the same instant is two different dates.
const instant = new Date("2026-10-13T02:30:00Z");
assert.equal(todayInZone("UTC", instant), "2026-10-13");
assert.equal(todayInZone("America/Los_Angeles", instant), "2026-10-12");
assert.equal(todayInZone("Pacific/Auckland", instant), "2026-10-13");
assert.equal(todayInZone("not a zone", instant), "2026-10-13"); // falls back to UTC
assert.equal(todayInZone(undefined, instant), "2026-10-13");

// ---- daily values ----
const lines = nutrientLines({ sodium: 2610, fiber: 21, protein: 121, fat: 52, carbs: 172 });
const sodium = lines.find((l) => l.id === "sodium")!;
assert.equal(sodium.pct, 113);
assert.equal(sodium.over, true); // a limit nutrient past 100%
assert.equal(lines.find((l) => l.id === "fiber")!.pct, 75);
assert.equal(lines.find((l) => l.id === "fiber")!.name, "Fiber"); // US spelling
assert.equal(lines.find((l) => l.id === "protein")!.over, false); // a target nutrient is never "over"
assert.deepEqual(nutrientLines({}), []);

// ---- goal days: calories band by goal AND protein at least 90% ----
assert.deepEqual(GOAL_BANDS.lose, { min: 85, max: 105, word: "losing" });
assert.deepEqual(GOAL_BANDS.maintain, { min: 90, max: 110, word: "maintaining" });
assert.deepEqual(GOAL_BANDS.gain, { min: 95, max: 115, word: "gaining" });
const lose = { kcal: 2300, proteinG: 160, goal: "lose" } as const;
const hold = { kcal: 2300, proteinG: 160, goal: "maintain" } as const;
const bulk = { kcal: 2300, proteinG: 160, goal: "gain" } as const;
assert.equal(dayFoodStatus({ calories: 0, proteinG: 0, entries: 0 }, lose).status, "none");
assert.equal(dayFoodStatus({ calories: 2240, proteinG: 162, entries: 5 }, lose).status, "hit");
// The owner's example, word for word.
const part = dayFoodStatus({ calories: 1950, proteinG: 131, entries: 5 }, lose);
assert.equal(part.status, "part");
assert.equal(part.kcalPct, 85);
assert.equal(part.proteinPct, 82);
assert.equal(
  part.detail,
  "1,950 of 2,300 kcal = 85% — inside 85–105% for losing ✓ · Protein 131 of 160 g = 82% — under 90% ✗ → partly",
);
assert.equal(part.note, "Protein 82%, under 90%");
// Boundaries (percentages are rounded first, and that rounded number decides).
assert.equal(dayFoodStatus({ calories: 1955, proteinG: 160, entries: 4 }, lose).status, "hit"); // 85%
assert.equal(dayFoodStatus({ calories: 1932, proteinG: 160, entries: 4 }, lose).status, "part"); // 84%
assert.equal(dayFoodStatus({ calories: 1932, proteinG: 160, entries: 4 }, lose).note, "Calories 84%, under 85%");
assert.equal(dayFoodStatus({ calories: 2420, proteinG: 160, entries: 4 }, lose).status, "hit"); // 105%
assert.equal(dayFoodStatus({ calories: 2440, proteinG: 160, entries: 4 }, lose).note, "Calories 106%, over 105%");
assert.equal(dayFoodStatus({ calories: 2440, proteinG: 160, entries: 4 }, hold).status, "hit"); // same day is fine when maintaining
assert.equal(dayFoodStatus({ calories: 2150, proteinG: 160, entries: 4 }, bulk).note, "Calories 93%, under 95%");
assert.equal(dayFoodStatus({ calories: 2200, proteinG: 160, entries: 4 }, bulk).status, "hit"); // 96%
assert.equal(dayFoodStatus({ calories: 2650, proteinG: 160, entries: 4 }, bulk).status, "hit"); // 115%
assert.equal(dayFoodStatus({ calories: 2670, proteinG: 160, entries: 4 }, bulk).status, "part"); // 116%
assert.equal(dayFoodStatus({ calories: 2300, proteinG: 144, entries: 4 }, lose).status, "hit"); // protein exactly 90%
assert.equal(dayFoodStatus({ calories: 2300, proteinG: 143, entries: 4 }, lose).status, "part"); // 89%
assert.equal(dayFoodStatus({ calories: 920, proteinG: 80, entries: 2 }, lose).note, "Protein 50%, under 90%; calories 40%, under 85%");
assert.equal(dayFoodStatus({ calories: 540, proteinG: 170, entries: 1 }, lose).status, "part"); // one meal is not a goal hit
const none = dayFoodStatus({ calories: 900, proteinG: 90, entries: 2 }, null);
assert.equal(none.status, "logged");
assert.equal(none.detail, null);

// ---- weight: 7-day rolling average, change vs a week ago ----
const w = [
  { date: "2026-10-03", kg: 84.6 },
  { date: "2026-10-05", kg: 84.2 },
  { date: "2026-10-10", kg: 84.0 },
  { date: "2026-10-11", kg: 83.6 },
  { date: "2026-10-13", kg: 83.8 },
  { date: "2026-10-16", kg: 83.2 },
];
assert.equal(averageOn(w, "2026-10-16"), 83.65); // the window is 10-10 .. 10-16: four readings
assert.equal(averageOn(w, "2026-10-09"), 84.4); // 10-03 .. 10-09: two readings
assert.equal(averageOn(w, "2026-09-20"), null); // nothing in the window
assert.equal(changeVsWeekAgo(w, "2026-10-16"), -0.75);
assert.equal(changeVsWeekAgo(w.slice(2), "2026-10-16"), null); // no readings a week ago
assert.equal(averageOn([...w].reverse(), "2026-10-16"), 83.65); // order does not matter
const rolled = withRollingAverage(w);
assert.equal(rolled.length, 6);
assert.equal(rolled[0].avg, 84.6); // the first reading is its own average
assert.equal(rolled[1].avg, 84.4);
assert.equal(rolled[5].avg, 83.65);
assert.equal(toGoal(83.65, 75, "lose"), 8.65);
assert.equal(toGoal(70, 75, "gain"), 5);
assert.ok(toGoal(74, 75, "lose") < 0); // past the goal
// Weekly averages run Monday to Sunday: 10-11 is a Sunday and belongs to the week starting 10-05.
assert.deepEqual(weeklyAverages(w), [
  { weekStart: "2026-09-28", avg: 84.6, count: 1 },
  { weekStart: "2026-10-05", avg: 83.93, count: 3 },
  { weekStart: "2026-10-12", avg: 83.5, count: 2 },
]);

// ---- streaks ----
const days = ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14", "2026-10-15", "2026-10-16"];
assert.deepEqual(computeStreak(days, "2026-10-16"), { current: 3, best: 3 });
assert.deepEqual(computeStreak(days, "2026-10-17"), { current: 3, best: 3 }); // today not logged yet: still alive
assert.deepEqual(computeStreak(days, "2026-10-18"), { current: 0, best: 3 }); // a missed day ends the run, the best stays
assert.deepEqual(computeStreak([...days, "2026-10-16", "2026-10-15"], "2026-10-16"), { current: 3, best: 3 }); // duplicates
assert.deepEqual(computeStreak([...days, "2026-10-20"], "2026-10-16"), { current: 3, best: 3 }); // future dates are ignored
assert.deepEqual(computeStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", ...days], "2026-10-16"), { current: 3, best: 5 });
assert.deepEqual(computeStreak([], "2026-10-16"), { current: 0, best: 0 });
assert.deepEqual(computeStreak(["2026-10-16"], "2026-10-16"), { current: 1, best: 1 });
assert.deepEqual(computeStreak(["2026-12-31", "2027-01-01"], "2027-01-01"), { current: 2, best: 2 }); // across a year
const s = computeStreaks(
  [
    { kind: "food", date: "2026-10-16" },
    { kind: "food", date: "2026-10-15" },
    { kind: "sleep", date: "2026-10-14" },
    { kind: "weight", date: "2026-10-16" },
  ],
  "2026-10-16",
);
assert.deepEqual(s.food, { current: 2, best: 2 });
assert.deepEqual(s.sleep, { current: 0, best: 1 });
assert.deepEqual(s.weight, { current: 1, best: 1 });

// ---- check-ins: one at a time, in order goal > weight > age; "not now" snoozes 14 days ----
const base = {
  sex: "male", age: 34, heightCm: 182, weightKg: 84, units: "metric", activity: 2, goal: "lose", paceKg: 0.5,
  kcal: 2260, proteinG: 160, carbsG: 235, fatG: 76, goalWeightKg: 76, updatedOn: "2026-10-01",
} as const;
assert.equal(projectedDateIso(base), "2027-01-21");
assert.equal(projectedDateIso({ ...base, goal: "maintain" }), null);
assert.equal(pickCheckIn({ targets: null, avgKg: 80, today: "2026-10-10", dismissed: {} }), null);
assert.equal(pickCheckIn({ targets: base, avgKg: 84.1, today: "2026-10-10", dismissed: {} }), null); // fresh, no drift
assert.equal(pickCheckIn({ targets: base, avgKg: 82.1, today: "2026-10-10", dismissed: {} }), null); // 1.9 kg is under the 2 kg line
assert.equal(pickCheckIn({ targets: base, avgKg: 82.0, today: "2026-10-10", dismissed: {} })?.kind, "weight"); // exactly 2 kg
assert.equal(pickCheckIn({ targets: base, avgKg: 86.0, today: "2026-10-10", dismissed: {} })?.kind, "weight"); // heavier counts too
assert.match(pickCheckIn({ targets: base, avgKg: 81.5, today: "2026-10-10", dismissed: {} })!.body, /down 2\.5 kg/);
assert.match(pickCheckIn({ targets: { ...base, units: "imperial" }, avgKg: 81.5, today: "2026-10-10", dismissed: {} })!.body, /down 5\.5 lb/);
assert.equal(pickCheckIn({ targets: base, avgKg: null, today: "2026-10-29", dismissed: {} })?.kind, "age"); // 28 days old is the line
assert.equal(pickCheckIn({ targets: base, avgKg: null, today: "2026-10-28", dismissed: {} }), null); // 27 days: not yet
assert.equal(pickCheckIn({ targets: base, avgKg: null, today: "2026-10-30", dismissed: {} })?.kind, "age");
assert.equal(goalReached(base, 76), true);
assert.equal(goalReached(base, 76.1), false);
assert.equal(goalReached({ ...base, goal: "gain", goalWeightKg: 90 }, 90.2), true);
assert.equal(goalReached({ ...base, goal: "maintain" }, 60), false);
assert.equal(pickCheckIn({ targets: base, avgKg: 75.9, today: "2026-10-10", dismissed: {} })?.kind, "goal"); // goal weight reached
assert.equal(pickCheckIn({ targets: base, avgKg: null, today: "2027-01-21", dismissed: {} })?.kind, "goal"); // projected date arrived
assert.equal(pickCheckIn({ targets: base, avgKg: null, today: "2027-01-20", dismissed: {} })?.kind, "age"); // the day before: only the age card
// Dismissals are remembered per kind; the next kind in order may then appear, never two at once.
assert.equal(pickCheckIn({ targets: base, avgKg: 75.9, today: "2026-10-10", dismissed: { goal: "2026-10-08" } })?.kind, "weight");
assert.equal(pickCheckIn({ targets: base, avgKg: 75.9, today: "2026-10-10", dismissed: { goal: "2026-10-08", weight: "2026-10-09" } }), null);
assert.equal(pickCheckIn({ targets: base, avgKg: 82, today: "2026-10-24", dismissed: { weight: "2026-10-10" } })?.kind, "weight"); // 14 days later it returns
assert.equal(pickCheckIn({ targets: base, avgKg: 82, today: "2026-10-23", dismissed: { weight: "2026-10-10" } }), null); // 13 days: still snoozed
assert.equal(pickCheckIn({ targets: { ...base, goal: "maintain", goalWeightKg: null }, avgKg: null, today: "2026-10-10", dismissed: {} }), null);

console.log("test-me: all assertions passed");
