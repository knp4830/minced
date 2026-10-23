"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { EditFoodDialog } from "@/components/me/editFoodDialog";
import { FoodDialog } from "@/components/me/foodDialog";
import { LogSheet } from "@/components/me/logSheet";
import { TargetsWizard } from "@/components/me/targetsWizard";
import type { Sex, Units } from "@/lib/me/targets";
import type { FoodEntry, Meal, MeTargets } from "@/lib/me/types";

/*
 * The dashboard's server-rendered cards need to open client dialogs (quick log, add food, edit an entry,
 * targets). This provider owns which one is open, so a card can be a Server Component with one small client
 * button inside it. `today` is the person's local date, decided on the server from their time-zone cookie;
 * `viewDate` is the day the page is showing (`?d=`, today by default) and is where "+ Add" and "Log" write to.
 */

type Dialog =
  | { kind: "log"; date: string }
  | { kind: "food"; date: string; meal: Meal }
  | { kind: "editFood"; entry: FoodEntry }
  | { kind: "targets" }
  | null;

type Ui = {
  today: string;
  /** The day the page is showing: today, or a past day picked in the calendar. */
  viewDate: string;
  targets: MeTargets | null;
  /** 7-day average weigh-in in kg, or null. */
  avgWeightKg: number | null;
  /** Settings > Units and Body. Targets may not exist yet, so the log forms read these from here. */
  settings: MeSettings;
  openLog: (date?: string) => void;
  openFood: (meal?: Meal, date?: string) => void;
  openEditFood: (entry: FoodEntry) => void;
  openTargets: () => void;
};

export type MeSettings = { units: Units; sex: Sex | null; birthYear: number | null };

const Ctx = createContext<Ui | null>(null);

export function useMeUi(): Ui {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMeUi must be used inside <MeUiProvider>");
  return ctx;
}

/** A sensible meal for "add food" when the person did not pick one: by the clock. */
function mealForNow(): Meal {
  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
}

export function MeUiProvider({
  today,
  viewDate,
  targets,
  avgWeightKg,
  settings,
  children,
}: {
  today: string;
  viewDate: string;
  targets: MeTargets | null;
  avgWeightKg: number | null;
  settings: MeSettings;
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);

  const openLog = useCallback((date?: string) => setDialog({ kind: "log", date: date ?? viewDate }), [viewDate]);
  const openFood = useCallback((meal?: Meal, date?: string) => setDialog({ kind: "food", date: date ?? viewDate, meal: meal ?? mealForNow() }), [viewDate]);
  const openEditFood = useCallback((entry: FoodEntry) => setDialog({ kind: "editFood", entry }), []);
  const openTargets = useCallback(() => setDialog({ kind: "targets" }), []);
  const close = useCallback(() => setDialog(null), []);

  const value = useMemo<Ui>(
    () => ({ today, viewDate, targets, avgWeightKg, settings, openLog, openFood, openEditFood, openTargets }),
    [today, viewDate, targets, avgWeightKg, settings, openLog, openFood, openEditFood, openTargets],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {dialog?.kind === "log" && <LogSheet date={dialog.date} today={today} onClose={close} onOpenFood={(d) => openFood(undefined, d)} />}
      {dialog?.kind === "food" && <FoodDialog date={dialog.date} today={today} meal={dialog.meal} onClose={close} />}
      {dialog?.kind === "editFood" && <EditFoodDialog entry={dialog.entry} onClose={close} />}
      {dialog?.kind === "targets" && <TargetsWizard initial={targets} settings={settings} today={today} avgWeightKg={avgWeightKg} onClose={close} />}
    </Ctx.Provider>
  );
}
