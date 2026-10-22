/*
 * "Is this food raw or cooked?" for the Me "Add food" dialog. A diary entry of 100 g of brown rice means very
 * different things raw (367 kcal) and cooked (123 kcal), so when an ingredient has more than one USDA food
 * the person picks which one they weighed. Pure, so a script can check it without a database.
 */

export type FoodForm = { fdcId: number; label: string; isDefault: boolean };

/** Plain-language state from the USDA description (falls back to the form name). */
export function formLabel(description: string, form: string): string {
  const d = description.toLowerCase();
  if (/\bcooked\b|\bboiled\b|\bsteamed\b|\broasted\b|\bbaked\b|\bgrilled\b/.test(d)) return "Cooked";
  if (/\bcanned\b/.test(d)) return "Canned";
  if (/\braw\b|\bdry\b|\bdried\b|\buncooked\b/.test(d)) return "Raw or dry (weighed before cooking)";
  const f = form.replace(/_/g, " ").trim();
  return f === "default" ? "Standard" : f.charAt(0).toUpperCase() + f.slice(1);
}

/** One entry per distinct food (several form names can point at the same record), labelled. */
export function toForms(rows: { form: string; fdcId: number; isDefault: boolean; description: string }[]): FoodForm[] {
  const seen = new Set<number>();
  const out: FoodForm[] = [];
  // the default form first, so the label the person already gets is the first one listed
  const sorted = [...rows].sort((a, b) => Number(b.form === "default") - Number(a.form === "default"));
  for (const r of sorted) {
    if (seen.has(r.fdcId)) continue;
    seen.add(r.fdcId);
    out.push({ fdcId: r.fdcId, label: formLabel(r.description, r.form), isDefault: r.form === "default" });
  }
  return out;
}
