"use server";

import { addMissingLines, recipeIdForSlug, type AddMissingResult } from "@/lib/queries/fridgeShopping";
import { SLUG_RE } from "@/lib/validate";

/*
 * Server Actions are public HTTP endpoints: validate everything before it reaches a query. The database
 * enforces ownership (RLS) regardless.
 */

const isId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 2 ** 31;

/** Add the named missing ingredients of one recipe to the shopping list (each only once per recipe). */
export async function addMissingToShoppingList(slug: string, ingredientIds: number[]): Promise<AddMissingResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, reason: "not-found" };
  if (!Array.isArray(ingredientIds) || ingredientIds.length === 0 || ingredientIds.length > 60) {
    return { ok: false, reason: "failed" };
  }
  const ids = [...new Set(ingredientIds)];
  if (!ids.every(isId)) return { ok: false, reason: "failed" };
  const recipeId = await recipeIdForSlug(slug);
  if (!recipeId) return { ok: false, reason: "not-found" };
  return addMissingLines(recipeId, ids);
}
