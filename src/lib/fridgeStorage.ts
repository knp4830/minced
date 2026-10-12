/**
 * Browser-side memory for the fridge picker. Client-only: every function
 * touches `window.localStorage` and swallows the errors a private window or
 * blocked storage throws -- the URL still carries the fridge, storage only
 * lets a returning visitor skip re-picking.
 */

export type FridgeItem = { id: number; name: string };

const KEY = "minced.fridge.v1";
/** The typed-pantry era stored the same {items} shape under this key. */
const LEGACY_KEY = "minced.pantry.v1";
const MAX_ITEMS = 50;

function parse(raw: string | null): FridgeItem[] | null {
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    const items = (p as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return null;
    const clean = items.filter(
      (i): i is FridgeItem =>
        !!i && Number.isInteger(i.id) && i.id > 0 && typeof i.name === "string",
    );
    return clean.slice(0, MAX_ITEMS);
  } catch {
    return null;
  }
}

export function readFridge(): FridgeItem[] {
  try {
    return (
      parse(window.localStorage.getItem(KEY)) ??
      parse(window.localStorage.getItem(LEGACY_KEY)) ??
      []
    );
  } catch {
    return [];
  }
}

export function writeFridge(items: FridgeItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ items: items.slice(0, MAX_ITEMS) }));
  } catch {
    /* private window / blocked storage: the URL still carries the fridge */
  }
}
