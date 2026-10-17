"use client";

import { useId, useMemo, useState, useTransition } from "react";

import { MeDialog } from "@/components/me/meDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTargets } from "@/lib/actions/me";
import {
  ACTIVITY,
  GOALS,
  PACES_KG,
  cmToFtIn,
  computeTargets,
  ftInToCm,
  kgToLb,
  lbToKg,
  paceNote,
  type Goal,
  type Sex,
  type Units,
} from "@/lib/me/targets";
import type { MeTargets } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * First-time setup, four short steps (the design's 1c-1f): body, activity, goal and pace, then the result.
 * The result is Mifflin-St Jeor x activity, adjusted for the goal (src/lib/me/targets.ts), and every number
 * is editable before saving. "Skip for now" leaves no targets and the dashboard simply has no goal.
 */

const STEPS = 4;
const nf = new Intl.NumberFormat("en-GB");

export function TargetsWizard({ initial, onClose }: { initial: MeTargets | null; onClose: () => void }) {
  const id = useId();
  const [step, setStep] = useState(1);
  const [units, setUnits] = useState<Units>(initial?.units ?? "metric");
  const [sex, setSex] = useState<Sex | null>(initial?.sex ?? null);
  const [age, setAge] = useState(initial ? String(initial.age) : "");

  const initFt = initial ? cmToFtIn(initial.heightCm) : null;
  const [heightCm, setHeightCm] = useState(initial && initial.units === "metric" ? String(initial.heightCm) : initial ? "" : "");
  const [ft, setFt] = useState(initFt && initial?.units === "imperial" ? String(initFt.ft) : "");
  const [inch, setInch] = useState(initFt && initial?.units === "imperial" ? String(initFt.inch) : "");
  const [weight, setWeight] = useState(initial ? String(initial.units === "imperial" ? kgToLb(initial.weightKg) : initial.weightKg) : "");

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

  const computed = useMemo(
    () => (body && sex ? computeTargets({ sex, age: body.age, heightCm: body.heightCm, weightKg: body.weightKg, activity, goal, paceKg: goal === "maintain" ? 0 : pace }) : null),
    [body, sex, activity, goal, pace],
  );

  function switchUnits(next: Units) {
    if (next === units) return;
    if (body) {
      if (next === "imperial") {
        const f = cmToFtIn(body.heightCm);
        setFt(String(f.ft));
        setInch(String(f.inch));
        setWeight(String(kgToLb(body.weightKg)));
      } else {
        setHeightCm(String(body.heightCm));
        setWeight(String(body.weightKg));
      }
    }
    setUnits(next);
  }

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
      });
      if (r.ok) onClose();
      else setMessage(r.error);
    });
  }

  const step1Ready = sex !== null && body !== null;
  const macroKcal = edit ? Number(edit.proteinG) * 4 + Number(edit.carbsG) * 4 + Number(edit.fatG) * 9 : 0;
  const mismatch = edit && Number.isFinite(macroKcal) && Math.abs(macroKcal - Number(edit.kcal)) > 100;

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
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[0.8125rem] font-semibold">
              Sex <span className="font-normal text-ink-subtle">(for the formula)</span>
            </span>
            <Seg label="Units" value={units} options={[["metric", "Metric"], ["imperial", "Imperial"]]} onChange={(v) => switchUnits(v as Units)} />
          </div>
          <div className="mt-2">
            <Seg label="Sex for the formula" value={sex ?? ""} options={[["female", "Female"], ["male", "Male"]]} onChange={(v) => setSex(v as Sex)} />
          </div>
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
              <Label htmlFor={`${id}-w`}>Weight ({units === "metric" ? "kg" : "lb"})</Label>
              <Input id={`${id}-w`} mono inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder={units === "metric" ? "kg" : "lb"} />
            </div>
          </div>
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
            <div className="mt-5">
              <span className="text-[0.8125rem] font-semibold">Pace</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Seg label="Pace per week" value={String(pace)} options={PACES_KG.map((p) => [String(p), `${p} kg`] as [string, string])} onChange={(v) => setPace(Number(v))} />
                <span className="text-[0.8125rem] text-ink-muted">per week</span>
              </div>
            </div>
          )}
          <p className="mt-4 text-[0.875rem] text-ink-muted" aria-live="polite">
            {paceNote(goal, goal === "maintain" ? 0 : pace)}
          </p>
        </div>
      )}

      {step === 4 && edit && computed && (
        <div>
          <p className="mt-4 text-[0.9375rem] text-ink-muted">Mifflin-St Jeor, adjusted for activity and goal. Edit anything before saving.</p>
          <div className="mt-5 flex items-end gap-3 rounded-xl bg-band px-5 py-4">
            <label className="sr-only" htmlFor={`${id}-kcal`}>
              Calories per day
            </label>
            <input id={`${id}-kcal`} inputMode="numeric" value={edit.kcal === "" ? "" : Number(edit.kcal).toLocaleString("en-GB")} onChange={(e) => onKcalEdit(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-32 bg-transparent font-mono text-[2.5rem] leading-none font-medium outline-none focus-visible:underline" />
            <span className="pb-1 font-mono text-xs text-ink-muted">kcal per day</span>
          </div>
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
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-muted">
            Resting rate <span className="font-mono">{nf.format(computed.bmr)} kcal</span> &middot; {ACTIVITY[activity].label.toLowerCase()} &middot; protein 1.9 g/kg, fat 0.9 g/kg, carbs fill the rest.
          </p>
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
          <Button size="sm" onClick={goNext} disabled={step === 1 && !step1Ready}>
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
