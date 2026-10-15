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
    ingredients: d.ingredients.map((i) => ({
      quantity: formatQuantity(i.quantity),
      unit: i.unit ?? "",
      name: i.name,
      note: i.prep_note ?? "",
      optional: i.is_optional,
    })),
    steps: d.steps.length > 0 ? d.steps : [""],
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
  /** Canonical names and aliases, lower-case, for the name field's suggestions. */
  ingredientNames: string[];
};
