/**
 * DEMO DATA — these 12 Reels are invented. They are not real @moss_robotics posts.
 *
 * This exists so you can see a populated dashboard before you have logged anything
 * real. For actual tracking, run `npm run db:reset`, set your starting point in
 * Settings, and log real Reels as you post them.
 *
 *   npm run db:seed     wipe, then load the invented samples
 *   npm run db:reset    wipe, leaving an empty database for real data
 *
 * Dates are generated relative to today, so the dashboard always looks current and
 * the "fresh milestone" banner has something in the last 14 days.
 */

import { openDb, wipe, describeDatabase } from "../src/lib/db.ts";
import { createPost, addSnapshot, setSetting, syncMilestones } from "../src/lib/queries.ts";
import type { RawMetrics } from "../src/lib/types.ts";

interface Sample {
  /** Days before today that this went up. */
  daysAgo: number;
  label: string;
  notes?: string;
  /** Where the numbers land once the post has finished maturing. */
  final: RawMetrics;
  /** Total followers once this post has run its course. */
  followers: number;
}

const SAMPLES: Sample[] = [
  {
    daysAgo: 62,
    label: "gripper stress test",
    notes: "First proper Reel. Shot on the bench, no lighting.",
    final: { views: 1840, reach: 1620, likes: 96, comments: 11, shares: 14, saves: 22, profileVisits: 41, followsFromPost: 9 },
    followers: 640,
  },
  {
    daysAgo: 57,
    label: "workshop tour",
    final: { views: 2310, reach: 2020, likes: 118, comments: 9, shares: 21, saves: 30, profileVisits: 55, followsFromPost: 12 },
    followers: 655,
  },
  {
    daysAgo: 52,
    label: "arm pick-and-place",
    notes: "Tighter cut, 9s. Hook in the first frame.",
    final: { views: 3120, reach: 2740, likes: 187, comments: 16, shares: 38, saves: 61, profileVisits: 88, followsFromPost: 21 },
    followers: 680,
  },
  {
    daysAgo: 48,
    label: "cable management timelapse",
    notes: "Too slow. Lost people in the first 3 seconds.",
    final: { views: 1460, reach: 1310, likes: 62, comments: 5, shares: 7, saves: 13, profileVisits: 24, followsFromPost: 4 },
    followers: 688,
  },
  {
    daysAgo: 43,
    label: "SLAM demo — warehouse floor",
    final: { views: 4780, reach: 4150, likes: 241, comments: 22, shares: 52, saves: 88, profileVisits: 121, followsFromPost: 27 },
    followers: 720,
  },
  {
    daysAgo: 38,
    label: "arm vs egg",
    notes: "First one to travel. Shared into two robotics group chats.",
    final: { views: 12400, reach: 10800, likes: 742, comments: 63, shares: 188, saves: 264, profileVisits: 402, followsFromPost: 96 },
    followers: 830,
  },
  {
    daysAgo: 33,
    label: "night build session",
    final: { views: 5220, reach: 4560, likes: 236, comments: 18, shares: 41, saves: 67, profileVisits: 96, followsFromPost: 19 },
    followers: 858,
  },
  {
    daysAgo: 28,
    label: "AGV first drive",
    final: { views: 6940, reach: 6010, likes: 372, comments: 29, shares: 78, saves: 121, profileVisits: 173, followsFromPost: 38 },
    followers: 900,
  },
  {
    daysAgo: 23,
    label: "vision calibration in 30s",
    notes: "Saves were strong — people bookmark the how-tos.",
    final: { views: 4180, reach: 3690, likes: 199, comments: 14, shares: 33, saves: 71, profileVisits: 84, followsFromPost: 16 },
    followers: 921,
  },
  {
    daysAgo: 18,
    label: "arm dances to a metronome",
    final: { views: 9650, reach: 8320, likes: 561, comments: 44, shares: 132, saves: 198, profileVisits: 287, followsFromPost: 61 },
    followers: 990,
  },
  {
    daysAgo: 12,
    label: "conveyor sorting demo",
    final: { views: 8300, reach: 7180, likes: 438, comments: 31, shares: 96, saves: 154, profileVisits: 216, followsFromPost: 44 },
    followers: 1042,
  },
  {
    daysAgo: 4,
    label: "robot folds a shirt",
    notes: "Best one yet. Reposted by two accounts on day 2.",
    final: { views: 26700, reach: 22900, likes: 1710, comments: 142, shares: 486, saves: 623, profileVisits: 902, followsFromPost: 214 },
    followers: 1290,
  },
];

const HOUR = 3_600_000;

/**
 * When we checked a post's numbers: roughly a day in, a work-week in, and a
 * fortnight in — plus a reading for right now if the post is younger than that.
 */
function captureAges(postAgeHours: number): number[] {
  const ages = [18, 120, 336].filter((h) => h <= postAgeHours);
  if (postAgeHours < 336 && (ages.length === 0 || postAgeHours - ages[ages.length - 1] > 6)) {
    ages.push(Math.max(1, Math.round(postAgeHours) - 1));
  }
  return ages.length > 0 ? ages : [1];
}

/** How mature a reading is, by its position from the end. The last one is the final figure. */
const MATURITY = [1, 0.84, 0.42, 0.25];

/**
 * Scale a metric back to an earlier point in a post's life. Views are scaled
 * linearly; engagement is scaled more gently, because early viewers engage harder
 * than the long tail does — which makes engagement rate drift down over a post's
 * life, the way it actually does.
 */
function atMaturity(final: RawMetrics, f: number): RawMetrics {
  const soft = Math.pow(f, 0.8);
  const r = (n: number, factor: number) => Math.max(0, Math.round(n * factor));
  return {
    views: r(final.views, f),
    reach: r(final.reach, f),
    likes: r(final.likes, soft),
    comments: r(final.comments, soft),
    shares: r(final.shares, soft),
    saves: r(final.saves, soft),
    profileVisits: r(final.profileVisits, soft),
    followsFromPost: r(final.followsFromPost, soft),
  };
}

async function main() {
  const db = await openDb();
  await wipe(db);
  await setSetting("baselineWindow", "10", db);

  // A declared starting point, so the demo also shows the progress view working.
  await setSetting(
    "startingBaseline",
    JSON.stringify({
      views: 1500,
      reach: 1350,
      likes: 74,
      comments: 7,
      shares: 11,
      saves: 17,
      profileVisits: 32,
      followsFromPost: 6,
    }),
    db,
  );
  await setSetting("startingFollowers", "620", db);

  const now = Date.now();
  let previousFollowers = 620;

  for (const sample of SAMPLES) {
    const postedAt = new Date(now - sample.daysAgo * 24 * HOUR);
    // Post in the evening — that's when these actually go up.
    postedAt.setHours(19, 15, 0, 0);
    const postAgeHours = (now - postedAt.getTime()) / HOUR;

    const ages = captureAges(postAgeHours);
    // The newest reading is the final figure; earlier ones are scaled back.
    const maturityAt = (i: number) => MATURITY[Math.min(MATURITY.length - 1, ages.length - 1 - i)];

    const postId = await createPost(
      {
        postedAt: postedAt.toISOString(),
        label: sample.label,
        url: null,
        format: "reel",
        notes: sample.notes ?? null,
      },
      buildSnapshot(sample, postedAt, ages[0], maturityAt(0), previousFollowers),
      db,
    );

    for (let i = 1; i < ages.length; i++) {
      await addSnapshot(postId, buildSnapshot(sample, postedAt, ages[i], maturityAt(i), previousFollowers), db);
    }

    previousFollowers = sample.followers;
  }

  const fresh = await syncMilestones(db);
  const count = async (table: string) =>
    Number((await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  const posts = { n: await count("posts") };
  const snaps = { n: await count("snapshots") };
  const stones = { n: await count("milestones") };

  console.log("DEMO DATA — these Reels are invented, not real @moss_robotics posts.");
  console.log("Run `npm run db:reset` to clear them before tracking for real.\n");
  console.log(`Seeded ${posts.n} posts, ${snaps.n} snapshots, ${stones.n} milestones into ${describeDatabase()}`);
  for (const m of fresh) console.log(`  · ${m.label}`);

  await db.close();
}

function buildSnapshot(
  sample: Sample,
  postedAt: Date,
  ageHours: number,
  maturity: number,
  previousFollowers: number,
) {
  return {
    capturedAt: new Date(postedAt.getTime() + ageHours * HOUR).toISOString(),
    ...atMaturity(sample.final, maturity),
    followerCountAfter: Math.round(
      previousFollowers + (sample.followers - previousFollowers) * maturity,
    ),
  };
}

await main();
