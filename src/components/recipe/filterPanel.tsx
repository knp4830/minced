import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import { FilterSlider } from "@/components/recipe/filterSlider";
import { TimeCustomRange } from "@/components/recipe/filterTimeCustom";
import { MyCookware } from "@/components/recipe/myCookware";
import {
  filtersToQuery,
  hasActiveFilters,
  toggleInclude,
  toggleInList,
  withFilters,
  withoutNarrowing,
  type RecipeFilters,
} from "@/lib/filters";
import type { FilterOptions } from "@/lib/queries/browse";

/**
 * The filter controls. Chips are plain links to the same page with one URL param
 * changed (`withFilters` also drops the cursor), so:
 *   - filter state lives in the URL, as CLAUDE.md requires;
 *   - it works without JavaScript and the back button undoes a filter;
 *   - a filtered view can be shared as a link.
 * The sliders, the custom time boxes and "My cookware" are small client islands that
 * write the same URL params. Both doors use the same controls: `base` is the page the
 * links point at ("/recipes" or "/pantry").
 */

const BASE = "/recipes";

/**
 * Total-time buckets, the way big recipe sites do it (Allrecipes, BBC Good Food, NYT
 * Cooking): short ranges instead of one "under N" cap, so "30 to 60 minutes" is one tap.
 * Both ends are inclusive, so a 30-minute recipe appears under "15–30" and "30–60"; the
 * boxes underneath take any other range. Recipes with no listed time pass every range.
 */
const TIME_BUCKETS = [
  { label: "Under 15", min: undefined, max: 15 },
  { label: "15–30", min: 15, max: 30 },
  { label: "30–60", min: 30, max: 60 },
  { label: "Over 60", min: 60, max: undefined },
] as const;

/** Chips shown per ingredient shelf; the rest are one search away. */
const SHELF_CHIPS = 18;

// Slider ranges follow the catalog: calories per serving run to about 840 at the 99th
// percentile, protein to about 50 g. The end stop means "no limit".
const CAL_SLIDER = { min: 0, max: 1000, step: 50 } as const;
const PROTEIN_SLIDER = { min: 0, max: 60, step: 5 } as const;

function hrefTo(f: RecipeFilters, base: string = BASE): string {
  return `${base}${filtersToQuery(f)}`;
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mb-5 min-w-0">
      <legend className="label-mono mb-2.5">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {hint && <p className="mt-2 text-[0.8125rem] leading-snug text-ink-muted">{hint}</p>}
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
      {/* nofollow: every chip is a new filter combination; crawlers must not walk them all. */}
      <Link href={to} scroll={false} prefetch={false} rel="nofollow">
        {children}
      </Link>
    </Chip>
  );
}

/**
 * "Cookware I'm using": recipes that USE any selected piece. Shared by the
 * browse rail, the phone sheet and the fridge results page (`base="/pantry"`),
 * so both doors filter the same way. Renders nothing when no recipe has
 * cookware data.
 */
export function CookwareGroup({
  filters,
  options,
  base = BASE,
}: {
  filters: RecipeFilters;
  options: Pick<FilterOptions, "cookware">;
  base?: string;
}) {
  if (options.cookware.length === 0) return null;
  return (
    <Group label="Uses cookware">
      {options.cookware.map((c) => (
        <Option
          key={c.slug}
          selected={!!filters.cookware?.includes(c.slug)}
          to={hrefTo(toggleInList(filters, "cookware", c.slug), base)}
        >
          {c.name}
        </Option>
      ))}
    </Group>
  );
}

/**
 * "Contains": ingredient chips by shelf. A recipe must contain ALL the picked
 * ingredients (each one counts if the recipe has it or a variant of it), so every
 * pick narrows the list, like Diet. Shelves are collapsed until used.
 */
function IngredientFilter({
  filters,
  options,
  base,
}: {
  filters: RecipeFilters;
  options: Pick<FilterOptions, "ingredientGroups">;
  base: string;
}) {
  const groups = options.ingredientGroups ?? [];
  if (groups.length === 0) return null;
  const picked = filters.include ?? [];
  const names = new Map(groups.flatMap((g) => g.items.map((i) => [i.id, i.name] as const)));
  return (
    <fieldset className="mb-5 min-w-0">
      <legend className="label-mono mb-1">Contains</legend>
      <p className="mb-2.5 text-[0.8125rem] leading-snug text-ink-muted">
        {picked.length > 1 ? "Recipes with all of these." : "Pick ingredients a recipe must have."}
      </p>
      {picked.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <Option key={id} selected to={hrefTo(toggleInclude(filters, id), base)}>
              {names.get(id) ?? `ingredient ${id}`}
            </Option>
          ))}
        </div>
      )}
      {groups.map((g) => {
        const mine = g.items.filter((i) => picked.includes(i.id)).length;
        return (
          <details key={g.slug} open={mine > 0} className="group/shelf mb-1">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-[0.875rem] text-ink marker:hidden [&::-webkit-details-marker]:hidden">
              <span>
                {g.name}
                {mine > 0 ? ` (${mine})` : ""}
              </span>
              <span aria-hidden className="font-mono text-[0.6875rem] text-ink-subtle group-open/shelf:hidden">
                show
              </span>
              <span aria-hidden className="hidden font-mono text-[0.6875rem] text-ink-subtle group-open/shelf:inline">
                hide
              </span>
            </summary>
            <div className="flex flex-wrap gap-1.5 pb-2 pt-1">
              {g.items.slice(0, SHELF_CHIPS).map((i) => (
                <Option
                  key={i.id}
                  selected={picked.includes(i.id)}
                  to={hrefTo(toggleInclude(filters, i.id), base)}
                >
                  {i.name}
                </Option>
              ))}
            </div>
          </details>
        );
      })}
    </fieldset>
  );
}

export function FilterControls({
  filters,
  options,
  base = BASE,
}: {
  filters: RecipeFilters;
  options: FilterOptions;
  base?: string;
}) {
  const f = filters;
  const href = (next: RecipeFilters) => hrefTo(next, base);
  return (
    <div>
      <fieldset className="mb-5 min-w-0">
        <legend className="label-mono mb-2.5">Total time, minutes</legend>
        <div className="flex flex-wrap gap-1.5">
          {TIME_BUCKETS.map((t) => {
            const on = f.minTime === t.min && f.maxTime === t.max;
            return (
              <Option
                key={t.label}
                tone="mono"
                selected={on}
                to={href(
                  withFilters(
                    f,
                    on ? { minTime: undefined, maxTime: undefined } : { minTime: t.min, maxTime: t.max },
                  ),
                )}
              >
                {t.label}
              </Option>
            );
          })}
        </div>
        <TimeCustomRange filters={f} base={base} />
      </fieldset>

      <Group
        label="Diet"
        hint={
          options.diets.some((d) => d.slug === "pescatarian")
            ? "Pescatarian includes vegetarian and vegan dishes, and vegetarian includes vegan."
            : undefined
        }
      >
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

      <IngredientFilter filters={f} options={options} base={base} />

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

      <CookwareGroup filters={f} options={options} base={base} />

      <MyCookware owned={f.ownedCookware ?? []} only={f.ownedOnly === true} all={options.allCookware ?? []} />

      <FilterSlider
        label="Calories"
        minKey="calMin"
        maxKey="calMax"
        filters={f}
        base={base}
        {...CAL_SLIDER}
        unit="cal"
        unitWord="calories"
      />

      <FilterSlider
        label="Protein"
        minKey="proteinMin"
        filters={f}
        base={base}
        {...PROTEIN_SLIDER}
        unit="g"
        unitWord="grams of protein"
      />
    </div>
  );
}

/** Number of narrowing filters currently applied, for the phone button badge. */
export function activeFilterCount(f: RecipeFilters): number {
  return (
    (f.minTime !== undefined || f.maxTime !== undefined ? 1 : 0) +
    // No spice control any more, but an old link can still carry it; keep the badge honest.
    (f.spiceMax !== undefined ? 1 : 0) +
    (f.calMin !== undefined || f.calMax !== undefined ? 1 : 0) +
    (f.proteinMin !== undefined ? 1 : 0) +
    (f.include?.length ?? 0) +
    (f.cuisine?.length ?? 0) +
    (f.diet?.length ?? 0) +
    (f.exclude?.length ?? 0) +
    (f.cookware?.length ?? 0) +
    (f.ownedOnly ? 1 : 0)
  );
}

/**
 * "Clear all" drops every narrowing filter. It keeps what the door is about (the
 * search text, the fridge) and the cookware LIST, which is a standing preference
 * like the fridge rather than a filter.
 */
export function clearFiltersHref(f: RecipeFilters, base: string = BASE): string {
  return hrefTo(withoutNarrowing(f), base);
}

export function ClearFilters({ filters, base = BASE }: { filters: RecipeFilters; base?: string }) {
  if (!hasActiveFilters(filters)) return null;
  return (
    <Link
      href={clearFiltersHref(filters, base)}
      scroll={false}
      className="inline-flex min-h-11 items-center rounded-md px-1 font-mono text-[0.6875rem] tracking-[0.04em] text-ink-subtle underline-offset-2 hover:text-paprika-deep hover:underline lg:min-h-0"
    >
      clear all
    </Link>
  );
}
