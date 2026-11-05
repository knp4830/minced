import { MAX_INT4 } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";

/*
 * The saved fridge (wave 6). Private: RLS (20261013140000_fridge.sql) lets a
 * user see and change only their own rows, so everything here uses the
 * cookie-bound client.
 */

export type FridgeRow = {
  id: string;
  ingredientId: number;
  name: string;
  aisle: string;
  purchasedOn: string | null;
  expiresOn: string | null;
  quantity: string | null;
  notes: string | null;
  /** Shelf-life suggestion in days (per-ingredient, else aisle), or null. */
  suggestedDays: number | null;
};

type Raw = {
  id: string;
  ingredient_id: number;
  purchased_on: string | null;
  expires_on: string | null;
  quantity: string | null;
  notes: string | null;
  ingredients: { canonical_name: string; aisle_category: string } | null;
};

async function db() {
  return createClient();
}

/** The signed-in user's fridge, soonest expiry first (no date last). Empty when signed out. */
export async function getFridge(): Promise<FridgeRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("fridge_items")
    .select(
      "id, ingredient_id, purchased_on, expires_on, quantity, notes, ingredients(canonical_name, aisle_category)",
    )
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Raw[]).filter((r) => r.ingredients);

  const { data: sugg } = await supabase.rpc("suggested_shelf_life", {
    ingredient_ids: rows.map((r) => r.ingredient_id),
  });
  const days = new Map(
    ((sugg ?? []) as { ingredient_id: number; days: number }[]).map((s) => [s.ingredient_id, s.days]),
  );

  return rows.map((r) => ({
    id: r.id,
    ingredientId: r.ingredient_id,
    name: r.ingredients!.canonical_name,
    aisle: r.ingredients!.aisle_category,
    purchasedOn: r.purchased_on,
    expiresOn: r.expires_on,
    quantity: r.quantity,
    notes: r.notes,
    suggestedDays: days.get(r.ingredient_id) ?? null,
  }));
}

/**
 * The saved fridge as ids for the matcher and recipe pages: the picked items
 * plus the family-expanded cover set (picking "onion" also covers "yellow onion").
 */
export async function getFridgeIds(): Promise<{
  items: { id: number; name: string }[];
  coverIds: number[];
}> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("fridge_items")
    .select("ingredient_id, ingredients(canonical_name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const items = (
    (data ?? []) as unknown as { ingredient_id: number; ingredients: { canonical_name: string } | null }[]
  ).flatMap((r) => (r.ingredients ? [{ id: r.ingredient_id, name: r.ingredients.canonical_name }] : []));

  let coverIds = items.map((i) => i.id);
  if (coverIds.length > 0) {
    const { data: cover } = await supabase.rpc("expand_ingredient_family", { ids: coverIds });
    if (Array.isArray(cover)) coverIds = (cover as number[]).filter((n) => n > 0 && n <= MAX_INT4);
  }
  return { items, coverIds };
}

