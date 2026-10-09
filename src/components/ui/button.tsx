import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * One component, three looks (+ one for dark bands), chosen by props.
 * `variant` is a prop and not three components because every variant shares
 * the same focus ring, disabled behaviour, sizing and `asChild` support —
 * variants only differ in colour. Splitting them would triplicate the rest.
 */
export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "font-sans font-semibold select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-herb text-on-herb shadow-press hover:bg-herb-deep active:shadow-none",
        secondary:
          "border border-outline bg-transparent text-ink hover:border-herb hover:text-herb",
        ghost: "bg-transparent text-ink hover:bg-ink/6 hover:text-herb",
        // For the dark herb band: light fill, saffron on hover.
        inverse: "bg-canvas text-ink hover:bg-surface",
        "inverse-outline":
          "border border-on-herb/35 bg-transparent text-on-herb hover:border-saffron hover:text-saffron",
        danger:
          "border border-paprika/50 bg-transparent text-paprika-deep hover:bg-paprika hover:text-surface",
      },
      size: {
        sm: "min-h-9 rounded-md px-3.5 py-2 text-[0.8125rem] pointer-coarse:min-h-11",
        md: "min-h-11 rounded-lg px-5 py-2.5 text-[0.9375rem]",
        lg: "min-h-12 rounded-lg px-6 py-3 text-[0.9375rem] sm:text-base",
        icon: "size-11 rounded-lg sm:size-10 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Next <Link>) with button styling. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
