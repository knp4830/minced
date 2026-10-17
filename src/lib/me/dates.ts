/*
 * Calendar dates for the Me dashboard. A "date" is always the person's LOCAL calendar date as a
 * YYYY-MM-DD string. The browser decides what "today" is (the server cannot), and sends it in a cookie
 * (the IANA time zone) or as an argument. Everything here does its arithmetic on UTC midnights so that no
 * server time zone, daylight-saving change or locale can shift a date by a day.
 */

/** Cookie that carries the browser's IANA time zone, so the server can work out the person's "today". */
export const TZ_COOKIE = "me_tz";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

function toUtc(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) throw new Error("bad date");
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2020 || y > 2100) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * 86_400_000);
}

/** Today's date in an IANA time zone; falls back to UTC for a missing or invalid zone name. */
export function todayInZone(tz: string | undefined | null, now: Date = new Date()): string {
  const zone = tz && /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz) ? tz : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    return ISO.test(parts) ? parts : fromUtc(now.getTime());
  } catch {
    return fromUtc(now.getTime());
  }
}

/** Sunday to Saturday week containing `iso` (the design's "Sun 12 - Sat 18 Oct"). */
export function weekRange(iso: string): { from: string; to: string } {
  const dow = new Date(toUtc(iso)).getUTCDay(); // 0 = Sunday
  const from = addDays(iso, -dow);
  return { from, to: addDays(from, 6) };
}

/** `2026-10` or null. */
export function parseMonthParam(v: string | undefined | null): { year: number; month: number } | null {
  if (!v) return null;
  const m = MONTH.exec(v);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

export function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + by;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type CalCell = { iso: string | null; day: number | null };

/** Month grid, Sunday first, padded with blanks to whole weeks. */
export function monthGrid(year: number, month: number): CalCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const n = daysInMonth(year, month);
  const cells: CalCell[] = [];
  for (let i = 0; i < first; i++) cells.push({ iso: null, day: null });
  for (let d = 1; d <= n; d++) cells.push({ iso: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d });
  while (cells.length % 7 !== 0) cells.push({ iso: null, day: null });
  return cells;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts });
const F_LONG = fmt({ weekday: "long", day: "numeric", month: "long" });
const F_WEEKDAY_DAY_MONTH = fmt({ weekday: "short", day: "numeric", month: "short" });
const F_MONTH_YEAR = fmt({ month: "long", year: "numeric" });
const F_DAY = fmt({ day: "numeric" });
const F_WEEKDAY = fmt({ weekday: "short" });

/** "Monday 13 October" */
export function longDate(iso: string): string {
  return F_LONG.format(toUtc(iso)).replace(",", "");
}
/** "Mon 13 Oct" */
export function shortDate(iso: string): string {
  return F_WEEKDAY_DAY_MONTH.format(toUtc(iso)).replace(",", "");
}
/** "October 2026" */
export function monthLabel(year: number, month: number): string {
  return F_MONTH_YEAR.format(Date.UTC(year, month - 1, 1));
}
/** "Sun 12 – Sat 18 Oct" (the month is written once when both ends share it) */
export function weekLabel(from: string, to: string): string {
  const sameMonth = new Date(toUtc(from)).getUTCMonth() === new Date(toUtc(to)).getUTCMonth();
  const left = sameMonth ? `${F_WEEKDAY.format(toUtc(from))} ${dayNumber(from)}` : shortDate(from);
  return `${left} – ${shortDate(to)}`;
}
export function dayNumber(iso: string): string {
  return F_DAY.format(toUtc(iso));
}
