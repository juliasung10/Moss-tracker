import Link from "next/link";
import { DeltaChip } from "@/components/delta.tsx";
import { Button } from "@/components/ui/button.tsx";
import { metricDef, type MetricKey, type PostComparison } from "@/lib/metrics.ts";
import type { Milestone } from "@/lib/types.ts";

/** What the save actually told us: what it beat, what it didn't, what it unlocked. */
export function SaveResult({
  label,
  mode,
  postId,
  comparison,
  fresh,
  onReset,
}: {
  label: string;
  mode: "new" | "snapshot";
  postId: number;
  comparison: PostComparison;
  fresh: Milestone[];
  onReset: () => void;
}) {
  const { baseline, beat, missed, deltas } = comparison;
  const headline = deltas.views;

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <span className="text-[13px] font-semibold">
            {mode === "new" ? "Post logged" : "Reading added"}
          </span>
          <span className="ml-2 text-[13px] text-ink-muted">{label}</span>
        </div>
        <Link href={`/posts/${postId}`} className="text-xs text-accent hover:underline">
          Open post detail
        </Link>
      </div>

      <div className="space-y-4 px-5 py-4">
        {baseline.forming ? (
          <p className="text-[13px] text-ink-muted">
            Baseline forming — <span className="num">{baseline.sampleSize}</span> of{" "}
            <span className="num">{baseline.window}</span> prior posts. Saved, but there is no
            average to judge it against yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
              <span className="text-ink-muted">Views vs baseline:</span>
              <DeltaChip delta={headline} />
              {headline.rank ? (
                <span className="num text-xs text-ink-faint">
                  {headline.rank.position === 1
                    ? `best of ${headline.rank.of}`
                    : `${headline.rank.position} of ${headline.rank.of}`}
                </span>
              ) : null}
            </div>

            <MetricList title="Beat baseline on" keys={beat} comparison={comparison} empty="Nothing beat the baseline this time." />
            <MetricList title="Below baseline on" keys={missed} comparison={comparison} empty="Nothing came in below baseline." />
          </>
        )}

        {fresh.length > 0 ? (
          <div className="rounded-md border border-line bg-canvas px-3 py-2.5">
            <div className="eyebrow mb-1.5">Milestones reached</div>
            <ul className="space-y-1">
              {fresh.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2 text-[13px]">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                  {m.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button type="button" onClick={onReset}>
            Log another
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetricList({
  title,
  keys,
  comparison,
  empty,
}: {
  title: string;
  keys: MetricKey[];
  comparison: PostComparison;
  empty: string;
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      {keys.length === 0 ? (
        <p className="text-[13px] text-ink-faint">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {keys.map((key) => (
            <span key={key} className="flex items-center gap-1.5 text-[13px]">
              <span className="text-ink-muted">{metricDef(key).label}</span>
              <DeltaChip delta={comparison.deltas[key]} size="sm" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
