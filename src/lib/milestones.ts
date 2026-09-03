/**
 * Milestone detection.
 *
 * Pure and idempotent: given the full set of posts, it returns every milestone the
 * data *deserves*, each carrying a stable `key`. The caller inserts them with
 * INSERT OR IGNORE against a UNIQUE key column, so re-running detection after every
 * save can never fire the same milestone twice.
 *
 * Because detection re-derives from scratch, a milestone earned before the app
 * existed (seed data, a CSV import) still lands on the timeline with the date it
 * was actually earned, not the date it was noticed.
 */

import { formatCompact, formatCount, formatPercent } from "./format.ts";
import {
  chronological,
  comparablePosts,
  metricValue,
  trailingBaseline,
  type BaselineSeed,
  type MetricKey,
} from "./metrics.ts";
import type { MilestoneType, PostFormat, PostWithMetrics } from "./types.ts";

export interface MilestoneCandidate {
  key: string;
  type: MilestoneType;
  label: string;
  achievedAt: string;
  postId: number | null;
  metric: string | null;
  value: number;
}

export const FOLLOWER_THRESHOLDS = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
export const CUMULATIVE_VIEW_THRESHOLDS = [10000, 50000, 100000, 500000, 1000000];
export const FIRST_CROSS_VIEW_THRESHOLDS = [1000, 5000, 10000, 50000, 100000];
export const PERSONAL_BEST_METRICS: MetricKey[] = [
  "views",
  "shares",
  "saves",
  "followsFromPost",
  "engagementRate",
];
export const STREAK_LENGTH = 3;
/** Trailing-average views are banded in thousands: 3,200 sits in band 3. */
export const BASELINE_BAND_SIZE = 1000;

const METRIC_LABEL: Record<string, string> = {
  views: "views",
  shares: "shares",
  saves: "saves",
  followsFromPost: "follows from post",
  engagementRate: "engagement rate",
};

function formatMetricValue(key: MetricKey, value: number): string {
  return key === "engagementRate" ? formatPercent(value) : formatCount(value);
}

export interface DetectOptions {
  /** The declared starting baseline, so comparisons exist from the first post. */
  seed?: BaselineSeed | null;
  /**
   * Follower count when tracking began. Thresholds already passed by then are not
   * milestones — you did not reach 1k followers today, you reached it before the
   * app existed.
   */
  startingFollowers?: number | null;
}

/**
 * Every milestone the current data supports, oldest first.
 *
 * `window` is the baseline window N, needed by the streak and baseline-band rules.
 */
export function detectMilestones(
  posts: PostWithMetrics[],
  window: number,
  opts: DetectOptions = {},
): MilestoneCandidate[] {
  const ordered = chronological(posts);
  const seed = opts.seed ?? null;
  const found: MilestoneCandidate[] = [];

  found.push(...followerMilestones(ordered, opts.startingFollowers ?? null));
  found.push(...cumulativeViewMilestones(ordered));
  found.push(...firstCrossMilestones(ordered));
  found.push(...personalBestMilestones(ordered));
  found.push(...streakMilestones(ordered, window, seed));
  found.push(...baselineBandMilestones(ordered, window, seed));

  return found.sort((a, b) => Date.parse(a.achievedAt) - Date.parse(b.achievedAt));
}

/**
 * Follower thresholds. Attributed to the earliest snapshot that reports a count at
 * or above the threshold, so importing history backfills them at the right dates.
 */
function followerMilestones(
  ordered: PostWithMetrics[],
  startingFollowers: number | null,
): MilestoneCandidate[] {
  const readings = ordered
    .map((p) => ({ at: p.current.capturedAt, count: p.current.followerCountAfter, postId: p.id }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const out: MilestoneCandidate[] = [];
  for (const threshold of FOLLOWER_THRESHOLDS) {
    // Already passed before tracking began — not something posting achieved.
    if (startingFollowers !== null && threshold <= startingFollowers) continue;
    const hit = readings.find((r) => r.count >= threshold);
    if (!hit) continue;
    out.push({
      key: `follower:${threshold}`,
      type: "follower_threshold",
      label: `${formatCompact(threshold)} followers`,
      achievedAt: hit.at,
      postId: hit.postId,
      metric: "followerCount",
      value: threshold,
    });
  }
  return out;
}

/** Cumulative views across the account, attributed to the post that tipped it over. */
function cumulativeViewMilestones(ordered: PostWithMetrics[]): MilestoneCandidate[] {
  const out: MilestoneCandidate[] = [];
  const remaining = new Set(CUMULATIVE_VIEW_THRESHOLDS);
  let running = 0;
  for (const post of ordered) {
    running += post.current.views;
    for (const threshold of [...remaining]) {
      if (running < threshold) continue;
      remaining.delete(threshold);
      out.push({
        key: `cumviews:${threshold}`,
        type: "cumulative_views",
        label: `${formatCompact(threshold)} tracked views`,
        achievedAt: post.current.capturedAt,
        postId: post.id,
        metric: "views",
        value: threshold,
      });
    }
  }
  return out;
}

/** The first post ever to pass each view threshold. Fires once, for one post. */
function firstCrossMilestones(ordered: PostWithMetrics[]): MilestoneCandidate[] {
  const out: MilestoneCandidate[] = [];
  for (const threshold of FIRST_CROSS_VIEW_THRESHOLDS) {
    const hit = ordered.find((p) => p.current.views >= threshold);
    if (!hit) continue;
    out.push({
      key: `firstcross:${threshold}`,
      type: "first_to_cross",
      label: `First post past ${formatCompact(threshold)} views`,
      achievedAt: hit.current.capturedAt,
      postId: hit.id,
      metric: "views",
      value: threshold,
    });
  }
  return out;
}

/**
 * Records. A new best is a genuinely new milestone, so the key includes the post
 * that took the crown — the record can be broken repeatedly without re-firing for
 * the same post. The very first post to carry a metric sets no record: there was
 * nothing to beat.
 */
function personalBestMilestones(ordered: PostWithMetrics[]): MilestoneCandidate[] {
  const out: MilestoneCandidate[] = [];
  for (const key of PERSONAL_BEST_METRICS) {
    let best: number | null = null;
    for (const post of ordered) {
      const value = metricValue(post.current, key);
      if (value === null) continue;
      if (best === null) {
        best = value;
        continue;
      }
      if (value > best) {
        best = value;
        out.push({
          key: `pb:${key}:${post.id}`,
          type: "personal_best",
          label: `Best ${METRIC_LABEL[key] ?? key}: ${formatMetricValue(key, value)}`,
          achievedAt: post.current.capturedAt,
          postId: post.id,
          metric: key,
          value,
        });
      }
    }
  }
  return out;
}

/**
 * Three consecutive posts beating their own trailing baseline on views.
 *
 * Runs are counted within a format — three strong Reels in a row is the signal;
 * a Reel, a carousel and a Reel is not a sequence of anything. A post whose
 * baseline is still forming can neither extend nor break a run: it is skipped,
 * because "above baseline" has no answer yet.
 *
 * Fires on the post that completes the run of three. A longer run does not re-fire.
 */
function streakMilestones(
  ordered: PostWithMetrics[],
  window: number,
  seed: BaselineSeed | null,
): MilestoneCandidate[] {
  const out: MilestoneCandidate[] = [];
  const formats = [...new Set(ordered.map((p) => p.format))] as PostFormat[];

  for (const format of formats) {
    const inFormat = comparablePosts(ordered, format, "same");
    let run = 0;
    for (let i = 0; i < inFormat.length; i++) {
      const post = inFormat[i];
      const baseline = trailingBaseline(inFormat.slice(0, i), window, seed);
      if (baseline.forming || baseline.values.views === null) continue;
      if (post.current.views > baseline.values.views) {
        run += 1;
        if (run === STREAK_LENGTH) {
          out.push({
            key: `streak:${post.id}`,
            type: "streak",
            label: `${STREAK_LENGTH} ${format}s in a row above baseline`,
            achievedAt: post.current.capturedAt,
            postId: post.id,
            metric: "views",
            value: STREAK_LENGTH,
          });
        }
      } else {
        run = 0;
      }
    }
  }
  return out;
}

/**
 * The baseline itself moving up a 1k band — the growth signal, independent of any
 * single post. Only fires once the window is full, which also keeps thin formats
 * (a handful of carousels) from generating noise.
 */
function baselineBandMilestones(
  ordered: PostWithMetrics[],
  window: number,
  seed: BaselineSeed | null,
): MilestoneCandidate[] {
  const out: MilestoneCandidate[] = [];
  const formats = [...new Set(ordered.map((p) => p.format))] as PostFormat[];
  // Start above the band your declared baseline already sits in, so saying "my
  // normal is 5k views" does not immediately award you a 5k baseline milestone.
  const startingBand = seed ? Math.floor(seed.views / BASELINE_BAND_SIZE) : 0;

  for (const format of formats) {
    const inFormat = comparablePosts(ordered, format, "same");
    let highestBand = startingBand;
    for (let i = 0; i < inFormat.length; i++) {
      const baseline = trailingBaseline(inFormat.slice(0, i + 1), window, seed);
      const avg = baseline.values.views;
      if (baseline.forming || avg === null) continue;
      const band = Math.floor(avg / BASELINE_BAND_SIZE);
      if (band <= highestBand) continue;
      highestBand = band;
      out.push({
        key: `baselineband:${format}:${band}`,
        type: "baseline_band",
        label: `Baseline ${format} views crossed ${formatCompact(band * BASELINE_BAND_SIZE)}`,
        achievedAt: inFormat[i].current.capturedAt,
        postId: inFormat[i].id,
        metric: "views",
        value: band * BASELINE_BAND_SIZE,
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Progress toward what's next                                                */
/* -------------------------------------------------------------------------- */

export interface NextMilestone {
  label: string;
  type: MilestoneType;
  current: number;
  target: number;
  /** 0..1 */
  progress: number;
  unit: "followers" | "views";
}

/**
 * The nearest thing still to reach, for the dashboard progress bar: whichever of
 * the next follower threshold and the next cumulative-view threshold is closer to
 * done. Returns null once both ladders are exhausted.
 */
export function nextMilestone(
  followerCount: number | null,
  totalViews: number,
): NextMilestone | null {
  const candidates: NextMilestone[] = [];

  const nextFollower = FOLLOWER_THRESHOLDS.find((t) => (followerCount ?? 0) < t);
  if (nextFollower !== undefined && followerCount !== null) {
    candidates.push({
      label: `${formatCompact(nextFollower)} followers`,
      type: "follower_threshold",
      current: followerCount,
      target: nextFollower,
      progress: clamp01(followerCount / nextFollower),
      unit: "followers",
    });
  }

  const nextViews = CUMULATIVE_VIEW_THRESHOLDS.find((t) => totalViews < t);
  if (nextViews !== undefined) {
    candidates.push({
      label: `${formatCompact(nextViews)} total views`,
      type: "cumulative_views",
      current: totalViews,
      target: nextViews,
      progress: clamp01(totalViews / nextViews),
      unit: "views",
    });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.progress - a.progress)[0];
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Milestones earned within the last `days` days — the dashboard banner. */
export function freshMilestones<T extends { achievedAt: string }>(
  milestones: T[],
  now: Date = new Date(),
  days = 14,
): T[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return milestones
    .filter((m) => {
      const t = Date.parse(m.achievedAt);
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime();
    })
    .sort((a, b) => Date.parse(b.achievedAt) - Date.parse(a.achievedAt));
}
