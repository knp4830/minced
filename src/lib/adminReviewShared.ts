/* Client-safe pieces of the admin review queue: types, labels, pure helpers. */

export type ReviewState = "unreviewed" | "approved" | "rejected" | "all";
export type SourceKey = "usda" | "minced" | "mockup" | "user";

export const REVIEW_STATES: ReviewState[] = ["unreviewed", "approved", "rejected", "all"];
export const SOURCE_KEYS: SourceKey[] = ["usda", "minced", "mockup", "user"];
export const SOURCE_LABEL: Record<SourceKey | "other", string> = {
  usda: "USDA MyPlate",
  minced: "Minced original",
  mockup: "Design mockup",
  user: "User",
  other: "Other",
};

export type AdminIngredient = {
  id: number;
  sort_order: number;
  ingredient_id: number;
  canonical_name: string;
  is_pantry_staple: boolean;
  aisle: string;
  quantity: number | null;
  unit: string | null;
  prep_note: string | null;
  is_optional: boolean;
};

export type AdminRecipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: "draft" | "in_review" | "published";
  servings: number;
  prep_time_min: number | null;
  cook_time_min: number | null;
  spice_level: number | null;
  cuisine: string | null;
  nutrition: Record<"calories" | "protein_g" | "carbs_g" | "fat_g" | "sodium_mg" | "fiber_g", number | null>;
  source: { key: SourceKey | "other"; name: string | null; url: string | null; license: string | null };
  notes: string | null;
  steps: { id: number; sort_order: number; instruction: string }[];
  ingredients: AdminIngredient[];
  allergens: string[];
  diets: string[];
  cookware: string[];
  photo: {
    storage_path: string;
    width: number;
    height: number;
    alt_text: string | null;
    source: string;
    license: string;
    license_url: string | null;
    credit: string | null;
    attribution_url: string;
  } | null;
  review: { state: "approved" | "rejected"; reviewed_at: string; note: string | null } | null;
};

export type ProgressRow = { source_key: string; state: string; n: number };
export type ListRow = {
  slug: string;
  title: string;
  source_key: string;
  state: string;
  status: string;
  ingredient_count: number;
  reviewed_at: string | null;
};
export type Neighbors = { prev_slug: string | null; next_slug: string | null; total: number };

export function parseState(v: string | string[] | undefined): ReviewState {
  const s = Array.isArray(v) ? v[0] : v;
  return REVIEW_STATES.includes(s as ReviewState) ? (s as ReviewState) : "unreviewed";
}

export function parseSource(v: string | string[] | undefined): SourceKey | null {
  const s = Array.isArray(v) ? v[0] : v;
  return SOURCE_KEYS.includes(s as SourceKey) ? (s as SourceKey) : null;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,150}$/;
export function parseSlug(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && SLUG_RE.test(s) ? s : null;
}

export type ProgressSummary = {
  total: number;
  reviewed: number;
  approved: number;
  rejected: number;
  unreviewed: number;
};

export function summarize(rows: ProgressRow[], source: SourceKey | null): ProgressSummary {
  const s: ProgressSummary = { total: 0, reviewed: 0, approved: 0, rejected: 0, unreviewed: 0 };
  for (const r of rows) {
    if (source && r.source_key !== source) continue;
    const n = Number(r.n);
    s.total += n;
    if (r.state === "approved") s.approved += n;
    else if (r.state === "rejected") s.rejected += n;
    else s.unreviewed += n;
  }
  s.reviewed = s.approved + s.rejected;
  return s;
}
