/*
 * Muscles, workout sessions, and how a session maps onto muscles. ONE editable table.
 *
 * The body-map artwork has 16 drawable muscle groups (slugs below). It has no separate lats: the
 * `upper-back` shape covers lats and mid-back, so pull work lands there.
 *
 * A session type is a recipe for spreading a number of working sets over muscles. "Push, 15 sets" means
 * chest, shoulders and triceps share those 15 sets by the shares in SESSION_MUSCLES. The result is stored
 * per muscle on the workout row, so changing this table later never rewrites anyone's history.
 *
 * The shares are a reasonable starting split, not exercise science. They are the owner's to tune.
 */

export const MUSCLES = [
  { slug: "chest", label: "Chest" },
  { slug: "deltoids", label: "Shoulders" },
  { slug: "biceps", label: "Biceps" },
  { slug: "triceps", label: "Triceps" },
  { slug: "forearm", label: "Forearms" },
  { slug: "abs", label: "Abs" },
  { slug: "obliques", label: "Obliques" },
  { slug: "trapezius", label: "Traps" },
  { slug: "upper-back", label: "Upper back and lats" },
  { slug: "lower-back", label: "Lower back" },
  { slug: "gluteal", label: "Glutes" },
  { slug: "quadriceps", label: "Quads" },
  { slug: "hamstring", label: "Hamstrings" },
  { slug: "adductors", label: "Inner thighs" },
  { slug: "calves", label: "Calves" },
  { slug: "tibialis", label: "Shins" },
] as const;

export type MuscleSlug = (typeof MUSCLES)[number]["slug"];

export const MUSCLE_SLUGS: readonly string[] = MUSCLES.map((m) => m.slug);

const LABELS = new Map<string, string>(MUSCLES.map((m) => [m.slug, m.label]));
export function muscleLabel(slug: string): string {
  return LABELS.get(slug) ?? slug;
}

export const SESSIONS = [
  { v: "upper", label: "Upper" },
  { v: "lower", label: "Lower" },
  { v: "push", label: "Push" },
  { v: "pull", label: "Pull" },
  { v: "legs", label: "Legs" },
  { v: "full_body", label: "Full body" },
  { v: "cardio", label: "Cardio" },
  { v: "custom", label: "Custom" },
  // The calendar's one-tap "I trained": no sets, no muscles. Not offered as a pill in the log sheet.
  { v: "trained", label: "Trained" },
] as const;

/** The session types the log sheet offers as pills (everything except the one-tap "trained" mark). */
export const LOG_SESSIONS = SESSIONS.filter((s) => s.v !== "trained");

export type Session = (typeof SESSIONS)[number]["v"];

export const SESSION_VALUES: readonly string[] = SESSIONS.map((s) => s.v);

export function sessionLabel(v: string): string {
  return SESSIONS.find((s) => s.v === v)?.label ?? v;
}

type Share = readonly [MuscleSlug, number];

/** Shares per session sum to 1. Cardio and Custom have none (cardio trains no muscle sets; custom is picked by hand). */
export const SESSION_MUSCLES: Record<Exclude<Session, "custom">, readonly Share[]> = {
  push: [["chest", 0.35], ["deltoids", 0.3], ["triceps", 0.35]],
  pull: [["upper-back", 0.4], ["biceps", 0.25], ["trapezius", 0.15], ["forearm", 0.1], ["lower-back", 0.1]],
  legs: [["quadriceps", 0.3], ["hamstring", 0.25], ["gluteal", 0.25], ["calves", 0.15], ["adductors", 0.05]],
  lower: [["quadriceps", 0.28], ["hamstring", 0.24], ["gluteal", 0.24], ["calves", 0.12], ["adductors", 0.06], ["lower-back", 0.06]],
  upper: [["chest", 0.22], ["upper-back", 0.25], ["deltoids", 0.16], ["biceps", 0.12], ["triceps", 0.12], ["trapezius", 0.08], ["forearm", 0.05]],
  full_body: [
    ["chest", 0.12], ["upper-back", 0.14], ["deltoids", 0.08], ["biceps", 0.06], ["triceps", 0.06], ["abs", 0.06],
    ["quadriceps", 0.16], ["hamstring", 0.1], ["gluteal", 0.12], ["calves", 0.06], ["lower-back", 0.04],
  ],
  cardio: [],
  trained: [],
};

export type MuscleSets = { muscle: MuscleSlug; sets: number }[];

/**
 * Spreads `total` working sets over a session's muscles with the largest-remainder method, so the parts
 * always add up to exactly `total` and no muscle gets a negative or fractional share. Muscles that round
 * to zero sets are left out.
 */
export function distributeSets(session: Exclude<Session, "custom">, total: number): MuscleSets {
  const shares = SESSION_MUSCLES[session];
  if (shares.length === 0 || total <= 0) return [];
  const exact = shares.map(([m, s]) => ({ muscle: m, raw: s * total }));
  const parts = exact.map((e) => ({ muscle: e.muscle, sets: Math.floor(e.raw), rem: e.raw - Math.floor(e.raw) }));
  let left = total - parts.reduce((a, p) => a + p.sets, 0);
  for (const p of [...parts].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    p.sets += 1;
    left -= 1;
  }
  return parts.filter((p) => p.sets > 0).map((p) => ({ muscle: p.muscle, sets: p.sets }));
}

/**
 * WEEKLY sets per muscle -> 0 (not trained), 1 (1-4 sets, light), 2 (5-9 sets, medium), 3 (10+ sets, full):
 * the legend's three greens. Training research commonly puts the growth target at about 10 or more hard sets
 * per muscle per week, with fewer enough to maintain; the colours follow that, so full green means "this
 * muscle got a growth-sized week".
 */
export function intensity(sets: number): 0 | 1 | 2 | 3 {
  return sets >= 10 ? 3 : sets >= 5 ? 2 : sets >= 1 ? 1 : 0;
}

/** Default total sets / minutes the log sheet starts with. Easy to change. */
export const DEFAULT_SETS = 15;
export const DEFAULT_MINUTES = 45;
