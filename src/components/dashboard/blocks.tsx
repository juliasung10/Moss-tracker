import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { DeltaChip, Figure, RankLabel } from "@/components/delta.tsx";
import { Sparkline } from "@/components/charts/sparkline.tsx";
import {
  metricDef,
  type Baseline,
  type MetricDelta,
  type MetricKey,
  type PostComparison,
} from "@/lib/metrics.ts";
import { formatCompact, formatCount, formatDate, formatMetric } from "@/lib/format.ts";
import type { Milestone, PostWithMetrics } from "@/lib/types.ts";
import type { NextMilestone } from "@/lib/milestones.ts";
import { cn } from "@/lib/utils.ts";

/* --- baseline block --------------------------------------------------------- */

export function BaselineTile({
  metricKey,
  baseline,
  trailing,
  scopeNote,
}: {
  metricKey: MetricKey;
  baseline: Baseline;
  /** History of the trailing average, for the sparkline. */
  trailing: (number | null)[];
  scopeNote: string;
}) {
  const def = metricDef(metricKey);
  const value = baseline.values[metricKey];

  return (
    <div className="flex-1 px-5 py-4">
      <div className="eyebrow">{def.label}</div>
      {baseline.forming ? (
        <>
          <div className="mt-1.5 text-[15px] font-medium text-ink-muted">Baseline forming</div>
          <div className="mt-1 text-xs text-ink-faint">
            <span className="num">
              {baseline.sampleSize} of {baseline.window}
            </span>{" "}
            posts
          </div>
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-line-strong"
              style={{ width: `${Math.min(100, (baseline.sampleSize / baseline.window) * 100)}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="num mt-1.5 text-2xl font-semibold tracking-tight">
            {formatMetric(value, def.kind)}
          </div>
          <div className="mt-1 text-xs text-ink-faint">
            {baseline.seeded ? (
              <>
                <span className="num">{baseline.measuredCount}</span> measured +{" "}
                <span className="num">{baseline.seededCount}</span> from your starting figures
              </>
            ) : (
              <>
                trailing average · last {baseline.window} {scopeNote}
              </>
            )}
          </div>
          <div className="mt-2">
            <Sparkline values={trailing} />
          </div>
        </>
      )}
    </div>
  );
}

/* --- metric rows ------------------------------------------------------------ */

export function MetricRow({
  delta,
  showRank = true,
  className,
}: {
  delta: MetricDelta;
  showRank?: boolean;
  className?: string;
}) {
  const def = metricDef(delta.key);
  return (
    <div className={cn("flex items-center gap-3 py-1.5", className)}>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{def.label}</span>
      <Figure value={delta.value} kind={def.kind} className="w-20 text-right text-[13px] font-medium" />
      <span className="w-16 text-right">
        <DeltaChip delta={delta} size="sm" />
      </span>
      {showRank ? (
        <span className="w-20 text-right">
          <RankLabel rank={delta.rank} />
        </span>
      ) : null}
    </div>
  );
}

/* --- latest post vs baseline ------------------------------------------------ */

const CARD_METRICS: MetricKey[] = [
  "views",
  "engagementRate",
  "shares",
  "saves",
  "followsFromPost",
  "profileVisitRate",
];

export function LatestPostCard({
  post,
  comparison,
  scopeNote,
}: {
  post: PostWithMetrics;
  comparison: PostComparison;
  scopeNote: string;
}) {
  const { baseline } = comparison;
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">Latest post vs baseline</CardTitle>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
            <span className="truncate">{post.label}</span>
            <span aria-hidden>·</span>
            <span className="num">{formatDate(post.postedAt)}</span>
            <Badge>{post.format}</Badge>
          </div>
        </div>
        <Link href={`/posts/${post.id}`} className="shrink-0 text-xs text-accent hover:underline">
          Detail
        </Link>
      </CardHeader>
      <CardBody className="py-2">
        {baseline.forming ? (
          <p className="py-3 text-[13px] text-ink-muted">
            Baseline forming —{" "}
            <span className="num">
              {baseline.measuredCount} of {baseline.window}
            </span>{" "}
            prior {scopeNote}. Values and ranks below are real; there is no average to
            compare them against yet. Set a starting point in{" "}
            <Link href="/settings" className="text-accent hover:underline">
              Settings
            </Link>{" "}
            to get comparisons from the first post.
          </p>
        ) : baseline.seeded ? (
          <p className="py-3 text-[13px] text-ink-muted">
            Compared against <span className="num">{baseline.measuredCount}</span> tracked{" "}
            {scopeNote} plus <span className="num">{baseline.seededCount}</span> slots from your
            starting figures.
          </p>
        ) : null}
        <div className="divide-y divide-line">
          {CARD_METRICS.map((key) => (
            <MetricRow key={key} delta={comparison.deltas[key]} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/* --- next milestone --------------------------------------------------------- */

export function NextMilestoneCard({ next }: { next: NextMilestone | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next milestone</CardTitle>
      </CardHeader>
      <CardBody>
        {next === null ? (
          <p className="text-[13px] text-ink-muted">Every tracked threshold has been passed.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium">{next.label}</span>
              <span className="num text-xs text-ink-muted">
                {formatCompact(next.current)} / {formatCompact(next.target)}
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${Math.max(2, next.progress * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-ink-faint">
              <span className="num">{formatCount(next.target - next.current)}</span> {next.unit} to go
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* --- fresh milestones ------------------------------------------------------- */

/** A record of what just happened. Deliberately not a celebration. */
export function MilestoneBanner({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;
  return (
    <div className="mb-6 rounded-lg border border-line bg-surface">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-2.5">
        <span className="eyebrow">Reached in the last 14 days</span>
        <Link href="/milestones" className="text-xs text-accent hover:underline">
          All milestones
        </Link>
      </div>
      <ul className="divide-y divide-line">
        {milestones.slice(0, 4).map((m) => (
          <li key={m.id} className="flex items-baseline gap-3 px-5 py-2">
            <span className="h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[13px]">{m.label}</span>
            <span className="num shrink-0 text-xs text-ink-faint">{formatDate(m.achievedAt)}</span>
          </li>
        ))}
      </ul>
      {milestones.length > 4 ? (
        <div className="border-t border-line px-5 py-2 text-xs text-ink-faint">
          <span className="num">{milestones.length - 4}</span> more in this window
        </div>
      ) : null}
    </div>
  );
}
