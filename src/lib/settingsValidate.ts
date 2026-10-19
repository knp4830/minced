/*
 * Settings: shared types and validators. Pure (no Next, no Supabase) so the server actions, the query layer and
 * the unit tests all use the same rules. A server action is a public endpoint: every argument is re-validated
 * here, whatever the form did.
 */

export type Units = "metric" | "imperial";
export type WeekStart = "monday" | "sunday";
export type Sex = "female" | "male";

export const UNITS: readonly Units[] = ["metric", "imperial"];
export const WEEK_STARTS: readonly WeekStart[] = ["monday", "sunday"];
export const SEXES: readonly Sex[] = ["female", "male"];

/** The two lists the filters understand: `diet` (recipe must carry ALL) and `exclude` (recipe must carry NONE). */
export type FoodDefaults = { diet: string[]; exclude: string[] };

export type UserSettings = {
  units: Units;
  weekStart: WeekStart;
  sex: Sex | null;
  /** Optional. Me derives an age from it (this year minus birth year). */
  birthYear: number | null;
  /** Diet slugs: at most one eating style from NESTED_DIETS, plus independent ones such as gluten-free. */
  diet: string[];
  /** Allergen slugs to leave out. */
  allergens: string[];
};

export const DEFAULT_SETTINGS: UserSettings = {
  units: "metric",
  weekStart: "monday",
  sex: null,
  birthYear: null,
  diet: [],
  allergens: [],
};

/**
 * Eating styles that nest (vegan is accepted by vegetarian, which is accepted by pescatarian; see
 * diet_satisfying()). They are a radio group, so a person can hold at most one.
 */
export const NESTED_DIETS: readonly string[] = ["pescatarian", "vegetarian", "vegan"];

export const MAX_DIETS = 8;
export const MAX_ALLERGENS = 16;
export const MAX_NAME = 60;
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Ok<T> = { ok: true; value: T };
type Bad = { ok: false; reason: string };
export type Checked<T> = Ok<T> | Bad;

export function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

export const MIN_AGE = 13;
export const MAX_AGE = 120;

/** Age in whole years from a birth year (off by at most one: no birthday is stored). */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear;
}

/** Birth year: a whole year that makes the person 13-120 now; null clears it. */
export function validateBirthYear(raw: unknown, now: Date = new Date()): Checked<number | null> {
  if (raw === null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{4}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(n)) return { ok: false, reason: "Enter a four-digit year, like 1990." };
  const age = ageFromBirthYear(n, now);
  if (age < MIN_AGE || age > MAX_AGE) return { ok: false, reason: `Enter a year that makes you ${MIN_AGE} to ${MAX_AGE}.` };
  return { ok: true, value: n };
}

/** Display name: control characters removed, whitespace collapsed, 1-60 characters; empty clears it. */
export function validateDisplayName(raw: unknown): Checked<string | null> {
  if (typeof raw !== "string") return { ok: false, reason: "Enter a name." };
  const clean = raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (clean.length === 0) return { ok: true, value: null };
  if ([...clean].length > MAX_NAME) return { ok: false, reason: `Keep it to ${MAX_NAME} characters or fewer.` };
  return { ok: true, value: clean };
}

function slugs(raw: unknown, max: number, label: string): Checked<string[]> {
  if (!Array.isArray(raw)) return { ok: false, reason: `${label} must be a list.` };
  // Bound the work before looking at contents: a hostile client can send a very long array.
  if (raw.length > max * 4) return { ok: false, reason: `Too many ${label.toLowerCase()}.` };
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string" || !SLUG.test(s)) return { ok: false, reason: `${label} has an invalid entry.` };
    if (!out.includes(s)) out.push(s);
  }
  if (out.length > max) return { ok: false, reason: `Too many ${label.toLowerCase()}.` };
  return { ok: true, value: out.sort() };
}

/**
 * The food-defaults payload. `vocab` (the diets and allergens that really exist) is optional so the pure checks
 * can run without a database; the server action always passes it, and the database trigger checks again.
 */
export function validateFoodDefaults(
  input: unknown,
  vocab?: { diets: readonly string[]; allergens: readonly string[] },
): Checked<{ diet: string[]; allergens: string[] }> {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "Bad request." };
  const o = input as Record<string, unknown>;
  const diet = slugs(o.diet, MAX_DIETS, "Diets");
  if (!diet.ok) return diet;
  const allergens = slugs(o.allergens, MAX_ALLERGENS, "Allergens");
  if (!allergens.ok) return allergens;
  if (diet.value.filter((d) => NESTED_DIETS.includes(d)).length > 1) {
    return { ok: false, reason: "Pick one eating style." };
  }
  if (vocab) {
    if (diet.value.some((d) => !vocab.diets.includes(d))) return { ok: false, reason: "Unknown diet." };
    if (allergens.value.some((a) => !vocab.allergens.includes(a))) return { ok: false, reason: "Unknown allergen." };
  }
  return { ok: true, value: { diet: diet.value, allergens: allergens.value } };
}

/** What `user_settings` holds, as the app sees it, from a possibly missing / partial row. */
export function settingsFromRow(
  row:
    | {
        units?: string | null;
        week_start?: string | null;
        sex?: string | null;
        birth_year?: number | null;
        diet_slugs?: string[] | null;
        allergen_slugs?: string[] | null;
      }
    | null
    | undefined,
): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    units: oneOf(row.units, UNITS) ? row.units : "metric",
    weekStart: oneOf(row.week_start, WEEK_STARTS) ? row.week_start : "monday",
    sex: oneOf(row.sex, SEXES) ? row.sex : null,
    birthYear: typeof row.birth_year === "number" && Number.isInteger(row.birth_year) ? row.birth_year : null,
    diet: Array.isArray(row.diet_slugs) ? row.diet_slugs.filter((s) => SLUG.test(s)) : [],
    allergens: Array.isArray(row.allergen_slugs) ? row.allergen_slugs.filter((s) => SLUG.test(s)) : [],
  };
}

export function defaultsOf(s: Pick<UserSettings, "diet" | "allergens">): FoodDefaults {
  return { diet: [...s.diet], exclude: [...s.allergens] };
}
