/**
 * Words, not abbreviations, for the facts shown next to a recipe.
 * "35 min", "1 hr 15 min", "12 servings", "410 calories".
 */

/** 35 -> "35 min", 60 -> "1 hr", 75 -> "1 hr 15 min". */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`;
}

export function formatServings(n: number): string {
  return `${n} ${n === 1 ? "serving" : "servings"}`;
}

export function formatCalories(n: number): string {
  return `${n} ${n === 1 ? "calorie" : "calories"}`;
}
