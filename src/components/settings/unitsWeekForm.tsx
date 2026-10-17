"use client";

import { saveUnits, saveWeekStart } from "@/lib/actions/settings";
import type { Units, WeekStart } from "@/lib/settingsValidate";
import { RadioGroup } from "./radioGroup";
import { StatusLine, useAutosave, useSaveStatus } from "./saveStatus";

/** Units (metric / imperial) and the first day of the week. Both save the moment they change. */
export function UnitsWeekForm({ units: initialUnits, weekStart: initialWeek }: { units: Units; weekStart: WeekStart }) {
  const { status, run } = useSaveStatus();
  const [units, setUnits] = useAutosave<Units>(initialUnits, saveUnits, run);
  const [week, setWeek] = useAutosave<WeekStart>(initialWeek, saveWeekStart, run);

  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2">
        <RadioGroup<Units>
          name="units"
          legend="Units"
          hint="Used for your weight and height on Me."
          value={units}
          options={[
            { value: "metric", label: "Metric (kg, cm)" },
            { value: "imperial", label: "Imperial (lb, ft and in)" },
          ]}
          onChange={(v) => v && setUnits(v)}
        />
        <RadioGroup<WeekStart>
          name="week_start"
          legend="Week starts on"
          hint="Changes your Me week and calendar."
          value={week}
          options={[
            { value: "monday", label: "Monday" },
            { value: "sunday", label: "Sunday" },
          ]}
          onChange={(v) => v && setWeek(v)}
        />
      </div>
      <StatusLine status={status} />
    </div>
  );
}
