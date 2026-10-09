import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldClasses } from "@/components/ui/input";

export function Textarea({
  className,
  rows = 3,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(fieldClasses, "min-h-20 resize-y read-only:bg-sunken leading-normal", className)}
      {...props}
    />
  );
}
