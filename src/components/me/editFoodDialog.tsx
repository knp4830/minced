"use client";

import { useId, useState, useTransition } from "react";

import { MeDialog } from "@/components/me/meDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { editFood } from "@/lib/actions/me";
import { MEALS, type FoodEntry, type Meal } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * Edit a diary entry: move it to another meal and/or change how much of it you ate. Every stored figure
 * (calories, macros, fibre, sodium and the vitamins and minerals) is scaled by the same factor in the database,
 * which is exact because nutrition is proportional to the amount. What "how much" means depends on the entry:
 *   a Minced recipe          -> servings
 *   an ingredient or brand   -> the amount you typed, in the unit you typed it in
 *   anything else (a quick add, or an older entry) -> a portion of what was logged (1 = unchanged)
 */

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

type Kind = { label: string; current: number; unit: string | null; hint: string };

function kindOf(e: FoodEntry): Kind {
  if (e.servings !== null) return { label: "Servings", current: e.servings, unit: null, hint: "Each serving is the recipe's per-serving nutrition." };
  if (e.amount !== null && e.amountUnit) return { label: "Amount", current: e.amount, unit: e.amountUnit, hint: "The calories and nutrients scale with the amount." };
  return { label: "Portion", current: 1, unit: null, hint: "1 is what you logged. Half is 0.5, double is 2." };
}

export function EditFoodDialog({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const id = useId();
  const kind = kindOf(entry);
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [amount, setAmount] = useState(String(Math.round(kind.current * 1000) / 1000));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const n = Number(amount.replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(n) && n > 0;
  const factor = valid ? n / kind.current : null;
  const changedAmount = valid && Math.abs(n - kind.current) > 1e-9;
  const changed = meal !== entry.meal || changedAmount;
  const newKcal = factor === null ? null : entry.calories * factor;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await editFood({ id: entry.id, meal: meal !== entry.meal ? meal : undefined, amount: changedAmount ? n : undefined });
      if (r.ok) onClose();
      else setMessage(r.error);
    });
  }

  return (
    <MeDialog eyebrow="Edit entry" title={entry.name} onClose={onClose} widthRem={30}>
      <div role="radiogroup" aria-label="Meal" className="mt-4 flex flex-wrap gap-1.5">
        {MEALS.map((m) => (
          <button
            key={m.v}
            type="button"
            role="radio"
            aria-checked={meal === m.v}
            onClick={() => setMeal(m.v)}
            className={cn(
              "min-h-11 rounded-sheet border px-3.5 text-[0.8125rem] font-medium transition-colors sm:min-h-9 pointer-coarse:min-h-11",
              meal === m.v ? "border-herb bg-herb text-on-herb" : "border-line-strong text-ink hover:border-herb hover:text-herb",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <Label htmlFor={`${id}-amt`}>{kind.label}</Label>
        <div className="flex items-end gap-2">
          <Input id={`${id}-amt`} mono inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))} className="w-32" aria-describedby={`${id}-hint`} />
          {kind.unit && <span className="pb-2.5 font-mono text-xs text-ink-muted">{kind.unit}</span>}
        </div>
        <FieldHint id={`${id}-hint`}>{kind.hint}</FieldHint>
      </div>

      <p className="mt-4 rounded-md bg-band px-3 py-2 font-mono text-[0.8125rem]" aria-live="polite">
        {newKcal === null ? "Enter an amount above zero." : changedAmount ? `${nf.format(entry.calories)} kcal now becomes about ${nf.format(newKcal)} kcal (${nf2.format(factor ?? 1)} times as much).` : `${nf.format(entry.calories)} kcal`}
      </p>

      <p role="alert" className={cn("mt-3 text-[0.8125rem] text-paprika-deep", !message && "sr-only")}>
        {message}
      </p>
      <div className="me-dialog-actions flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!valid || !changed || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </MeDialog>
  );
}
