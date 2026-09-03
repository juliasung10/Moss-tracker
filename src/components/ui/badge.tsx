import * as React from "react";
import { cn } from "@/lib/utils.ts";

/** Neutral only — coloured chips are reserved for deltas. */
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-line px-1.5 py-px text-[11px] font-medium text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
