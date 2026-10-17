import { HowCalculated } from "@/components/me/howCalculated";
import { TargetsButton } from "@/components/me/meButtons";
import { KCAL_PER_G } from "@/lib/me/targets";
import type { DayTotals, MeTargets } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * "Today's food": the calorie ring (macro segments), the three macro bars, and the goal. Pure server
 * rendering; the only client piece is the "Set your targets" button. With no targets there is no goal, so
 * the ring is an empty track and the card offers the four-question setup (the design's empty state).
 */

const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const R = 88;
const C = 2 * Math.PI * R;

type Seg = { cls: string; dash: string; offset: number };

/** Segments laid end to end around the ring, each sized by its share of the goal. Over goal: scaled to fit. */
function segments(totals: DayTotals, goal: number): Seg[] {
  const parts = [
    { cls: "me-seg-carb", kcal: totals.carbsG * KCAL_PER_G.carbs },
    { cls: "me-seg-fat", kcal: totals.fatG * KCAL_PER_G.fat },
    { cls: "me-seg-protein", kcal: totals.proteinG * KCAL_PER_G.protein },
  ];
  const sum = parts.reduce((a, p) => a + p.kcal, 0);
  const scale = sum > goal ? goal / sum : 1;
  let acc = 0;
  return parts.map((p) => {
    const len = (p.kcal / goal) * C * scale;
    const vis = Math.max(len - 3, 0);
    const seg = { cls: p.cls, dash: `${vis} ${C - vis}`, offset: -acc };
    acc += len;
    return seg;
  });
}

export function TodayFood({ dateLabel, totals, targets }: { dateLabel: string; totals: DayTotals; targets: MeTargets | null }) {
  const kcal = Math.round(totals.calories);
  const goal = targets?.kcal ?? null;
  const left = goal === null ? null : goal - kcal;
  const segs = goal ? segments(totals, goal) : [];
  const energy = totals.carbsG * 4 + totals.fatG * 9 + totals.proteinG * 4;
  const share = (k: number) => (energy > 0 ? Math.round((k / energy) * 100) : 0);

  const macros = [
    { key: "carb", label: "Carbs", got: totals.carbsG, goal: targets?.carbsG ?? null, kcal: totals.carbsG * 4 },
    { key: "fat", label: "Fat", got: totals.fatG, goal: targets?.fatG ?? null, kcal: totals.fatG * 9 },
    { key: "protein", label: "Protein", got: totals.proteinG, goal: targets?.proteinG ?? null, kcal: totals.proteinG * 4 },
  ];

  const ringLabel =
    goal === null ? `${nf.format(kcal)} kcal eaten, no goal set` : `${nf.format(kcal)} of ${nf.format(goal)} kcal eaten`;

  return (
    <section aria-labelledby="me-food-h" className="rounded-xl border border-line bg-surface p-4 md:p-[1.375rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-mono">{dateLabel}</p>
          <h2 id="me-food-h" className="mt-1.5 text-xl leading-tight font-medium">
            Today&rsquo;s food
          </h2>
        </div>
        <span className="flex items-center gap-2 pt-1 font-mono text-xs text-ink-muted">
          {goal === null ? (
            "No goal set"
          ) : (
            <>
              Goal {nf.format(goal)} kcal
              <TargetsButton variant="link">Edit</TargetsButton>
            </>
          )}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-5 md:mt-[1.125rem] md:gap-10">
        <div className="relative size-[150px] shrink-0 md:size-[208px]">
          <svg viewBox="0 0 208 208" className="size-full" role="img" aria-label={ringLabel}>
            <circle cx="104" cy="104" r={R} fill="none" strokeWidth="16" className="me-ring-track" />
            <g transform="rotate(-90 104 104)">
              {segs.map((s) => (
                <circle key={s.cls} cx="104" cy="104" r={R} fill="none" strokeWidth="16" className={cn("me-seg", s.cls)} strokeDasharray={s.dash} strokeDashoffset={s.offset} />
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="font-mono text-[1.375rem] leading-none font-medium md:text-[1.875rem]">{nf.format(kcal)}</div>
            <div className="mt-1.5 font-mono text-[0.625rem] text-ink-muted md:text-xs">/ {goal === null ? "—" : nf.format(goal)} kcal</div>
            {left !== null && (
              <div className={cn("mt-2 font-mono text-[0.6875rem] font-medium md:mt-2.5 md:text-[0.8125rem]", left < 0 ? "text-paprika-deep" : "text-herb")}>
                {left >= 0 ? `${nf.format(left)} left` : `${nf.format(-left)} over`}
              </div>
            )}
          </div>
        </div>

        {goal === null ? (
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-snug font-medium">Set your daily targets</p>
            <p className="mt-1.5 max-w-[26em] text-[0.875rem] leading-relaxed text-ink-muted">Four questions give you a calorie goal and protein, carb and fat targets. Takes about a minute.</p>
            <div className="mt-3">
              <TargetsButton>Set your targets</TargetsButton>
            </div>
          </div>
        ) : (
          <>
            {/* Phone: bars beside the ring. */}
            <div className="flex min-w-0 flex-1 flex-col gap-3 md:hidden">
              {macros.map((m) => (
                <MacroBar key={m.key} label={m.label} got={m.got} goal={m.goal} compact />
              ))}
            </div>
            {/* Desktop: a key for the ring segments. */}
            <ul className="hidden flex-col gap-2.5 text-[0.8125rem] md:flex">
              {macros.map((m) => (
                <li key={m.key} className="flex items-center gap-2.5">
                  <span aria-hidden className={cn("size-2.5 rounded-xs", `me-bar-${m.key}`)} />
                  <span className="w-[3.75rem]">{m.label}</span>
                  <span className="font-mono text-xs text-ink-muted">
                    {nf.format(Math.round(m.kcal))} kcal &middot; {share(m.kcal)}%
                  </span>
                </li>
              ))}
              <li className="mt-1 max-w-[16.25rem] text-xs leading-snug text-ink-muted">Each segment is that macro&rsquo;s share of today&rsquo;s {nf.format(goal)} kcal goal.</li>
            </ul>
          </>
        )}
      </div>

      {/* Desktop bars (and the empty placeholders when there is no goal). */}
      <div className="mt-5 hidden gap-6 border-t border-line pt-4 md:mt-[1.375rem] md:grid md:grid-cols-3">
        {macros.map((m) => (
          <MacroBar key={m.key} label={m.label} got={m.got} goal={m.goal} />
        ))}
      </div>
      {targets && <HowCalculated targets={targets} />}
    </section>
  );
}

function MacroBar({ label, got, goal, compact }: { label: string; got: number; goal: number | null; compact?: boolean }) {
  const pct = goal ? Math.min(100, Math.round((got / goal) * 100)) : 0;
  const cls = label === "Carbs" ? "me-bar-carb" : label === "Fat" ? "me-bar-fat" : "me-bar-protein";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={cn("font-medium", compact ? "text-xs" : "text-[0.8125rem]")}>{label}</span>
        <span className={cn("font-mono text-ink-muted", compact ? "text-[0.6875rem]" : "text-xs")}>
          {nf.format(Math.round(got))} / {goal === null ? "—" : nf.format(goal)} g
        </span>
      </div>
      <div className={cn("overflow-hidden rounded-xs bg-band", compact ? "mt-1.5 h-1" : "mt-2 h-1")} role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={goal ?? 0} aria-valuenow={Math.round(got)}>
        <div className={cn("h-full rounded-xs", cls)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
