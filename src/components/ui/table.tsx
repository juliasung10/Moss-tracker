import * as React from "react";
import { cn } from "@/lib/utils.ts";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-line", className)} {...props} />;
}

export function TH({
  className,
  align = "left",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-line last:border-0", className)} {...props} />;
}

export function TD({
  className,
  align = "left",
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return (
    <td
      className={cn("px-3 py-2 align-middle", align === "right" ? "text-right" : "text-left", className)}
      {...props}
    />
  );
}
