import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import {
  filtersToQuery,
  hasActiveFilters,
  toggleInList,
  withFilters,
  type RecipeFilters,
} from "@/lib/filters";
import type { FilterOptions } from "@/lib/queries/browse";

/**
 * The filter controls. Every control is a plain link to the same page with one
 * URL param changed (`withFilters` also drops the cursor), so:
 *   - filter state lives in the URL, as CLAUDE.md requires;
 *   - it works without JavaScript and the back button undoes a filter;
 *   - a filtered view can be shared as a link.
 * Server component; the phone sheet is a <details>, also JS-free.
 */

const BASE = "/recipes";

const TIME_OPTIONS = [20, 30, 45, 60] as const;
const SPICE_OPTIONS = [
  { value: 0, label: "Not spicy" },
  { value: 1, label: "Mild" },
  { value: 2, label: "Medium" },
] as const;
const CAL_OPTIONS = [400, 600] as const;
const PROTEIN_OPTIONS = [20, 30] as const;

function href(f: RecipeFilters): string {
  return `${BASE}${filtersToQuery(f)}`;
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-5 min-w-0">
      <legend className="label-mono mb-2.5">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Option({
  to,
  selected,
  tone,
  children,
}: {
  to: string;
  selected: boolean;
  tone?: "text" | "mono";
  children: React.ReactNode;
}) {
  return (
    <Chip asChild selected={selected} tone={tone}>
      <Link href={to} scroll={false} prefetch={false}>
        {children}
      </Link>
    </Chip>
  );
}

export function FilterControls({
  filters,
  options,
}: {
  filters: RecipeFilters;
  options: FilterOptions;
}) {
  const f = filters;
  return (
    <div>
      <Group label="Total time">
        {TIME_OPTIONS.map((m) => (
          <Option
            key={m}
            tone="mono"
            selected={f.maxTime === m}
            to={href(withFilters(f, { maxTime: f.maxTime === m ? undefined : m }))}
          >
            &lt; {m} min
          </Option>
        ))}
      </Group>

      <Group label="Diet">
        {options.diets.map((d) => (
          <Option
            key={d.slug}
            selected={!!f.diet?.includes(d.slug)}
            to={href(toggleInList(f, "diet", d.slug))}
          >
            {d.name}
          </Option>
        ))}
      </Group>

      <Group label="Free of">
        {options.allergens.map((a) => (
          <Option
            key={a.slug}
            selected={!!f.exclude?.includes(a.slug)}
            to={href(toggleInList(f, "exclude", a.slug))}
          >
            {a.name.toLowerCase()}
          </Option>
        ))}
      </Group>

      {options.cuisines.length > 0 && (
        // ~30 chips: collapsed until used, so the groups below stay reachable.
        <details open={!!f.cuisine?.length} className="group/cuisine mb-5">
          <summary className="label-mono mb-2.5 flex min-h-8 cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden">
            <span>
              Cuisine{f.cuisine?.length ? ` (${f.cuisine.length})` : ""}
            </span>
            <span aria-hidden className="group-open/cuisine:hidden">
              show
            </span>
            <span aria-hidden className="hidden group-open/cuisine:inline">
              hide
            </span>
          </summary>
          <div className="flex flex-wrap gap-1.5">
            {options.cuisines.map((c) => (
              <Option
                key={c.slug}
                selected={!!f.cuisine?.includes(c.slug)}
                to={href(toggleInList(f, "cuisine", c.slug))}
              >
                {c.name}
              </Option>
            ))}
          </div>
        </details>
      )}

      <Group label="Max spice">
        {SPICE_OPTIONS.map((s) => (
          <Option
            key={s.value}
            selected={f.spiceMax === s.value}
            to={href(withFilters(f, { spiceMax: f.spiceMax === s.value ? undefined : s.value }))}
          >
            {s.label}
          </Option>
        ))}
      </Group>

      <Group label="Calories">
        {CAL_OPTIONS.map((c) => (
          <Option
            key={c}
            tone="mono"
            selected={f.calMax === c}
            to={href(withFilters(f, { calMax: f.calMax === c ? undefined : c }))}
          >
            &lt; {c} cal
          </Option>
        ))}
      </Group>

      <Group label="Protein">
        {PROTEIN_OPTIONS.map((p) => (
          <Option
            key={p}
            tone="mono"
            selected={f.proteinMin === p}
            to={href(withFilters(f, { proteinMin: f.proteinMin === p ? undefined : p }))}
          >
            {p} g+
          </Option>
        ))}
      </Group>
    </div>
  );
}

/** Number of narrowing filters currently applied, for the phone button badge. */
export function activeFilterCount(f: RecipeFilters): number {
  return (
    (f.maxTime !== undefined ? 1 : 0) +
    (f.spiceMax !== undefined ? 1 : 0) +
    (f.calMax !== undefined ? 1 : 0) +
    (f.calMin !== undefined ? 1 : 0) +
    (f.proteinMin !== undefined ? 1 : 0) +
    (f.cuisine?.length ?? 0) +
    (f.diet?.length ?? 0) +
    (f.exclude?.length ?? 0)
  );
}

/** "Clear all" keeps the search text and nothing else. */
export function clearFiltersHref(f: RecipeFilters): string {
  return href({ q: f.q });
}

export function ClearFilters({ filters }: { filters: RecipeFilters }) {
  if (!hasActiveFilters(filters)) return null;
  return (
    <Link
      href={clearFiltersHref(filters)}
      scroll={false}
      className="inline-flex min-h-11 items-center rounded-md px-1 font-mono text-[0.6875rem] tracking-[0.04em] text-ink-subtle underline-offset-2 hover:text-paprika-deep hover:underline lg:min-h-0"
    >
      clear all
    </Link>
  );
}
