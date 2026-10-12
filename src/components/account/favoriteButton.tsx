"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { cn } from "@/lib/utils";

/**
 * The gold star. `card` is a round icon button over the photo corner;
 * `detail` is a labelled button ("Save" / "Saved") for the recipe header.
 *
 * Tapping saves instantly (optimistic) and puts it back if the server says no,
 * with a short message announced to screen readers and shown beside the button.
 * Signed-out visitors get a log-in dialog instead (see AccountProvider).
 */
export function FavoriteButton({
  slug,
  title,
  variant = "card",
  className,
}: {
  slug: string;
  title: string;
  variant?: "card" | "detail";
  className?: string;
}) {
  const { isSaved, toggle } = useAccount();
  // The message names the action that failed: removing and saving are not the same thing.
  const [failed, setFailed] = useState<"save" | "remove" | null>(null);
  const saved = isSaved(slug);
  const failedText =
    failed === "remove" ? "Couldn't remove. Try again." : failed === "save" ? "Couldn't save. Try again." : "";

  async function onClick() {
    const wasSaved = saved;
    setFailed(null);
    const result = await toggle(slug);
    if (result === "failed") setFailed(wasSaved ? "remove" : "save");
  }

  const icon = (
    <Star
      aria-hidden
      className={cn(
        "size-[1.125rem] transition-colors",
        saved ? "fill-saffron stroke-saffron-ink" :"fill-transparent stroke-ink-soft",
      )}
    />
  );

  if (variant === "detail") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={saved}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline px-3.5 text-[0.875rem] font-semibold text-ink transition-colors hover:border-herb hover:text-herb"
        >
          {icon}
          {saved ? "Saved" : "Save"}
        </button>
        <span role="status" className="text-[0.8125rem] text-paprika-deep">
          {failedText}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved recipes` : `Save ${title}`}
      className={cn(
        "relative z-10 flex size-11 items-center justify-center rounded-full bg-canvas/90 shadow-sm backdrop-blur-sm transition-[background-color,transform] hover:bg-canvas active:scale-95",
        failed && "ring-2 ring-paprika",
        className,
      )}
    >
      {icon}
      {failed && <span className="sr-only">{failedText}</span>}
    </button>
  );
}
