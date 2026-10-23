"use client";

import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/recipe/allergenConfirm";
import { Chip } from "@/components/ui/chip";
import { saveFoodDefaults } from "@/lib/actions/settings";
import { prefsLabel } from "@/lib/prefs";
import { NESTED_DIETS } from "@/lib/settingsValidate";
import { cn } from "@/lib/utils";
import { RadioGroup } from "./radioGroup";
import { StatusLine, useAutosave, useSaveStatus } from "./saveStatus";

type Option = { slug: string; name: string };
type Value = { diet: string[]; allergens: string[] };

/*
 * Default eating style, extra diets and allergens to leave out. Everything saves on change. Once saved these
 * apply on /recipes (browse and search) and /pantry (the fridge matcher) without touching the filters; the
 * "Your defaults" chip on those pages shows them and turns them off per search.
 *
 * Eating style is a radio group because the styles nest (vegan is accepted by vegetarian, which is accepted by
 * pescatarian), so a person holds at most one. Diets that do not nest (gluten-free today) are independent chips,
 * and new diets in the table appear here by themselves.
 */
export function FoodDefaultsForm({
  diets,
  allergens,
  initial,
}: {
  diets: Option[];
  allergens: Option[];
  initial: Value;
}) {
  const { status, run } = useSaveStatus();
  const [value, setValue] = useAutosave<Value>(initial, saveFoodDefaults, run);

  const styles = diets.filter((d) => NESTED_DIETS.includes(d.slug));
  const also = diets.filter((d) => !NESTED_DIETS.includes(d.slug));
  // Keep the radio order the nesting reads in: pescatarian, vegetarian, vegan.
  styles.sort((a, b) => NESTED_DIETS.indexOf(a.slug) - NESTED_DIETS.indexOf(b.slug));
  const style = value.diet.find((d) => NESTED_DIETS.includes(d)) ?? "";
  /** The saved allergen the person just tapped to remove, waiting for a yes. */
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const offName = (allergens.find((a) => a.slug === confirmOff)?.name ?? confirmOff ?? "").toLowerCase();

  const preview = useMemo(
    () =>
      prefsLabel(
        { diet: value.diet, exclude: value.allergens },
        { diets: new Map(diets.map((d) => [d.slug, d.name])), allergens: new Map(allergens.map((a) => [a.slug, a.name])) },
      ),
    [value, diets, allergens],
  );

  function setStyle(slug: string) {
    const rest = value.diet.filter((d) => !NESTED_DIETS.includes(d));
    setValue({ ...value, diet: slug ? [...rest, slug].sort() : rest });
  }
  function toggle(key: "diet" | "allergens", slug: string) {
    const cur = value[key];
    // Taking an allergen OFF the list is the one change that can put it in front of someone, so it asks first.
    if (key === "allergens" && cur.includes(slug)) {
      setConfirmOff(slug);
      return;
    }
    setValue({ ...value, [key]: cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug] });
  }

  return (
    <div className="space-y-6">
      <RadioGroup
        name="eating_style"
        legend="How do you eat?"
        hint="Vegetarian recipes include vegan ones too."
        value={style}
        options={[{ value: "", label: "No preference" }, ...styles.map((s) => ({ value: s.slug, label: s.name }))]}
        onChange={setStyle}
      />

      {also.length > 0 && (
        <fieldset className="min-w-0">
          <legend className="text-[0.9375rem] font-semibold">Also</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {also.map((d) => (
              <Chip
                key={d.slug}
                selected={value.diet.includes(d.slug)}
                onClick={() => toggle("diet", d.slug)}
                className="min-h-11"
              >
                {d.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="min-w-0" aria-describedby="allergen-note">
        <legend className="text-[0.9375rem] font-semibold">Leave out recipes with</legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {allergens.map((a) => (
            <Chip
              key={a.slug}
              selected={value.allergens.includes(a.slug)}
              onClick={() => toggle("allergens", a.slug)}
              className={cn(
                "min-h-11",
                "data-[selected=true]:border-paprika-deep data-[selected=true]:bg-paprika/10 data-[selected=true]:text-paprika-deep",
                "data-[selected=true]:hover:bg-paprika/20",
              )}
            >
              {a.name.toLowerCase()}
            </Chip>
          ))}
        </div>
        <p className="mt-3 max-w-[34em] text-[0.8125rem] leading-snug text-ink-muted" data-testid="allergen-always-hidden">
          Recipes with these stay hidden on every search, so nothing slips through while you browse. If you ever need
          to look past them, you can do that for one search at a time, and we will ask first.
        </p>
        <p className="mt-3 max-w-[34em] text-[0.8125rem] leading-snug text-ink-muted" data-testid="allergen-definitions">
          Peanuts and tree nuts are separate, and coconut is not counted as a tree nut. Wheat is separate from gluten
          (gluten also covers barley and rye). Shellfish means crab, shrimp and lobster; mollusks means clams, oysters,
          scallops and squid. A recipe that has an allergen only in an optional ingredient stays in your list, with a
          note to leave it out.
        </p>
        <p id="allergen-note" className="mt-3 max-w-[34em] text-[0.8125rem] leading-snug text-ink-muted">
          Allergen information comes from the ingredients listed and may be incomplete. It doesn&rsquo;t cover brands or
          cross-contact. Always read labels. If you have a serious allergy, don&rsquo;t rely on Minced.
        </p>
      </fieldset>

      <ConfirmDialog
        open={confirmOff !== null}
        title={`Stop hiding recipes with ${offName}?`}
        confirmLabel="Stop hiding them"
        cancelLabel="Keep hiding them"
        onConfirm={() => {
          if (confirmOff) setValue({ ...value, allergens: value.allergens.filter((s) => s !== confirmOff) });
          setConfirmOff(null);
        }}
        onCancel={() => setConfirmOff(null)}
      >
        <p>
          Recipes with {offName} will start showing up in your browse, search and fridge results. You can switch it
          back on whenever you like.
        </p>
      </ConfirmDialog>

      <div>
        <p className="rounded-md bg-band px-3 py-2 text-[0.875rem]" data-testid="defaults-preview">
          {preview ? (
            <>
              <span className="label-mono mr-1.5">Your defaults</span>
              <span className="text-ink">{preview}</span>
            </>
          ) : (
            <span className="text-ink-muted">No defaults set.</span>
          )}
        </p>
        <StatusLine status={status} />
      </div>
    </div>
  );
}
