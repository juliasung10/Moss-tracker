import Link from "next/link";
import { cn } from "@/lib/utils.ts";

export interface SegmentOption {
  label: string;
  href: string;
  active: boolean;
}

/**
 * A two-or-three way switch rendered as links, so the choice lives in the URL and
 * the page stays server-rendered.
 */
export function Segmented({ options, className }: { options: SegmentOption[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-md border border-line bg-surface p-0.5", className)}>
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          aria-current={o.active ? "true" : undefined}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
            o.active ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
