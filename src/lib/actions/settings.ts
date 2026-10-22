"use server";

import { revalidatePath } from "next/cache";

import { getFilterOptions } from "@/lib/queries/browse";
import { writeDisplayName, writeSettings, type SettingsPatch } from "@/lib/queries/settings";
import { setPrefsCookie } from "@/lib/prefsCookie";
import {
  defaultsOf,
  oneOf,
  SEXES,
  UNITS,
  validateBirthYear,
  validateDisplayName,
  validateFoodDefaults,
  WEEK_STARTS,
  type UserSettings,
} from "@/lib/settingsValidate";

/*
 * Server actions for the Settings page. A Server Action is a public endpoint: whatever the form did, every
 * argument is re-validated here, and the database re-checks (constraints, the slug trigger, RLS). Each save
 * returns a result the page turns into "Saved." or an error; nothing throws to the client.
 *
 * Each call changes ONE section, so a failure in one never blocks another. The write uses `.select()` so "no
 * row matched" is a failure, not a silent success.
 */

export type SaveResult =
  | { ok: true; /** The name as stored, for the name form. */ name?: string }
  | { ok: false; reason: "signed-out" | "invalid" | "failed"; message: string };

const SIGNED_OUT: SaveResult = { ok: false, reason: "signed-out", message: "You've been signed out. Log in to save." };
const FAILED: SaveResult = { ok: false, reason: "failed", message: "Couldn't save that just now. Try again." };
const bad = (message: string): SaveResult => ({ ok: false, reason: "invalid", message });

async function saveOne(patch: SettingsPatch): Promise<SaveResult> {
  const r = await writeSettings(patch);
  if (!r.ok) return r.reason === "signed-out" ? SIGNED_OUT : FAILED;
  // Me reads these on every render; /settings shows them.
  revalidatePath("/me");
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveProfileName(name: unknown): Promise<SaveResult> {
  const v = validateDisplayName(name);
  if (!v.ok) return bad(v.reason);
  const r = await writeDisplayName(v.value);
  if (r === "signed-out") return SIGNED_OUT;
  if (r === "failed") return FAILED;
  revalidatePath("/account");
  revalidatePath("/settings");
  return { ok: true, name: v.value ?? "" };
}

export async function saveUnits(units: unknown): Promise<SaveResult> {
  if (!oneOf(units, UNITS)) return bad("Pick metric or imperial.");
  return saveOne({ units });
}

export async function saveWeekStart(weekStart: unknown): Promise<SaveResult> {
  if (!oneOf(weekStart, WEEK_STARTS)) return bad("Pick Monday or Sunday.");
  return saveOne({ week_start: weekStart });
}

export async function saveSex(sex: unknown): Promise<SaveResult> {
  if (sex !== null && !oneOf(sex, SEXES)) return bad("Pick female or male.");
  return saveOne({ sex });
}

export async function saveBirthYear(year: unknown): Promise<SaveResult> {
  const v = validateBirthYear(year);
  if (!v.ok) return bad(v.reason);
  return saveOne({ birth_year: v.value });
}

/**
 * Eating style, extra diets and allergens to leave out. Besides the database row this sets the prefs cookie in the
 * SAME action, so the very next /recipes or /pantry request already applies the new defaults (no tab ever sees a
 * half-saved state), then invalidates the list pages' client cache.
 */
export async function saveFoodDefaults(input: unknown): Promise<SaveResult & { settings?: UserSettings }> {
  const options = await getFilterOptions();
  const v = validateFoodDefaults(input, {
    diets: options.diets.map((d) => d.slug),
    allergens: options.allergens.map((a) => a.slug),
  });
  if (!v.ok) return bad(v.reason);

  const r = await writeSettings({ diet_slugs: v.value.diet, allergen_slugs: v.value.allergens });
  if (!r.ok) return r.reason === "signed-out" ? SIGNED_OUT : FAILED;

  await setPrefsCookie(r.userId, defaultsOf(r.settings));
  revalidatePath("/recipes");
  revalidatePath("/pantry");
  revalidatePath("/settings");
  return { ok: true, settings: r.settings };
}
