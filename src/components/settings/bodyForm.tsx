"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBirthYear, saveSex } from "@/lib/actions/settings";
import type { Sex } from "@/lib/settingsValidate";
import { RadioGroup } from "./radioGroup";
import { StatusLine, useAutosave, useSaveStatus } from "./saveStatus";

/**
 * Sex and birth year. The Me calorie formula (Mifflin-St Jeor) has one constant for each of two values, so this asks for one of
 * the two and says exactly what it is used for. There is no "unset" button: once chosen it can be changed, and
 * Me asks once if it is still empty.
 */
export function BodyForm({ sex: initial, birthYear: initialYear }: { sex: Sex | null; birthYear: number | null }) {
  const { status, run } = useSaveStatus();
  const yearId = useId();
  const [year, setYear] = useState(initialYear === null ? "" : String(initialYear));
  const [busy, setBusy] = useState(false);
  const { status: yearStatus, run: runYear } = useSaveStatus();
  const [sex, setSex] = useAutosave<Sex | "">(initial ?? "", (v) => saveSex(v === "" ? null : v), run);

  return (
    <div>
      <RadioGroup<Sex>
        name="sex"
        legend="Sex"
        hint="Used for your calorie estimate and which body we draw on your muscle map. Nothing else."
        value={sex}
        options={[
          { value: "female", label: "Female" },
          { value: "male", label: "Male" },
        ]}
        onChange={(v) => v && setSex(v)}
      />
      <StatusLine status={status} />

      <form
        className="mt-6"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await runYear(() => saveBirthYear(year.trim() === "" ? null : year.trim()));
          setBusy(false);
        }}
      >
        <Label htmlFor={yearId}>Birth year</Label>
        <p id={`${yearId}-hint`} className="mb-2 text-[0.875rem] leading-snug text-ink-muted">
          Optional. With your sex and a logged weight it gives Me a sedentary calorie baseline and sets your daily vitamin and mineral values by age. Skip it if you set targets in Me.
        </p>
        <div className="flex max-w-md flex-wrap gap-3">
          <Input
            id={yearId}
            name="birth_year"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1990"
            maxLength={4}
            autoComplete="bday-year"
            aria-describedby={`${yearId}-hint`}
            className="min-w-0 flex-1 basis-40"
          />
          <Button type="submit" variant="secondary" disabled={busy} aria-disabled={busy}>
            Save birth year
          </Button>
        </div>
        <StatusLine status={yearStatus} />
      </form>
    </div>
  );
}
