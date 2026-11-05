"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { stripControlChars } from "@/lib/filters";
import { USER_RECIPES_ENABLED } from "@/lib/flags";
import { searchFoods } from "@/lib/queries/foods";
import {
  autosaveMyRecipe,
  type AutosaveFailure,
  deleteMyRecipe,
  previewNutrition,
  resolveIngredientName,
  type NutritionPreview,
  type PreviewLine,
  saveMyRecipe,
  setMyRecipeFoods,
  withdrawMyRecipe,
  type SaveResult,
} from "@/lib/queries/myRecipes";
import { autosaveReadiness, LIMITS, parseQuantity, type RecipeFormValues } from "@/lib/recipeForm";
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
      // The database words these for people, but two of them read like a form error; say them the way we talk.
      if (r.field === "title") return { ok: false, message: "Give your recipe a title, between 3 and 120 characters.", field: r.field };
      if (r.field === "servings") return { ok: false, message: "Add how many servings this makes, from 1 to 100.", field: r.field };
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

export type AutosaveResult =
  | { ok: true; id: string; slug: string; skipped: number }
  | { ok: false; reason: AutosaveFailure | "waiting" | "off"; message: string };

const AUTOSAVE_MESSAGES: Record<AutosaveFailure, string> = {
  signed_out: "You have been signed out. Your recipe is kept on this device; sign in again and it will keep saving.",
  gone: "This recipe could not be found any more (it may have been deleted in another tab).",
  not_draft: "This recipe is no longer a draft (maybe it was submitted in another tab), so it is not saved automatically.",
  invalid: "Some of the recipe could not be saved yet.",
  transient: "Something went wrong saving.",
};

/**
 * Draft autosave. Never submits and never touches anything that is not a draft: that is enforced by
 * autosave_my_recipe in SQL, not here. Lines that are not valid yet are left out by the database and counted
 * in `skipped`; the form keeps them on the page (and in a device-local backup) so nothing typed is lost.
 */
export async function autosaveRecipe(id: string | null, values: RecipeFormValues): Promise<AutosaveResult> {
  if (!USER_RECIPES_ENABLED) return { ok: false, reason: "off", message: OFF };
  if (id !== null && (typeof id !== "string" || !UUID_RE.test(id))) return { ok: false, reason: "gone", message: AUTOSAVE_MESSAGES.gone };
  if (!shapeOk(values)) return { ok: false, reason: "invalid", message: "That was not understood. Reload the page and try again." };
  const ready = autosaveReadiness(values);
  if (!ready.ready) return { ok: false, reason: "waiting", message: ready.waitingFor };

  const ingredients = values.ingredients.map((row) => {
    const q = parseQuantity(row.quantity);
    return {
      // A non-number is sent as text the database refuses, so that one line is left out rather than guessed at.
      quantity: q.ok ? q.value : "not a number",
      unit: row.unit,
      name: row.name,
      prep_note: row.note,
      is_optional: row.optional,
      fdc_id: typeof row.fdcId === "number" ? row.fdcId : null,
    };
  });
  const res = await autosaveMyRecipe(id, {
    title: values.title,
    description: values.description,
    cuisine_id: num(values.cuisineId),
    prep_time_min: num(values.prep),
    cook_time_min: num(values.cook),
    servings: num(values.servings),
    spice_level: values.spice,
    cost_per_serving: num(values.cost),
    diets: values.diets,
    cookware: values.cookware,
    ingredients,
    steps: values.steps,
  });
  if (res.ok) return res;
  return { ok: false, reason: res.reason, message: res.reason === "invalid" && res.message ? res.message : AUTOSAVE_MESSAGES[res.reason] };
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

/**
 * The live nutrition preview under the ingredient list. Takes only the ingredient lines and the servings (nothing
 * about the recipe's identity), writes nothing, and answers null on any fault so the form says "could not check
 * just now" instead of showing a number it cannot stand behind. Bounded like a save: at most 80 lines.
 */
export async function previewRecipeNutrition(
  rows: unknown,
  servings: unknown,
): Promise<NutritionPreview | { error: "off" | "servings" | "failed" }> {
  if (!USER_RECIPES_ENABLED || !Array.isArray(rows) || rows.length > LIMITS.ingredients + 20) return { error: "off" };
  const n = typeof servings === "string" && /^\d{1,3}$/.test(servings.trim()) ? Number(servings.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.servingsMax) return { error: "servings" };

  const lines: PreviewLine[] = [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null) return { error: "off" };
    const o = r as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.quantity !== "string" || typeof o.unit !== "string" || typeof o.note !== "string") {
      return { error: "off" };
    }
    const name = stripControlChars(o.name).replace(/\s+/g, " ").trim().slice(0, LIMITS.nameMax);
    if (name === "") continue;
    const q = parseQuantity(o.quantity);
    // An amount that is not a number is the person's to fix; the save says so plainly. Here the line is left uncounted.
    if (!q.ok) {
      lines.push({ name, quantity: null, unit: "", note: "", optional: false, fdcId: null, badAmount: true });
      continue;
    }
    lines.push({
      name,
      quantity: q.value,
      unit: stripControlChars(o.unit).replace(/\s+/g, " ").trim().slice(0, 40),
      note: stripControlChars(o.note).replace(/\s+/g, " ").trim().slice(0, LIMITS.noteMax * 4),
      optional: o.optional === true,
      fdcId: typeof o.fdcId === "number" && Number.isInteger(o.fdcId) && o.fdcId > 0 ? o.fdcId : null,
    });
  }
  try {
    return await previewNutrition(lines, n);
  } catch {
    return { error: "failed" };
  }
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

/**
 * Of the ingredient names on a form that was just reopened, the ones whose default food has no nutrition data
 * (lowercase). A freshly picked row learns this from the type-ahead; a saved row has to ask. Null when the lookup
 * failed, so the form then says nothing instead of guessing. Bounded: at most 40 names, 60 characters each.
 */
export async function ingredientsWithoutNutrition(names: unknown): Promise<string[] | null> {
  if (!USER_RECIPES_ENABLED || !Array.isArray(names)) return null;
  const clean = [...new Set(names.filter((n): n is string => typeof n === "string").map((n) => stripControlChars(n).replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60)).filter((n) => n.length >= 2))].slice(0, 40);
  try {
    const out: string[] = [];
    await Promise.all(
      clean.map(async (name) => {
        const hits = await searchFoods(name, 3);
        const own = hits.find((h) => h.kind === "ingredient" && (h.canonicalName ?? h.label).toLowerCase() === name);
        if (own && own.hasNutrition === false) out.push(name);
      }),
    );
    return out;
  } catch {
    return null;
  }
}
