"use client";

import { formatDate, formatMetric } from "@/lib/format.ts";
import type { MetricKind } from "@/lib/metrics.ts";

export interface TooltipRow {
  name: string;
  value: number | null;
  color: string;
}

/** Quiet tooltip: hairline border, no shadow, mono figures. */
export function ChartTooltip({
  active,
  label,
  rows,
  kind,
}: {
  active?: boolean;
  label?: string;
  rows: TooltipRow[];
  kind: MetricKind;
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5">
      {label ? <div className="mb-1 text-[11px] text-ink-faint">{formatDate(label)}</div> : null}
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2 text-xs">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
            <span className="text-ink-muted">{r.name}</span>
            <span className="num ml-auto font-medium text-ink">{formatMetric(r.value, kind)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
