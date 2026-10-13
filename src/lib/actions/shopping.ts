"use server";

import {
  addRecipe,
  clearAll,
  clearChecked,
  importLocal,
  removeByIds,
  setChecked,
  type AddResult,
} from "@/lib/queries/shopping";

/*
 * Server Actions are public HTTP endpoints: everything arriving here is
 * validated before it reaches a query, and the database enforces ownership
 * (RLS) regardless.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,150}$/;
const isId = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) > 0 && (n as number) < 2 ** 31;

export async function addToShoppingList(input: {
  slug: string;
  servings: number;
  skipStaples: boolean;
  haveIds: number[];
}): Promise<AddResult> {
  const { slug, servings, skipStaples, haveIds } = input ?? {};
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, reason: "not-found" };
  if (!Number.isInteger(servings) || servings < 1 || servings > 48) return { ok: false, reason: "failed" };
  const ids = Array.isArray(haveIds) ? haveIds.filter(isId).slice(0, 200) : [];
  return addRecipe(slug, servings, skipStaples !== false, ids);
}

export async function setShoppingChecked(keys: string[], checked: boolean): Promise<boolean> {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 500) return false;
  const ids = keys.map(Number);
  if (!ids.every(isId)) return false;
  return setChecked(ids, checked === true);
}

export async function removeShoppingItems(keys: string[]): Promise<boolean> {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 500) return false;
  const ids = keys.map(Number);
  if (!ids.every(isId)) return false;
  return removeByIds(ids);
}

export async function clearCheckedShopping(): Promise<boolean> {
  return clearChecked();
}

export async function clearShoppingList(): Promise<boolean> {
  return clearAll();
}

/** One-shot: the browser's signed-out list becomes part of the account. Returns lines kept, or null. */
export async function importLocalShoppingList(items: unknown): Promise<number | null> {
  if (!Array.isArray(items) || items.length > 300) return null;
  return importLocal(items);
}
