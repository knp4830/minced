// Run: node --experimental-strip-types scripts/test-me.mts
// Plain asserts, no test runner (no new packages). Exits non-zero on failure.
// Covers the pure helpers behind the Me dashboard (src/lib/me/*).
import assert from "node:assert/strict";

import { addDays, daysInMonth, isIsoDate, monthGrid, parseMonthParam, shiftMonth, todayInZone, weekRange, weekLabel, longDate } from "../src/lib/me/dates.ts";
import { nutrientLines } from "../src/lib/me/dv.ts";
import { dayFoodStatus } from "../src/lib/me/foodStatus.ts";
import { SESSION_MUSCLES, distributeSets, intensity } from "../src/lib/me/muscles.ts";
import { cmToFtIn, computeTargets, ftInToCm, kgToLb, lbToKg } from "../src/lib/me/targets.ts";

// ---- targets: the design's worked example (34 y, male, 182 cm, 84 kg, moderately active, lose 0.5 kg/wk) ----
const t = computeTargets({ sex: "male", age: 34, heightCm: 182, weightKg: 84, activity: 2, goal: "lose", paceKg: 0.5 });
assert.equal(t.bmr, 1813); // 10*84 + 6.25*182 - 5*34 + 5 = 1812.5
assert.equal(t.kcal, 2300);
assert.equal(t.proteinG, 160);
assert.equal(t.carbsG, 245);
assert.equal(t.fatG, 76);
// Female constant, maintain has no delta, gain adds.
const f = computeTargets({ sex: "female", age: 30, heightCm: 165, weightKg: 60, activity: 1, goal: "maintain", paceKg: 0 });
assert.equal(f.bmr, Math.round(600 + 1031.25 - 150 - 161));
assert.equal(f.kcal, Math.round((f.bmr * 1.375) / 50) * 50 || f.kcal);
const gain = computeTargets({ sex: "male", age: 25, heightCm: 180, weightKg: 75, activity: 3, goal: "gain", paceKg: 0.25 });
const keep = computeTargets({ sex: "male", age: 25, heightCm: 180, weightKg: 75, activity: 3, goal: "maintain", paceKg: 0 });
assert.ok(gain.kcal > keep.kcal);
// Never suggests under the floor.
const tiny = computeTargets({ sex: "female", age: 60, heightCm: 150, weightKg: 45, activity: 0, goal: "lose", paceKg: 0.75 });
assert.ok(tiny.kcal >= 1200);
// Macros never go negative.
assert.ok(tiny.carbsG >= 0);

// ---- units ----
assert.deepEqual(cmToFtIn(182), { ft: 6, inch: 0 }); // 71.65 in rounds to 72
assert.deepEqual(cmToFtIn(180), { ft: 5, inch: 11 });
assert.equal(ftInToCm(5, 11), 180.3);
assert.equal(kgToLb(84), 185);
assert.equal(lbToKg(185), 83.9);

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
assert.deepEqual([0, 1, 2, 3, 4, 9].map(intensity), [0, 1, 2, 2, 3, 3]);

// ---- dates ----
assert.ok(isIsoDate("2026-10-13"));
assert.ok(!isIsoDate("2026-02-31"));
assert.ok(!isIsoDate("2026-1-3"));
assert.ok(!isIsoDate("1999-01-01"));
assert.ok(!isIsoDate(20261013));
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
assert.equal(addDays("2026-03-01", -1), "2026-02-28");
assert.deepEqual(weekRange("2026-10-13"), { from: "2026-10-11", to: "2026-10-17" }); // Tue; weeks run Sun-Sat
assert.deepEqual(weekRange("2026-10-11"), { from: "2026-10-11", to: "2026-10-17" }); // a Sunday
assert.equal(weekLabel("2026-10-11", "2026-10-17"), "Sun 11 – Sat 17 Oct");
assert.equal(longDate("2026-10-13"), "Tuesday 13 October");
assert.equal(daysInMonth(2028, 2), 29);
assert.deepEqual(parseMonthParam("2026-10"), { year: 2026, month: 10 });
assert.equal(parseMonthParam("2026-13"), null);
assert.equal(parseMonthParam("nope"), null);
assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
const grid = monthGrid(2026, 10); // 1 Oct 2026 is a Thursday
assert.equal(grid.length % 7, 0);
assert.equal(grid.findIndex((c) => c.day === 1), 4);
assert.equal(grid.filter((c) => c.day !== null).length, 31);
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
assert.equal(lines.find((l) => l.id === "protein")!.over, false); // a target nutrient is never "over"
assert.deepEqual(nutrientLines({}), []);

// ---- calendar nutrition status ----
const goal = { kcal: 2300, proteinG: 160 };
assert.equal(dayFoodStatus({ calories: 0, proteinG: 0, entries: 0 }, goal).status, "none");
assert.equal(dayFoodStatus({ calories: 2240, proteinG: 162, entries: 5 }, goal).status, "hit");
const part = dayFoodStatus({ calories: 2210, proteinG: 131, entries: 5 }, goal);
assert.equal(part.status, "part");
assert.equal(part.note, "Protein short by 29 g");
assert.equal(dayFoodStatus({ calories: 540, proteinG: 170, entries: 1 }, goal).status, "part"); // one meal is not a goal hit
assert.equal(dayFoodStatus({ calories: 3000, proteinG: 170, entries: 6 }, goal).note, "700 kcal over goal");
assert.equal(dayFoodStatus({ calories: 900, proteinG: 90, entries: 2 }, null).status, "logged");

console.log("test-me: all assertions passed");
