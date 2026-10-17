import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SETTINGS,
  defaultsOf,
  settingsFromRow,
  type FoodDefaults,
  type UserSettings,
} from "@/lib/settingsValidate";

/*
 * Every database call for Settings lives here (CLAUDE.md: no inline Supabase calls in components).
 *
 * `user_settings` is private: owner-only RLS, no anon access. A signed-out visitor gets the defaults.
 * The generated types (src/types/database.ts) are refreshed at integration with `pnpm db:types`; until then
 * the table is reached through an untyped client. Drop `untyped()` once the types know `user_settings`.
 */

const COLUMNS = "units, week_start, sex, diet_slugs, allergen_slugs";

async function untyped(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

/**
 * The signed-in person's settings, or the defaults when there is no row yet or nobody is signed in.
 * `cache()` makes it one query per request however many components ask.
 */
export const getMySettings = cache(async (): Promise<UserSettings> => {
  const db = await untyped();
  const { data, error } = await db.from("user_settings").select(COLUMNS).maybeSingle();
  if (error || !data) return { ...DEFAULT_SETTINGS };
  return settingsFromRow(data);
});

/**
 * The caller's saved default filters, read with a client that already holds the session (used right after a
 * sign-in, before the new cookies are visible to a fresh client). `null` = could not tell.
 */
export async function getDefaultsWith(
  db: unknown,
): Promise<{ userId: string; defaults: FoodDefaults } | null> {
  const client = db as SupabaseClient;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from("user_settings").select(COLUMNS).maybeSingle();
  if (error) return null;
  return { userId: user.id, defaults: defaultsOf(settingsFromRow(data)) };
}

export type SettingsPatch = Partial<{
  units: UserSettings["units"];
  week_start: UserSettings["weekStart"];
  sex: UserSettings["sex"];
  diet_slugs: string[];
  allergen_slugs: string[];
}>;

export type WriteOutcome =
  | { ok: true; settings: UserSettings; userId: string }
  | { ok: false; reason: "signed-out" | "failed" };

/**
 * Upserts the given columns for the caller and returns the row as saved. `.select()` matters: an upsert RLS
 * refuses reports success with no rows, and "it didn't error" is not "it did something".
 */
export async function writeSettings(patch: SettingsPatch): Promise<WriteOutcome> {
  const db = await untyped();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) return { ok: false, reason: "signed-out" };

  const { data, error } = await db
    .from("user_settings")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" })
    .select(COLUMNS);
  if (error || !data || data.length !== 1) return { ok: false, reason: "failed" };
  return { ok: true, settings: settingsFromRow(data[0]), userId: user.id };
}

/** The display name exactly as stored (null = never set), for the edit box. The header shows a fallback instead. */
export async function getProfileName(): Promise<string | null> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return data?.display_name ?? null;
}

/** Sets (or clears, with null) the display name on the caller's own profile row. */
export async function writeDisplayName(name: string | null): Promise<"ok" | "signed-out" | "failed"> {
  const db = await createClient();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) return "signed-out";
  const { data, error } = await db
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id)
    .select("id");
  return error || !data || data.length !== 1 ? "failed" : "ok";
}

/** Raw columns for "Download my data". */
export async function getMySettingsExport() {
  const db = await untyped();
  const { data } = await db.from("user_settings").select(`${COLUMNS}, updated_at`).maybeSingle();
  return data ?? null;
}
