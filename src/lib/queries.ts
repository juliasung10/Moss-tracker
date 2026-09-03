/**
 * Data access. Everything the app reads or writes goes through here, so the SQL
 * lives in one place and the rest of the app deals in domain types.
 */

import type { Database } from "better-sqlite3";
import { getDb } from "./db.ts";
import { detectMilestones } from "./milestones.ts";
import {
  DEFAULT_SETTINGS,
  EMPTY_METRICS,
  type Milestone,
  type PostFormat,
  type PostWithMetrics,
  type RawMetrics,
  type Settings,
  type Snapshot,
} from "./types.ts";

const POST_COLUMNS = `
  p.id           AS id,
  p.postedAt     AS postedAt,
  p.label        AS label,
  p.url          AS url,
  p.format       AS format,
  p.notes        AS notes
`;

const SNAPSHOT_COLUMNS = `
  s.id                 AS s_id,
  s.postId             AS s_postId,
  s.capturedAt         AS s_capturedAt,
  s.views              AS s_views,
  s.reach              AS s_reach,
  s.likes              AS s_likes,
  s.comments           AS s_comments,
  s.shares             AS s_shares,
  s.saves              AS s_saves,
  s.profileVisits      AS s_profileVisits,
  s.followsFromPost    AS s_followsFromPost,
  s.followerCountAfter AS s_followerCountAfter
`;

/** Joins each post to its newest snapshot. Ties on capturedAt fall back to insert order. */
const LATEST_SNAPSHOT_JOIN = `
  JOIN snapshots s ON s.id = (
    SELECT id FROM snapshots
    WHERE postId = p.id
    ORDER BY capturedAt DESC, id DESC
    LIMIT 1
  )
`;

interface JoinedRow {
  id: number;
  postedAt: string;
  label: string;
  url: string | null;
  format: PostFormat;
  notes: string | null;
  snapshotCount: number;
  s_id: number;
  s_postId: number;
  s_capturedAt: string;
  s_views: number;
  s_reach: number;
  s_likes: number;
  s_comments: number;
  s_shares: number;
  s_saves: number;
  s_profileVisits: number;
  s_followsFromPost: number;
  s_followerCountAfter: number;
}

function toPost(row: JoinedRow): PostWithMetrics {
  return {
    id: row.id,
    postedAt: row.postedAt,
    label: row.label,
    url: row.url,
    format: row.format,
    notes: row.notes,
    snapshotCount: row.snapshotCount,
    current: {
      id: row.s_id,
      postId: row.s_postId,
      capturedAt: row.s_capturedAt,
      views: row.s_views,
      reach: row.s_reach,
      likes: row.s_likes,
      comments: row.s_comments,
      shares: row.s_shares,
      saves: row.s_saves,
      profileVisits: row.s_profileVisits,
      followsFromPost: row.s_followsFromPost,
      followerCountAfter: row.s_followerCountAfter,
    },
  };
}

/* --- settings --------------------------------------------------------------- */

export function getSettings(db: Database = getDb()): Settings {
  const rows = db.prepare(`SELECT "key", value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const raw = Number(map.get("baselineWindow"));
  const baselineWindow =
    Number.isFinite(raw) && raw >= 2 && raw <= 100 ? Math.round(raw) : DEFAULT_SETTINGS.baselineWindow;

  const followers = Number(map.get("startingFollowers"));

  return {
    baselineWindow,
    trackingStartedAt: map.get("trackingStartedAt") ?? null,
    startingFollowers: Number.isFinite(followers) && followers > 0 ? Math.round(followers) : null,
    startingBaseline: parseStartingBaseline(map.get("startingBaseline")),
  };
}

/** Stored as JSON. A malformed or absent value means "not set", never a crash. */
function parseStartingBaseline(raw: string | undefined): RawMetrics | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RawMetrics>;
    const out = { ...EMPTY_METRICS };
    let any = false;
    for (const key of Object.keys(EMPTY_METRICS) as (keyof RawMetrics)[]) {
      const v = Number(parsed[key]);
      if (Number.isFinite(v) && v >= 0) {
        out[key] = Math.round(v);
        if (v > 0) any = true;
      }
    }
    // An all-zero baseline is indistinguishable from having none, and would make
    // every rate null. Treat it as unset.
    return any ? out : null;
  } catch {
    return null;
  }
}

export function setSetting(key: string, value: string, db: Database = getDb()): void {
  db.prepare(
    `INSERT INTO settings ("key", value) VALUES (?, ?)
     ON CONFLICT("key") DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/* --- reads ------------------------------------------------------------------ */

export function listPosts(db: Database = getDb()): PostWithMetrics[] {
  const rows = db
    .prepare(
      `SELECT ${POST_COLUMNS}, ${SNAPSHOT_COLUMNS},
              (SELECT COUNT(*) FROM snapshots WHERE postId = p.id) AS snapshotCount
       FROM posts p ${LATEST_SNAPSHOT_JOIN}
       ORDER BY p.postedAt DESC, p.id DESC`,
    )
    .all() as JoinedRow[];
  return rows.map(toPost);
}

export function getPost(id: number, db: Database = getDb()): PostWithMetrics | null {
  const row = db
    .prepare(
      `SELECT ${POST_COLUMNS}, ${SNAPSHOT_COLUMNS},
              (SELECT COUNT(*) FROM snapshots WHERE postId = p.id) AS snapshotCount
       FROM posts p ${LATEST_SNAPSHOT_JOIN}
       WHERE p.id = ?`,
    )
    .get(id) as JoinedRow | undefined;
  return row ? toPost(row) : null;
}

/** A post's snapshot history, oldest first — how the post matured. */
export function listSnapshots(postId: number, db: Database = getDb()): Snapshot[] {
  return db
    .prepare(
      `SELECT id, postId, capturedAt, views, reach, likes, comments, shares, saves,
              profileVisits, followsFromPost, followerCountAfter
       FROM snapshots WHERE postId = ? ORDER BY capturedAt ASC, id ASC`,
    )
    .all(postId) as Snapshot[];
}

export function latestSnapshot(postId: number, db: Database = getDb()): Snapshot | null {
  const row = db
    .prepare(
      `SELECT id, postId, capturedAt, views, reach, likes, comments, shares, saves,
              profileVisits, followsFromPost, followerCountAfter
       FROM snapshots WHERE postId = ? ORDER BY capturedAt DESC, id DESC LIMIT 1`,
    )
    .get(postId) as Snapshot | undefined;
  return row ?? null;
}

export function listMilestones(db: Database = getDb()): Milestone[] {
  return db
    .prepare(
      `SELECT id, "key" AS key, type, label, achievedAt, postId, metric, value
       FROM milestones ORDER BY achievedAt DESC, id DESC`,
    )
    .all() as Milestone[];
}

/* --- writes ----------------------------------------------------------------- */

export interface PostInput {
  postedAt: string;
  label: string;
  url: string | null;
  format: PostFormat;
  notes: string | null;
}

export interface SnapshotInput extends RawMetrics {
  capturedAt: string;
  followerCountAfter: number;
}

const INSERT_SNAPSHOT = `
  INSERT INTO snapshots
    (postId, capturedAt, views, reach, likes, comments, shares, saves,
     profileVisits, followsFromPost, followerCountAfter)
  VALUES
    (@postId, @capturedAt, @views, @reach, @likes, @comments, @shares, @saves,
     @profileVisits, @followsFromPost, @followerCountAfter)
`;

/** Create a post together with its first snapshot — a post is never numberless. */
export function createPost(
  post: PostInput,
  snapshot: SnapshotInput,
  db: Database = getDb(),
): number {
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO posts (postedAt, label, url, format, notes)
         VALUES (@postedAt, @label, @url, @format, @notes)`,
      )
      .run(post);
    const postId = Number(info.lastInsertRowid);
    db.prepare(INSERT_SNAPSHOT).run({ ...snapshot, postId });
    return postId;
  })();
}

/** Record a later reading for an existing post. */
export function addSnapshot(postId: number, snapshot: SnapshotInput, db: Database = getDb()): number {
  const info = db.prepare(INSERT_SNAPSHOT).run({ ...snapshot, postId });
  return Number(info.lastInsertRowid);
}

export function updatePost(id: number, post: PostInput, db: Database = getDb()): void {
  db.prepare(
    `UPDATE posts SET postedAt = @postedAt, label = @label, url = @url,
            format = @format, notes = @notes WHERE id = @id`,
  ).run({ ...post, id });
}

export function deletePost(id: number, db: Database = getDb()): void {
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
}

export function deleteSnapshot(id: number, db: Database = getDb()): void {
  db.prepare("DELETE FROM snapshots WHERE id = ?").run(id);
}

/* --- milestones -------------------------------------------------------------- */

/**
 * Re-derive every milestone from the current data and insert the ones we do not
 * already have. INSERT OR IGNORE against the UNIQUE key column is what guarantees
 * a milestone never fires twice, even though detection runs on every save.
 *
 * Returns only the newly earned ones, so the caller can show them.
 */
export function syncMilestones(db: Database = getDb()): Milestone[] {
  const posts = listPosts(db);
  const { baselineWindow, startingBaseline, startingFollowers } = getSettings(db);
  const candidates = detectMilestones(posts, baselineWindow, {
    seed: startingBaseline,
    startingFollowers,
  });

  const insert = db.prepare(
    `INSERT OR IGNORE INTO milestones ("key", type, label, achievedAt, postId, metric, value)
     VALUES (@key, @type, @label, @achievedAt, @postId, @metric, @value)`,
  );

  const freshKeys: string[] = [];
  db.transaction(() => {
    for (const c of candidates) {
      const info = insert.run(c);
      if (info.changes > 0) freshKeys.push(c.key);
    }
  })();

  if (freshKeys.length === 0) return [];
  const placeholders = freshKeys.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT id, "key" AS key, type, label, achievedAt, postId, metric, value
       FROM milestones WHERE "key" IN (${placeholders}) ORDER BY achievedAt ASC`,
    )
    .all(...freshKeys) as Milestone[];
}

/* --- series and exports ------------------------------------------------------ */

/**
 * Follower count over time, one reading per day (the last one recorded that day).
 * Snapshots are the only place follower counts live, so this is the growth curve.
 */
export function followerSeries(db: Database = getDb()): { capturedAt: string; followers: number }[] {
  const rows = db
    .prepare(
      `SELECT capturedAt, followerCountAfter FROM snapshots
       WHERE followerCountAfter > 0 ORDER BY capturedAt ASC, id ASC`,
    )
    .all() as { capturedAt: string; followerCountAfter: number }[];

  const byDay = new Map<string, { capturedAt: string; followers: number }>();
  for (const r of rows) {
    byDay.set(r.capturedAt.slice(0, 10), { capturedAt: r.capturedAt, followers: r.followerCountAfter });
  }
  return [...byDay.values()];
}

/** Every post with its full snapshot history — the shape the CSV export wants. */
export function listPostsForExport(db: Database = getDb()) {
  const posts = db
    .prepare(`SELECT id, postedAt, label, url, format, notes FROM posts ORDER BY postedAt ASC, id ASC`)
    .all() as { id: number; postedAt: string; label: string; url: string | null; format: PostFormat; notes: string | null }[];

  return posts.map((p) => ({
    label: p.label,
    postedAt: p.postedAt,
    format: p.format,
    url: p.url,
    notes: p.notes,
    snapshots: listSnapshots(p.id, db).map((s) => ({
      capturedAt: s.capturedAt,
      views: s.views,
      reach: s.reach,
      likes: s.likes,
      comments: s.comments,
      shares: s.shares,
      saves: s.saves,
      profileVisits: s.profileVisits,
      followsFromPost: s.followsFromPost,
      followerCountAfter: s.followerCountAfter,
    })),
  }));
}
