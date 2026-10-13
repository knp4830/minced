import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays } from "@/lib/fridgeDates";
import { createClient } from "@/lib/supabase/server";

/*
 * Saved-fridge writes. Inputs are validated by the server actions in
 * src/lib/actions/fridge.ts; RLS is the real gate (a user can only touch their
 * own rows), the `user_id` filters below are belt and braces.
 */

export type FridgeWriteResult = { ok: true } | { ok: false; reason: "signed-out" | "failed" };

async function session(): Promise<{ db: SupabaseClient; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { db: supabase as unknown as SupabaseClient, userId: user.id };
}

/** Add ingredients that are not yet in the fridge, dated from `today` + the shelf-life suggestion. */
async function insertMissing(
  s: { db: SupabaseClient; userId: string },
  ids: number[],
  today: string,
): Promise<boolean> {
  if (ids.length === 0) return true;
  const { data: sugg } = await s.db.rpc("suggested_shelf_life", { ingredient_ids: ids });
  const days = new Map(
    ((sugg ?? []) as { ingredient_id: number; days: number }[]).map((r) => [r.ingredient_id, r.days]),
  );
  const rows = ids.map((id) => ({
    user_id: s.userId,
    ingredient_id: id,
    added_on: today,
    purchased_on: today,
    expires_on: days.has(id) ? addDays(today, days.get(id)!) : null,
  }));
  const { error } = await s.db
    .from("fridge_items")
    .upsert(rows, { onConflict: "user_id,ingredient_id", ignoreDuplicates: true });
  return !error;
}

async function currentIds(s: { db: SupabaseClient; userId: string }): Promise<number[] | null> {
  const { data, error } = await s.db.from("fridge_items").select("ingredient_id").eq("user_id", s.userId);
  if (error) return null;
  return ((data ?? []) as { ingredient_id: number }[]).map((r) => r.ingredient_id);
}

/**
 * Make the saved fridge exactly `ids`. Items already there keep their dates,
 * new ones get today's dates plus the suggested shelf life, the rest go.
 */
export async function replaceFridge(ids: number[], today: string): Promise<FridgeWriteResult> {
  const s = await session();
  if (!s) return { ok: false, reason: "signed-out" };
  const have = await currentIds(s);
  if (!have) return { ok: false, reason: "failed" };

  const keep = new Set(ids);
  const remove = have.filter((id) => !keep.has(id));
  if (remove.length > 0) {
    const { error } = await s.db
      .from("fridge_items")
      .delete()
      .eq("user_id", s.userId)
      .in("ingredient_id", remove);
    if (error) return { ok: false, reason: "failed" };
  }
  const ok = await insertMissing(
    s,
    ids.filter((id) => !have.includes(id)),
    today,
  );
  return ok ? { ok: true } : { ok: false, reason: "failed" };
}

/** Add `ids` to the fridge without removing anything (the local-fridge import). */
export async function addToFridge(ids: number[], today: string): Promise<FridgeWriteResult> {
  const s = await session();
  if (!s) return { ok: false, reason: "signed-out" };
  const have = await currentIds(s);
  if (!have) return { ok: false, reason: "failed" };
  const ok = await insertMissing(
    s,
    ids.filter((id) => !have.includes(id)),
    today,
  );
  return ok ? { ok: true } : { ok: false, reason: "failed" };
}

export type FridgePatch = {
  purchasedOn?: string | null;
  expiresOn?: string | null;
  quantity?: string | null;
  notes?: string | null;
};

export async function updateFridgeRow(id: string, patch: FridgePatch): Promise<FridgeWriteResult> {
  const s = await session();
  if (!s) return { ok: false, reason: "signed-out" };
  const row: Record<string, string | null> = {};
  if (patch.purchasedOn !== undefined) row.purchased_on = patch.purchasedOn;
  if (patch.expiresOn !== undefined) row.expires_on = patch.expiresOn;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (Object.keys(row).length === 0) return { ok: true };
  // select() so an update that matched no row (someone else's id) is a failure, not a silent "UPDATE 0".
  const { data, error } = await s.db
    .from("fridge_items")
    .update(row)
    .eq("id", id)
    .eq("user_id", s.userId)
    .select("id");
  if (error || !data || data.length === 0) return { ok: false, reason: "failed" };
  return { ok: true };
}

export async function deleteFridgeRow(id: string): Promise<FridgeWriteResult> {
  const s = await session();
  if (!s) return { ok: false, reason: "signed-out" };
  const { error } = await s.db.from("fridge_items").delete().eq("id", id).eq("user_id", s.userId);
  return error ? { ok: false, reason: "failed" } : { ok: true };
}
