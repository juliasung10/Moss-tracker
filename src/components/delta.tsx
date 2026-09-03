import { metricDef, type MetricDelta } from "@/lib/metrics.ts";
import {
  DASH,
  formatAbsChange,
  formatMetric,
  formatPctChange,
  ordinal,
} from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

const TONE = {
  up: "bg-up-soft text-up",
  down: "bg-down-soft text-down",
  flat: "bg-canvas text-ink-muted",
  unknown: "bg-canvas text-ink-faint",
} as const;

/**
 * The percent change vs baseline. Green above, red below, grey within ±5%.
 * These are the only coloured elements in the app.
 */
export function DeltaChip({
  delta,
  className,
  size = "default",
}: {
  delta: MetricDelta;
  className?: string;
  size?: "default" | "sm";
}) {
  const def = metricDef(delta.key);
  const { direction, pctChange, absChange, baseline } = delta;

  // A zero baseline has no percentage; fall back to the absolute move so the chip
  // still says something true.
  const body =
    direction === "unknown"
      ? DASH
      : pctChange !== null
        ? formatPctChange(pctChange)
        : formatAbsChange(absChange, def.kind);

  const title =
    direction === "unknown"
      ? "No baseline yet"
      : `${formatMetric(delta.value, def.kind)} vs baseline ${formatMetric(baseline, def.kind)} · ${formatAbsChange(absChange, def.kind)}`;

  return (
    <span
      title={title}
      className={cn(
        "num inline-flex items-center rounded px-1.5 font-medium",
        size === "sm" ? "text-[11px] py-px" : "text-xs py-0.5",
        TONE[direction],
        className,
      )}
    >
      {body}
    </span>
  );
}

/** "3rd of 27" — where this post sits against every comparable post. */
export function RankLabel({
  rank,
  className,
}: {
  rank: { position: number; of: number } | null;
  className?: string;
}) {
  if (!rank) return <span className={cn("text-ink-faint", className)}>{DASH}</span>;
  return (
    <span className={cn("num text-xs text-ink-muted", className)}>
      {ordinal(rank.position)} of {rank.of}
    </span>
  );
}

/** A metric rendered in its own units, tabular. */
export function Figure({
  value,
  kind,
  className,
}: {
  value: number | null;
  kind: "count" | "rate";
  className?: string;
}) {
  return <span className={cn("num", value === null && "text-ink-faint", className)}>{formatMetric(value, kind)}</span>;
}
