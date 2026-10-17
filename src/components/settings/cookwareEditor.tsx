"use client";

import { useRef, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { saveMyCookware } from "@/lib/actions/cookware";
import { readCookware, writeCookware } from "@/lib/cookwareStorage";

/*
 * The place a signed-in cook says which pots and pans they own. The filter panel only
 * has the "Only what I can make with my cookware" switch; this list is what it uses.
 * Each tap saves to the account (one save at a time, last write wins) and mirrors the
 * list to this device so the next visit to /recipes restores it.
 */
export function CookwareEditor({
  all,
  initial,
}: {
  all: { slug: string; name: string }[];
  initial: string[];
}) {
  const [owned, setOwned] = useState(initial);
  const [state, setState] = useState<"idle" | "saved" | "failed">("idle");
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  function toggle(slug: string) {
    const next = owned.includes(slug) ? owned.filter((s) => s !== slug) : [...owned, slug];
    setOwned(next);
    writeCookware({ slugs: next, only: next.length > 0 && readCookware().only });
    saving.current = saving.current.then(() =>
      saveMyCookware(next)
        .then((r) => setState(r.ok ? "saved" : "failed"))
        .catch(() => setState("failed")),
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {all.map((c) => (
          <Chip key={c.slug} selected={owned.includes(c.slug)} onClick={() => toggle(c.slug)}>
            {c.name}
          </Chip>
        ))}
      </div>
      <p role="status" className="mt-2 min-h-5 text-[0.8125rem] text-ink-muted">
        {state === "saved" && "Saved to your account."}
        {state === "failed" && (
          <span className="text-paprika-deep">Couldn&apos;t save this just now. Try again.</span>
        )}
      </p>
    </div>
  );
}
