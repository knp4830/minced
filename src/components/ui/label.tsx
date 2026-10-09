import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("mb-1.5 block text-[0.8125rem] font-semibold", className)}
      {...props}
    />
  );
}

/** Helper or error text under a field. Pair with aria-describedby. */
export function FieldHint({
  className,
  error = false,
  ...props
}: React.ComponentProps<"p"> & { error?: boolean }) {
  return (
    <p
      data-slot="field-hint"
      className={cn(
        "mt-1.5 text-xs leading-snug",
        error ? "text-paprika-deep" : "text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}
