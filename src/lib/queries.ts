/**
 * Data access. Everything the app reads or writes goes through here, so the SQL
 * lives in one place and the rest of the app deals in domain types.
 *
 * Postgres dialect: $1 placeholders, RETURNING instead of lastInsertRowid, and
 * every camelCase identifier quoted so Postgres does not fold it to lowercase.
 */

import { getDb, int, type Db } from "./db.ts";
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

function conn(db?: Db): Promise<Db> {
  return db ? Promise.resolve(db) : getDb();
}

const POST_COLUMNS = `
  p.id           AS id,
  p."postedAt"   AS "postedAt",
  p.label        AS label,
  p.url          AS url,
  p.format       AS format,
  p.notes        AS notes
`;

const SNAPSHOT_COLUMNS = `
  s.id                   AS "s_id",
  s."postId"             AS "s_postId",
  s."capturedAt"         AS "s_capturedAt",
  s.views                AS "s_views",
  s.reach                AS "s_reach",
  s.likes                AS "s_likes",
  s.comments             AS "s_comments",
  s.shares               AS "s_shares",
  s.saves                AS "s_saves",
  s."profileVisits"      AS "s_profileVisits",
  s."followsFromPost"    AS "s_followsFromPost",
  s."followerCountAfter" AS "s_followerCountAfter"
`;

/** Joins each post to its newest snapshot. Ties on capturedAt fall back to insert order. */
const LATEST_SNAPSHOT_JOIN = `
  JOIN snapshots s ON s.id = (
    SELECT id FROM snapshots
    WHERE "postId" = p.id
    ORDER BY "capturedAt" DESC, id DESC
    LIMIT 1
  )
`;

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "");
const nullableStr = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

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

const SNAPSHOT_SELECT = `
  id, "postId", "capturedAt", views, reach, likes, comments, shares, saves,
  "profileVisits", "followsFromPost", "followerCountAfter"
`;

/* --- settings --------------------------------------------------------------- */

export async function getSettings(db?: Db): Promise<Settings> {
  const c = await conn(db);
  const { rows } = await c.query(`SELECT "key", value FROM settings`);
  const map = new Map(rows.map((r) => [str((r as Row).key), str((r as Row).value)]));

  const raw = Number(map.get("baselineWindow"));
  const baselineWindow =
    Number.isFinite(raw) && raw >= 2 && raw <= 100
      ? Math.round(raw)
      : DEFAULT_SETTINGS.baselineWindow;

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

export async function setSetting(key: string, value: string, db?: Db): Promise<void> {
  const c = await conn(db);
  await c.query(
    `INSERT INTO settings ("key", value) VALUES ($1, $2)
     ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

/* --- reads ------------------------------------------------------------------ */

export async function listPosts(db?: Db): Promise<PostWithMetrics[]> {
  const c = await conn(db);
  const { rows } = await c.query(
    `SELECT ${POST_COLUMNS}, ${SNAPSHOT_COLUMNS},
            (SELECT COUNT(*) FROM snapshots WHERE "postId" = p.id) AS "snapshotCount"
     FROM posts p ${LATEST_SNAPSHOT_JOIN}
     ORDER BY p."postedAt" DESC, p.id DESC`,
  );
  return rows.map((r) => toPost(r as Row));
}

export async function getPost(id: number, db?: Db): Promise<PostWithMetrics | null> {
  const c = await conn(db);
  const { rows } = await c.query(
    `SELECT ${POST_COLUMNS}, ${SNAPSHOT_COLUMNS},
            (SELECT COUNT(*) FROM snapshots WHERE "postId" = p.id) AS "snapshotCount"
     FROM posts p ${LATEST_SNAPSHOT_JOIN}
     WHERE p.id = $1`,
    [id],
  );
  return rows.length > 0 ? toPost(rows[0] as Row) : null;
}

/** A post's snapshot history, oldest first — how the post matured. */
export async function listSnapshots(postId: number, db?: Db): Promise<Snapshot[]> {
  const c = await conn(db);
  const { rows } = await c.query(
    `SELECT ${SNAPSHOT_SELECT} FROM snapshots
     WHERE "postId" = $1 ORDER BY "capturedAt" ASC, id ASC`,
    [postId],
  );
  return rows.map((r) => toSnapshot(r as Row));
}

export async function latestSnapshot(postId: number, db?: Db): Promise<Snapshot | null> {
  const c = await conn(db);
  const { rows } = await c.query(
    `SELECT ${SNAPSHOT_SELECT} FROM snapshots
     WHERE "postId" = $1 ORDER BY "capturedAt" DESC, id DESC LIMIT 1`,
    [postId],
  );
  return rows.length > 0 ? toSnapshot(rows[0] as Row) : null;
}

export async function listMilestones(db?: Db): Promise<Milestone[]> {
  const c = await conn(db);
  const { rows } = await c.query(
    `SELECT id, "key", type, label, "achievedAt", "postId", metric, value
     FROM milestones ORDER BY "achievedAt" DESC, id DESC`,
  );
  return rows.map((raw) => {
    const r = raw as Row;
    return {
      id: int(r.id),
      key: str(r.key),
      type: str(r.type) as Milestone["type"],
      label: str(r.label),
      achievedAt: str(r.achievedAt),
      postId: r.postId === null || r.postId === undefined ? null : int(r.postId),
      metric: nullableStr(r.metric),
      value: Number(r.value ?? 0),
    };
  });
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

function snapshotValues(s: SnapshotInput): unknown[] {
  return [
    s.capturedAt,
    s.views,
    s.reach,
    s.likes,
    s.comments,
    s.shares,
    s.saves,
    s.profileVisits,
    s.followsFromPost,
    s.followerCountAfter,
  ];
}

const SNAPSHOT_INSERT_COLUMNS = `
  "postId", "capturedAt", views, reach, likes, comments, shares, saves,
  "profileVisits", "followsFromPost", "followerCountAfter"
`;

/**
 * Create a post together with its first snapshot — a post is never numberless.
 *
 * Done as one data-modifying CTE rather than an explicit transaction: a single
 * statement is atomic on its own, which keeps this correct without holding a
 * dedicated connection out of the pool.
 */
export async function createPost(
  post: PostInput,
  snapshot: SnapshotInput,
  db?: Db,
): Promise<number> {
  const c = await conn(db);
  const { rows } = await c.query<{ id: number }>(
    `WITH new_post AS (
       INSERT INTO posts ("postedAt", label, url, format, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id
     )
     INSERT INTO snapshots (${SNAPSHOT_INSERT_COLUMNS})
     SELECT id, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15 FROM new_post
     RETURNING "postId" AS id`,
    [post.postedAt, post.label, post.url, post.format, post.notes, ...snapshotValues(snapshot)],
  );
  return int(rows[0]?.id);
}

/** Record a later reading for an existing post. */
export async function addSnapshot(
  postId: number,
  snapshot: SnapshotInput,
  db?: Db,
): Promise<number> {
  const c = await conn(db);
  const { rows } = await c.query<{ id: number }>(
    `INSERT INTO snapshots (${SNAPSHOT_INSERT_COLUMNS})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [postId, ...snapshotValues(snapshot)],
  );
  return int(rows[0]?.id);
}

export async function updatePost(id: number, post: PostInput, db?: Db): Promise<void> {
  const c = await conn(db);
  await c.query(
    `UPDATE posts SET "postedAt" = $2, label = $3, url = $4, format = $5, notes = $6
     WHERE id = $1`,
    [id, post.postedAt, post.label, post.url, post.format, post.notes],
  );
}

/** Snapshots cascade and milestone references null out — both enforced by the schema. */
export async function deletePost(id: number, db?: Db): Promise<void> {
  const c = await conn(db);
  await c.query("DELETE FROM posts WHERE id = $1", [id]);
}

export async function deleteSnapshot(id: number, db?: Db): Promise<void> {
  const c = await conn(db);
  await c.query("DELETE FROM snapshots WHERE id = $1", [id]);
}

/* --- milestones -------------------------------------------------------------- */

/**
 * Re-derive every milestone from the current data and insert the ones we do not
 * already have. ON CONFLICT DO NOTHING against the UNIQUE key column is what
 * guarantees a milestone never fires twice, even though detection runs on every
 * save — and RETURNING tells us exactly which ones were new.
 */
export async function syncMilestones(db?: Db): Promise<Milestone[]> {
  const c = await conn(db);
  const posts = await listPosts(c);
  const { baselineWindow, startingBaseline, startingFollowers } = await getSettings(c);
  const candidates = detectMilestones(posts, baselineWindow, {
    seed: startingBaseline,
    startingFollowers,
  });
  if (candidates.length === 0) return [];

  const params: unknown[] = [];
  const tuples = candidates.map((m) => {
    const base = params.length;
    params.push(m.key, m.type, m.label, m.achievedAt, m.postId, m.metric, m.value);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
  });

  const { rows } = await c.query<{ key: string }>(
    `INSERT INTO milestones ("key", type, label, "achievedAt", "postId", metric, value)
     VALUES ${tuples.join(", ")}
     ON CONFLICT ("key") DO NOTHING
     RETURNING "key"`,
    params,
  );
  if (rows.length === 0) return [];

  const freshKeys = new Set(rows.map((r) => str(r.key)));
  const all = await listMilestones(c);
  return all
    .filter((m) => freshKeys.has(m.key))
    .sort((a, b) => Date.parse(a.achievedAt) - Date.parse(b.achievedAt));
}

/* --- series and exports ------------------------------------------------------ */

/**
 * Follower count over time, one reading per day (the last one recorded that day).
 * Snapshots are the only place follower counts live, so this is the growth curve.
 */
export async function followerSeries(
  db?: Db,
): Promise<{ capturedAt: string; followers: number }[]> {
  const c = await conn(db);
  const { rows } = await c.query(
    `SELECT "capturedAt", "followerCountAfter" FROM snapshots
     WHERE "followerCountAfter" > 0 ORDER BY "capturedAt" ASC, id ASC`,
  );

  const byDay = new Map<string, { capturedAt: string; followers: number }>();
  for (const raw of rows) {
    const r = raw as Row;
    const capturedAt = str(r.capturedAt);
    byDay.set(capturedAt.slice(0, 10), {
      capturedAt,
      followers: int(r.followerCountAfter),
    });
  }
  return [...byDay.values()];
}

/**
 * Every post with its full snapshot history — the shape the CSV export wants.
 * Two queries rather than one per post: over a network, round trips are the cost.
 */
export async function listPostsForExport(db?: Db) {
  const c = await conn(db);
  const [{ rows: postRows }, { rows: snapshotRows }] = await Promise.all([
    c.query(`SELECT id, "postedAt", label, url, format, notes FROM posts ORDER BY "postedAt" ASC, id ASC`),
    c.query(`SELECT ${SNAPSHOT_SELECT} FROM snapshots ORDER BY "capturedAt" ASC, id ASC`),
  ]);

  const byPost = new Map<number, Snapshot[]>();
  for (const raw of snapshotRows) {
    const snapshot = toSnapshot(raw as Row);
    const list = byPost.get(snapshot.postId);
    if (list) list.push(snapshot);
    else byPost.set(snapshot.postId, [snapshot]);
  }

  return postRows.map((raw) => {
    const p = raw as Row;
    return {
      label: str(p.label),
      postedAt: str(p.postedAt),
      format: str(p.format) as PostFormat,
      url: nullableStr(p.url),
      notes: nullableStr(p.notes),
      snapshots: (byPost.get(int(p.id)) ?? []).map((s) => ({
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
    };
  });
}
