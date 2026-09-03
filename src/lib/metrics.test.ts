import { describe, expect, it } from "vitest";
import {
  METRIC_CATEGORIES,
  METRIC_KEYS,
  allTimeBaseline,
  baselineDrift,
  comparePost,
  comparablePosts,
  cumulativeViews,
  deltaFor,
  latestFollowerCount,
  metricValue,
  metricsIn,
  priorPosts,
  progressVsStart,
  rankOf,
  trailingBaseline,
} from "./metrics.ts";
import type { PostFormat, PostWithMetrics, RawMetrics } from "./types.ts";

/* --- fixtures -------------------------------------------------------------- */

const ZERO: RawMetrics = {
  views: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  profileVisits: 0,
  followsFromPost: 0,
};

let nextId = 1;

/** Build a post on day `day` of Jan 2025 with the given metrics. */
function post(
  day: number,
  metrics: Partial<RawMetrics>,
  opts: { format?: PostFormat; id?: number; followers?: number; capturedAt?: string } = {},
): PostWithMetrics {
  const id = opts.id ?? nextId++;
  const postedAt = new Date(Date.UTC(2025, 0, day, 12, 0, 0)).toISOString();
  return {
    id,
    postedAt,
    label: `post-${id}`,
    url: null,
    format: opts.format ?? "reel",
    notes: null,
    snapshotCount: 1,
    current: {
      id,
      postId: id,
      capturedAt: opts.capturedAt ?? postedAt,
      followerCountAfter: opts.followers ?? 1000,
      ...ZERO,
      ...metrics,
    },
  };
}

/** n posts, one per day, each with `views` views. */
function series(views: number[], format: PostFormat = "reel"): PostWithMetrics[] {
  return views.map((v, i) => post(i + 1, { views: v }, { format, id: i + 1 }));
}

/* --- derived metrics ------------------------------------------------------- */

describe("derived metrics", () => {
  it("computes engagement rate from all four interaction types", () => {
    const p = post(1, { views: 1000, likes: 50, comments: 10, shares: 20, saves: 20 });
    expect(metricValue(p.current, "engagementRate")).toBeCloseTo(0.1);
  });

  it("computes share, save, follow and visit rates against views", () => {
    const p = post(1, { views: 2000, shares: 40, saves: 100, followsFromPost: 20, profileVisits: 300 });
    expect(metricValue(p.current, "shareRate")).toBeCloseTo(0.02);
    expect(metricValue(p.current, "saveRate")).toBeCloseTo(0.05);
    expect(metricValue(p.current, "followConversion")).toBeCloseTo(0.01);
    expect(metricValue(p.current, "profileVisitRate")).toBeCloseTo(0.15);
  });

  it("returns null, never NaN or Infinity, when views are zero", () => {
    const p = post(1, { views: 0, likes: 5, shares: 2 });
    for (const key of ["engagementRate", "shareRate", "saveRate", "followConversion", "profileVisitRate"] as const) {
      expect(metricValue(p.current, key)).toBeNull();
    }
  });

  it("leaves counts intact on a zero-view post", () => {
    const p = post(1, { views: 0, likes: 5 });
    expect(metricValue(p.current, "likes")).toBe(5);
    expect(metricValue(p.current, "views")).toBe(0);
  });
});

/* --- baseline: self-exclusion and cold start ------------------------------- */

describe("trailing baseline", () => {
  it("is forming, with no values, below N posts", () => {
    const b = trailingBaseline(series([100, 200, 300]), 10);
    expect(b.forming).toBe(true);
    expect(b.sampleSize).toBe(3);
    expect(b.values.views).toBeNull();
  });

  it("uses exactly the last N posts once the window fills", () => {
    // 12 posts of 100..1200; last 10 are 300..1200, mean 750.
    const posts = series([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
    const b = trailingBaseline(posts, 10);
    expect(b.forming).toBe(false);
    expect(b.sampleSize).toBe(10);
    expect(b.values.views).toBe(750);
  });

  it("honours a configured window other than 10", () => {
    const posts = series([100, 200, 300, 400, 500]);
    expect(trailingBaseline(posts, 3).values.views).toBe(400); // 300,400,500
  });

  it("averages rates per post, not as a ratio of summed totals", () => {
    // Post A: 100 views, 10% eng. Post B: 10,000 views, 1% eng.
    // Per-post mean is 5.5%; a summed-ratio would give ~1.09%.
    const posts = [
      post(1, { views: 100, likes: 10 }, { id: 1 }),
      post(2, { views: 10000, likes: 100 }, { id: 2 }),
    ];
    expect(trailingBaseline(posts, 2).values.engagementRate).toBeCloseTo(0.055);
  });

  it("skips null rates for that metric only, keeping counts intact", () => {
    const posts = [
      post(1, { views: 0, likes: 4 }, { id: 1 }),
      post(2, { views: 1000, likes: 100 }, { id: 2 }),
    ];
    const b = trailingBaseline(posts, 2);
    expect(b.counts.engagementRate).toBe(1); // only the second post had a rate
    expect(b.values.engagementRate).toBeCloseTo(0.1);
    expect(b.values.views).toBe(500); // both posts count toward the view average
  });

  it("all-time baseline reports a real average of however many posts exist", () => {
    const b = allTimeBaseline(series([100, 200, 300]));
    expect(b.forming).toBe(false);
    expect(b.values.views).toBe(200);
  });
});

describe("prior posts", () => {
  it("excludes the post itself and everything after it", () => {
    const posts = series([100, 200, 300, 400, 500]);
    const target = posts[2]; // day 3
    const prior = priorPosts(target, posts, "same");
    expect(prior.map((p) => p.current.views)).toEqual([100, 200]);
  });

  it("compares reels to reels by default", () => {
    const posts = [
      post(1, { views: 100 }, { format: "reel", id: 1 }),
      post(2, { views: 9999 }, { format: "carousel", id: 2 }),
      post(3, { views: 300 }, { format: "reel", id: 3 }),
      post(4, { views: 200 }, { format: "reel", id: 4 }),
    ];
    const target = posts[3];
    expect(priorPosts(target, posts, "same").map((p) => p.id)).toEqual([1, 3]);
    expect(priorPosts(target, posts, "all").map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("breaks same-timestamp ties by id so ordering is total", () => {
    const a = post(1, { views: 100 }, { id: 7 });
    const b = post(1, { views: 200 }, { id: 8 });
    expect(priorPosts(b, [a, b], "same").map((p) => p.id)).toEqual([7]);
    expect(priorPosts(a, [a, b], "same")).toHaveLength(0);
  });

  it("filters a comparable pool by format", () => {
    const posts = [
      post(1, { views: 1 }, { format: "reel", id: 1 }),
      post(2, { views: 2 }, { format: "image", id: 2 }),
    ];
    expect(comparablePosts(posts, "reel", "same")).toHaveLength(1);
    expect(comparablePosts(posts, "reel", "all")).toHaveLength(2);
  });
});

/* --- deltas ---------------------------------------------------------------- */

describe("deltas", () => {
  it("reports absolute and percent change", () => {
    const d = deltaFor("views", 1200, 1000);
    expect(d.absChange).toBe(200);
    expect(d.pctChange).toBeCloseTo(0.2);
    expect(d.direction).toBe("up");
  });

  it("calls anything within ±5% flat", () => {
    expect(deltaFor("views", 1040, 1000).direction).toBe("flat");
    expect(deltaFor("views", 960, 1000).direction).toBe("flat");
    expect(deltaFor("views", 1050, 1000).direction).toBe("flat"); // boundary is inclusive
    expect(deltaFor("views", 1051, 1000).direction).toBe("up");
    expect(deltaFor("views", 949, 1000).direction).toBe("down");
  });

  it("gives no percentage against a zero baseline but still reports direction", () => {
    const d = deltaFor("followsFromPost", 3, 0);
    expect(d.pctChange).toBeNull();
    expect(d.absChange).toBe(3);
    expect(d.direction).toBe("up");
  });

  it("is unknown when either side is missing", () => {
    expect(deltaFor("engagementRate", null, 0.05).direction).toBe("unknown");
    expect(deltaFor("engagementRate", 0.05, null).direction).toBe("unknown");
  });
});

/* --- ranks ----------------------------------------------------------------- */

describe("ranks", () => {
  it("ranks best-first and counts the pool", () => {
    const r = rankOf(300, [100, 500, 300, 400]);
    expect(r).toEqual({ position: 3, of: 4 });
  });

  it("gives tied values the better shared position", () => {
    expect(rankOf(300, [300, 300, 100])).toEqual({ position: 1, of: 3 });
  });

  it("ignores nulls instead of treating them as zero", () => {
    expect(rankOf(100, [null, 50, 100])).toEqual({ position: 1, of: 2 });
    expect(rankOf(null, [1, 2])).toBeNull();
    expect(rankOf(5, [null, null])).toBeNull();
  });
});

/* --- comparison ------------------------------------------------------------ */

describe("comparePost", () => {
  it("never includes the post in its own baseline", () => {
    // 10 prior posts at 1000 views, then a monster post.
    const posts = [...series(Array(10).fill(1000)), post(11, { views: 5000 }, { id: 11 })];
    const target = posts[10];
    const c = comparePost(target, posts, { window: 10 });
    expect(c.baseline.values.views).toBe(1000); // not 1363
    expect(c.deltas.views.pctChange).toBeCloseTo(4);
  });

  it("reports a forming baseline instead of a fabricated one", () => {
    const posts = series([100, 200, 300]);
    const c = comparePost(posts[2], posts, { window: 10 });
    expect(c.baseline.forming).toBe(true);
    expect(c.baseline.sampleSize).toBe(2);
    expect(c.deltas.views.direction).toBe("unknown");
    expect(c.beat).toHaveLength(0);
  });

  it("still ranks a post while its baseline is forming", () => {
    const posts = series([100, 300, 200]);
    const c = comparePost(posts[1], posts, { window: 10 });
    expect(c.deltas.views.rank).toEqual({ position: 1, of: 3 });
  });

  it("ranks against every comparable post, including itself", () => {
    const posts = series([100, 200, 300, 400, 500]);
    const c = comparePost(posts[2], posts, { window: 2 });
    expect(c.deltas.views.rank).toEqual({ position: 3, of: 5 });
  });

  it("scopes both baseline and rank to the post's own format by default", () => {
    const posts = [
      ...Array.from({ length: 10 }, (_, i) => post(i + 1, { views: 1000 }, { format: "reel", id: i + 1 })),
      post(11, { views: 100000 }, { format: "carousel", id: 11 }),
      post(12, { views: 2000 }, { format: "reel", id: 12 }),
    ];
    const target = posts[11];
    const same = comparePost(target, posts, { window: 10, scope: "same" });
    expect(same.baseline.values.views).toBe(1000);
    expect(same.deltas.views.rank).toEqual({ position: 1, of: 11 });

    const all = comparePost(target, posts, { window: 10, scope: "all" });
    // Last 10 before the target: reels 2..10 (nine at 1000) plus the 100k carousel.
    expect(all.baseline.values.views).toBe((9 * 1000 + 100000) / 10);
    expect(all.deltas.views.rank).toEqual({ position: 2, of: 12 });
  });

  it("sorts beat by biggest win and missed by worst loss", () => {
    const prior = Array.from({ length: 10 }, (_, i) =>
      post(i + 1, { views: 1000, likes: 100, shares: 10, saves: 10 }, { id: i + 1 }),
    );
    const target = post(11, { views: 2000, likes: 100, shares: 5, saves: 30 }, { id: 11 });
    const c = comparePost(target, [...prior, target], { window: 10 });
    expect(c.beat[0]).toBe("saves"); // +200% beats views' +100%
    // shares fell 50%, but share *rate* fell 75% because views doubled underneath it.
    expect(c.missed).toContain("shares");
    expect(c.missed[0]).toBe("shareRate");
  });
});

/* --- drift ----------------------------------------------------------------- */

describe("baseline drift", () => {
  it("starts the rolling line only once the window fills", () => {
    const posts = series([100, 200, 300, 400]);
    const d = baselineDrift(posts, "views", { window: 3, scope: "all" });
    expect(d.map((p) => p.trailing)).toEqual([null, null, 200, 300]);
  });

  it("includes each post in its own rolling average", () => {
    const posts = series([100, 200, 300]);
    const d = baselineDrift(posts, "views", { window: 3, scope: "all" });
    expect(d[2].trailing).toBe(200);
    expect(d[2].value).toBe(300);
  });

  it("restricts the line to one format when scoped", () => {
    const posts = [
      post(1, { views: 100 }, { format: "reel", id: 1 }),
      post(2, { views: 9999 }, { format: "carousel", id: 2 }),
      post(3, { views: 300 }, { format: "reel", id: 3 }),
    ];
    const d = baselineDrift(posts, "views", { window: 2, scope: "same", format: "reel" });
    expect(d).toHaveLength(2);
    expect(d[1].trailing).toBe(200);
  });
});

/* --- account-level rollups -------------------------------------------------- */

describe("account rollups", () => {
  it("sums current views across posts", () => {
    expect(cumulativeViews(series([100, 250, 400]))).toBe(750);
  });

  it("takes the follower count from the most recently captured snapshot", () => {
    const posts = [
      post(1, { views: 10 }, { id: 1, followers: 900, capturedAt: "2025-02-01T00:00:00.000Z" }),
      post(2, { views: 10 }, { id: 2, followers: 1200, capturedAt: "2025-01-20T00:00:00.000Z" }),
    ];
    expect(latestFollowerCount(posts)).toBe(900);
    expect(latestFollowerCount([])).toBeNull();
  });
});

/* --- starting baseline (the declared "this is my normal right now") --------- */

const SEED: RawMetrics = {
  views: 1000,
  reach: 900,
  likes: 50,
  comments: 5,
  shares: 10,
  saves: 15,
  profileVisits: 20,
  followsFromPost: 4,
};

describe("seeded baseline", () => {
  it("gives a real baseline from the very first post instead of forming", () => {
    const b = trailingBaseline([], 10, SEED);
    expect(b.forming).toBe(false);
    expect(b.seeded).toBe(true);
    expect(b.measuredCount).toBe(0);
    expect(b.seededCount).toBe(10);
    expect(b.values.views).toBe(1000);
    expect(b.values.engagementRate).toBeCloseTo(0.08);
  });

  it("replaces declared slots with real posts one at a time", () => {
    // Three posts at 2,000 views against a 1,000-view starting point:
    // (3 x 2000 + 7 x 1000) / 10 = 1300.
    const b = trailingBaseline(series([2000, 2000, 2000]), 10, SEED);
    expect(b.measuredCount).toBe(3);
    expect(b.seededCount).toBe(7);
    expect(b.values.views).toBe(1300);
  });

  it("stops using the starting figures entirely once the window fills", () => {
    const b = trailingBaseline(series(Array(10).fill(2000)), 10, SEED);
    expect(b.seeded).toBe(false);
    expect(b.seededCount).toBe(0);
    expect(b.values.views).toBe(2000);
  });

  it("still reports forming when no starting point was declared", () => {
    const b = trailingBaseline(series([2000]), 10, null);
    expect(b.forming).toBe(true);
    expect(b.seeded).toBe(false);
    expect(b.values.views).toBeNull();
  });

  it("lets the first post ever logged be compared", () => {
    const first = post(1, { views: 3000, likes: 200 }, { id: 1 });
    const c = comparePost(first, [first], { window: 10, seed: SEED });
    expect(c.baseline.forming).toBe(false);
    expect(c.deltas.views.pctChange).toBeCloseTo(2); // 3000 vs 1000
    expect(c.deltas.views.direction).toBe("up");
  });

  it("never lets a post seed its own baseline through the window", () => {
    const posts = series([5000]);
    const c = comparePost(posts[0], posts, { window: 10, seed: SEED });
    expect(c.baseline.values.views).toBe(1000); // purely the declared figure
  });

  it("starts the drift line at the first post rather than at post N", () => {
    const d = baselineDrift(series([2000, 2000]), "views", {
      window: 10,
      scope: "all",
      seed: SEED,
    });
    expect(d[0].trailing).toBe(1100); // (1x2000 + 9x1000)/10
    expect(d[1].trailing).toBe(1200);
  });
});

describe("progress against the starting point", () => {
  it("measures current from posts only, never from the declared figures", () => {
    // One post at 2,000. A seeded baseline would say 1,100; progress must say 2,000.
    const result = progressVsStart(series([2000]), SEED, { window: 10, scope: "all" });
    const views = result!.rows.find((r) => r.key === "views")!;
    expect(views.starting).toBe(1000);
    expect(views.current).toBe(2000);
    expect(views.delta.pctChange).toBeCloseTo(1);
    expect(result!.measuredCount).toBe(1);
  });

  it("covers every metric, including the derived rates", () => {
    const result = progressVsStart(series([2000]), SEED, { window: 10, scope: "all" });
    expect(result!.rows).toHaveLength(METRIC_KEYS.length);
    expect(result!.rows.some((r) => r.key === "engagementRate")).toBe(true);
  });

  it("returns nothing to show without a starting point or without posts", () => {
    expect(progressVsStart(series([2000]), null, { window: 10, scope: "all" })).toBeNull();
    expect(progressVsStart([], SEED, { window: 10, scope: "all" })).toBeNull();
  });
});

describe("metric categories", () => {
  it("assigns every metric to exactly one category", () => {
    const covered = METRIC_CATEGORIES.flatMap((c) => metricsIn(c.key).map((m) => m.key));
    expect(covered.sort()).toEqual([...METRIC_KEYS].sort());
    expect(new Set(covered).size).toBe(METRIC_KEYS.length);
  });

  it("groups the derived rates with the counts they come from", () => {
    expect(metricsIn("engagement").map((m) => m.key)).toContain("engagementRate");
    expect(metricsIn("growth").map((m) => m.key)).toContain("followConversion");
    expect(metricsIn("reach").map((m) => m.key)).toEqual(["views", "reach"]);
  });
});
