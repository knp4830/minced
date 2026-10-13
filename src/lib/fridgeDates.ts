/**
 * Date helpers for the saved fridge. Pure, so they run on server and client.
 *
 * Dates are plain calendar dates ("2026-10-14"), never timestamps: "expires
 * Friday" means the same day in every timezone. Day arithmetic therefore runs
 * on UTC midnights, which have no daylight-saving gaps.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** True for a real calendar date in YYYY-MM-DD form ("2026-02-30" is not). */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/** Today in the CALLER's local calendar (browser: the person's day; server: its own clock). */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** `iso` plus `n` days (n may be negative). */
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `today` to `iso`: 0 = today, 1 = tomorrow, -1 = yesterday. */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/**
 * How loudly to say it. Only `expired` and `urgent` get the paprika colour
 * (handoff: paprika is for things that need action); `soon` is a quiet outline.
 */
export type Urgency = "expired" | "urgent" | "soon" | "ok" | "none";

export const URGENT_WITHIN_DAYS = 2;
export const SOON_WITHIN_DAYS = 5;

export function urgencyOf(days: number | null): Urgency {
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= URGENT_WITHIN_DAYS) return "urgent";
  if (days <= SOON_WITHIN_DAYS) return "soon";
  return "ok";
}

/** "Expires in 2 days", "Expires today", "Expired yesterday". Words, not just colour. */
export function expiryLabel(days: number | null): string {
  if (days === null) return "No date";
  if (days < -1) return `Expired ${-days} days ago`;
  if (days === -1) return "Expired yesterday";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

/** Completes "Uses something ...": "expiring in 2 days", "expiring today", "past its date". */
export function daysUntilLabel(days: number): string {
  if (days < 0) return "past its date";
  if (days === 0) return "expiring today";
  if (days === 1) return "expiring tomorrow";
  return `expiring in ${days} days`;
}

/** "Fri, 17 Oct" for a calendar date. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
