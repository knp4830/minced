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
  /** Ingredient name, used only to decide whether a bare count can be fractional (eggs cannot). */
  name?: string;
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

/**
 * "egg" -> "eggs" once the shown amount is more than 1. Only for bare counts (no unit): a name
 * after "cups" or "cloves" stays as written. Names that already end in "s" are left alone.
 */
export function pluralizeName(name: string, amountText: string): string {
  if (!(parseAmount(amountText) > 1)) return name;
  const m = /^(.*?)(\s*\(.*\))?$/.exec(name);
  const base = m?.[1] ?? name;
  const tail = m?.[2] ?? "";
  const words = base.split(" ");
  const last = words[words.length - 1];
  if (!last || /s$/i.test(last) || /^(?:of|and)$/i.test(last) || /[^a-z]/i.test(last)) return name;
  let plural: string;
  if (/[^aeiou]y$/i.test(last)) plural = last.slice(0, -1) + "ies";
  else if (/(?:ch|sh|x|z|o)$/i.test(last)) plural = last + "es";
  else if (/fe?$/i.test(last) && /^(?:knife|loaf|leaf)$/i.test(last)) plural = last.replace(/fe?$/i, "ves");
  else plural = last + "s";
  words[words.length - 1] = plural;
  return words.join(" ") + tail;
}

/* Common kitchen fractions of a cup (a cook owns 1/4, 1/3, 1/2, 2/3 and 3/4 cup measures). */
const CUP_FRACTIONS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
const VOLUME_TSP: Record<string, number> = { tsp: 1, tbsp: 3, cup: 48 };
/** Units counted one by one: shown in halves ("2 1/2 cloves"), "about" when inexact. */
const COUNT_UNITS = new Set(["clove", "head", "stalk", "fillet", "can", "bunch", "piece", "portion", "slice"]);
const NEAR = 0.02;

/** The nearest whole-plus-common-cup-fraction at or below `cups` (or nearest, when `floor` is false). */
function cupStep(cups: number, floor: boolean): number {
  const whole = Math.floor(cups);
  let best = whole;
  let bestErr = Infinity;
  for (let w = Math.max(0, whole - 1); w <= whole + 1; w++) {
    for (const f of [...CUP_FRACTIONS, 1]) {
      const v = w + f;
      if (floor && v > cups + 1e-9) continue;
      const e = Math.abs(v - cups);
      if (e < bestErr) {
        bestErr = e;
        best = v;
      }
    }
  }
  return best;
}

/**
 * Volume (tsp/tbsp/cup lines) in the largest unit that reads well, from the total in teaspoons:
 *   12 1/2 tbsp -> "3/4 cup + 1/2 tbsp", 38 tsp -> "3/4 cup + 2 tsp", 10 tbsp -> "1/2 cup + 2 tbsp".
 * A single unit is used whenever it is within 2% ("1/3 cup", "4 1/2 tbsp", "7 tsp"); otherwise a
 * cup measure plus a remainder in tbsp (halves) or tsp.
 */
function volumeDisplay(t: number): DisplayQuantity {
  const err = (shown: number) => Math.abs(shown - t) / t;
  const single = (amount: number, unit: string): DisplayQuantity => ({
    amount: formatAmount(amount),
    unit,
  });
  const cupResult = (cups: number, rest?: string, approx = false): DisplayQuantity => ({
    amount: formatAmount(cups),
    unit: `${cups > 1 ? "cups" : "cup"}${rest ? ` + ${rest}` : ""}`,
    ...(approx ? { approx } : {}),
  });
  const cups = t / 48;

  // Ten cups and up: a quarter-cup is plenty of precision.
  if (t >= 480) {
    const v = Math.round(cups * 4) / 4;
    return cupResult(v, undefined, err(v * 48) > 0.03);
  }
  if (t >= 12) {
    const v = cupStep(cups, false);
    if (v > 0 && err(v * 48) <= NEAR) return cupResult(v);
  }
  // Up to 7 tbsp stays in tablespoons, in halves ("4 1/2 tbsp").
  if (t < 24) {
    const tb = Math.round((t / 3) * 2) / 2;
    if (tb > 0 && err(tb * 3) <= NEAR) return single(tb, "tbsp");
  }
  if (t < 12) {
    // 4 tsp or more that is not a half-tablespoon reads as "3 tbsp + 1 tsp", the way a cook measures.
    if (t >= 4) {
      let w = Math.floor(t / 3);
      let ts = Math.round((t - 3 * w) * 4) / 4;
      if (ts >= 3) {
        w += 1;
        ts = 0;
      }
      const shown = w * 3 + ts;
      if (w >= 1 && ts > 0 && err(shown) <= NEAR) {
        return { amount: formatAmount(w), unit: `tbsp + ${formatAmount(ts)} tsp` };
      }
    }
    const ts = Math.round(t * 4) / 4;
    if (err(ts) <= NEAR) return single(ts, "tsp");
    const tb = Math.round((t / 3) * 2) / 2;
    return { ...single(tb, "tbsp"), approx: true };
  }

  // A cup measure plus a remainder.
  const c = cupStep(cups, true);
  const r = t - c * 48;
  const tb = Math.round((r / 3) * 2) / 2;
  const ts = r < 2 ? Math.round(r * 4) / 4 : Math.round(r * 2) / 2;
  const errTb = tb > 0 ? Math.abs(c * 48 + tb * 3 - t) : Infinity;
  const errTs = ts > 0 ? Math.abs(c * 48 + ts - t) : Infinity;
  if (r >= 1.5 && errTb <= errTs + 1e-9 && errTb / t <= NEAR) return cupResult(c, `${formatAmount(tb)} tbsp`);
  if (errTs / t <= NEAR) return cupResult(c, `${formatAmount(ts)} tsp`);
  if (tb > 0 && r >= 1.5) return cupResult(c, `${formatAmount(tb)} tbsp`, errTb / t > 0.03);
  return cupResult(c, ts > 0 ? `${formatAmount(ts)} tsp` : undefined, errTs / t > 0.03);
}

/** A counted amount: halves from 1 up, common fractions below 1. */
function snapCount(scaled: number, wholeOnly: boolean): number {
  if (scaled >= 2 && wholeOnly) return Math.round(scaled);
  if (scaled >= 1 || wholeOnly) return Math.max(0.5, Math.round(scaled * 2) / 2);
  const v = cupStep(scaled, false); // 0, 1/4, 1/3, 1/2, 2/3, 3/4 or 1
  return v > 0 ? v : 1 / 4;
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
    // Whole items read as halves ("2 1/2 apples"), never "3 3/4 egg": eggs are whole from 2 up.
    // Flagged "about" when the shown amount is more than 3% off.
    const snapped = snapCount(scaled, /egg/i.test(line.name ?? ""));
    const amount = formatAmount(snapped);
    const approx = relativeError(parseAmount(amount), scaled) > 0.03;
    return { amount, unit: "", ...(approx ? { approx } : {}) };
  }
  if (COUNT_UNITS.has(line.unit)) {
    const amount = formatAmount(snapCount(scaled, false));
    const approx = relativeError(parseAmount(amount), scaled) > 0.03;
    return { amount, unit: pluralUnit(line.unit, parseAmount(amount)), ...(approx ? { approx } : {}) };
  }
  if (line.unit in VOLUME_TSP) {
    const t = scaled * VOLUME_TSP[line.unit];
    if (t >= 3) return volumeDisplay(t);
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
