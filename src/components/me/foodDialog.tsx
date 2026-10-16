"use client";

import { useId, useRef, useState, useTransition } from "react";

import { MeDialog } from "@/components/me/meDialog";
import { Button } from "@/components/ui/button";
import { FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { logFood, searchRecipes } from "@/lib/actions/me";
import { longDate } from "@/lib/me/dates";
import { MEALS, type Meal } from "@/lib/me/types";
import { usableImageUrl } from "@/lib/photos";
import type { LoggableRecipe } from "@/lib/queries/me";
import { cn } from "@/lib/utils";

/*
 * Add food to a meal. Two ways in, both writing the same kind of row:
 *   - a Minced recipe x servings: the nutrition is read from the recipe on the server and frozen on the
 *     log row (the browser never sends numbers for a recipe);
 *   - a quick add: a name and calories, with macros if you know them.
 * Foods from the ingredient catalogue are not offered: the database holds no per-100 g nutrition for
 * ingredients, and nothing here invents numbers.
 */

type Tab = "recipe" | "quick";

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function FoodDialog({
  date,
  today,
  meal: initialMeal,
  onClose,
}: {
  date: string;
  today: string;
  meal: Meal;
  onClose: () => void;
}) {
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [tab, setTab] = useState<Tab>("recipe");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mealLabel = MEALS.find((m) => m.v === meal)?.label ?? "";

  return (
    <MeDialog
      eyebrow={date === today ? "Today" : longDate(date)}
      title={`Add to ${mealLabel.toLowerCase()}`}
      onClose={onClose}
      widthRem={36}
    >
      <div role="radiogroup" aria-label="Meal" className="mt-4 flex flex-wrap gap-1.5">
        {MEALS.map((m) => (
          <Pill key={m.v} checked={meal === m.v} onClick={() => setMeal(m.v)}>
            {m.label}
          </Pill>
        ))}
      </div>

      <div role="tablist" aria-label="How to add" className="mt-5 flex gap-1 border-b border-line">
        {(
          [
            ["recipe", "Minced recipe"],
            ["quick", "Quick add"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            id={`food-tab-${v}`}
            aria-selected={tab === v}
            aria-controls={`food-panel-${v}`}
            onClick={() => setTab(v)}
            className={cn(
              "-mb-px min-h-11 border-b-2 px-3.5 text-[0.875rem] font-medium transition-colors",
              tab === v ? "border-herb text-herb" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4" role="tabpanel" id={`food-panel-${tab}`} aria-labelledby={`food-tab-${tab}`}>
        {tab === "recipe" ? (
          <RecipeTab date={date} meal={meal} pending={pending} startTransition={startTransition} setMessage={setMessage} onDone={onClose} />
        ) : (
          <QuickTab date={date} meal={meal} pending={pending} startTransition={startTransition} setMessage={setMessage} onDone={onClose} />
        )}
      </div>
      <p role="alert" className={cn("mt-3 min-h-5 text-[0.8125rem] text-paprika-deep", !message && "sr-only")}>
        {message}
      </p>
    </MeDialog>
  );
}

function Pill({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "min-h-11 sm:min-h-9 rounded-sheet border px-3.5 text-[0.8125rem] font-medium transition-colors pointer-coarse:min-h-11",
        checked ? "border-herb bg-herb text-on-herb" : "border-line-strong text-ink hover:border-herb hover:text-herb",
      )}
    >
      {children}
    </button>
  );
}

type TabProps = {
  date: string;
  meal: Meal;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  setMessage: (m: string | null) => void;
  onDone: () => void;
};

function RecipeTab({ date, meal, pending, startTransition, setMessage, onDone }: TabProps) {
  const qId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LoggableRecipe[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<LoggableRecipe | null>(null);
  const [servings, setServings] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  function search(value: string) {
    setQ(value);
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      const r = await searchRecipes(value);
      if (mine !== seq.current) return; // a newer search is in flight
      setSearching(false);
      if (r.ok) setResults(r.recipes);
      else setMessage(r.error);
    }, 250);
  }

  function add() {
    if (!picked) return;
    startTransition(async () => {
      const r = await logFood({ kind: "recipe", date, meal, slug: picked.slug, servings });
      if (r.ok) onDone();
      else setMessage(r.error);
    });
  }

  if (picked) {
    const kcal = picked.calories === null ? null : picked.calories * servings;
    return (
      <div>
        <p className="font-display text-lg leading-snug font-medium">{picked.title}</p>
        <p className="mt-1 font-mono text-xs text-ink-muted">
          {picked.calories === null ? "No nutrition yet" : `${nf.format(picked.calories)} kcal per serving`} &middot; makes {picked.servings}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Label className="mb-0" htmlFor={`${qId}-servings`}>
            Servings eaten
          </Label>
          <div className="inline-flex items-center rounded-field border border-field">
            <button type="button" aria-label="Fewer servings" className="size-11 text-lg text-herb disabled:opacity-40 sm:size-10" disabled={servings <= 0.5} onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}>
              &minus;
            </button>
            <output id={`${qId}-servings`} className="min-w-12 text-center font-mono text-[0.9375rem]" aria-live="polite">
              {servings}
            </output>
            <button type="button" aria-label="More servings" className="size-11 text-lg text-herb disabled:opacity-40 sm:size-10" disabled={servings >= 20} onClick={() => setServings((s) => Math.min(20, s + 0.5))}>
              +
            </button>
          </div>
          {kcal !== null && <span className="font-mono text-sm text-ink-muted">{nf.format(kcal)} kcal</span>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPicked(null)}>
            Back
          </Button>
          <Button size="sm" onClick={add} disabled={pending || picked.calories === null}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={qId}>Search Minced recipes</Label>
      <Input id={qId} type="search" autoComplete="off" placeholder="Overnight oats, chana masala&hellip;" value={q} onChange={(e) => search(e.target.value)} autoFocus />
      <div aria-live="polite" className="mt-3 min-h-24">
        {searching && <p className="text-[0.8125rem] text-ink-muted">Searching&hellip;</p>}
        {!searching && results && results.length === 0 && (
          <p className="text-[0.8125rem] text-ink-muted">No recipe has that in its name. Try another word, or use Quick add for anything else.</p>
        )}
        {!searching && results && results.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {results.map((r) => {
              const img = usableImageUrl(r.imageUrl);
              return (
                <li key={r.slug}>
                  <button type="button" onClick={() => setPicked(r)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-band">
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-md border border-line bg-hatch">
                      {img && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem]">{r.title}</span>
                      <span className="block font-mono text-[0.6875rem] text-ink-muted">
                        {r.calories === null ? "No nutrition yet" : `${nf.format(r.calories)} kcal per serving`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!searching && !results && <FieldHint>Type at least two letters. Only Minced recipes are searched; for a coffee or a snack bar, use Quick add.</FieldHint>}
      </div>
    </div>
  );
}

function QuickTab({ date, meal, pending, startTransition, setMessage, onDone }: TabProps) {
  const id = useId();
  const [f, setF] = useState({ name: "", calories: "", proteinG: "", carbsG: "", fatG: "", fiberG: "", sodiumMg: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const r = await logFood({ kind: "quick", date, meal, ...f });
      if (r.ok) onDone();
      else setMessage(r.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div>
        <Label htmlFor={`${id}-name`}>What did you have?</Label>
        <Input id={`${id}-name`} value={f.name} onChange={set("name")} maxLength={120} placeholder="Flat white, protein bar&hellip;" autoFocus required />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Num id={`${id}-kcal`} label="Calories" unit="kcal" value={f.calories} onChange={set("calories")} required />
        <Num id={`${id}-p`} label="Protein" unit="g" value={f.proteinG} onChange={set("proteinG")} />
        <Num id={`${id}-c`} label="Carbs" unit="g" value={f.carbsG} onChange={set("carbsG")} />
        <Num id={`${id}-f`} label="Fat" unit="g" value={f.fatG} onChange={set("fatG")} />
      </div>
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer py-2.5 text-[0.8125rem] font-medium text-herb">More nutrients</summary>
        <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num id={`${id}-fib`} label="Fibre" unit="g" value={f.fiberG} onChange={set("fiberG")} />
          <Num id={`${id}-na`} label="Sodium" unit="mg" value={f.sodiumMg} onChange={set("sodiumMg")} />
        </div>
      </details>
      <FieldHint>Only calories are required. Empty protein, carbs or fat count as 0 g. Empty fibre or sodium stay unknown, so they are left out of your totals rather than counted as zero.</FieldHint>
      <div className="mt-5 flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !f.name.trim() || f.calories.trim() === ""}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}

function Num({ id, label, unit, value, onChange, required }: { id: string; label: string; unit: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>; required?: boolean }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} mono inputMode="decimal" value={value} onChange={onChange} required={required} placeholder={required ? "" : "optional"} className="pr-10" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-ink-subtle">
          {unit}
        </span>
      </div>
    </div>
  );
}
