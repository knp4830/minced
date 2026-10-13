/**
 * The signed-out shopping list, kept in this browser. Client-only: every
 * function touches `window.localStorage` and swallows the errors a private
 * window or blocked storage throws. On sign-in the list is handed to the
 * account once (see ShoppingSync) and this copy is cleared.
 */
import type { AddSelection, ShopLine, UnitKind } from "@/lib/shopping";

const KEY = "minced.shopping.v1";
const MAX_LINES = 300;
const KINDS: readonly string[] = ["mass", "volume", "count"];

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.length <= max ? v : null;

function clean(raw: unknown): ShopLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 120);
  const key = str(r.key, 64);
  if (!name || !key || !Number.isInteger(r.ingredientId) || (r.ingredientId as number) <= 0) return null;
  const quantity = typeof r.quantity === "number" && r.quantity > 0 && r.quantity < 100000 ? r.quantity : null;
  const unit = quantity == null ? null : str(r.unit, 20);
  return {
    key,
    ingredientId: r.ingredientId as number,
    name,
    aisle: str(r.aisle, 20) ?? "Other",
    quantity,
    unit,
    unitKind: unit && typeof r.unitKind === "string" && KINDS.includes(r.unitKind) ? (r.unitKind as UnitKind) : null,
    unitFactor: unit && typeof r.unitFactor === "number" && r.unitFactor > 0 ? r.unitFactor : null,
    recipeSlug: str(r.recipeSlug, 160),
    recipeTitle: str(r.recipeTitle, 200),
    checked: r.checked === true,
  };
}

export function readLocalList(): ShopLine[] {
  try {
    const p: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    const lines = (p as { lines?: unknown } | null)?.lines;
    if (!Array.isArray(lines)) return [];
    return lines
      .flatMap((l) => {
        const c = clean(l);
        return c ? [c] : [];
      })
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

export function writeLocalList(lines: ShopLine[]): boolean {
  try {
    if (lines.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify({ lines: lines.slice(0, MAX_LINES) }));
    return true;
  } catch {
    return false;
  }
}

let counter = 0;
const uid = () =>
  `l${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Add a recipe's selected lines. Re-adding the same recipe replaces its earlier lines. */
export function addRecipeLocal(
  sel: AddSelection,
  recipe: { slug: string; title: string },
): { ok: boolean; full: boolean } {
  const kept = readLocalList().filter((l) => l.recipeSlug !== recipe.slug);
  const fresh: ShopLine[] = sel.add.map((l) => ({
    key: uid(),
    ingredientId: l.ingredientId,
    name: l.name,
    aisle: l.aisle,
    quantity: l.quantity,
    unit: l.quantity == null ? null : l.unit,
    unitKind: l.quantity == null ? null : l.unitKind,
    unitFactor: l.quantity == null ? null : l.unitFactor,
    recipeSlug: recipe.slug,
    recipeTitle: recipe.title,
    checked: false,
  }));
  const all = [...kept, ...fresh];
  if (all.length > MAX_LINES) return { ok: false, full: true };
  return { ok: writeLocalList(all), full: false };
}

export function toggleLocal(keys: string[], checked: boolean) {
  const set = new Set(keys);
  writeLocalList(readLocalList().map((l) => (set.has(l.key) ? { ...l, checked } : l)));
}

export function removeLocal(keys: string[]) {
  const set = new Set(keys);
  writeLocalList(readLocalList().filter((l) => !set.has(l.key)));
}

export function clearCheckedLocal() {
  writeLocalList(readLocalList().filter((l) => !l.checked));
}

export function clearLocal() {
  writeLocalList([]);
}

/** The payload import_local_shopping_list() takes. */
export function exportForImport(lines: ShopLine[]) {
  return lines.map((l) => ({
    ingredient_id: l.ingredientId,
    quantity: l.quantity,
    unit: l.unit,
    recipe_slug: l.recipeSlug,
    checked: l.checked,
  }));
}
