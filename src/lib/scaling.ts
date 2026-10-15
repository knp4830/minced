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
  /** True when the shown value is rounded to a kitchen fraction by more than 3%: show "about". */
  approx?: boolean;
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
 * Values that are not near a kitchen fraction snap to the nearest eighth (< 10)
 * or a whole number (>= 10); there are no decimals in a recipe.
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
  // No kitchen fraction within 4%: a cook measures in eighths, never "0.2", so take the
  // nearest eighth. `displayQuantity` flags the result as approximate.
  const eighths = Math.round(value * 8);
  const w = Math.floor(eighths / 8);
  const f = eighths % 8;
  const label = f === 0 ? "" : (FRACTIONS.find(([v]) => Math.abs(v - f / 8) < 1e-9)?.[1] ?? "");
  if (!label) return String(w);
  return w > 0 ? `${w} ${label}` : label;
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

export function pluralUnit(unit: string, amountValue: number): string {
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
  if (!line.unit) {
    const amount = formatAmount(scaled);
    const approx = relativeError(parseAmount(amount), scaled) > 0.03;
    return { amount, unit: "", ...(approx ? { approx } : {}) };
  }

  const promoted = promote(scaled, line.unit);
  let q = promoted.quantity;
  let unit = promoted.unit;
  let amount = formatAmount(q);

  // Rounding to a kitchen fraction must not drift: 4 1/2 tbsp is 0.28 cup, which
  // would print as "1/4 cup" (10% short). Step back down the ladder until the
  // printed amount is within 3% of the real one, so the recipe page and the
  // shopping list agree.
  const key = ladderOf(unit);
  if (key && relativeError(parseAmount(amount), q) > 0.03) {
    const steps = LADDERS[key];
    const baseQty = q * (steps.find(([n]) => n === unit)?.[1] ?? 1);
    for (let i = steps.findIndex(([n]) => n === unit) - 1; i >= 0; i--) {
      const cq = baseQty / steps[i][1];
      const text = formatAmount(cq);
      q = cq;
      unit = steps[i][0];
      amount = text;
      if (relativeError(parseAmount(text), cq) <= 0.03) break;
    }
  }
  // Under 1/8 tsp (the smallest measuring spoon) is a pinch, never "0.1 tsp".
  if (unit === "tsp" && q < 0.11) return { amount: "a pinch", unit: "" };

  // `formatAmount` can round up to the next whole; pluralise on the rounded text.
  const n = amount === "0" ? 0 : q;
  const approx = relativeError(parseAmount(amount), q) > 0.03;
  return { amount, unit: pluralUnit(unit, n), ...(approx ? { approx } : {}) };
}

/** "1 1/2" -> 1.5, "to taste" -> NaN. */
export function parseAmount(text: string): number {
  let total = 0;
  for (const part of text.trim().split(/\s+/)) {
    const m = /^(\d+)\/(\d+)$/.exec(part);
    if (m) total += Number(m[1]) / Number(m[2]);
    else total += Number(part);
  }
  return total;
}

function relativeError(shown: number, actual: number): number {
  if (!Number.isFinite(shown) || actual <= 0) return 0;
  return Math.abs(shown - actual) / actual;
}

/* ---- Amounts inside prep notes ------------------------------------------------------------ */

const NOTE_UNITS: Record<string, string> = {
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", tsps: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbsps: "tbsp",
  cup: "cup", cups: "cup", pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  ounce: "oz", ounces: "oz", oz: "oz",
};
const NOTE_AMOUNT =
  /(?<![\w/.-])(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(teaspoons?|tsps?|tablespoons?|tbsps?|cups?|pounds?|lbs?|ounces?|oz)\b\.?(?!\s*(?:-|each|cans?|packages?|jars?|bags?|bottles?|boxes|box|cartons?|containers?))/gi;
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
const SIZE_WORDS = "large|medium|small|full";
const COUNT_NOUNS =
  "bunch(?:es)?|sticks?|oranges?|limes?|lemons?|bananas?|breasts?|drumsticks?|thighs?|fillets?|portions?|slices?|stalks?|packages?|squash|eggplants?|onions?|sprigs?|cloves?";
// "2 large", "2-3 bananas", "1/2 package", "4 drumsticks": a count that follows the servings.
const NOTE_COUNT = new RegExp(
  String.raw`(?<![\w/.-])(${NUM})(?:(\s*(?:-|to)\s*)(${NUM}))?(\s+)(?:(${SIZE_WORDS})\b|(${COUNT_NOUNS})\b)`,
  "gi",
);
// A weight written first in a note ("14.5 ounces", "13.5 oz") on a line that is not a measured
// volume is the size of the package or piece, not a quantity of the recipe.
const NOTE_PACKAGE_LEAD = /^\s*\d+(?:\.\d+)?(?:\s+\d+\/\d+)?\s*-?\s*(?:oz|ounces?)\b/i;
const CONTAINER_UNITS = new Set(["can"]);
const VOLUME_UNITS = new Set(["tsp", "tbsp", "cup", "ml", "l", "fl oz", "pt", "qt", "gal"]);

/** "orange" <-> "oranges" to follow the scaled count; more than 1 is plural, 1 or less singular. */
function pluralNoun(noun: string, n: number): string {
  const lower = noun.toLowerCase();
  if (lower === "squash") return noun;
  const one = lower.startsWith("bunch") ? "bunch" : lower.replace(/s$/, "");
  const out = n > 1 ? (one === "bunch" ? "bunches" : `${one}s`) : one;
  return noun[0] === noun[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
}

/**
 * Prep notes are cleaned of the ingredient's own amount (scripts/cleanup), but some keep a
 * second amount that belongs to an alternative ("or 1/2 teaspoon garlic powder") or a size
 * ("2 large"). Those follow the servings too. Package sizes ("15 ounce can") are left alone.
 */
export function scaleNoteAmounts(
  note: string,
  baseServings: number,
  targetServings: number,
  /** The ingredient line's own unit: a can's "13.5 oz" is its size, not an amount to scale. */
  lineUnit?: string | null,
): string {
  if (targetServings === baseServings || !(baseServings > 0)) return note;
  if (lineUnit && CONTAINER_UNITS.has(lineUnit)) return note;
  if (NOTE_PACKAGE_LEAD.test(note) && !(lineUnit && VOLUME_UNITS.has(lineUnit))) return note;
  const factor = targetServings / baseServings;
  const scaled = note.replace(NOTE_AMOUNT, (whole, num: string, unit: string) => {
    const n = parseAmount(num);
    if (!Number.isFinite(n) || n <= 0) return whole;
    const q = displayQuantity({ quantity: n, unit: NOTE_UNITS[unit.toLowerCase()] }, baseServings, targetServings);
    return `${q.approx ? "about " : ""}${q.amount}${q.unit ? ` ${q.unit}` : ""}`;
  });
  return scaled.replace(
    NOTE_COUNT,
    (whole, a: string, sep: string | undefined, b: string | undefined, gap: string, size?: string, noun?: string) => {
      const x = parseAmount(a);
      if (!Number.isFinite(x) || x <= 0) return whole;
      const first = formatAmount(x * factor);
      const hi = b === undefined ? x : parseAmount(b);
      const text = b === undefined ? first : `${first}${sep}${formatAmount(hi * factor)}`;
      if (size) return `${text}${gap}${size}`;
      return `${text}${gap}${pluralNoun(noun as string, hi * factor)}`;
    },
  );
}
