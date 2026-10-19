/*
 * Validation for "this much of that food" (Me "Add food"). Pure, shared by the preview and the log action
 * so both reject exactly the same things before the database sees them.
 */

export type FoodInput = { ingredientId: unknown; fdcId: unknown; quantity: unknown; unit: unknown };

/** The unit choices the Add food dialog offers (it shows these names; the database resolves them). */
export const FOOD_UNITS = ["g", "oz", "ml", "cup", "tbsp", "tsp", "kg", "lb", "l", ""] as const;
const UNIT_SET: ReadonlySet<string> = new Set(FOOD_UNITS);

export type CheckedFood = { ingredientId: number; fdcId: number | null; quantity: number; unit: string };

export function checkFoodInput(input: FoodInput): ({ ok: true } & CheckedFood) | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Pick a food from the list first." };
  const ingredientId = Number(input.ingredientId);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) return { ok: false, error: "Pick a food from the list first." };
  let fdcId: number | null = null;
  if (input.fdcId !== null && input.fdcId !== undefined) {
    fdcId = Number(input.fdcId);
    if (!Number.isInteger(fdcId) || fdcId <= 0) return { ok: false, error: "That food could not be found." };
  }
  const quantity = typeof input.quantity === "number" ? input.quantity : Number(String(input.quantity ?? "").trim().replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return { ok: false, error: "Enter an amount above zero." };
  const unit = typeof input.unit === "string" ? input.unit.trim().toLowerCase() : "";
  if (!UNIT_SET.has(unit)) return { ok: false, error: "Pick one of the listed units." };
  return { ok: true, ingredientId, fdcId, quantity: Math.round(quantity * 1000) / 1000, unit };
}
