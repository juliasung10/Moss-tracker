/**
 * Data access. Everything the app reads or writes goes through here, so the SQL
 * lives in one place and the rest of the app deals in domain types.
 *
 * Every function is async because libSQL is. Each takes an optional client so the
 * seed scripts and tests can supply their own connection.
 */

import { getDb, int, type Client } from "./db.ts";
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

function conn(db?: Client): Promise<Client> {
  return db ? Promise.resolve(db) : getDb();
}

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

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "");
const nullableStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toPost(row: Row): PostWithMetrics {
  return {
    id: int(row.id),
    postedAt: str(row.postedAt),
    label: str(row.label),
    url: nullableStr(row.url),
    format: str(row.format) as PostFormat,
    notes: nullableStr(row.notes),
    snapshotCount: int(row.snapshotCount),
    current: {
      id: int(row.s_id),
      postId: int(row.s_postId),
      capturedAt: str(row.s_capturedAt),
      views: int(row.s_views),
      reach: int(row.s_reach),
      likes: int(row.s_likes),
      comments: int(row.s_comments),
      shares: int(row.s_shares),
      saves: int(row.s_saves),
      profileVisits: int(row.s_profileVisits),
      followsFromPost: int(row.s_followsFromPost),
      followerCountAfter: int(row.s_followerCountAfter),
    },
  };
}

function toSnapshot(row: Row): Snapshot {
  return {
    id: int(row.id),
    postId: int(row.postId),
    capturedAt: str(row.capturedAt),
    views: int(row.views),
    reach: int(row.reach),
    likes: int(row.likes),
    comments: int(row.comments),
    shares: int(row.shares),
    saves: int(row.saves),
    profileVisits: int(row.profileVisits),
    followsFromPost: int(row.followsFromPost),
    followerCountAfter: int(row.followerCountAfter),
  };
}

/* --- settings --------------------------------------------------------------- */

export async function getSettings(db?: Client): Promise<Settings> {
  const c = await conn(db);
  const { rows } = await c.execute(`SELECT "key", value FROM settings`);
  const map = new Map(rows.map((r) => [str(r.key), str(r.value)]));

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

export async function setSetting(key: string, value: string, db?: Client): Promise<void> {
  const c = await conn(db);
  await c.execute({
    sql: `INSERT INTO settings ("key", value) VALUES (:key, :value)
          ON CONFLICT("key") DO UPDATE SET value = excluded.value`,
    args: { key, value },
  });
}

/* --- reads ------------------------------------------------------------------ */

export async function listPosts(db?: Client): Promise<PostWithMetrics[]> {
  const c = await conn(db);
  const { rows } = await c.execute(
    `SELECT ${POST_COLUMNS}, ${SNAPSHOT_COLUMNS},
            (SELECT COUNT(*) FROM snapshots WHERE postId = p.id) AS snapshotCount
     FROM posts p ${LATEST_SNAPSHOT_JOIN}
     ORDER BY p.postedAt DESC, p.id DESC`,
  );
  return rows.map((r) => toPost(r as Row));
}

export async function getPost(id: number, db?: Client): Promise<PostWithMetrics | null> {
  const c = await conn(db);
  const { rows } = await c.execute({
    sql: `SELECT ${POST_COLUMNS}, ${SNAPSHOT_COLUMNS},
                 (SELECT COUNT(*) FROM snapshots WHERE postId = p.id) AS snapshotCount
          FROM posts p ${LATEST_SNAPSHOT_JOIN}
          WHERE p.id = :id`,
    args: { id },
  });
  return rows.length > 0 ? toPost(rows[0] as Row) : null;
}

/** A post's snapshot history, oldest first — how the post matured. */
export async function listSnapshots(postId: number, db?: Client): Promise<Snapshot[]> {
  const c = await conn(db);
  const { rows } = await c.execute({
    sql: `SELECT id, postId, capturedAt, views, reach, likes, comments, shares, saves,
                 profileVisits, followsFromPost, followerCountAfter
          FROM snapshots WHERE postId = :postId ORDER BY capturedAt ASC, id ASC`,
    args: { postId },
  });
  return rows.map((r) => toSnapshot(r as Row));
}

export async function latestSnapshot(postId: number, db?: Client): Promise<Snapshot | null> {
  const c = await conn(db);
  const { rows } = await c.execute({
    sql: `SELECT id, postId, capturedAt, views, reach, likes, comments, shares, saves,
                 profileVisits, followsFromPost, followerCountAfter
          FROM snapshots WHERE postId = :postId ORDER BY capturedAt DESC, id DESC LIMIT 1`,
    args: { postId },
  });
  return rows.length > 0 ? toSnapshot(rows[0] as Row) : null;
}

export async function listMilestones(db?: Client): Promise<Milestone[]> {
  const c = await conn(db);
  const { rows } = await c.execute(
    `SELECT id, "key" AS key, type, label, achievedAt, postId, metric, value
     FROM milestones ORDER BY achievedAt DESC, id DESC`,
  );
  return rows.map((r) => ({
    id: int(r.id),
    key: str(r.key),
    type: str(r.type) as Milestone["type"],
    label: str(r.label),
    achievedAt: str(r.achievedAt),
    postId: r.postId === null || r.postId === undefined ? null : int(r.postId),
    metric: nullableStr(r.metric),
    value: Number(r.value ?? 0),
  }));
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
    (:postId, :capturedAt, :views, :reach, :likes, :comments, :shares, :saves,
     :profileVisits, :followsFromPost, :followerCountAfter)
`;

function snapshotArgs(postId: number, s: SnapshotInput) {
  return {
    postId,
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
  };
}

/** Create a post together with its first snapshot — a post is never numberless. */
export async function createPost(
  post: PostInput,
  snapshot: SnapshotInput,
  db?: Client,
): Promise<number> {
  const c = await conn(db);
  const tx = await c.transaction("write");
  try {
    const result = await tx.execute({
      sql: `INSERT INTO posts (postedAt, label, url, format, notes)
            VALUES (:postedAt, :label, :url, :format, :notes)`,
      args: {
        postedAt: post.postedAt,
        label: post.label,
        url: post.url,
        format: post.format,
        notes: post.notes,
      },
    });
    const postId = int(result.lastInsertRowid);
    await tx.execute({ sql: INSERT_SNAPSHOT, args: snapshotArgs(postId, snapshot) });
    await tx.commit();
    return postId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/** Record a later reading for an existing post. */
export async function addSnapshot(
  postId: number,
  snapshot: SnapshotInput,
  db?: Client,
): Promise<number> {
  const c = await conn(db);
  const result = await c.execute({ sql: INSERT_SNAPSHOT, args: snapshotArgs(postId, snapshot) });
  return int(result.lastInsertRowid);
}

export async function updatePost(id: number, post: PostInput, db?: Client): Promise<void> {
  const c = await conn(db);
  await c.execute({
    sql: `UPDATE posts SET postedAt = :postedAt, label = :label, url = :url,
                 format = :format, notes = :notes WHERE id = :id`,
    args: {
      id,
      postedAt: post.postedAt,
      label: post.label,
      url: post.url,
      format: post.format,
      notes: post.notes,
    },
  });
}

export async function deletePost(id: number, db?: Client): Promise<void> {
  const c = await conn(db);
  // Turso does not enable foreign keys by default, so the cascade is explicit.
  await c.batch(
    [
      { sql: "DELETE FROM snapshots WHERE postId = ?", args: [id] },
      { sql: "UPDATE milestones SET postId = NULL WHERE postId = ?", args: [id] },
      { sql: "DELETE FROM posts WHERE id = ?", args: [id] },
    ],
    "write",
  );
}

export async function deleteSnapshot(id: number, db?: Client): Promise<void> {
  const c = await conn(db);
  await c.execute({ sql: "DELETE FROM snapshots WHERE id = ?", args: [id] });
}

/* --- milestones -------------------------------------------------------------- */

/**
 * Re-derive every milestone from the current data and insert the ones we do not
 * already have. INSERT OR IGNORE against the UNIQUE key column is what guarantees
 * a milestone never fires twice, even though detection runs on every save.
 *
 * Returns only the newly earned ones, so the caller can show them.
 */
export async function syncMilestones(db?: Client): Promise<Milestone[]> {
  const c = await conn(db);
  const posts = await listPosts(c);
  const { baselineWindow, startingBaseline, startingFollowers } = await getSettings(c);
  const candidates = detectMilestones(posts, baselineWindow, {
    seed: startingBaseline,
    startingFollowers,
  });
  if (candidates.length === 0) return [];

  const before = new Set(
    (await c.execute(`SELECT "key" FROM milestones`)).rows.map((r) => str(r.key)),
  );
  const unseen = candidates.filter((m) => !before.has(m.key));
  if (unseen.length === 0) return [];

  await c.batch(
    unseen.map((m) => ({
      sql: `INSERT OR IGNORE INTO milestones ("key", type, label, achievedAt, postId, metric, value)
            VALUES (:key, :type, :label, :achievedAt, :postId, :metric, :value)`,
      args: {
        key: m.key,
        type: m.type,
        label: m.label,
        achievedAt: m.achievedAt,
        postId: m.postId,
        metric: m.metric,
        value: m.value,
      },
    })),
    "write",
  );

  const all = await listMilestones(c);
  const freshKeys = new Set(unseen.map((m) => m.key));
  return all.filter((m) => freshKeys.has(m.key)).sort((a, b) => Date.parse(a.achievedAt) - Date.parse(b.achievedAt));
}

/* --- series and exports ------------------------------------------------------ */

/**
 * Follower count over time, one reading per day (the last one recorded that day).
 * Snapshots are the only place follower counts live, so this is the growth curve.
 */
export async function followerSeries(
  db?: Client,
): Promise<{ capturedAt: string; followers: number }[]> {
  const c = await conn(db);
  const { rows } = await c.execute(
    `SELECT capturedAt, followerCountAfter FROM snapshots
     WHERE followerCountAfter > 0 ORDER BY capturedAt ASC, id ASC`,
  );

  const byDay = new Map<string, { capturedAt: string; followers: number }>();
  for (const r of rows) {
    const capturedAt = str(r.capturedAt);
    byDay.set(capturedAt.slice(0, 10), { capturedAt, followers: int(r.followerCountAfter) });
  }
  return [...byDay.values()];
}

/** Every post with its full snapshot history — the shape the CSV export wants. */
export async function listPostsForExport(db?: Client) {
  const c = await conn(db);
  const { rows } = await c.execute(
    `SELECT id, postedAt, label, url, format, notes FROM posts ORDER BY postedAt ASC, id ASC`,
  );

  return Promise.all(
    rows.map(async (p) => ({
      label: str(p.label),
      postedAt: str(p.postedAt),
      format: str(p.format) as PostFormat,
      url: nullableStr(p.url),
      notes: nullableStr(p.notes),
      snapshots: (await listSnapshots(int(p.id), c)).map((s) => ({
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
    })),
  );
}
