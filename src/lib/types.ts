/**
 * Core domain types for the Moss Instagram tracker.
 *
 * Design note on Post vs Snapshot:
 * A Post holds only identity — when it went up, what it is, what I called it.
 * Every *number* lives on a Snapshot, including followerCountAfter. A post always
 * has at least one snapshot (created with it); "the post's current numbers" means
 * its latest snapshot by capturedAt. That keeps a single source of truth for each
 * metric instead of storing today's figures on the post and yesterday's on a snapshot.
 */

export type PostFormat = "reel" | "carousel" | "image";

export const POST_FORMATS: PostFormat[] = ["reel", "carousel", "image"];

/** The raw numbers copied off the Instagram Insights screen. */
export interface RawMetrics {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profileVisits: number;
  followsFromPost: number;
}

export interface Post {
  id: number;
  /** ISO 8601, stored UTC, always rendered in local time. */
  postedAt: string;
  label: string;
  url: string | null;
  format: PostFormat;
  notes: string | null;
}

export interface Snapshot extends RawMetrics {
  id: number;
  postId: number;
  capturedAt: string;
  /** Total account followers at the moment this snapshot was taken. */
  followerCountAfter: number;
}

/** A post joined to its latest snapshot — the shape nearly every screen wants. */
export interface PostWithMetrics extends Post {
  current: Snapshot;
  snapshotCount: number;
}

export type MilestoneType =
  | "follower_threshold"
  | "cumulative_views"
  | "personal_best"
  | "first_to_cross"
  | "streak"
  | "baseline_band";

export interface Milestone {
  id: number;
  /** Stable dedupe identity. UNIQUE in SQLite, so a milestone can never fire twice. */
  key: string;
  type: MilestoneType;
  label: string;
  achievedAt: string;
  postId: number | null;
  /** Metric key this milestone concerns, when it concerns one. */
  metric: string | null;
  value: number;
}

export interface Settings {
  /** N — how many prior posts make up a trailing baseline. */
  baselineWindow: number;
  /** When tracking began. Nothing before this date is counted or celebrated. */
  trackingStartedAt: string | null;
  /** Follower count on that day — thresholds already passed by then never fire. */
  startingFollowers: number | null;
  /**
   * "This is what a normal post does for me right now", entered by hand as one
   * typical post. It fills the baseline slots no real post has filled yet, and it is
   * the fixed line that progress is measured against.
   */
  startingBaseline: RawMetrics | null;
}

export const DEFAULT_SETTINGS: Settings = {
  baselineWindow: 10,
  trackingStartedAt: null,
  startingFollowers: null,
  startingBaseline: null,
};

export const EMPTY_METRICS: RawMetrics = {
  views: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  profileVisits: 0,
  followsFromPost: 0,
};
