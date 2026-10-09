import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Chip is the filter pill and the diet tag.
 *
 * Interactive chips are toggles. Filter state lives in URL search params, so on
 * real pages a chip is usually a <Link> (use `asChild`); `selected` then drives
 * the look through `data-selected` and, for a real <button>, `aria-pressed`.
 * Set `isStatic` for a read-only tag (diet, cookware): it renders a <span> that
 * is not focusable and has no hover.
 */
const chipVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 rounded-sheet border whitespace-nowrap select-none",
    "transition-[background-color,border-color,color] duration-150 ease-out",
    "min-h-8 px-3 text-[0.8125rem] leading-none",
    "pointer-coarse:min-h-10",
  ],
  {
    variants: {
      tone: {
        // Plain words: cuisine, diet, cookware.
        text: "font-sans font-medium",
        // Measurements: "< 30 min", "3–4". Mono keeps digits in a column.
        mono: "font-mono text-xs",
      },
      selected: {
        true: "border-herb bg-herb text-on-herb",
        false: "border-line-strong bg-transparent text-ink",
      },
      interactive: {
        true: "cursor-pointer",
        false: "",
      },
    },
    compoundVariants: [
      {
        selected: false,
        interactive: true,
        className: "hover:border-herb hover:text-herb",
      },
      {
        selected: true,
        interactive: true,
        className: "hover:bg-herb-deep",
      },
    ],
    defaultVariants: { tone: "text", selected: false, interactive: true },
  },
);

export interface ChipProps
  extends Omit<React.ComponentProps<"button">, "type">,
    Omit<VariantProps<typeof chipVariants>, "selected" | "interactive"> {
  selected?: boolean;
  /** Render a non-interactive <span> tag (no focus, no hover). */
  isStatic?: boolean;
  asChild?: boolean;
}

export function Chip({
  className,
  tone,
  selected = false,
  isStatic = false,
  asChild = false,
  children,
  ...props
}: ChipProps) {
  const classes = cn(
    chipVariants({ tone, selected, interactive: !isStatic }),
    className,
  );

  if (isStatic) {
    return (
      <span data-slot="chip" data-selected={selected} className={classes}>
        {children}
      </span>
    );
  }

  if (asChild) {
    return (
      <Slot
        data-slot="chip"
        data-selected={selected}
        aria-current={selected ? "true" : undefined}
        className={classes}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      type="button"
      data-slot="chip"
      data-selected={selected}
      aria-pressed={selected}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}
