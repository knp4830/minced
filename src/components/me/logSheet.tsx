"use client";

import { useId, useState, useTransition } from "react";

import { MeDialog } from "@/components/me/meDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { useMeUi } from "@/components/me/meUi";
import { logSleep, logWeight, logWorkout } from "@/lib/actions/me";
import { lbToKg } from "@/lib/me/targets";
import { longDate } from "@/lib/me/dates";
import { DEFAULT_MINUTES, DEFAULT_SETS, MUSCLES, SESSIONS, type Session } from "@/lib/me/muscles";
import { cn } from "@/lib/utils";

/*
 * "+ Log": one sheet, three things you can log in a few taps.
 *   Workout - pick a session type (it fills the muscle map), then sets and minutes. Custom lets you pick the
 *             muscles and the sets for each. Cardio is minutes only.
 *   Food    - opens the add-food dialog (recipes and quick adds write immediately from there).
 *   Sleep   - hours slept, in half hours. The slider only logs once you move it.
 *   Weight  - this morning's weigh-in. Logs only when a number is typed.
 * "Log" saves the workout and the sleep you set; food is added from its own dialog.
 */

type CustomRow = { on: boolean; sets: number };

export function LogSheet({
  date,
  today,
  onClose,
  onOpenFood,
}: {
  date: string;
  today: string;
  onClose: () => void;
  onOpenFood: (date: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [sets, setSets] = useState(DEFAULT_SETS);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [customName, setCustomName] = useState("");
  const [custom, setCustom] = useState<Record<string, CustomRow>>({});
  const [sleep, setSleep] = useState(7.5);
  const [sleepTouched, setSleepTouched] = useState(false);
  const ui = useMeUi();
  const units = ui.targets?.units ?? "metric";
  const unitWord = units === "imperial" ? "lb" : "kg";
  const [weight, setWeight] = useState("");
  const weightKg = units === "imperial" ? lbToKg(Number(weight)) : Number(weight);
  const weightReady = weight.trim() !== "" && Number.isFinite(weightKg) && weightKg >= 30 && weightKg <= 300;
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  const pickedMuscles = Object.entries(custom).filter(([, r]) => r.on);
  const workoutReady = session !== null && (session === "cardio" ? minutes >= 1 : session === "custom" ? pickedMuscles.length > 0 : sets >= 1);
  const canLog = workoutReady || sleepTouched || weightReady;

  function save() {
    setMessage(null);
    startTransition(async () => {
      if (workoutReady && session) {
        const r = await logWorkout({
          date,
          session,
          minutes: session === "cardio" || minutes > 0 ? minutes : undefined,
          sets: session === "custom" || session === "cardio" ? undefined : sets,
          customName: session === "custom" ? customName : undefined,
          muscles: session === "custom" ? pickedMuscles.map(([muscle, row]) => ({ muscle, sets: row.sets })) : undefined,
        });
        if (!r.ok) return setMessage(r.error);
      }
      if (sleepTouched) {
        const r = await logSleep(date, sleep);
        if (!r.ok) return setMessage(r.error);
      }
      if (weightReady) {
        const r = await logWeight(date, weightKg);
        if (!r.ok) return setMessage(r.error);
      }
      onClose();
    });
  }

  return (
    <MeDialog eyebrow={date === today ? "Quick log" : `Quick log · ${longDate(date)}`} title="What are you logging?" onClose={onClose}>
      <div className="mt-5 grid gap-4 md:grid-cols-[1.35fr_1fr_1fr]">
        {/* Workout */}
        <section aria-labelledby={`${id}-w`} className="flex flex-col gap-3 rounded-xl bg-band p-4 md:row-span-2 md:p-[1.125rem]">
          <div>
            <h3 id={`${id}-w`} className="text-lg font-medium">
              Workout
            </h3>
            <p className="mt-1 text-xs leading-snug text-ink-muted">Pick a session type &mdash; it fills this week&rsquo;s muscle map.</p>
          </div>
          <div role="radiogroup" aria-label="Session type" className="flex flex-wrap gap-1.5">
            {SESSIONS.map((s) => (
              <button
                key={s.v}
                type="button"
                role="radio"
                aria-checked={session === s.v}
                onClick={() => setSession(session === s.v ? null : s.v)}
                className={cn(
                  "min-h-11 sm:min-h-9 rounded-sheet border px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors pointer-coarse:min-h-11",
                  session === s.v ? "border-herb bg-herb text-on-herb" : "border-outline bg-transparent text-ink hover:border-herb hover:text-herb",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {session && session !== "cardio" && session !== "custom" && (
            <Stepper id={`${id}-sets`} label="Working sets" value={sets} min={1} max={60} step={1} onChange={setSets} />
          )}
          {session === "custom" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor={`${id}-name`}>Name (optional)</Label>
                <Input id={`${id}-name`} value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={60} placeholder="Climbing, arms day&hellip;" />
              </div>
              <fieldset>
                <legend className="mb-1.5 text-[0.8125rem] font-semibold">Muscles and sets</legend>
                <ul className="grid gap-1">
                  {MUSCLES.map((m) => {
                    const row = custom[m.slug] ?? { on: false, sets: 3 };
                    return (
                      <li key={m.slug} className="flex min-h-11 items-center gap-2 sm:min-h-9">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[0.875rem]">
                          <input
                            type="checkbox"
                            className="size-4 accent-(--color-herb)"
                            checked={row.on}
                            onChange={(e) => setCustom((c) => ({ ...c, [m.slug]: { ...row, on: e.target.checked } }))}
                          />
                          <span className="truncate">{m.label}</span>
                        </label>
                        {row.on && (
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label={`Fewer sets for ${m.label}`} className="size-8 rounded-sm text-herb hover:bg-surface" onClick={() => setCustom((c) => ({ ...c, [m.slug]: { ...row, sets: Math.max(1, row.sets - 1) } }))}>
                              &minus;
                            </button>
                            <span className="w-6 text-center font-mono text-sm" aria-label={`${row.sets} sets`}>
                              {row.sets}
                            </span>
                            <button type="button" aria-label={`More sets for ${m.label}`} className="size-8 rounded-sm text-herb hover:bg-surface" onClick={() => setCustom((c) => ({ ...c, [m.slug]: { ...row, sets: Math.min(100, row.sets + 1) } }))}>
                              +
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            </div>
          )}
          {session && <Stepper id={`${id}-min`} label="Minutes" value={minutes} min={1} max={600} step={5} onChange={setMinutes} />}
        </section>

        {/* Food */}
        <section aria-labelledby={`${id}-f`} className="flex flex-col gap-3 rounded-xl bg-band p-4 md:col-span-2 md:p-[1.125rem]">
          <div>
            <h3 id={`${id}-f`} className="text-lg font-medium">
              Food
            </h3>
            <p className="mt-1 text-xs leading-snug text-ink-muted">Search Minced recipes, or add something quick.</p>
          </div>
          <Button variant="secondary" className="justify-start bg-surface font-normal text-ink-muted" onClick={() => onOpenFood(date)}>
            Search recipes or foods&hellip;
          </Button>
          <p className="text-[0.6875rem] text-ink-muted">You can also log a recipe from its own page.</p>
        </section>

        {/* Sleep */}
        <section aria-labelledby={`${id}-s`} className="flex flex-col gap-3 rounded-xl bg-band p-4 md:p-[1.125rem]">
          <div>
            <h3 id={`${id}-s`} className="text-lg font-medium">
              Sleep
            </h3>
            <p className="mt-1 text-xs leading-snug text-ink-muted">Last night, in hours.</p>
          </div>
          <output htmlFor={`${id}-sl`} className={cn("font-mono text-[2rem] leading-none", !sleepTouched && "text-ink-subtle")}>
            {sleep}h
          </output>
          <input
            id={`${id}-sl`}
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={sleep}
            aria-label="Hours slept"
            aria-valuetext={`${sleep} hours`}
            onChange={(e) => {
              setSleep(Number(e.target.value));
              setSleepTouched(true);
            }}
            className="h-11 w-full accent-(--color-herb)"
          />
          <div className="flex justify-between font-mono text-[0.625rem] text-ink-muted">
            <span>0h</span>
            <span>12h</span>
          </div>
          {!sleepTouched && <FieldHint>Move the slider to log your sleep.</FieldHint>}
        </section>

        {/* Weight */}
        <section aria-labelledby={`${id}-g`} className="flex flex-col gap-3 rounded-xl bg-band p-4 md:p-[1.125rem]">
          <div>
            <h3 id={`${id}-g`} className="text-lg font-medium">
              Weight
            </h3>
            <p className="mt-1 text-xs leading-snug text-ink-muted">Your weigh-in{date === today ? " this morning" : ""}. We chart the 7-day average.</p>
          </div>
          <div>
            <Label htmlFor={`${id}-wt`} className="sr-only">
              Weight in {unitWord}
            </Label>
            <div className="flex items-end gap-2">
              <Input
                id={`${id}-wt`}
                mono
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
                placeholder="0.0"
                className="w-28"
              />
              <span className="pb-2.5 font-mono text-xs text-ink-muted">{unitWord}</span>
            </div>
          </div>
          {!weightReady && <FieldHint>Type your weight to log it.</FieldHint>}
        </section>
      </div>

      <p role="alert" className={cn("mt-3 text-[0.8125rem] text-paprika-deep", !message && "sr-only")}>
        {message}
      </p>
      <div className="me-dialog-actions flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!canLog || pending}>
          {pending ? "Saving…" : "Log"}
        </Button>
      </div>
    </MeDialog>
  );
}

function Stepper({ id, label, value, min, max, step, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1">
        {label}
      </Label>
      <div className="inline-flex items-center rounded-field border border-field bg-surface">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} className="size-11 text-lg text-herb disabled:opacity-40 sm:size-10">
          &minus;
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            onChange(Math.min(max, Math.max(min, Number.isFinite(n) && n > 0 ? n : min)));
          }}
          className="w-14 bg-transparent text-center font-mono text-[0.9375rem] outline-none"
        />
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} className="size-11 text-lg text-herb disabled:opacity-40 sm:size-10">
          +
        </button>
      </div>
    </div>
  );
}
