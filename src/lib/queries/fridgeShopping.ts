import { createClient } from "@/lib/supabase/server";

/*
 * One tap on a missing ingredient (fridge results): adds just those lines of one recipe to the signed-in
 * person's shopping list. The RPC is SECURITY INVOKER, so RLS is the gate; it reads auth.uid() itself.
 * Not in the generated types until `pnpm db:types` runs at integration, so the client is widened here.
 */

type LooseRpc = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export type AddMissingResult =
  | { ok: true; added: number; already: number }
  | { ok: false; reason: "signed-out" | "not-found" | "full" | "failed" };

export async function addMissingLines(recipeId: string, ingredientIds: number[]): Promise<AddMissingResult> {
  const sb = (await createClient()) as unknown as LooseRpc;
  const { data, error } = await sb.rpc("add_missing_to_shopping_list", {
    p_recipe_id: recipeId,
    p_ingredient_ids: ingredientIds,
  });
  if (error) {
    if (error.code === "28000") return { ok: false, reason: "signed-out" };
    if (error.code === "P0002") return { ok: false, reason: "not-found" };
    if (error.code === "54000") return { ok: false, reason: "full" };
    return { ok: false, reason: "failed" };
  }
  const r = (data ?? {}) as { added?: number; already?: number };
  return { ok: true, added: r.added ?? 0, already: r.already ?? 0 };
}

/** Recipe id for a slug, or null. Public read through the caller's client (RLS decides what exists). */
export async function recipeIdForSlug(slug: string): Promise<string | null> {
  const sb = await createClient();
  const { data } = await sb.from("recipes").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}
