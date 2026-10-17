"use client";

import { saveSex } from "@/lib/actions/settings";
import type { Sex } from "@/lib/settingsValidate";
import { RadioGroup } from "./radioGroup";
import { StatusLine, useAutosave, useSaveStatus } from "./saveStatus";

/**
 * Sex. The Me calorie formula (Mifflin-St Jeor) has one constant for each of two values, so this asks for one of
 * the two and says exactly what it is used for. There is no "unset" button: once chosen it can be changed, and
 * Me asks once if it is still empty.
 */
export function BodyForm({ sex: initial }: { sex: Sex | null }) {
  const { status, run } = useSaveStatus();
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
    </div>
  );
}
