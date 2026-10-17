import type { Streak, StreakKind } from "@/lib/me/streaks";
import { cn } from "@/lib/utils";

/*
 * Compact streaks for food, sleep and weight: "3 days" with the best run beneath. A day counts when it has
 * at least one entry of that kind. The copy is deliberately gentle: when a streak is not running it shows the
 * best run and an invitation, never a count of what was missed.
 */

const LABEL: Record<StreakKind, string> = { food: "Food", sleep: "Sleep", weight: "Weight" };
const ORDER: StreakKind[] = ["food", "sleep", "weight"];

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function StreakStrip({ streaks }: { streaks: Record<StreakKind, Streak> }) {
  const any = ORDER.some((k) => streaks[k].best > 0);
  return (
    <section aria-label="Logging streaks" className="mt-4">
      <ul className="grid max-w-md grid-cols-3 gap-2">
        {ORDER.map((k) => {
          const s = streaks[k];
          const running = s.current > 0;
          return (
            <li key={k} className={cn("rounded-xl border px-3 py-2", running ? "border-herb/40 bg-band" : "border-line bg-surface")}>
              <p className="label-mono">{LABEL[k]}</p>
              <p className={cn("mt-1 font-mono text-[0.8125rem] leading-tight font-medium", running ? "text-herb" : "text-ink-muted")}>
                {running ? days(s.current) : s.best > 0 ? "Start any day" : "Not started"}
              </p>
              {s.best > 0 && <p className="mt-0.5 font-mono text-[0.6875rem] text-ink-subtle">best {days(s.best)}</p>}
            </li>
          );
        })}
      </ul>
      {!any && <p className="mt-2 text-xs text-ink-muted">Log food, sleep or your weight on consecutive days to start a streak. Any one entry counts for the day.</p>}
    </section>
  );
}
