"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";

import { MeDialog } from "@/components/me/meDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTargets } from "@/lib/actions/me";
import { addDays, dayMonthYear } from "@/lib/me/dates";
import {
  ACTIVITY,
  GOALS,
  MIN_KCAL,
  PACES_KG,
  cmToFtIn,
  computeTargets,
  daysToGoal,
  effectivePaceKg,
  explainTargets,
  ftInToCm,
  kgToLb1,
  lbToKg,
  paceLabel,
  paceNote,
  type Goal,
  type Sex,
  type Units,
} from "@/lib/me/targets";
import type { MeTargets } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * First-time setup, four short steps: body, activity, goal (with pace and goal weight), then the result.
 * The result is Mifflin-St Jeor x activity, adjusted for the pace (src/lib/me/targets.ts), the maths is shown
 * in words, and every number is editable before saving. "Skip for now" leaves no targets and the dashboard
 * simply has no goal. The same dialog is used to edit and to answer a check-in.
 */

const STEPS = 4;
const nf = new Intl.NumberFormat("en-GB");

/** A weight in kg, shown in the person's units for a text field. */
const showWeight = (kg: number, units: Units) => String(units === "imperial" ? kgToLb1(kg) : Math.round(kg * 10) / 10);

export function TargetsWizard({
  initial,
  settings,
  today,
  avgWeightKg,
  onClose,
}: {
  initial: MeTargets | null;
  /** Settings owns units and sex. Units are shown, not asked; sex is asked here only while Settings has none. */
  settings: { units: Units; sex: Sex | null };
  today: string;
  avgWeightKg: number | null;
  onClose: () => void;
}) {
  const id = useId();
  const [step, setStep] = useState(1);
  const units: Units = settings.units;
  const sexFromSettings = settings.sex !== null;
  const [sex, setSex] = useState<Sex | null>(settings.sex ?? initial?.sex ?? null);
  const [age, setAge] = useState(initial ? String(initial.age) : "");

  const initFt = initial ? cmToFtIn(initial.heightCm) : null;
  const [heightCm, setHeightCm] = useState(initial && initial.units === "metric" ? String(initial.heightCm) : "");
  const [ft, setFt] = useState(initFt && initial?.units === "imperial" ? String(initFt.ft) : "");
  const [inch, setInch] = useState(initFt && initial?.units === "imperial" ? String(initFt.inch) : "");
  // When there is a 7-day average from daily weigh-ins, start from it: it is where the person is now.
  const fromAverage = initial !== null && avgWeightKg !== null;
  const [weight, setWeight] = useState(initial ? showWeight(avgWeightKg ?? initial.weightKg, initial.units) : "");
  const [goalWeight, setGoalWeight] = useState(initial?.goalWeightKg ? showWeight(initial.goalWeightKg, initial.units) : "");

  const [activity, setActivity] = useState<number>(initial?.activity ?? 2);
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "maintain");
  const [pace, setPace] = useState<number>(initial && initial.goal !== "maintain" ? initial.paceKg : 0.5);

  const [edit, setEdit] = useState<{ kcal: string; proteinG: string; carbsG: string; fatG: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Body measures in metric, or null while a field is empty or out of range.
  const body = useMemo(() => {
    const a = Number(age);
    const cm = units === "metric" ? Number(heightCm) : ft === "" && inch === "" ? NaN : ftInToCm(Number(ft || 0), Number(inch || 0));
    const kg = units === "metric" ? Number(weight) : lbToKg(Number(weight));
    const good = Number.isInteger(a) && a >= 13 && a <= 110 && cm >= 100 && cm <= 250 && kg >= 30 && kg <= 300;
    return good ? { age: a, heightCm: Math.round(cm * 10) / 10, weightKg: Math.round(kg * 10) / 10 } : null;
  }, [age, heightCm, ft, inch, weight, units]);

  const input = useMemo(
    () => (body && sex ? { sex, age: body.age, heightCm: body.heightCm, weightKg: body.weightKg, activity, goal, paceKg: goal === "maintain" ? 0 : pace } : null),
    [body, sex, activity, goal, pace],
  );
  const computed = useMemo(() => (input ? computeTargets(input) : null), [input]);
  const explained = useMemo(() => (input && computed ? explainTargets(input, computed) : null), [input, computed]);

  // Goal weight in kg: null when blank, NaN when typed but not usable.
  const goalKg = useMemo(() => {
    if (goal === "maintain" || goalWeight.trim() === "") return null;
    const n = Number(goalWeight);
    const kg = units === "metric" ? n : lbToKg(n);
    return Number.isFinite(kg) && kg >= 30 && kg <= 300 ? Math.round(kg * 10) / 10 : Number.NaN;
  }, [goal, goalWeight, units]);
  const wrongSide = body !== null && goalKg !== null && !Number.isNaN(goalKg) && (goal === "lose" ? goalKg >= body.weightKg : goal === "gain" ? goalKg <= body.weightKg : false);
  const goalProblem = goalKg !== null && Number.isNaN(goalKg) ? "Enter a goal weight between 30 and 300 kg." : wrongSide ? (goal === "lose" ? "To lose weight, the goal needs to be below your current weight." : "To gain weight, the goal needs to be above your current weight.") : null;
  // The pace the calories really give: slower than chosen when the target was lifted to the minimum.
  const realPace = input && computed ? effectivePaceKg(input, computed.kcal) : 0;
  const days = body && goalKg !== null && !Number.isNaN(goalKg) && !wrongSide ? daysToGoal(body.weightKg, goalKg, goal, realPace) : null;

  function goNext() {
    setMessage(null);
    if (step === 3 && computed) {
      setEdit({ kcal: String(computed.kcal), proteinG: String(computed.proteinG), carbsG: String(computed.carbsG), fatG: String(computed.fatG) });
    }
    setStep((s) => Math.min(STEPS, s + 1));
  }

  function onKcalEdit(v: string) {
    if (!edit || !computed) return;
    const k = Number(v);
    const p = Number(edit.proteinG);
    const f = Number(edit.fatG);
    // Changing the calories refills the carbs, the same rule the formula uses.
    const carbs = Number.isFinite(k) && k > 0 ? Math.max(0, Math.round((k - p * 4 - f * 9) / 20) * 5) : Number(edit.carbsG);
    setEdit({ ...edit, kcal: v, carbsG: String(carbs) });
  }

  function save() {
    if (!edit || !body || !sex) return;
    setMessage(null);
    startTransition(async () => {
      const r = await saveTargets({
        sex,
        age: body.age,
        heightCm: body.heightCm,
        weightKg: body.weightKg,
        units,
        activity,
        goal,
        paceKg: goal === "maintain" ? 0 : pace,
        kcal: Number(edit.kcal),
        proteinG: Number(edit.proteinG),
        carbsG: Number(edit.carbsG),
        fatG: Number(edit.fatG),
        goalWeightKg: goal === "maintain" ? body.weightKg : goalKg === null || Number.isNaN(goalKg) ? null : goalKg,
      });
      if (r.ok) onClose();
      else setMessage(r.error);
    });
  }

  const step1Ready = sex !== null && body !== null;
  const step3Ready = goalProblem === null && (goal === "maintain" || goalKg !== null);
  const macroKcal = edit ? Number(edit.proteinG) * 4 + Number(edit.carbsG) * 4 + Number(edit.fatG) * 9 : 0;
  const mismatch = edit && Number.isFinite(macroKcal) && Math.abs(macroKcal - Number(edit.kcal)) > 100;
  const floor = sex ? MIN_KCAL[sex] : 1200;
  const belowFloor = edit !== null && Number(edit.kcal) > 0 && Number(edit.kcal) < floor;
  const wUnit = units === "metric" ? "kg" : "lb";

  return (
    <MeDialog eyebrow={`Step ${step} of ${STEPS}`} title={["Let’s set your targets", "How active are you?", "What’s the goal?", "Your daily targets"][step - 1]} onClose={onClose} widthRem={34}>
      <div className="mt-3 flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step} aria-label="Setup progress">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={cn("size-2 rounded-full", i < step ? "bg-herb" : "bg-line-strong")} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-muted">Four quick questions. These feed the calorie formula and you can change them any time.</p>
          {sexFromSettings ? (
            <p className="mt-5 rounded-md bg-band px-3 py-2 text-[0.875rem] text-ink-muted" data-testid="wizard-using">
              Using: <span className="text-ink">{sex}</span>, <span className="text-ink">{units}</span>.{" "}
              <Link href="/settings#body" className="underline underline-offset-4 hover:text-herb">
                Change in Settings
              </Link>
            </p>
          ) : (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[0.8125rem] font-semibold">
                  Sex <span className="font-normal text-ink-subtle">(the calorie formula has one constant for each; saved to Settings)</span>
                </span>
              </div>
              <div className="mt-2">
                <Seg label="Sex for the formula" value={sex ?? ""} options={[["female", "Female"], ["male", "Male"]]} onChange={(v) => setSex(v as Sex)} />
              </div>
              <p className="mt-2 text-[0.8125rem] text-ink-muted">
                Using <span className="text-ink">{units}</span> units.{" "}
                <Link href="/settings#units" className="underline underline-offset-4 hover:text-herb">
                  Change in Settings
                </Link>
              </p>
            </>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`${id}-age`}>Age</Label>
              <Input id={`${id}-age`} mono inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="years" />
            </div>
            {units === "metric" ? (
              <div>
                <Label htmlFor={`${id}-h`}>Height (cm)</Label>
                <Input id={`${id}-h`} mono inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="cm" />
              </div>
            ) : (
              <div>
                <Label htmlFor={`${id}-ft`}>Height (ft, in)</Label>
                <div className="flex gap-2">
                  <Input id={`${id}-ft`} mono inputMode="numeric" aria-label="Feet" value={ft} onChange={(e) => setFt(e.target.value.replace(/\D/g, "").slice(0, 1))} placeholder="ft" />
                  <Input mono inputMode="numeric" aria-label="Inches" value={inch} onChange={(e) => setInch(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="in" />
                </div>
              </div>
            )}
            <div>
              <Label htmlFor={`${id}-w`}>Weight ({wUnit})</Label>
              <Input id={`${id}-w`} mono inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder={wUnit} />
            </div>
          </div>
          {fromAverage && <p className="mt-3 text-[0.8125rem] text-ink-muted">Weight starts from your 7-day average, so the new targets fit where you are now. Change it if that is not right.</p>}
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="mt-4 text-[0.9375rem] text-ink-muted">Count a normal week, training included.</p>
          <div role="radiogroup" aria-label="Activity level" className="mt-4 grid gap-2">
            {ACTIVITY.map((a) => (
              <button
                key={a.v}
                type="button"
                role="radio"
                aria-checked={activity === a.v}
                onClick={() => setActivity(a.v)}
                className={cn("flex min-h-14 items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition-colors", activity === a.v ? "border-herb bg-band" : "border-line-strong bg-surface hover:border-herb")}
              >
                <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border-2", activity === a.v ? "border-herb" : "border-field")}>
                  {activity === a.v && <span className="size-2 rounded-full bg-herb" />}
                </span>
                <span>
                  <span className="block text-[0.9375rem] font-medium">{a.label}</span>
                  <span className="block text-[0.8125rem] text-ink-muted">{a.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="mt-4 text-[0.9375rem] text-ink-muted">Slower is easier to keep up. You can change pace later.</p>
          <div className="mt-4">
            <Seg label="Goal" value={goal} options={GOALS.map((g) => [g.v, g.label] as [string, string])} onChange={(v) => setGoal(v as Goal)} wide />
          </div>
          {goal !== "maintain" && (
            <>
              <div className="mt-5">
                <span className="text-[0.8125rem] font-semibold">Pace</span>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Seg label="Pace per week" value={String(pace)} options={PACES_KG.map((p) => [String(p), paceLabel(p, units)] as [string, string])} onChange={(v) => setPace(Number(v))} />
                  <span className="text-[0.8125rem] text-ink-muted">per week</span>
                </div>
              </div>
              <div className="mt-5 max-w-56">
                <Label htmlFor={`${id}-gw`}>Goal weight ({wUnit})</Label>
                <Input
                  id={`${id}-gw`}
                  mono
                  inputMode="decimal"
                  value={goalWeight}
                  onChange={(e) => setGoalWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
                  placeholder={wUnit}
                  aria-invalid={goalProblem !== null}
                  aria-describedby={`${id}-gw-note`}
                />
              </div>
              <p id={`${id}-gw-note`} className={cn("mt-2 text-[0.875rem]", goalProblem ? "text-paprika-deep" : "text-ink-muted")} aria-live="polite">
                {goalProblem ??
                  (days !== null && body && goalKg !== null
                    ? `At ${computed?.clamped ? "about " : ""}${paceLabel(computed?.clamped ? Math.round(realPace * 100) / 100 : pace, units)} a week, from ${showWeight(body.weightKg, units)} ${wUnit} to ${showWeight(goalKg, units)} ${wUnit} takes about ${Math.max(1, Math.round(days / 7))} ${Math.round(days / 7) === 1 ? "week" : "weeks"}: about ${dayMonthYear(addDays(today, days))}. It is an estimate, because weight does not ${goal === "gain" ? "rise" : "drop"} in a straight line.`
                    : "Add your goal weight to continue. We will show roughly when you would get there.")}
              </p>
            </>
          )}
          <p className="mt-4 text-[0.875rem] text-ink-muted" aria-live="polite">
            {paceNote(goal, goal === "maintain" ? 0 : pace, units)}
          </p>
        </div>
      )}

      {step === 4 && edit && computed && explained && (
        <div>
          <p className="mt-4 text-[0.9375rem] text-ink-muted">Here is how we got there. Edit anything before saving.</p>
          <div className="mt-5 flex items-end gap-3 rounded-xl bg-band px-5 py-4">
            <label className="sr-only" htmlFor={`${id}-kcal`}>
              Calories per day
            </label>
            <input id={`${id}-kcal`} inputMode="numeric" value={edit.kcal === "" ? "" : Number(edit.kcal).toLocaleString("en-GB")} onChange={(e) => onKcalEdit(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-32 bg-transparent font-mono text-[2.5rem] leading-none font-medium outline-none focus-visible:underline" />
            <span className="pb-1 font-mono text-xs text-ink-muted">kcal per day</span>
          </div>
          <p className="mt-3 text-[0.875rem] leading-relaxed">{explained.oneLine}.</p>
          <details className="mt-2 text-[0.8125rem] text-ink-muted">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-herb sm:min-h-0 sm:py-0">Show each step</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed">
              {explained.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ol>
          </details>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {(
              [
                ["Protein", "proteinG"],
                ["Carbs", "carbsG"],
                ["Fat", "fatG"],
              ] as const
            ).map(([label, key]) => (
              <div key={key}>
                <Label htmlFor={`${id}-${key}`}>{label} (g)</Label>
                <Input id={`${id}-${key}`} mono inputMode="numeric" value={edit[key]} onChange={(e) => setEdit({ ...edit, [key]: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
              </div>
            ))}
          </div>
          {belowFloor && (
            <p className="mt-3 text-[0.8125rem] text-saffron-ink">
              {nf.format(Number(edit.kcal))} kcal is below the {nf.format(floor)} kcal we suggest as a minimum. You can keep it, but a very low target is worth talking over with a doctor or dietitian.
            </p>
          )}
          {mismatch && <p className="mt-2 text-[0.8125rem] text-saffron-ink">Those macros add up to about {nf.format(Math.round(macroKcal))} kcal, not {nf.format(Number(edit.kcal) || 0)}. That is fine if you meant it.</p>}
        </div>
      )}

      <p role="alert" className={cn("mt-3 text-[0.8125rem] text-paprika-deep", !message && "sr-only")}>
        {message}
      </p>

      <div className="mt-6 flex justify-between gap-2">
        {step === 1 ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Skip for now
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS ? (
          <Button size="sm" onClick={goNext} disabled={(step === 1 && !step1Ready) || (step === 3 && !step3Ready)}>
            Continue
          </Button>
        ) : (
          <Button size="sm" onClick={save} disabled={pending || !edit || !(Number(edit.kcal) >= 800)}>
            {pending ? "Saving…" : "Save targets"}
          </Button>
        )}
      </div>
    </MeDialog>
  );
}

/** A segmented single-choice control (radio semantics). */
function Seg({ label, value, options, onChange, wide }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-md border border-line-strong p-0.5", wide && "flex w-full")}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "min-h-11 rounded-sm px-4 text-[0.875rem] font-medium transition-colors sm:min-h-10",
            wide && "flex-1",
            value === v ? "bg-herb text-on-herb" : "text-ink hover:text-herb",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
