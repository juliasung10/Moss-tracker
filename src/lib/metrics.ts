/**
 * Metric, baseline, delta and rank calculation.
 *
 * This module is pure: it takes posts and returns numbers. It never touches the
 * database, the clock, or the DOM, which is what makes it testable.
 *
 * The three rules that matter:
 *  1. A post is NEVER part of its own baseline. It is compared against the N posts
 *     that came strictly before it. Including it would drag the baseline toward the
 *     post and shrink every delta.
 *  2. Fewer than N prior posts means there is no baseline yet — not a smaller one.
 *     We report `forming` and null values rather than inventing an average.
 *  3. Nothing is ever divided by zero. A rate on a post with 0 views is null, which
 *     the UI renders as an em dash.
 */

import type { PostFormat, PostWithMetrics, RawMetrics } from "./types.ts";

export type MetricKey =
  | "views"
  | "reach"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "profileVisits"
  | "followsFromPost"
  | "engagementRate"
  | "shareRate"
  | "saveRate"
  | "followConversion"
  | "profileVisitRate";

export type MetricKind = "count" | "rate";

/**
 * What a metric is actually telling you. Three questions, in the order they matter:
 * did people see it, did it land, and did it grow the account.
 */
export type MetricCategory = "reach" | "engagement" | "growth";

export const METRIC_CATEGORIES: {
  key: MetricCategory;
  label: string;
  /** What Instagram calls this section, so the entry form matches the screen. */
  insightsLabel: string;
  description: string;
}[] = [
  {
    key: "reach",
    label: "Reach",
    insightsLabel: "Reach",
    description: "How many people the post got in front of.",
  },
  {
    key: "engagement",
    label: "Engagement",
    insightsLabel: "Interactions",
    description: "What the people who saw it did about it.",
  },
  {
    key: "growth",
    label: "Growth",
    insightsLabel: "Profile activity",
    description: "Whether it turned viewers into followers.",
  },
];

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Column header in dense tables. */
  short: string;
  kind: MetricKind;
  category: MetricCategory;
  compute: (m: RawMetrics) => number | null;
}

/** Guard for every derived metric: no division by zero, ever. */
function rate(numerator: number, views: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null;
  const r = numerator / views;
  return Number.isFinite(r) ? r : null;
}

export const METRICS: MetricDef[] = [
  { key: "views", label: "Views", short: "Views", category: "reach", kind: "count", compute: (m) => m.views },
  { key: "reach", label: "Reach", short: "Reach", category: "reach", kind: "count", compute: (m) => m.reach },
  { key: "likes", label: "Likes", short: "Likes", category: "engagement", kind: "count", compute: (m) => m.likes },
  { key: "comments", label: "Comments", short: "Comm", category: "engagement", kind: "count", compute: (m) => m.comments },
  { key: "shares", label: "Shares", short: "Shares", category: "engagement", kind: "count", compute: (m) => m.shares },
  { key: "saves", label: "Saves", short: "Saves", category: "engagement", kind: "count", compute: (m) => m.saves },
  {
    key: "profileVisits",
    label: "Profile visits",
    short: "Visits",
    category: "growth", kind: "count",
    compute: (m) => m.profileVisits,
  },
  {
    key: "followsFromPost",
    label: "Follows from post",
    short: "Follows",
    category: "growth", kind: "count",
    compute: (m) => m.followsFromPost,
  },
  {
    key: "engagementRate",
    label: "Engagement rate",
    short: "Eng",
    category: "engagement", kind: "rate",
    compute: (m) => rate(m.likes + m.comments + m.shares + m.saves, m.views),
  },
  {
    key: "shareRate",
    label: "Share rate",
    short: "Share%",
    category: "engagement", kind: "rate",
    compute: (m) => rate(m.shares, m.views),
  },
  {
    key: "saveRate",
    label: "Save rate",
    short: "Save%",
    category: "engagement", kind: "rate",
    compute: (m) => rate(m.saves, m.views),
  },
  {
    key: "followConversion",
    label: "Follow conversion",
    short: "Conv",
    category: "growth", kind: "rate",
    compute: (m) => rate(m.followsFromPost, m.views),
  },
  {
    key: "profileVisitRate",
    label: "Profile visit rate",
    short: "Visit%",
    category: "growth", kind: "rate",
    compute: (m) => rate(m.profileVisits, m.views),
  },
];

export const METRIC_KEYS: MetricKey[] = METRICS.map((m) => m.key);

const METRIC_BY_KEY = new Map<MetricKey, MetricDef>(METRICS.map((m) => [m.key, m]));

export function metricDef(key: MetricKey): MetricDef {
  const def = METRIC_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown metric: ${key}`);
  return def;
}

/** The headline three, used for the dashboard baseline block. */
export const HEADLINE_METRICS: MetricKey[] = ["views", "engagementRate", "followsFromPost"];

/** The metrics in one category, in registry order. */
export function metricsIn(category: MetricCategory): MetricDef[] {
  return METRICS.filter((m) => m.category === category);
}

/**
 * The columns of the all-posts table. Kept short so the table stays scannable.
 * Lives here rather than beside the table component because server components read
 * it too, and a "use client" module only ever hands the server a client reference.
 */
export const TABLE_METRICS: MetricKey[] = [
  "views",
  "engagementRate",
  "shares",
  "saves",
  "followsFromPost",
];

export function metricValue(m: RawMetrics, key: MetricKey): number | null {
  return metricDef(key).compute(m);
}

export function metricValues(m: RawMetrics): MetricValues {
  const out = {} as MetricValues;
  for (const def of METRICS) out[def.key] = def.compute(m);
  return out;
}

export type MetricValues = Record<MetricKey, number | null>;

/* -------------------------------------------------------------------------- */
/* Ordering and comparable sets                                               */
/* -------------------------------------------------------------------------- */

export type FormatScope = "same" | "all";

/** Chronological, oldest first. Ties broken by id so ordering is total and stable. */
export function chronological(posts: PostWithMetrics[]): PostWithMetrics[] {
  return [...posts].sort((a, b) => {
    const t = Date.parse(a.postedAt) - Date.parse(b.postedAt);
    return t !== 0 ? t : a.id - b.id;
  });
}

function isBefore(a: PostWithMetrics, b: PostWithMetrics): boolean {
  const ta = Date.parse(a.postedAt);
  const tb = Date.parse(b.postedAt);
  return ta !== tb ? ta < tb : a.id < b.id;
}

/**
 * The set a post is judged against. Reels compare to Reels unless the caller
 * asks for "all formats" — comparing a Reel to a carousel is comparing two
 * different products.
 */
export function comparablePosts(
  posts: PostWithMetrics[],
  format: PostFormat,
  scope: FormatScope,
): PostWithMetrics[] {
  return scope === "all" ? posts : posts.filter((p) => p.format === format);
}

/** Comparable posts published strictly before `post`, excluding `post` itself. */
export function priorPosts(
  post: PostWithMetrics,
  posts: PostWithMetrics[],
  scope: FormatScope,
): PostWithMetrics[] {
  return chronological(
    comparablePosts(posts, post.format, scope).filter((p) => p.id !== post.id && isBefore(p, post)),
  );
}

/* -------------------------------------------------------------------------- */
/* Baselines                                                                  */
/* -------------------------------------------------------------------------- */

export interface Baseline {
  /** N asked for. */
  window: number;
  /** How many slots the average was taken over. */
  sampleSize: number;
  /** True when there is neither enough history nor a starting baseline to stand in. */
  forming: boolean;
  /** Real posts that went into it. */
  measuredCount: number;
  /** Slots filled by the declared starting baseline instead of a real post. */
  seededCount: number;
  /** True while any slot is still coming from the starting baseline. */
  seeded: boolean;
  values: MetricValues;
  /** Per metric, how many of the sampled slots had a defined value. */
  counts: Record<MetricKey, number>;
}

/**
 * A declared "this is my normal right now" figure set — one typical post, entered
 * by hand in Settings. It stands in for the posts we have not measured yet.
 */
export type BaselineSeed = RawMetrics;

/**
 * Wrap the seed as a synthetic post so it flows through the same averaging code as
 * a real one. Nothing outside this module ever sees these.
 */
function seedSlot(seed: BaselineSeed, i: number): PostWithMetrics {
  return {
    id: -1 - i,
    postedAt: new Date(0).toISOString(),
    label: "starting baseline",
    url: null,
    format: "reel",
    notes: null,
    snapshotCount: 1,
    current: { id: -1 - i, postId: -1 - i, capturedAt: new Date(0).toISOString(), followerCountAfter: 0, ...seed },
  };
}

function emptyValues(): MetricValues {
  const out = {} as MetricValues;
  for (const k of METRIC_KEYS) out[k] = null;
  return out;
}

function emptyCounts(): Record<MetricKey, number> {
  const out = {} as Record<MetricKey, number>;
  for (const k of METRIC_KEYS) out[k] = 0;
  return out;
}

/**
 * Mean of each metric across the given posts.
 *
 * Rates are averaged per post (each post counts once), not recomputed from summed
 * totals. A post that got 40 views and a great save rate should not be drowned out
 * by one that got 40,000 — this baseline describes a typical post, not a typical view.
 * Posts whose value is null (a rate on 0 views) are skipped for that metric only.
 */
export function meanOf(posts: PostWithMetrics[]): { values: MetricValues; counts: Record<MetricKey, number> } {
  const sums = emptyCounts();
  const counts = emptyCounts();
  for (const post of posts) {
    for (const def of METRICS) {
      const v = def.compute(post.current);
      if (v === null || !Number.isFinite(v)) continue;
      sums[def.key] += v;
      counts[def.key] += 1;
    }
  }
  const values = emptyValues();
  for (const k of METRIC_KEYS) values[k] = counts[k] > 0 ? sums[k] / counts[k] : null;
  return { values, counts };
}

/**
 * Trailing average over the most recent `window` posts.
 *
 * Any slot not yet filled by a real post is filled by `seed` — the engagement level
 * you declared as your current normal when you started tracking. So a comparison is
 * available from the very first post, and the declared figures fade out slot by slot
 * as real posts replace them, reaching a purely measured baseline at post N.
 *
 * With no seed and fewer than N posts this reports `forming` with null values, so the
 * UI says "baseline forming — 4 of 10 posts" rather than quoting an average of four.
 */
export function trailingBaseline(
  posts: PostWithMetrics[],
  window: number,
  seed: BaselineSeed | null = null,
): Baseline {
  const ordered = chronological(posts);
  const sample = ordered.slice(-window);
  const shortfall = window - sample.length;

  if (shortfall <= 0) {
    const { values, counts } = meanOf(sample);
    return {
      window,
      sampleSize: sample.length,
      forming: false,
      measuredCount: sample.length,
      seededCount: 0,
      seeded: false,
      values,
      counts,
    };
  }

  if (!seed) {
    return {
      window,
      sampleSize: sample.length,
      forming: true,
      measuredCount: sample.length,
      seededCount: 0,
      seeded: false,
      values: emptyValues(),
      counts: emptyCounts(),
    };
  }

  const filler = Array.from({ length: shortfall }, (_, i) => seedSlot(seed, i));
  const { values, counts } = meanOf([...filler, ...sample]);
  return {
    window,
    sampleSize: window,
    forming: false,
    measuredCount: sample.length,
    seededCount: shortfall,
    seeded: true,
    values,
    counts,
  };
}

/** Average across every post given. Never "forming" — an average of 3 posts is a real average of 3 posts. */
export function allTimeBaseline(posts: PostWithMetrics[]): Baseline {
  const { values, counts } = meanOf(posts);
  return {
    window: posts.length,
    sampleSize: posts.length,
    forming: false,
    measuredCount: posts.length,
    seededCount: 0,
    seeded: false,
    values,
    counts,
  };
}

/* -------------------------------------------------------------------------- */
/* Deltas and ranks                                                           */
/* -------------------------------------------------------------------------- */

/** Inside ±5% of baseline counts as holding steady, and renders grey. */
export const FLAT_BAND = 0.05;

export type Direction = "up" | "down" | "flat" | "unknown";

export interface Rank {
  /** 1 = best. Ties share the better position. */
  position: number;
  /** How many posts had a comparable value. */
  of: number;
}

export interface MetricDelta {
  key: MetricKey;
  value: number | null;
  baseline: number | null;
  absChange: number | null;
  /** Fractional, not percentage points: 0.23 means +23%. Null if baseline is 0 or absent. */
  pctChange: number | null;
  direction: Direction;
  rank: Rank | null;
}

export type DeltaSet = Record<MetricKey, MetricDelta>;

export function deltaFor(
  key: MetricKey,
  value: number | null,
  baseline: number | null,
  rank: Rank | null = null,
): MetricDelta {
  if (value === null || baseline === null) {
    return { key, value, baseline, absChange: null, pctChange: null, direction: "unknown", rank };
  }
  const absChange = value - baseline;
  // A zero baseline has no meaningful percentage — 3 from 0 is not "+300%", it is
  // undefined. Report the absolute change and leave the percentage null.
  const pctChange = baseline === 0 ? null : absChange / baseline;
  let direction: Direction;
  if (pctChange === null) {
    direction = absChange > 0 ? "up" : absChange < 0 ? "down" : "flat";
  } else if (Math.abs(pctChange) <= FLAT_BAND) {
    direction = "flat";
  } else {
    direction = pctChange > 0 ? "up" : "down";
  }
  return { key, value, baseline, absChange, pctChange, direction, rank };
}

/**
 * Where `value` places among `pool`. Higher is better for every metric we track.
 * Nulls are excluded from the pool rather than treated as zero.
 */
export function rankOf(value: number | null, pool: (number | null)[]): Rank | null {
  if (value === null) return null;
  const defined = pool.filter((v): v is number => v !== null && Number.isFinite(v));
  if (defined.length === 0) return null;
  const better = defined.filter((v) => v > value).length;
  return { position: better + 1, of: defined.length };
}

export interface PostComparison {
  postId: number;
  scope: FormatScope;
  /** Trailing baseline of the N posts before this one. */
  baseline: Baseline;
  /** Average of every comparable post before this one. */
  allTime: Baseline;
  deltas: DeltaSet;
  /** Metrics that came in above baseline, best margin first. Empty while forming. */
  beat: MetricKey[];
  /** Metrics that came in below baseline, worst margin first. */
  missed: MetricKey[];
}

/**
 * Compare one post to the posts that came before it.
 *
 * Ranks are computed against every comparable post in `posts` (including this one —
 * a post is part of the all-time leaderboard it appears on), while the baseline uses
 * only prior posts (a post is never part of its own average).
 */
export function comparePost(
  post: PostWithMetrics,
  posts: PostWithMetrics[],
  opts: { window: number; scope?: FormatScope; seed?: BaselineSeed | null },
): PostComparison {
  const scope = opts.scope ?? "same";
  const prior = priorPosts(post, posts, scope);
  const baseline = trailingBaseline(prior, opts.window, opts.seed ?? null);
  const allTime = allTimeBaseline(prior);
  const pool = comparablePosts(posts, post.format, scope);

  const deltas = {} as DeltaSet;
  for (const def of METRICS) {
    const value = def.compute(post.current);
    const rank = rankOf(value, pool.map((p) => def.compute(p.current)));
    deltas[def.key] = deltaFor(def.key, value, baseline.values[def.key], rank);
  }

  const byMargin = (dir: Direction) =>
    METRIC_KEYS.filter((k) => deltas[k].direction === dir).sort((a, b) => {
      const pa = deltas[a].pctChange ?? 0;
      const pb = deltas[b].pctChange ?? 0;
      return dir === "up" ? pb - pa : pa - pb;
    });

  return { postId: post.id, scope, baseline, allTime, deltas, beat: byMargin("up"), missed: byMargin("down") };
}

/* -------------------------------------------------------------------------- */
/* Baseline drift                                                             */
/* -------------------------------------------------------------------------- */

export interface DriftPoint {
  postId: number;
  /** The post whose position in the timeline this trailing average sits at. */
  postedAt: string;
  label: string;
  /** The post's own value, for plotting against the rolling line. */
  value: number | null;
  /** Trailing average of the N posts up to and including this one. */
  trailing: number | null;
}

/**
 * The rolling average over time — how the normal itself is moving.
 *
 * Unlike `comparePost`, each point INCLUDES its own post: this is "what the last N
 * posts averaged as of this post", the growth signal, not a fairness comparison.
 * Points before the window fills carry a null trailing value so the line simply
 * starts at post N instead of ramping up from a partial average.
 */
export function baselineDrift(
  posts: PostWithMetrics[],
  key: MetricKey,
  opts: { window: number; scope?: FormatScope; format?: PostFormat; seed?: BaselineSeed | null },
): DriftPoint[] {
  const scope = opts.scope ?? "same";
  const pool =
    scope === "all" || !opts.format ? posts : comparablePosts(posts, opts.format, scope);
  const ordered = chronological(pool);
  const def = metricDef(key);
  return ordered.map((post, i) => {
    const windowPosts = ordered.slice(Math.max(0, i + 1 - opts.window), i + 1);
    const trailing = trailingBaseline(windowPosts, opts.window, opts.seed ?? null).values[key];
    return {
      postId: post.id,
      postedAt: post.postedAt,
      label: post.label,
      value: def.compute(post.current),
      trailing,
    };
  });
}

/** Total views across every post's current numbers. */
export function cumulativeViews(posts: PostWithMetrics[]): number {
  return posts.reduce((sum, p) => sum + p.current.views, 0);
}

/** Latest known follower count, by most recent snapshot capture. */
export function latestFollowerCount(posts: PostWithMetrics[]): number | null {
  let best: { at: number; value: number } | null = null;
  for (const p of posts) {
    const at = Date.parse(p.current.capturedAt);
    if (!best || at > best.at) best = { at, value: p.current.followerCountAfter };
  }
  return best ? best.value : null;
}

/* -------------------------------------------------------------------------- */
/* Progress against the starting baseline                                     */
/* -------------------------------------------------------------------------- */

export interface Progress {
  key: MetricKey;
  /** What you declared as normal when you started tracking. */
  starting: number | null;
  /** What your tracked posts actually average now. */
  current: number | null;
  delta: MetricDelta;
}

/**
 * The average across measured posts only — deliberately excluding the starting
 * baseline, so "where I am now" is never partly made of "where I said I was".
 */
export function measuredAverage(
  posts: PostWithMetrics[],
  window: number,
): { values: MetricValues; count: number } {
  const sample = chronological(posts).slice(-window);
  return { values: meanOf(sample).values, count: sample.length };
}

/**
 * Has posting actually moved the numbers?
 *
 * Compares what your tracked posts average now against the engagement level you
 * declared when you started. Both sides are real: the left is your own figure, the
 * right is measured from posts only. Returns null until at least one post exists.
 */
export function progressVsStart(
  posts: PostWithMetrics[],
  seed: BaselineSeed | null,
  opts: { window: number; scope?: FormatScope; format?: PostFormat },
): { rows: Progress[]; measuredCount: number } | null {
  if (!seed || posts.length === 0) return null;

  const scope = opts.scope ?? "same";
  const pool =
    scope === "all" || !opts.format ? posts : comparablePosts(posts, opts.format, scope);
  if (pool.length === 0) return null;

  const measured = measuredAverage(pool, opts.window);
  const starting = metricValues(seed);

  const rows = METRIC_KEYS.map((key) => ({
    key,
    starting: starting[key],
    current: measured.values[key],
    delta: deltaFor(key, measured.values[key], starting[key]),
  }));

  return { rows, measuredCount: measured.count };
}
