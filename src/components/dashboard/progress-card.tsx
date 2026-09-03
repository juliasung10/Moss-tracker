import { ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { DeltaChip } from "@/components/delta.tsx";
import { METRIC_CATEGORIES, metricDef, type Progress } from "@/lib/metrics.ts";
import { formatDate, formatMetric } from "@/lib/format.ts";

/**
 * Has posting actually moved anything?
 *
 * Left: the engagement level you declared when you started. Right: what your tracked
 * posts average now. Both sides are real figures — the current column is measured
 * from posts only, never from the starting baseline, so this can't flatter itself.
 */
export function ProgressCard({
  rows,
  measuredCount,
  window,
  startedAt,
  scopeNote,
}: {
  rows: Progress[];
  measuredCount: number;
  window: number;
  startedAt: string | null;
  scopeNote: string;
}) {
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Progress since you started</CardTitle>
          <p className="mt-0.5 text-xs text-ink-faint">
            Your starting figures vs the average of{" "}
            <span className="num">{Math.min(measuredCount, window)}</span> tracked {scopeNote}
            {startedAt ? (
              <>
                {" "}
                · since <span className="num">{formatDate(startedAt)}</span>
              </>
            ) : null}
          </p>
        </div>
      </CardHeader>

      <div className="divide-y divide-line">
        {METRIC_CATEGORIES.map((category) => (
          <div key={category.key} className="px-5 py-3">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="eyebrow">{category.label}</span>
              <span className="text-[11px] text-ink-faint">{category.description}</span>
            </div>
            <div className="space-y-1">
              {rows
                .filter((r) => metricDef(r.key).category === category.key)
                .map((row) => {
                  const def = metricDef(row.key);
                  const current = byKey.get(row.key)?.current ?? null;
                  return (
                    <div key={row.key} className="flex items-center gap-3 py-0.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                        {def.label}
                      </span>
                      <span className="num w-20 text-right text-[13px] text-ink-faint">
                        {formatMetric(row.starting, def.kind)}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
                      <span className="num w-20 text-right text-[13px] font-medium">
                        {formatMetric(current, def.kind)}
                      </span>
                      <span className="w-16 text-right">
                        <DeltaChip delta={row.delta} size="sm" />
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
