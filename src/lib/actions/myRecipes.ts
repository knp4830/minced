"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { stripControlChars } from "@/lib/filters";
import { USER_RECIPES_ENABLED } from "@/lib/flags";
import {
  deleteMyRecipe,
  resolveIngredientName,
  saveMyRecipe,
  setMyRecipeFoods,
  withdrawMyRecipe,
  type SaveResult,
} from "@/lib/queries/myRecipes";
import { LIMITS, parseQuantity, type RecipeFormValues } from "@/lib/recipeForm";
import { UUID_RE } from "@/lib/validate";

/*
 * Server Actions for the recipe form. Each is a public POST endpoint, so the
 * input is re-shaped and bounded here and then validated for real by Postgres
 * (save_my_recipe), which is the only thing that can write. Nothing the client
 * sends can set status, author, slug, photo or nutrition: those are not even
 * keys in the payload built below.
 */

export type ActionResult =
  | { ok: true; id?: string; slug?: string; status?: "draft" | "in_review"; warning?: string }
  | { ok: false; message: string; field?: string };

const OFF = "That recipe could not be found.";
const GENERIC = "Something went wrong saving. Your recipe is still on this page; try again in a moment.";

function describe(r: Extract<SaveResult, { ok: false }>): ActionResult {
  switch (r.reason) {
    case "signed_out":
      return { ok: false, message: "You need to be signed in. Sign in again, then press Save." };
    case "not_found":
      return { ok: false, message: "That recipe no longer exists (or it is not yours)." };
    case "invalid":
      return { ok: false, message: r.message ?? "Some of the recipe is not valid.", field: r.field };
    default:
      return { ok: false, message: GENERIC };
  }
}

/** Bound sizes before any work: a malicious client can send anything. */
function shapeOk(v: unknown): v is RecipeFormValues {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const str = (x: unknown, max: number) => typeof x === "string" && x.length <= max;
  return (
    str(o.title, 400) &&
    str(o.description, 2000) &&
    str(o.cuisineId, 12) &&
    str(o.prep, 12) &&
    str(o.cook, 12) &&
    str(o.servings, 12) &&
    str(o.cost, 12) &&
    typeof o.rights === "boolean" &&
    (o.spice === null || (typeof o.spice === "number" && Number.isInteger(o.spice))) &&
    Array.isArray(o.ingredients) &&
    o.ingredients.length <= LIMITS.ingredients + 20 &&
    o.ingredients.every(
      (i) =>
        typeof i === "object" &&
        i !== null &&
        str((i as Record<string, unknown>).quantity, 30) &&
        str((i as Record<string, unknown>).unit, 40) &&
        str((i as Record<string, unknown>).name, 300) &&
        str((i as Record<string, unknown>).note, 400) &&
        typeof (i as Record<string, unknown>).optional === "boolean" &&
        // Optional: the specific food picked for the line. Anything but a positive integer is refused.
        ((i as Record<string, unknown>).fdcId === undefined ||
          (i as Record<string, unknown>).fdcId === null ||
          (Number.isInteger((i as Record<string, unknown>).fdcId) && ((i as Record<string, unknown>).fdcId as number) > 0)),
    ) &&
    Array.isArray(o.steps) &&
    o.steps.length <= LIMITS.steps + 20 &&
    o.steps.every((s) => str(s, 6000)) &&
    Array.isArray(o.diets) &&
    o.diets.length <= 20 &&
    o.diets.every((d) => Number.isInteger(d)) &&
    Array.isArray(o.cookware) &&
    o.cookware.length <= 60 &&
    o.cookware.every((c) => Number.isInteger(c))
  );
}

/** Empty -> null; otherwise the trimmed text. Postgres parses it, and says so plainly if it is not a number. */
function num(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function toPayload(v: RecipeFormValues): { ok: true; data: object } | { ok: false; message: string; field: string } {
  const ingredients: object[] = [];
  for (let i = 0; i < v.ingredients.length; i++) {
    const row = v.ingredients[i];
    const q = parseQuantity(row.quantity);
    if (!q.ok) {
      return {
        ok: false,
        field: `ingredient_qty:${i + 1}`,
        message: `Ingredient ${i + 1}: "${row.quantity.trim()}" is not an amount. Use a number like 2, 1/2 or 1 1/2, or leave it empty for "to taste".`,
      };
    }
    ingredients.push({
      quantity: q.value,
      unit: row.unit,
      name: row.name,
      prep_note: row.note,
      is_optional: row.optional,
    });
  }
  return {
    ok: true,
    data: {
      title: v.title,
      description: v.description,
      cuisine_id: num(v.cuisineId),
      prep_time_min: num(v.prep),
      cook_time_min: num(v.cook),
      servings: num(v.servings),
      spice_level: v.spice,
      cost_per_serving: num(v.cost),
      diets: v.diets,
      cookware: v.cookware,
      ingredients,
      steps: v.steps,
      rights_confirmed: v.rights,
    },
  };
}

function refresh(slug: string) {
  // The recipe page is ISR (an hour): a recipe that left or entered the public
  // site must not keep answering from the cache. Run after the response is sent.
  after(() => {
    revalidatePath(`/recipes/${slug}`);
    revalidatePath("/recipes");
    revalidatePath("/pantry");
    revalidatePath("/account");
  });
}

export async function saveRecipe(id: string | null, values: RecipeFormValues, submit: boolean): Promise<ActionResult> {
  if (!USER_RECIPES_ENABLED) return { ok: false, message: OFF };
  if (id !== null && (typeof id !== "string" || !UUID_RE.test(id))) {
    return { ok: false, message: "That recipe could not be found." };
  }
  if (!shapeOk(values) || typeof submit !== "boolean") {
    return { ok: false, message: "That submission was not understood. Reload the page and try again." };
  }
  const payload = toPayload(values);
  if (!payload.ok) return payload;

  const res = await saveMyRecipe(id, payload.data, submit);
  if (!res.ok) return describe(res);

  // Which specific food (a brand, say) was picked for a line. Positions count the non-blank lines, the
  // same way save_my_recipe numbers them. The database re-checks that each food really belongs to the
  // line's ingredient, so a forged id simply attaches nothing.
  let pos = 0;
  const picks: { pos: number; fdc_id: number }[] = [];
  for (const row of values.ingredients) {
    if (row.name.trim() === "") continue;
    if (typeof row.fdcId === "number") picks.push({ pos, fdc_id: row.fdcId });
    pos++;
  }
  let foodsSaved = true;
  if (picks.length > 0) foodsSaved = await setMyRecipeFoods(res.id, picks);

  refresh(res.slug);
  return {
    ok: true,
    id: res.id,
    slug: res.slug,
    status: res.status,
    ...(foodsSaved ? {} : { warning: "Saved, but the brand choices could not be stored. Open the recipe and pick them again." }),
  };
}

export async function deleteRecipe(id: string): Promise<ActionResult> {
  if (!USER_RECIPES_ENABLED) return { ok: false, message: OFF };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { ok: false, message: "That recipe could not be found." };
  const res = await deleteMyRecipe(id);
  if (!res.ok) return describe(res);
  refresh(res.slug);
  return { ok: true, slug: res.slug };
}

export async function withdrawRecipe(id: string): Promise<ActionResult> {
  if (!USER_RECIPES_ENABLED) return { ok: false, message: OFF };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { ok: false, message: "That recipe could not be found." };
  const res = await withdrawMyRecipe(id);
  if (!res.ok) return describe(res);
  refresh(res.slug);
  return { ok: true, slug: res.slug };
}

/** The canonical ingredient a typed name resolves to, or null. Powers the inline "recognised" tick. */
export async function checkIngredientName(name: string): Promise<{ canonical: string | null } | null> {
  if (!USER_RECIPES_ENABLED || typeof name !== "string") return null;
  const clean = stripControlChars(name).replace(/\s+/g, " ").trim().slice(0, LIMITS.nameMax);
  if (clean === "") return { canonical: null };
  try {
    return { canonical: await resolveIngredientName(clean) };
  } catch {
    return null; // unknown: the form then says nothing instead of a wrong "not found"
  }
}
