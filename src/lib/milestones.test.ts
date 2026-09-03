import { describe, expect, it } from "vitest";
import {
  detectMilestones,
  freshMilestones,
  nextMilestone,
} from "./milestones.ts";
import type { PostFormat, PostWithMetrics, RawMetrics } from "./types.ts";

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

function post(
  day: number,
  metrics: Partial<RawMetrics>,
  opts: { id?: number; format?: PostFormat; followers?: number } = {},
): PostWithMetrics {
  const id = opts.id ?? day;
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
      capturedAt: postedAt,
      followerCountAfter: opts.followers ?? 100,
      ...ZERO,
      ...metrics,
    },
  };
}

/** n posts, one per day, each with the given views. */
function series(views: number[], opts: { format?: PostFormat; followers?: number } = {}) {
  return views.map((v, i) => post(i + 1, { views: v }, { id: i + 1, ...opts }));
}

function keys(posts: PostWithMetrics[], window = 10) {
  return detectMilestones(posts, window).map((m) => m.key);
}

describe("follower thresholds", () => {
  it("fires each threshold the account has passed", () => {
    const posts = [
      post(1, { views: 100 }, { id: 1, followers: 420 }),
      post(2, { views: 100 }, { id: 2, followers: 1200 }),
    ];
    const found = keys(posts);
    expect(found).toContain("follower:500");
    expect(found).toContain("follower:1000");
    expect(found).not.toContain("follower:2500");
  });

  it("attributes the threshold to the earliest snapshot that reached it", () => {
    const posts = [
      post(1, { views: 100 }, { id: 1, followers: 600 }),
      post(2, { views: 100 }, { id: 2, followers: 900 }),
    ];
    const m = detectMilestones(posts, 10).find((x) => x.key === "follower:500");
    expect(m?.postId).toBe(1);
    expect(m?.achievedAt).toBe(posts[0].current.capturedAt);
  });

  it("fires nothing below the first threshold", () => {
    expect(keys([post(1, { views: 10 }, { followers: 120 })])).not.toContain("follower:500");
  });
});

describe("cumulative views", () => {
  it("fires on the post that tips the account over the line", () => {
    const posts = series([4000, 4000, 4000]); // 4k, 8k, 12k
    const m = detectMilestones(posts, 10).find((x) => x.key === "cumviews:10000");
    expect(m?.postId).toBe(3);
    expect(keys(posts)).not.toContain("cumviews:50000");
  });
});

describe("first post to cross a view threshold", () => {
  it("credits the first post over each line, not the biggest", () => {
    const posts = series([1200, 900, 60000]);
    const found = detectMilestones(posts, 10);
    expect(found.find((m) => m.key === "firstcross:1000")?.postId).toBe(1);
    expect(found.find((m) => m.key === "firstcross:10000")?.postId).toBe(3);
    expect(found.find((m) => m.key === "firstcross:50000")?.postId).toBe(3);
    expect(found.find((m) => m.key === "firstcross:100000")).toBeUndefined();
  });

  it("fires once per threshold no matter how many posts clear it later", () => {
    const found = keys(series([2000, 3000, 4000]));
    expect(found.filter((k) => k === "firstcross:1000")).toHaveLength(1);
  });
});

describe("personal bests", () => {
  it("does not treat the first post as a record", () => {
    expect(keys([post(1, { views: 5000 })])).not.toContain("pb:views:1");
  });

  it("fires when a post beats the previous best", () => {
    const found = keys(series([100, 300, 200, 500]));
    expect(found).toContain("pb:views:2");
    expect(found).toContain("pb:views:4");
    expect(found).not.toContain("pb:views:3"); // 200 did not beat 300
  });

  it("keys each record to the post that set it, so records can be broken repeatedly", () => {
    const found = detectMilestones(series([100, 200, 300]), 10).filter((m) => m.type === "personal_best");
    const viewRecords = found.filter((m) => m.metric === "views");
    expect(viewRecords.map((m) => m.postId)).toEqual([2, 3]);
    expect(new Set(viewRecords.map((m) => m.key)).size).toBe(2);
  });

  it("tracks rate records independently of raw counts", () => {
    const posts = [
      post(1, { views: 1000, likes: 50 }, { id: 1 }), // 5%
      post(2, { views: 10000, likes: 200 }, { id: 2 }), // 2% — a views record, not an engagement one
      post(3, { views: 500, likes: 100 }, { id: 3 }), // 20% — engagement record only
    ];
    const found = keys(posts);
    expect(found).toContain("pb:views:2");
    expect(found).toContain("pb:engagementRate:3");
    expect(found).not.toContain("pb:engagementRate:2");
    expect(found).not.toContain("pb:views:3");
  });

  it("ignores posts whose rate is undefined rather than counting them as zero", () => {
    const posts = [
      post(1, { views: 1000, likes: 100 }, { id: 1 }),
      post(2, { views: 0, likes: 0 }, { id: 2 }),
      post(3, { views: 1000, likes: 150 }, { id: 3 }),
    ];
    expect(keys(posts)).toContain("pb:engagementRate:3");
  });
});

describe("streaks", () => {
  it("fires on the third consecutive post above baseline", () => {
    // 10 posts at 1000 set the baseline, then three climbing posts.
    const posts = series([...Array(10).fill(1000), 1500, 1600, 1700]);
    const found = detectMilestones(posts, 10);
    const streaks = found.filter((m) => m.type === "streak");
    expect(streaks).toHaveLength(1);
    expect(streaks[0].postId).toBe(13);
  });

  it("does not re-fire while a longer run continues", () => {
    const posts = series([...Array(10).fill(1000), 1500, 1600, 1700, 1800, 1900]);
    expect(detectMilestones(posts, 10).filter((m) => m.type === "streak")).toHaveLength(1);
  });

  it("resets when a post falls below baseline", () => {
    const posts = series([...Array(10).fill(1000), 1500, 1600, 100, 1500, 1600]);
    expect(detectMilestones(posts, 10).filter((m) => m.type === "streak")).toHaveLength(0);
  });

  it("never fires while the baseline is still forming", () => {
    expect(detectMilestones(series([100, 200, 300, 400]), 10).filter((m) => m.type === "streak")).toHaveLength(0);
  });

  it("counts runs within a format, not across formats", () => {
    // Reels: 10 baseline posts, then two winners. A carousel between them must not
    // complete the run, and must not break it either.
    const reels = series(Array(10).fill(1000));
    const posts = [
      ...reels,
      post(11, { views: 1500 }, { id: 11, format: "reel" }),
      post(12, { views: 99999 }, { id: 12, format: "carousel" }),
      post(13, { views: 1600 }, { id: 13, format: "reel" }),
      post(14, { views: 1700 }, { id: 14, format: "reel" }),
    ];
    const streaks = detectMilestones(posts, 10).filter((m) => m.type === "streak");
    expect(streaks).toHaveLength(1);
    expect(streaks[0].postId).toBe(14);
  });
});

describe("baseline bands", () => {
  it("fires when the trailing average crosses into a new thousand", () => {
    // Ten posts at 900 -> baseline 900 (band 0, no milestone). Then rising posts
    // pull the trailing average past 1,000.
    const posts = series([...Array(10).fill(900), 3000, 3000, 3000]);
    const bands = detectMilestones(posts, 10).filter((m) => m.type === "baseline_band");
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.every((b) => b.value >= 1000)).toBe(true);
  });

  it("fires each band once and never goes backwards", () => {
    const posts = series([...Array(10).fill(5000), 100, 100, 100]);
    const bands = detectMilestones(posts, 10).filter((m) => m.type === "baseline_band");
    const values = bands.map((b) => b.value);
    expect(new Set(values).size).toBe(values.length);
    expect([...values].sort((a, b) => a - b)).toEqual(values); // monotonic
  });

  it("stays quiet while the window is unfilled", () => {
    const posts = series([9000, 9000, 9000]);
    expect(detectMilestones(posts, 10).filter((m) => m.type === "baseline_band")).toHaveLength(0);
  });
});

describe("the engine as a whole", () => {
  it("is idempotent — the same data yields the same keys every time", () => {
    const posts = series([...Array(10).fill(1000), 1500, 1600, 1700], { followers: 800 });
    expect(keys(posts)).toEqual(keys(posts));
    expect(new Set(keys(posts)).size).toBe(keys(posts).length);
  });

  it("returns milestones oldest first", () => {
    const posts = series([...Array(10).fill(1000), 1500, 1600, 1700], { followers: 800 });
    const times = detectMilestones(posts, 10).map((m) => Date.parse(m.achievedAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("finds nothing in an empty account", () => {
    expect(detectMilestones([], 10)).toEqual([]);
  });

  it("survives a post with zero views", () => {
    expect(() => detectMilestones([post(1, { views: 0 })], 10)).not.toThrow();
  });
});

describe("next milestone", () => {
  it("picks whichever target is closest to done", () => {
    // 900/1000 followers = 90%; 12k/50k views = 24%.
    const next = nextMilestone(900, 12000);
    expect(next?.label).toBe("1k followers");
    expect(next?.progress).toBeCloseTo(0.9);
  });

  it("switches to the view ladder when that one is closer", () => {
    const next = nextMilestone(520, 47000);
    expect(next?.unit).toBe("views");
    expect(next?.target).toBe(50000);
  });

  it("returns null once every ladder is exhausted", () => {
    expect(nextMilestone(200000, 2000000)).toBeNull();
  });
});

describe("fresh milestones", () => {
  const now = new Date("2025-03-01T00:00:00.000Z");

  it("keeps only the last 14 days, newest first", () => {
    const fresh = freshMilestones(
      [
        { achievedAt: "2025-02-27T00:00:00.000Z", key: "a" },
        { achievedAt: "2025-01-01T00:00:00.000Z", key: "b" },
        { achievedAt: "2025-02-20T00:00:00.000Z", key: "c" },
      ],
      now,
    );
    expect(fresh.map((m) => m.key)).toEqual(["a", "c"]);
  });

  it("excludes anything dated in the future", () => {
    expect(freshMilestones([{ achievedAt: "2025-03-05T00:00:00.000Z" }], now)).toHaveLength(0);
  });
});

/* --- the starting point ----------------------------------------------------- */

const SEED = {
  views: 1000,
  reach: 900,
  likes: 50,
  comments: 5,
  shares: 10,
  saves: 15,
  profileVisits: 20,
  followsFromPost: 4,
};

describe("milestones respect where tracking began", () => {
  it("does not celebrate follower thresholds passed before tracking started", () => {
    const posts = [post(1, { views: 100 }, { id: 1, followers: 1400 })];
    const found = detectMilestones(posts, 10, { startingFollowers: 1200 }).map((m) => m.key);
    expect(found).not.toContain("follower:500");
    expect(found).not.toContain("follower:1000");
  });

  it("still fires thresholds crossed after tracking started", () => {
    const posts = [post(1, { views: 100 }, { id: 1, followers: 2600 })];
    const found = detectMilestones(posts, 10, { startingFollowers: 1200 }).map((m) => m.key);
    expect(found).toContain("follower:2500");
  });

  it("fires everything when no starting count was declared", () => {
    const posts = [post(1, { views: 100 }, { id: 1, followers: 1400 })];
    expect(detectMilestones(posts, 10).map((m) => m.key)).toContain("follower:1000");
  });

  it("does not award a baseline band the declared starting figure already sits in", () => {
    // Declared normal is 1,000 views (band 1). A single 1,000-view post must not
    // "cross" into band 1 — that is where the account already was.
    const bands = detectMilestones(series([1000]), 10, { seed: SEED }).filter(
      (m) => m.type === "baseline_band",
    );
    expect(bands).toHaveLength(0);
  });

  it("awards a band once posting genuinely lifts the trailing average past it", () => {
    // Ten posts at 3,000 pull the trailing average to 3,000: bands 2 and 3 are new.
    const bands = detectMilestones(series(Array(10).fill(3000)), 10, { seed: SEED }).filter(
      (m) => m.type === "baseline_band",
    );
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.every((b) => b.value > SEED.views)).toBe(true);
  });

  it("lets a streak start from the first posts, since a baseline now exists", () => {
    const streaks = detectMilestones(series([1500, 1600, 1700]), 10, { seed: SEED }).filter(
      (m) => m.type === "streak",
    );
    expect(streaks).toHaveLength(1);
    expect(streaks[0].postId).toBe(3);
  });

  it("stays idempotent with a starting point in play", () => {
    const opts = { seed: SEED, startingFollowers: 1200 };
    const posts = series([1500, 1600, 1700], { followers: 1400 });
    const a = detectMilestones(posts, 10, opts).map((m) => m.key);
    const b = detectMilestones(posts, 10, opts).map((m) => m.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});
