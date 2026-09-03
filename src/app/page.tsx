import { requireDatabase } from "@/lib/guard.tsx";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DriftChart, TrendLine } from "@/components/charts/trend.tsx";
import {
  BaselineTile,
  LatestPostCard,
  MilestoneBanner,
  NextMilestoneCard,
} from "@/components/dashboard/blocks.tsx";
import { ProgressCard } from "@/components/dashboard/progress-card.tsx";
import {
  HEADLINE_METRICS,
  baselineDrift,
  comparablePosts,
  comparePost,
  cumulativeViews,
  latestFollowerCount,
  metricDef,
  progressVsStart,
  trailingBaseline,
} from "@/lib/metrics.ts";
import { freshMilestones, nextMilestone } from "@/lib/milestones.ts";
import { followerSeries, getSettings, listMilestones, listPosts } from "@/lib/queries.ts";
import { dominantFormat, parseScope, scopeLabel } from "@/lib/scope.ts";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  // A database that is missing or unreachable must explain itself, not crash.
  const blocked = await requireDatabase();
  if (blocked) return blocked;

  const { scope: rawScope } = await searchParams;
  const scope = parseScope(rawScope);

  const posts = await listPosts();
  const { baselineWindow, startingBaseline, trackingStartedAt } = await getSettings();

  if (posts.length === 0) return <EmptyDashboard hasStartingPoint={startingBaseline !== null} />;

  const format = dominantFormat(posts);
  const scopeNote = scopeLabel(scope, format);
  const pool = comparablePosts(posts, format, scope);

  const baseline = trailingBaseline(pool, baselineWindow, startingBaseline);
  const latest = posts[0];
  const comparison = comparePost(latest, posts, {
    window: baselineWindow,
    scope,
    seed: startingBaseline,
  });

  const progress = progressVsStart(posts, startingBaseline, {
    window: baselineWindow,
    scope,
    format,
  });

  const drift = baselineDrift(posts, "views", {
    window: baselineWindow,
    scope,
    format,
    seed: startingBaseline,
  });
  const followers = await followerSeries();
  const milestones = await listMilestones();
  const fresh = freshMilestones(milestones);
  const next = nextMilestone(latestFollowerCount(posts), cumulativeViews(posts));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            Benchmarked against the last <span className="num">{baselineWindow}</span> {scopeNote}.
          </p>
        </div>
        <Segmented
          options={[
            { label: `${format[0].toUpperCase()}${format.slice(1)}s only`, href: "/", active: scope === "same" },
            { label: "All formats", href: "/?scope=all", active: scope === "all" },
          ]}
        />
      </div>

      <MilestoneBanner milestones={fresh} />

      {/* Current baseline — the number every comparison is made against. */}
      <Card className="mb-6">
        <div className="flex flex-col divide-y divide-line sm:flex-row sm:divide-x sm:divide-y-0">
          {HEADLINE_METRICS.map((key) => (
            <BaselineTile
              key={key}
              metricKey={key}
              baseline={baseline}
              trailing={baselineDrift(posts, key, {
                window: baselineWindow,
                scope,
                format,
                seed: startingBaseline,
              }).map((d) => d.trailing)}
              scopeNote={scopeNote}
            />
          ))}
        </div>
      </Card>

      {progress ? (
        <div className="mb-6">
          <ProgressCard
            rows={progress.rows}
            measuredCount={progress.measuredCount}
            window={baselineWindow}
            startedAt={trackingStartedAt}
            scopeNote={scopeNote}
          />
        </div>
      ) : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <LatestPostCard post={latest} comparison={comparison} scopeNote={scopeNote} />
        <div className="flex flex-col gap-6">
          <NextMilestoneCard next={next} />
          <Card>
            <CardHeader>
              <CardTitle>Follower growth</CardTitle>
              <span className="num text-xs text-ink-faint">
                {latestFollowerCount(posts)?.toLocaleString("en-US") ?? "—"} now
              </span>
            </CardHeader>
            <CardBody className="pr-3">
              <TrendLine
                points={followers.map((f) => ({ x: f.capturedAt, value: f.followers }))}
                kind="count"
                name="Followers"
                height={150}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Baseline drift — {metricDef("views").label.toLowerCase()}</CardTitle>
            <p className="mt-0.5 text-xs text-ink-faint">
              How the normal itself is moving. The line, not the dots, is the growth signal.
            </p>
          </div>
          <Link href="/posts" className="shrink-0 text-xs text-accent hover:underline">
            All posts
          </Link>
        </CardHeader>
        <CardBody className="pr-3">
          <DriftChart
            data={drift.map((d) => ({
              x: d.postedAt,
              label: d.label,
              value: d.value,
              trailing: d.trailing,
            }))}
            kind="count"
            window={baselineWindow}
            startingValue={startingBaseline ? startingBaseline.views : null}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function EmptyDashboard({ hasStartingPoint }: { hasStartingPoint: boolean }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight">
        {hasStartingPoint ? "Ready for your first post" : "Set your starting point"}
      </h1>
      {hasStartingPoint ? (
        <p className="mt-2 text-[13px] text-ink-muted">
          Your current engagement level is recorded. Log the next Reel you post and it will be
          measured against it straight away — no waiting for a baseline to build up.
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-ink-muted">
          Tell the tracker what a normal post does for you right now. That becomes the line every
          future Reel is judged against, so the very first post you log gets a real comparison
          instead of a shrug.
        </p>
      )}
      <div className="mt-5 flex items-center justify-center gap-2">
        {hasStartingPoint ? (
          <>
            <Button asChild>
              <Link href="/add">Log a post</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings">Edit starting point</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild>
              <Link href="/settings">Set starting point</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/add">Skip and log a post</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
