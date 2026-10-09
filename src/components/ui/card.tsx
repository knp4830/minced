import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Card is a plain surface. `interactive` adds the lift-on-hover from the
 * mockup's recipe card; use it only when the whole card is a link target
 * (put the link on the title and stretch it with `after:absolute after:inset-0`).
 */
export interface CardProps extends React.ComponentProps<"div"> {
  interactive?: boolean;
}

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "relative overflow-hidden rounded-xl border border-line bg-surface",
        interactive &&
          "transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift focus-within:shadow-lift",
        className,
      )}
      {...props}
    />
  );
}

export function CardMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-media"
      className={cn("relative aspect-[4/3] overflow-hidden bg-hatch", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-body"
      className={cn("px-4 pt-3.5 pb-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "font-display text-lg leading-[1.15] font-semibold tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("border-t border-line px-4 py-3", className)}
      {...props}
    />
  );
}
