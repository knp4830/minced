/**
 * Servings scaling and kitchen-friendly quantity display. Pure functions, no
 * React, so the maths can be tested in plain node.
 *
 * The rule: scale the stored quantity by target / base servings FIRST, in the
 * unit the recipe was written in, then pick a unit and a fraction for display.
 * Never round before scaling, or 1 tsp x 4 turns into 1 tbsp + error.
 */

export type ScalableLine = {
  /** null means "to taste" / "as needed" and is never scaled. */
  quantity: number | null;
  /** Unit name as stored in `units.name` ("tsp", "cup", "clove") or null. */
  unit: string | null;
};

export type DisplayQuantity = {
  /** "1 1/2", "2", "to taste". Empty only for unitless text-only lines. */
  amount: string;
  /** "cups", "tbsp", "" for bare counts like "3 eggs". */
  unit: string;
};

export function scaleQuantity(
  quantity: number,
  baseServings: number,
  targetServings: number,
): number {
  if (!(baseServings > 0)) return quantity;
  return (quantity * targetServings) / baseServings;
}

/* Unit ladders: [name, size in the ladder's base unit]. Smallest first. */
const LADDERS: Record<string, [string, number][]> = {
  volume: [
    ["tsp", 1],
    ["tbsp", 3],
    ["cup", 48],
  ],
  metric_mass: [
    ["g", 1],
    ["kg", 1000],
  ],
  metric_volume: [
    ["ml", 1],
    ["l", 1000],
  ],
  mass: [
    ["oz", 1],
    ["lb", 16],
  ],
};

function ladderOf(unit: string): string | null {
  for (const [key, steps] of Object.entries(LADDERS)) {
    if (steps.some(([n]) => n === unit)) return key;
  }
  return null;
}

/**
 * Move to a nicer unit only when the number would otherwise read badly:
 * up when >= the next unit's size (3 tsp -> 1 tbsp; 4 tbsp -> 1/4 cup),
 * down when < one of the current unit and a smaller one exists (1/2 tbsp -> 1 1/2 tsp).
 * Up-moves are limited to results >= 1/4 of the new unit, so we never say "1/16 cup".
 */
function promote(quantity: number, unit: string): { quantity: number; unit: string } {
  const key = ladderOf(unit);
  if (!key) return { quantity, unit };
  const steps = LADDERS[key];
  const idx = steps.findIndex(([n]) => n === unit);
  let base = quantity * steps[idx][1];

  // Pick the largest unit in which the amount is at least 1/4 (cup) / 1 (others).
  let best = 0;
  for (let i = 0; i < steps.length; i++) {
    const min = steps[i][0] === "cup" ? 0.25 : 1;
    if (base / steps[i][1] >= min) best = i;
  }
  // 3 tsp is the same as 1 tbsp but "1/4 cup" beats "4 tbsp": handled by min above.
  base = base / steps[best][1];
  return { quantity: base, unit: steps[best][0] };
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "1/8"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [3 / 8, "3/8"],
  [1 / 2, "1/2"],
  [5 / 8, "5/8"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [7 / 8, "7/8"],
];

/**
 * 0.5 -> "1/2", 1.5 -> "1 1/2", 2 -> "2", 0.34 -> "1/3", 12.4 -> "12".
 * Values that are not near a kitchen fraction fall back to one decimal (< 10)
 * or a whole number (>= 10).
 */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10) return String(Math.round(value));

  if (value < 0.0625) return "1/8"; // never print "0 tsp" for a pinch-sized amount

  const whole = Math.floor(value);
  const frac = value - whole;
  if (frac < 0.04) return String(whole);
  if (frac > 0.96) return String(whole + 1);

  let bestLabel: string | null = null;
  let bestErr = Infinity;
  for (const [v, label] of FRACTIONS) {
    const err = Math.abs(frac - v);
    if (err < bestErr) {
      bestErr = err;
      bestLabel = label;
    }
  }
  if (bestLabel && bestErr <= 0.04) {
    return whole > 0 ? `${whole} ${bestLabel}` : bestLabel;
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const PLURAL_UNITS = new Set([
  "cup",
  "clove",
  "head",
  "stalk",
  "fillet",
  "can",
  "bunch",
  "piece",
  "portion",
  "slice",
]);

function pluralUnit(unit: string, amountValue: number): string {
  if (amountValue > 1 && PLURAL_UNITS.has(unit)) return `${unit}s`;
  return unit;
}

/** The text for one ingredient line at `targetServings`. */
export function displayQuantity(
  line: ScalableLine,
  baseServings: number,
  targetServings: number,
): DisplayQuantity {
  if (line.quantity == null) return { amount: "to taste", unit: "" };

  const scaled = scaleQuantity(line.quantity, baseServings, targetServings);
  if (!line.unit) return { amount: formatAmount(scaled), unit: "" };

  const promoted = promote(scaled, line.unit);
  const q = promoted.quantity;
  const unit = promoted.unit;
  // `formatAmount` can round up to the next whole; pluralise on the rounded text.
  const amount = formatAmount(q);
  const n = amount === "0" ? 0 : q;
  return { amount, unit: pluralUnit(unit, n) };
}
