import { Dumbbell } from "lucide-react";

/*
 * A quiet placeholder for the workout area. Plans and an exercise library (pick a split by days a week and
 * time available, with proper exercises and photos) are researched and built in a later wave. Nothing here
 * is interactive on purpose: no fake buttons, no sample data.
 */
export function WorkoutPlansSoon() {
  return (
    <section aria-labelledby="me-plans-h" className="rounded-xl border border-dashed border-line-strong bg-band/60 p-4 md:p-[1.375rem]">
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface">
          <Dumbbell className="size-4 text-herb" />
        </span>
        <div>
          <p className="label-mono">Coming soon</p>
          <h2 id="me-plans-h" className="mt-1.5 text-lg leading-tight font-medium">
            Workout plans and exercise library
          </h2>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-muted">
            Find a split that fits your week &mdash; by how many days you can train and how long you have &mdash; with each exercise shown properly. Until then, log your sessions and the muscle map above fills in.
          </p>
        </div>
      </div>
    </section>
  );
}
