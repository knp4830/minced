import { FDC, type Nutrient } from "@/lib/nutrients";
import { KCAL_PER_G, MIN_KCAL, PROTEIN_G_PER_KG, FAT_G_PER_KG, type Sex } from "@/lib/me/targets";

/*
 * Personal Daily Values for "All nutrients today". Pure: no I/O.
 *
 * Recipe pages keep the FDA label Daily Values (one number for everybody, the thing printed on food). Me is
 * about one person, so it uses, in this order:
 *
 *   calories, protein, carbs, total fat   the person's own daily targets (or the sedentary baseline below);
 *   saturated fat, added sugars           10% of the calorie target (Dietary Guidelines for Americans 2020-2025:
 *                                         "less than 10% of calories"; saturated fat 9 kcal/g, sugars 4 kcal/g);
 *   fiber, vitamins, minerals, potassium  the NASEM Dietary Reference Intake for the person's sex and age band
 *                                         (RDA, or AI where no RDA exists), from the `nutrient_dris` table;
 *   sodium                                the NASEM 2019 Chronic Disease Risk Reduction intake (a ceiling);
 *   cholesterol, anything else            the FDA label value: no DRI exists for cholesterol.
 *
 * If sex or age is unknown, every nutrient falls back to the FDA value and the panel says so. Nothing here
 * adjusts for pregnancy, breastfeeding or smoking (the app does not ask).
 */

export type Dri = { key: string; sex: Sex; ageMin: number; ageMax: number; amount: number; kind: "rda" | "ai" | "cdrr" };

export type DvBasis = "target" | "energy" | "rda" | "ai" | "cdrr" | "fda";

export type PersonalDv = { amount: number; basis: DvBasis };

/** What we know about the person. Calories and macros are grams/kcal per day. */
export type Person = {
  sex: Sex | null;
  age: number | null;
  /** Where the macro numbers come from: the saved targets, or the weight/sex/age baseline. */
  macros: { kcal: number; proteinG: number; carbsG: number; fatG: number; source: "targets" | "baseline" } | null;
};

export const SAT_FAT_ENERGY_SHARE = 0.1;
export const ADDED_SUGAR_ENERGY_SHARE = 0.1;

/** The DRI row for a nutrient, sex and age (13 falls in the 9-13 band), or undefined. */
export function driFor(dris: readonly Dri[], key: string, sex: Sex, age: number): Dri | undefined {
  return dris.find((d) => d.key === key && d.sex === sex && age >= d.ageMin && age <= d.ageMax);
}

/**
 * Daily Value for every nutrient in the list, keyed by `Nutrient.key`. A nutrient with no personal value and no
 * FDA value (total sugars, trans, mono, poly) is absent: it has no % by design.
 */
export function personalDailyValues(nutrients: readonly Nutrient[], dris: readonly Dri[], person: Person): Map<string, PersonalDv> {
  const out = new Map<string, PersonalDv>();
  const personal = person.sex !== null && person.age !== null;
  for (const n of nutrients) {
    const fda = n.dvAmount !== null && n.dvAmount > 0 ? { amount: n.dvAmount, basis: "fda" as const } : null;
    let dv: PersonalDv | null = null;
    const m = person.macros;
    if (m && n.fdcNumber !== null) {
      if (n.fdcNumber === FDC.energy) dv = { amount: m.kcal, basis: "target" };
      else if (n.fdcNumber === FDC.protein) dv = { amount: m.proteinG, basis: "target" };
      else if (n.fdcNumber === FDC.carbs) dv = { amount: m.carbsG, basis: "target" };
      else if (n.fdcNumber === FDC.fat) dv = { amount: m.fatG, basis: "target" };
      else if (n.fdcNumber === FDC.satFat) dv = { amount: Math.round((m.kcal * SAT_FAT_ENERGY_SHARE) / KCAL_PER_G.fat), basis: "energy" };
      else if (n.fdcNumber === FDC.addedSugars) dv = { amount: Math.round((m.kcal * ADDED_SUGAR_ENERGY_SHARE) / KCAL_PER_G.carbs), basis: "energy" };
    }
    if (!dv && personal) {
      const d = driFor(dris, n.key, person.sex as Sex, person.age as number);
      if (d) dv = { amount: d.amount, basis: d.kind };
    }
    const chosen = dv ?? fda;
    if (chosen && chosen.amount > 0) out.set(n.key, chosen);
  }
  return out;
}

// ---------- sedentary baseline from weight, sex and age only ----------

/**
 * Basal metabolic rate from weight, sex and age alone (no height), kcal a day: the Schofield equations in
 * FAO/WHO/UNU, "Energy and protein requirements", Technical Report 724 (1985).
 */
export function schofieldBmr(sex: Sex, age: number, weightKg: number): number {
  const w = weightKg;
  if (sex === "male") {
    if (age < 18) return 17.686 * w + 658.2;
    if (age < 30) return 15.057 * w + 692.2;
    if (age <= 60) return 11.472 * w + 873.1;
    return 11.711 * w + 587.7;
  }
  if (age < 18) return 13.384 * w + 692.6;
  if (age < 30) return 14.818 * w + 486.6;
  if (age <= 60) return 8.126 * w + 845.6;
  return 9.082 * w + 658.5;
}

/** Sedentary activity factor, the same 1.2 the targets wizard uses for "Sedentary". */
export const SEDENTARY_FACTOR = 1.2;

/**
 * Maintenance calories and macros for someone who gave only weight, sex and age: Schofield x 1.2 (sedentary),
 * to the nearest 10, never below the app's calorie floor; protein and fat per kg and carbs for the rest, exactly
 * as `computeTargets` does. It is a starting point, not a plan: no goal, no pace.
 */
export function baselineMacros(sex: Sex, age: number, weightKg: number): NonNullable<Person["macros"]> {
  const maintenance = Math.round((schofieldBmr(sex, age, weightKg) * SEDENTARY_FACTOR) / 10) * 10;
  const kcal = Math.max(maintenance, MIN_KCAL[sex]);
  const proteinG = Math.round(weightKg * PROTEIN_G_PER_KG);
  const fatG = Math.round(weightKg * FAT_G_PER_KG);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat) / 20) * 5);
  return { kcal, proteinG, carbsG, fatG, source: "baseline" };
}
