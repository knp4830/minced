import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared field chrome for Input, Select and Textarea. */
export const fieldClasses = cn(
  "block w-full rounded-field border border-field bg-surface px-3.5 py-2.5",
  "text-base text-ink sm:text-[0.9375rem]", // 16px on phones: iOS won't zoom on focus
  "transition-[border-color,box-shadow] duration-150 ease-out",
  "hover:border-ink-subtle",
  "focus-visible:border-herb focus-visible:ring-[3px] focus-visible:ring-herb/20",
  "aria-invalid:border-paprika aria-invalid:focus-visible:ring-paprika/20",
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60",
);

export interface InputProps extends React.ComponentProps<"input"> {
  /** Monospace digits for quantities, times and costs. */
  mono?: boolean;
}

export function Input({ className, mono = false, type, ...props }: InputProps) {
  return (
    <input
      data-slot="input"
      type={type ?? "text"}
      className={cn(
        fieldClasses,
        "min-h-11 read-only:bg-sunken",
        mono && "font-mono tracking-tight",
        className,
      )}
      {...props}
    />
  );
}
