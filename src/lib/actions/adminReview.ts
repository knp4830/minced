"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/*
 * Server Actions for the review queue. Each one is a public POST endpoint, so
 * each re-validates its input and relies on the database (admin_* functions
 * check is_admin()) for authorisation: a non-admin gets { ok: false } and no
 * rows change, whatever the page showed them.
 */

export type ActionResult =
  | { ok: true; count?: number }
  | { ok: false; reason: "forbidden" | "invalid" | "failed"; message?: string };

type Rpc = {
  rpc(fn: string, args?: object): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,150}$/;

function fail(error: { message: string; code?: string }): ActionResult {
  if (error.code === "42501") return { ok: false, reason: "forbidden" };
  if (error.code === "22023") return { ok: false, reason: "invalid", message: error.message };
  return { ok: false, reason: "failed", message: error.message };
}

function refresh(slugs: string[]) {
  // Recipe pages are ISR-cached for an hour: without this a rejected recipe
  // would stay publicly visible until the cache expires.
  for (const s of slugs) revalidatePath(`/recipes/${s}`);
  revalidatePath("/recipes");
}

export async function setReview(slugs: string[], state: string, note?: string): Promise<ActionResult> {
  if (
    !Array.isArray(slugs) ||
    slugs.length < 1 ||
    slugs.length > 200 ||
    !slugs.every((s) => typeof s === "string" && SLUG_RE.test(s)) ||
    !["approved", "rejected", "unreviewed"].includes(state)
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = (await createClient()) as unknown as Rpc;
  const { data, error } = await supabase.rpc("admin_set_review", {
    p_slugs: slugs,
    p_state: state,
    p_note: typeof note === "string" ? note.slice(0, 1000) : null,
  });
  if (error) return fail(error);
  refresh(slugs);
  return { ok: true, count: Number(data) };
}

export type RecipeEdit = {
  title?: string;
  steps?: { id: number; instruction: string }[];
  ingredients?: { id: number; quantity: string; prep_note: string; is_optional?: boolean; ingredient_name?: string }[];
};

export async function updateRecipe(slug: string, edit: RecipeEdit): Promise<ActionResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug) || typeof edit !== "object" || edit === null) {
    return { ok: false, reason: "invalid" };
  }
  const steps = (edit.steps ?? []).map((s) => ({ id: Number(s.id), instruction: String(s.instruction ?? "") }));
  const ingredients: object[] = [];
  for (const i of edit.ingredients ?? []) {
    const q = String(i.quantity ?? "").trim();
    // Accept "1/2" and "1 1/2" as well as decimals.
    let quantity: number | null = null;
    if (q !== "") {
      const m = q.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
      quantity = m ? Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]) : Number(q);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return {
          ok: false,
          reason: "invalid",
          message: `Quantity "${q}" must be a positive number (or empty for to taste).`,
        };
      }
    }
    ingredients.push({
      id: Number(i.id),
      quantity,
      prep_note: String(i.prep_note ?? ""),
      is_optional: i.is_optional,
      ingredient_name: i.ingredient_name?.trim() || undefined,
    });
  }
  const supabase = (await createClient()) as unknown as Rpc;
  const { error } = await supabase.rpc("admin_update_recipe", {
    p_slug: slug,
    p_title: edit.title === undefined ? null : edit.title,
    p_steps: steps,
    p_ingredients: ingredients,
  });
  if (error) return fail(error);
  refresh([slug]);
  return { ok: true };
}
