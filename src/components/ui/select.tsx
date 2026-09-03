import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";

/**
 * A styled native <select>.
 *
 * Deliberately not the Radix listbox: the entry form is built to be filled in
 * without touching the mouse, and a native select is the only kind that opens with
 * a keystroke, type-ahead jumps to an option, and never traps focus.
 */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-8 w-full appearance-none rounded-md border border-line-strong bg-surface pl-2.5 pr-7 text-[13px] text-ink transition-colors",
          "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
