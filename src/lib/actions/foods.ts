"use server";

import { checkFoodInput, type FoodInput } from "@/lib/foodInput";
import { ME_ENABLED } from "@/lib/me/flag";
import { stripControlChars } from "@/lib/filters";
import { FDC, byFdc } from "@/lib/nutrients";
import type { FoodForm } from "@/lib/foodForm";
import { computeFood, getFoodForms, searchFoods, type FoodHit } from "@/lib/queries/foods";
import { getNutrients } from "@/lib/queries/recipeNutrients";

/*
 * Server Actions behind the food type-ahead. Each is a public POST endpoint, so input is bounded here
 * and the database does the real work. Nothing here writes.
 */

export type SuggestResult = { ok: true; hits: FoodHit[] } | { ok: false };

/** Suggestions while typing: canonical ingredients first, then foods and brands. */
export async function suggestFoods(q: unknown): Promise<SuggestResult> {
  if (typeof q !== "string") return { ok: false };
  const clean = stripControlChars(q).replace(/\s+/g, " ").trim().slice(0, 60);
  if (clean.length < 2) return { ok: true, hits: [] };
  try {
    return { ok: true, hits: await searchFoods(clean, 10) };
  } catch {
    return { ok: false };
  }
}

export type PreviewResult =
  | { ok: true; calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; nutrientCount: number }
  | { ok: false; error: string };

/** What the amount adds up to, before it is added to the diary. */
export async function previewFood(input: FoodInput): Promise<PreviewResult> {
  if (!ME_ENABLED) return { ok: false, error: "Not available." };
  const v = checkFoodInput(input);
  if (!v.ok) return v;
  const r = await computeFood(v);
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.reason === "unit"
          ? "That unit is not recognised."
          : r.reason === "no_data"
            ? "We have no nutrition data for that amount. Try grams, or pick a different entry."
            : "The calculation is not available right now.",
    };
  }
  const nutrients = await getNutrients();
  const pick = (fdc: number) => {
    const n = byFdc(nutrients, fdc);
    return n && n.key in r.food.byKey ? r.food.byKey[n.key] : null;
  };
  // Rounded exactly as logFood() stores them (whole kcal, grams to one decimal), so the preview and the diary agree.
  const kcal = pick(FDC.energy);
  const g1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    ok: true,
    calories: kcal === null ? null : Math.round(kcal),
    proteinG: g1(pick(FDC.protein)),
    carbsG: g1(pick(FDC.carbs)),
    fatG: g1(pick(FDC.fat)),
    nutrientCount: r.food.rows.length,
  };
}

/** Raw / cooked / canned choices for one ingredient (empty when there is only one food). */
export async function listFoodForms(ingredientId: unknown): Promise<FoodForm[]> {
  if (!ME_ENABLED) return [];
  const id = Number(ingredientId);
  if (!Number.isInteger(id) || id <= 0) return [];
  try {
    return await getFoodForms(id);
  } catch {
    return [];
  }
}
