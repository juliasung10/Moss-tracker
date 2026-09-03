import { requireDatabase } from "@/lib/guard.tsx";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input, Textarea } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Table, TD, TH, THead, TR } from "@/components/ui/table.tsx";
import { DeltaChip, Figure, RankLabel } from "@/components/delta.tsx";
import { DeletePost } from "@/components/danger-zone.tsx";
import { TrendLine } from "@/components/charts/trend.tsx";
import { METRIC_CATEGORIES, comparePost, metricValue, metricsIn } from "@/lib/metrics.ts";
import {
  formatAge,
  formatDateFull,
  formatDateTime,
  formatMetric,
  toLocalInputValue,
} from "@/lib/format.ts";
import { getPost, getSettings, listPosts, listSnapshots } from "@/lib/queries.ts";
import { updatePostDetails } from "@/lib/actions.ts";
import { dominantFormat, parseScope, scopeLabel } from "@/lib/scope.ts";
import { POST_FORMATS } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  // A database that is missing or unreachable must explain itself, not crash.
  const blocked = await requireDatabase();
  if (blocked) return blocked;

  const { id } = await params;
  const { scope: rawScope } = await searchParams;
  const scope = parseScope(rawScope);

  const postId = Number(id);
  const post = await getPost(postId);
  if (!post) notFound();

  const posts = await listPosts();
  const snapshots = await listSnapshots(postId);
  const { baselineWindow, startingBaseline } = await getSettings();
  const comparison = comparePost(post, posts, {
    window: baselineWindow,
    scope,
    seed: startingBaseline,
  });
  const scopeNote = scopeLabel(scope, dominantFormat(posts));

  return (
    <div>
      <div className="mb-6">
        <Link href="/posts" className="text-xs text-accent hover:underline">
          ← All posts
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{post.label}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <span className="num">{formatDateFull(post.postedAt)}</span>
              <Badge>{post.format}</Badge>
              <span className="num text-ink-faint">
                {post.snapshotCount} {post.snapshotCount === 1 ? "reading" : "readings"}
              </span>
              {post.url ? (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  Open on Instagram
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              ) : null}
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/add">Add a reading</Link>
          </Button>
        </div>
        {post.notes ? (
          <p className="mt-3 max-w-2xl border-l-2 border-line pl-3 text-[13px] text-ink-muted">
            {post.notes}
          </p>
        ) : null}
      </div>

      {comparison.baseline.forming ? (
        <div className="mb-6 rounded-lg border border-line bg-surface px-5 py-3 text-[13px] text-ink-muted">
          Baseline forming — this post had only{" "}
          <span className="num">{comparison.baseline.sampleSize}</span> of{" "}
          <span className="num">{comparison.baseline.window}</span> prior {scopeNote} to be judged
          against. Values and ranks below are real; the change column is not available.
        </div>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Metric breakdown</CardTitle>
          <span className="text-xs text-ink-faint">
            vs the {baselineWindow} {scopeNote} before it
          </span>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Metric</TH>
              <TH align="right">Value</TH>
              <TH align="right">Baseline</TH>
              <TH align="right">Change</TH>
              <TH align="right">Rank</TH>
            </TR>
          </THead>
          <tbody>
            {METRIC_CATEGORIES.map((category) => (
              <Fragment key={category.key}>
                <TR className="bg-canvas">
                  <TD colSpan={5} className="py-1.5">
                    <span className="eyebrow">{category.label}</span>
                    <span className="ml-2 text-[11px] text-ink-faint">{category.description}</span>
                  </TD>
                </TR>
                {metricsIn(category.key).map((def) => {
                  const delta = comparison.deltas[def.key];
                  return (
                    <TR key={def.key}>
                      <TD className="pl-5 text-ink-muted">{def.label}</TD>
                      <TD align="right">
                        <Figure value={delta.value} kind={def.kind} className="font-medium" />
                      </TD>
                      <TD align="right">
                        <span className="num text-ink-faint">
                          {formatMetric(delta.baseline, def.kind)}
                        </span>
                      </TD>
                      <TD align="right">
                        <DeltaChip delta={delta} size="sm" />
                      </TD>
                      <TD align="right">
                        <RankLabel rank={delta.rank} />
                      </TD>
                    </TR>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </Card>

      {snapshots.length > 1 ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>How views matured</CardTitle>
            </CardHeader>
            <CardBody className="pr-3">
              <TrendLine
                points={snapshots.map((s) => ({ x: s.capturedAt, value: s.views }))}
                kind="count"
                name="Views"
                height={160}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>How engagement rate moved</CardTitle>
            </CardHeader>
            <CardBody className="pr-3">
              <TrendLine
                points={snapshots.map((s) => ({
                  x: s.capturedAt,
                  value: metricValue(s, "engagementRate"),
                }))}
                kind="rate"
                name="Engagement rate"
                height={160}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Snapshot history</CardTitle>
          <span className="text-xs text-ink-faint">Oldest first</span>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Captured</TH>
              <TH align="right">Age</TH>
              <TH align="right">Views</TH>
              <TH align="right">Reach</TH>
              <TH align="right">Likes</TH>
              <TH align="right">Shares</TH>
              <TH align="right">Saves</TH>
              <TH align="right">Follows</TH>
              <TH align="right">Eng</TH>
              <TH align="right">Followers</TH>
            </TR>
          </THead>
          <tbody>
            {snapshots.map((s) => (
              <TR key={s.id}>
                <TD className="num whitespace-nowrap text-ink-muted">{formatDateTime(s.capturedAt)}</TD>
                <TD align="right" className="num text-ink-faint">
                  {formatAge(post.postedAt, s.capturedAt)}
                </TD>
                <TD align="right" className="num">{s.views.toLocaleString("en-US")}</TD>
                <TD align="right" className="num">{s.reach.toLocaleString("en-US")}</TD>
                <TD align="right" className="num">{s.likes.toLocaleString("en-US")}</TD>
                <TD align="right" className="num">{s.shares.toLocaleString("en-US")}</TD>
                <TD align="right" className="num">{s.saves.toLocaleString("en-US")}</TD>
                <TD align="right" className="num">{s.followsFromPost.toLocaleString("en-US")}</TD>
                <TD align="right" className="num">
                  {formatMetric(metricValue(s, "engagementRate"), "rate")}
                </TD>
                <TD align="right" className="num">{s.followerCountAfter.toLocaleString("en-US")}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit post</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updatePostDetails} className="space-y-4">
            <input type="hidden" name="id" value={post.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="label">Label</Label>
                <Input id="label" name="label" defaultValue={post.label} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="format">Format</Label>
                <Select id="format" name="format" defaultValue={post.format}>
                  {POST_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postedAt">Posted at</Label>
                <Input
                  id="postedAt"
                  type="datetime-local"
                  name="postedAt"
                  defaultValue={toLocalInputValue(new Date(post.postedAt))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="url">Link</Label>
                <Input id="url" name="url" defaultValue={post.url ?? ""} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={post.notes ?? ""} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <Button type="submit" size="sm">
                Save changes
              </Button>
              <DeletePost id={post.id} label={post.label} snapshotCount={post.snapshotCount} />
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
