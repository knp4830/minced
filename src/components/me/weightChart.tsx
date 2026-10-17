import { addDays, dayDiff, dayMonth, shortDate } from "@/lib/me/dates";
import { KG_PER_LB } from "@/lib/me/targets";
import type { Units } from "@/lib/me/targets";
import type { WeekAvg, WeightAvgPoint } from "@/lib/me/weight";

/*
 * The weight chart: hand-written SVG, no chart library. Daily view draws every weigh-in as a dot and the
 * 7-day average as a line through them; weekly view draws one dot per Monday-to-Sunday week (that week's
 * average) joined by a line. A dashed line marks the goal weight when it falls in range.
 *
 * It is a Server Component (pure drawing from props). For screen readers the picture is described in its
 * <title>/<desc> and the same numbers are in a visually hidden table.
 */

const W = 400;
const H = 230;
const M = { l: 42, r: 10, t: 12, b: 28 };

type Props = {
  mode: "daily" | "weekly";
  from: string;
  to: string;
  daily: WeightAvgPoint[];
  weekly: WeekAvg[];
  goalKg: number | null;
  units: Units;
  /** One sentence for the picture's description. */
  summary: string;
  label: string;
};

const toUnit = (kg: number, units: Units) => (units === "imperial" ? kg / KG_PER_LB : kg);

function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function WeightChart({ mode, from, to, daily, weekly, goalKg, units, summary, label }: Props) {
  const pts =
    mode === "daily"
      ? daily.map((p) => ({ date: p.date, v: toUnit(p.kg, units), avg: toUnit(p.avg, units) }))
      : weekly.map((w) => ({ date: w.weekStart, v: toUnit(w.avg, units), avg: toUnit(w.avg, units) }));

  const goal = goalKg === null ? null : toUnit(goalKg, units);
  const values = pts.flatMap((p) => [p.v, p.avg]);
  const inRangeGoal = goal !== null && values.length > 0 && goal >= Math.min(...values) - 6 && goal <= Math.max(...values) + 6 ? goal : null;
  const all = inRangeGoal === null ? values : [...values, inRangeGoal];
  const ticks = all.length ? niceTicks(Math.min(...all), Math.max(...all)) : [0, 1];
  const yLo = ticks[0];
  const yHi = ticks[ticks.length - 1];

  const first = mode === "daily" ? from : (pts[0]?.date ?? from);
  const last = mode === "daily" ? to : (pts[pts.length - 1]?.date ?? to);
  const span = Math.max(dayDiff(last, first), 1);
  const x = (iso: string) => M.l + (pts.length === 1 && mode === "weekly" ? 0.5 : dayDiff(iso, first) / span) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - yLo) / (yHi - yLo || 1)) * (H - M.t - M.b);

  const line = pts.map((p) => `${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ");
  const unit = units === "imperial" ? "lb" : "kg";
  const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
  const xLabels = [first, pts.length > 1 ? addDays(first, Math.floor(dayDiff(last, first) / 2)) : null, last].filter((d): d is string => d !== null);

  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[34rem]" role="img" aria-labelledby="wt-title wt-desc">
        <title id="wt-title">{label}</title>
        <desc id="wt-desc">{summary}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth="1" />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-muted font-mono" fontSize="11.5">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xLabels.map((d, i) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"} className="fill-ink-muted font-mono" fontSize="11.5">
            {dayMonth(d)}
          </text>
        ))}
        {inRangeGoal !== null && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={y(inRangeGoal)} y2={y(inRangeGoal)} className="stroke-saffron-ink" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={W - M.r} y={y(inRangeGoal) - 5} textAnchor="end" className="fill-saffron-ink font-mono" fontSize="11.5">
              Goal {fmt(inRangeGoal)} {unit}
            </text>
          </g>
        )}
        {mode === "daily" && pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.v)} r="2.6" className="fill-ink-subtle" opacity="0.7" />)}
        {pts.length > 1 && <polyline points={line} fill="none" className="stroke-herb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {mode === "weekly" && pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.v)} r="4" className="fill-herb" />)}
        {mode === "daily" && pts.length === 1 && <circle cx={x(pts[0].date)} cy={y(pts[0].avg)} r="5" className="fill-herb" />}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {mode === "daily" ? (
          <>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-ink-subtle opacity-70" /> Daily weigh-in
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded-full bg-herb" /> 7-day average
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full bg-herb" /> Average for each week (Monday to Sunday)
          </span>
        )}
        {inRangeGoal !== null && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-saffron-ink" /> Goal weight
          </span>
        )}
      </figcaption>

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{mode === "daily" ? "Date" : "Week starting"}</th>
            <th scope="col">{mode === "daily" ? `Weight (${unit})` : `Average (${unit})`}</th>
            {mode === "daily" ? <th scope="col">{`7-day average (${unit})`}</th> : <th scope="col">Weigh-ins</th>}
          </tr>
        </thead>
        <tbody>
          {mode === "daily"
            ? pts.map((p) => (
                <tr key={p.date}>
                  <th scope="row">{shortDate(p.date)}</th>
                  <td>{fmt(p.v)}</td>
                  <td>{fmt(p.avg)}</td>
                </tr>
              ))
            : weekly.map((w) => (
                <tr key={w.weekStart}>
                  <th scope="row">{shortDate(w.weekStart)}</th>
                  <td>{fmt(toUnit(w.avg, units))}</td>
                  <td>{w.count}</td>
                </tr>
              ))}
        </tbody>
      </table>
    </figure>
  );
}

