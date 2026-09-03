import * as React from "react";
import { cn } from "@/lib/utils.ts";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink transition-colors",
        "placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink transition-colors",
      "placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
