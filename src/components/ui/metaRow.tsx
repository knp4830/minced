import * as React from "react";
import { cn } from "@/lib/utils";
import { SpiceDots } from "@/components/ui/spiceDots";

export interface MetaRowProps extends React.ComponentProps<"div"> {
  /** Total minutes. */
  time?: number;
  servings?: number;
  calories?: number;
  /** 0–4. Omit to hide the dots entirely. */
  spice?: number;
  /** Cost per serving in dollars. */
  cost?: number;
  size?: "sm" | "md";
}

/**
 * The mono "spec strip": 30m · 4 srv · 410 cal · ●●○○ · $2.10.
 * Each part is optional so the same row serves cards, search hits and the recipe header.
 * Empty parts simply don't render, and separators are only drawn between parts.
 */
export function MetaRow({
  time,
  servings,
  calories,
  spice,
  cost,
  size = "sm",
  className,
  ...props
}: MetaRowProps) {
  const parts: React.ReactNode[] = [];
  if (time !== undefined) {
    parts.push(
      <span key="time">
        <span className="sr-only">Time: </span>
        {time}m
      </span>,
    );
  }
  if (servings !== undefined) {
    parts.push(
      <span key="srv">
        <span className="sr-only">Servings: </span>
        {servings} srv
      </span>,
    );
  }
  if (calories !== undefined) {
    parts.push(
      <span key="cal">
        <span className="sr-only">Calories: </span>
        {calories} cal
      </span>,
    );
  }
  if (spice !== undefined) {
    parts.push(
      <SpiceDots key="spice" level={spice} size={size === "sm" ? "sm" : "md"} />,
    );
  }
  if (cost !== undefined) {
    parts.push(
      <span
        key="cost"
        className="rounded-xs bg-saffron-tint px-1.5 py-px font-semibold text-saffron-ink"
      >
        <span className="sr-only">Cost per serving: </span>${cost.toFixed(2)}
      </span>,
    );
  }

  return (
    <div
      data-slot="meta-row"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-ink-muted",
        size === "sm" ? "text-[0.71875rem]" : "text-[0.8125rem]",
        className,
      )}
      {...props}
    >
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="text-stone-line">
              ·
            </span>
          )}
          {part}
        </React.Fragment>
      ))}
    </div>
  );
}
