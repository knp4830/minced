/*
 * Shared (client + server) pieces of the recipe form. Pure: no I/O.
 *
 * The limits mirror save_my_recipe() in 20261014120000_user_recipes.sql. The
 * database is the authority (a Server Action is a public endpoint); these
 * copies exist so the form can say "too long" before a round trip.
 */

export const LIMITS = {
  titleMin: 3,
  titleMax: 120,
  descriptionMax: 500,
  ingredients: 60,
  steps: 40,
  stepMax: 1000,
  noteMax: 100,
  nameMax: 80,
  servingsMax: 100,
  minutesMax: 1440,
  costMax: 999,
} as const;

export type IngredientRow = {
  quantity: string;
  unit: string;
  name: string;
  note: string;
  optional: boolean;
  /**
   * A specific USDA food or brand picked for this line (the line itself is still the canonical ingredient
   * `name`). Null/absent: the ingredient's default food is used.
   */
  fdcId?: number | null;
  /** What to show for that pick ("Kikkoman Soy Sauce"). Display only, never sent to the database. */
  foodLabel?: string;
  /** The picker said this pick has no nutrition data. Display only. */
  noNutrition?: boolean;
};

/** Everything the form edits. Numbers stay strings until the server parses them. */
export type RecipeFormValues = {
  title: string;
  description: string;
  cuisineId: string;
  prep: string;
  cook: string;
  servings: string;
  spice: number | null;
  cost: string;
  ingredients: IngredientRow[];
  steps: string[];
  diets: number[];
  cookware: number[];
  /** "I wrote this and may share it." Sent with every save that goes to review. */
  rights: boolean;
};

export const EMPTY_INGREDIENT: IngredientRow = { quantity: "", unit: "", name: "", note: "", optional: false };

export function emptyValues(): RecipeFormValues {
  return {
    title: "",
    description: "",
    cuisineId: "",
    prep: "",
    cook: "",
    servings: "4",
    spice: null,
    cost: "",
    ingredients: [{ ...EMPTY_INGREDIENT }, { ...EMPTY_INGREDIENT }, { ...EMPTY_INGREDIENT }],
    steps: ["", ""],
    diets: [],
    cookware: [],
    rights: false,
  };
}

const VULGAR: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125 };

/**
 * "2", "0.5", "1/2", "1 1/2", "1½" -> number. Empty -> null ("to taste").
 * Anything else, zero and negatives -> { ok: false }.
 */
export function parseQuantity(raw: string): { ok: true; value: number | null } | { ok: false } {
  const q = raw.trim().replace(",", ".");
  if (q === "") return { ok: true, value: null };

  let value: number | null = null;
  const vulgar = /^(\d+)?\s*([½⅓⅔¼¾⅛])$/u.exec(q);
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(q);
  const fraction = /^(\d+)\/(\d+)$/.exec(q);
  if (vulgar) value = Number(vulgar[1] ?? 0) + VULGAR[vulgar[2]];
  else if (mixed) value = Number(mixed[2]) / Number(mixed[3]) + Number(mixed[1]);
  else if (fraction) value = Number(fraction[1]) / Number(fraction[2]);
  else if (/^\d*\.?\d+$/.test(q)) value = Number(q);

  if (value === null || !Number.isFinite(value) || value <= 0 || value > 100000) return { ok: false };
  return { ok: true, value: Math.round(value * 1000) / 1000 };
}

/** Quantity as a cook would write it back: 0.5 -> "1/2", 1.25 -> "1 1/4", 2 -> "2". */
export function formatQuantity(n: number | null): string {
  if (n === null || n === undefined) return "";
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.005) return String(whole);
  const known: [number, string][] = [
    [0.125, "1/8"], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"],
  ];
  for (const [v, s] of known) {
    if (Math.abs(frac - v) < 0.006) return whole > 0 ? `${whole} ${s}` : s;
  }
  return String(Math.round(n * 1000) / 1000);
}


export type RecipeStatus = "draft" | "in_review" | "published";

/** Shape returned by the my_recipes() RPC. */
export type MyRecipeRow = {
  id: string;
  slug: string;
  title: string;
  status: RecipeStatus;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number;
  ingredient_count: number;
  updated_at: string;
  returned: boolean;
  review_note: string | null;
};

/** Shape returned by the my_recipe_for_edit() RPC. */
export type MyRecipeDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: RecipeStatus;
  cuisine_id: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number;
  spice_level: number | null;
  cost_per_serving: number | null;
  ingredients: { quantity: number | null; unit: string | null; name: string; prep_note: string | null; is_optional: boolean }[];
  steps: string[];
  diets: number[];
  cookware: number[];
  allergens: string[];
  returned: boolean;
  review_note: string | null;
};

export function valuesFromDetail(d: MyRecipeDetail): RecipeFormValues {
  return {
    title: d.title,
    description: d.description ?? "",
    cuisineId: d.cuisine_id === null ? "" : String(d.cuisine_id),
    prep: d.prep_time_min === null ? "" : String(d.prep_time_min),
    cook: d.cook_time_min === null ? "" : String(d.cook_time_min),
    servings: String(d.servings),
    spice: d.spice_level,
    cost: d.cost_per_serving === null ? "" : String(d.cost_per_serving),
    // A draft autosave opened before any ingredient was valid has none yet: show empty rows, like a new recipe.
    ingredients:
      d.ingredients.length > 0
        ? d.ingredients.map((i) => ({
            quantity: formatQuantity(i.quantity),
            unit: i.unit ?? "",
            name: i.name,
            note: i.prep_note ?? "",
            optional: i.is_optional,
          }))
        : emptyValues().ingredients,
    steps: d.steps.length > 0 ? d.steps : emptyValues().steps,
    diets: d.diets,
    cookware: d.cookware,
    rights: false,
  };
}

export const SPICE_LABELS = ["Not spicy", "Mild", "Medium", "Hot", "Very hot"] as const;

/** Vocabularies the form offers. Loaded once, cached an hour (see queries/myRecipes.ts). */
export type FormOptions = {
  cuisines: { id: number; name: string }[];
  diets: { id: number; name: string }[];
  cookware: { id: number; name: string }[];
  units: string[];
};

// ---------------------------------------------------------------------------
// Draft autosave (M5.2). Pure helpers shared by the form and the tests.
// ---------------------------------------------------------------------------

/** How long to wait after the last keystroke, and the longest a steady typist goes without a save. */
export const AUTOSAVE = { quietMs: 1500, maxWaitMs: 8000, retryMs: [3000, 6000, 12000, 30000] } as const;

/**
 * What the form edits, as a string that changes only when something a save would store changes. The rights
 * tick is left out on purpose: a draft save never stores it, so ticking it must not look like an edit.
 */
export function valuesSignature(v: RecipeFormValues): string {
  return JSON.stringify({
    title: v.title,
    description: v.description,
    cuisineId: v.cuisineId,
    prep: v.prep,
    cook: v.cook,
    servings: v.servings,
    spice: v.spice,
    cost: v.cost,
    diets: v.diets,
    cookware: v.cookware,
    steps: v.steps,
    ingredients: v.ingredients.map((r) => ({
      quantity: r.quantity,
      unit: r.unit,
      name: r.name,
      note: r.note,
      optional: r.optional,
      fdcId: typeof r.fdcId === "number" ? r.fdcId : null,
    })),
  });
}

export type AutosaveReadiness = { ready: true } | { ready: false; waitingFor: "title" | "servings" };

/**
 * Whether there is enough to open a draft. A recipe needs a title and a serving count to exist at all (the
 * same two things the database insists on); everything else can be half done. Until then nothing is sent.
 */
export function autosaveReadiness(v: Pick<RecipeFormValues, "title" | "servings">): AutosaveReadiness {
  if (v.title.replace(/\s+/g, " ").trim().length < LIMITS.titleMin) return { ready: false, waitingFor: "title" };
  const s = v.servings.trim();
  const n = Number(s);
  if (!/^\d{1,3}$/.test(s) || n < 1 || n > LIMITS.servingsMax) return { ready: false, waitingFor: "servings" };
  return { ready: true };
}

export type AutosaveState =
  | { kind: "idle" }
  | { kind: "waiting"; waitingFor: "title" | "servings" }
  | { kind: "saving" }
  | { kind: "saved"; skipped: number }
  | { kind: "retrying" }
  | { kind: "stopped"; message: string };

/** The calm sentence for the status line. Kept here so the wording is tested. */
export function autosaveText(s: AutosaveState): string {
  switch (s.kind) {
    case "idle":
      return "";
    case "waiting":
      return s.waitingFor === "title"
        ? "Give it a title (at least 3 letters) and we will start saving your draft."
        : "Add how many servings and we will start saving your draft.";
    case "saving":
      return "Saving…";
    case "saved":
      return s.skipped > 0
        ? `Saved. ${s.skipped} ingredient ${s.skipped === 1 ? "line is" : "lines are"} not saved yet. Choose a name from the suggestions and check the amount.`
        : "Saved";
    case "retrying":
      return "Couldn't save just now. We will keep trying, and nothing you typed is lost.";
    case "stopped":
      return s.message;
  }
}

/** A device-local copy of the form, so a closed tab or a failed save never costs typing. */
export type LocalBackup = { at: number; values: RecipeFormValues };

export function backupKey(recipeId: string | null): string {
  return `minced:recipe-backup:${recipeId ?? "new"}`;
}

/** Reads a stored backup defensively: anything that is not the right shape is treated as no backup. */
export function parseBackup(raw: string | null): LocalBackup | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<LocalBackup> | null;
    const v = o?.values as Partial<RecipeFormValues> | undefined;
    if (!o || typeof o.at !== "number" || !v) return null;
    if (typeof v.title !== "string" || typeof v.description !== "string" || typeof v.servings !== "string") return null;
    if (!Array.isArray(v.ingredients) || !Array.isArray(v.steps) || !Array.isArray(v.diets) || !Array.isArray(v.cookware)) return null;
    if (!v.ingredients.every((r) => r && typeof r.name === "string" && typeof r.quantity === "string" && typeof r.unit === "string")) return null;
    if (!v.steps.every((s) => typeof s === "string")) return null;
    const merged = { ...emptyValues(), ...(v as RecipeFormValues), rights: false };
    merged.ingredients = (v.ingredients as IngredientRow[]).map((r) => ({ ...EMPTY_INGREDIENT, ...r }));
    return { at: o.at, values: merged };
  } catch {
    return null;
  }
}
