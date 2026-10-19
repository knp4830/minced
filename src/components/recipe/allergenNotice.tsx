import { joinNames, sentenceName, type AllergenInfo } from "@/lib/allergenInfo";

/**
 * The allergen block on a recipe page. A Server Component with no client JavaScript, so it is identical for every
 * visitor and the page stays cacheable. The signed-in "which you avoid" warning is a separate client island
 * (AvoidNotice), because it depends on who is looking.
 *
 *   Contains          allergens that come from a required ingredient and are typical or inherent
 *   May contain       allergens that only SOME brands or versions of an ingredient carry (basis "varies")
 *   Optional only     the recipe is fine without it: "Peanuts: optional (peanuts). Leave them out if you avoid peanuts."
 *
 * Allergen data comes from the ingredient list and does not cover brands, cross-contact or kitchen practice.
 */
export function AllergenNotice({ info }: { info: AllergenInfo[] }) {
  const contains = info.filter((a) => !a.optionalOnly && a.basis !== "varies");
  const may = info.filter((a) => !a.optionalOnly && a.basis === "varies");
  const optional = info.filter((a) => a.optionalOnly);
  if (contains.length + may.length + optional.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2" data-allergen-notice>
      {contains.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.08em] text-paprika-deep uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-paprika" />
            Contains
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Allergens">
            {contains.map((a) => (
              <li
                key={a.slug}
                data-allergen={a.slug}
                title={a.sources.length ? `From ${joinNames(a.sources)}` : undefined}
                className="rounded-full border border-paprika/30 bg-paprika/5 px-2.5 py-0.5 text-[0.75rem] leading-snug text-paprika-deep"
              >
                {sentenceName(a.name)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {may.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.08em] text-ink-muted uppercase">
            <span aria-hidden className="size-1.5 rounded-full border border-paprika" />
            May contain
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Allergens in some brands">
            {may.map((a) => (
              <li
                key={a.slug}
                data-allergen={a.slug}
                title={a.sources.length ? `Some brands or versions of ${joinNames(a.sources)}` : undefined}
                className="rounded-full border border-dashed border-paprika/40 px-2.5 py-0.5 text-[0.75rem] leading-snug text-ink-muted"
              >
                {sentenceName(a.name)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {optional.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Allergens in optional ingredients">
          {optional.map((a) => (
            <li key={a.slug} data-allergen={a.slug} data-optional className="text-[0.8125rem] leading-snug text-ink-muted">
              <span className="font-semibold text-ink">{a.name}</span>: optional{a.sources.length ? ` (${joinNames(a.sources)})` : ""}.{" "}
              Leave them out if you avoid {sentenceName(a.name)}.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
