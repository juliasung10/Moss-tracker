/**
 * libSQL connection and migrations.
 *
 * One code path serves both environments. With no TURSO_DATABASE_URL set, this
 * opens a local file at data/moss.db exactly as before, so `npm run dev` needs no
 * credentials and no cloud account. In production it points at Turso instead.
 *
 * libSQL is asynchronous, unlike better-sqlite3 — every read and write here returns
 * a promise. That is the one real cost of being deployable.
 */

import { createClient, type Client, type InArgs } from "@libsql/client";
import path from "node:path";

/** Local file by default; Turso when the environment provides a URL. */
export const DB_URL =
  process.env.TURSO_DATABASE_URL ?? `file:${path.join(process.cwd(), "data", "moss.db")}`;

export const IS_REMOTE = !DB_URL.startsWith("file:");

interface Migration {
  id: number;
  name: string;
  statements: string[];
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "initial schema",
    statements: [
      `CREATE TABLE posts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        postedAt    TEXT    NOT NULL,
        label       TEXT    NOT NULL,
        url         TEXT,
        format      TEXT    NOT NULL CHECK (format IN ('reel', 'carousel', 'image')),
        notes       TEXT,
        createdAt   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`,
      `CREATE INDEX idx_posts_postedAt ON posts (postedAt)`,
      // Every number lives here. A post always has at least one snapshot; its
      // "current" figures are the row with the newest capturedAt.
      `CREATE TABLE snapshots (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        postId              INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
        capturedAt          TEXT    NOT NULL,
        views               INTEGER NOT NULL DEFAULT 0,
        reach               INTEGER NOT NULL DEFAULT 0,
        likes               INTEGER NOT NULL DEFAULT 0,
        comments            INTEGER NOT NULL DEFAULT 0,
        shares              INTEGER NOT NULL DEFAULT 0,
        saves               INTEGER NOT NULL DEFAULT 0,
        profileVisits       INTEGER NOT NULL DEFAULT 0,
        followsFromPost     INTEGER NOT NULL DEFAULT 0,
        followerCountAfter  INTEGER NOT NULL DEFAULT 0,
        createdAt           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`,
      `CREATE INDEX idx_snapshots_post ON snapshots (postId, capturedAt DESC)`,
      // "key" is UNIQUE: this is what makes milestone detection idempotent.
      `CREATE TABLE milestones (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        "key"       TEXT    NOT NULL UNIQUE,
        type        TEXT    NOT NULL,
        label       TEXT    NOT NULL,
        achievedAt  TEXT    NOT NULL,
        postId      INTEGER REFERENCES posts (id) ON DELETE SET NULL,
        metric      TEXT,
        value       REAL    NOT NULL,
        createdAt   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )`,
      `CREATE INDEX idx_milestones_achievedAt ON milestones (achievedAt DESC)`,
      `CREATE TABLE settings (
        "key"  TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      )`,
    ],
  },
];

function makeClient(url = DB_URL): Client {
  return createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

/**
 * The shared client, plus a one-time migration promise.
 *
 * Both are cached on globalThis so Next's dev-mode module reloading does not open a
 * new connection or re-run migrations on every edit. Callers await `getDb()`, which
 * resolves only once the schema is in place.
 */
interface Cache {
  client?: Client;
  migrated?: Promise<Client>;
}

function cache(): Cache {
  const g = globalThis as typeof globalThis & { __moss?: Cache };
  g.__moss ??= {};
  return g.__moss;
}

export function getClient(): Client {
  const c = cache();
  c.client ??= makeClient();
  return c.client;
}

/** The client, guaranteed migrated. Await this before any query. */
export function getDb(): Promise<Client> {
  const c = cache();
  c.migrated ??= (async () => {
    const client = getClient();
    await migrate(client);
    return client;
  })();
  return c.migrated;
}

export async function migrate(db: Client): Promise<void> {
  await db.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    appliedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  const existing = await db.execute("SELECT id FROM _migrations");
  const applied = new Set(existing.rows.map((r) => Number(r.id)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    // batch() is transactional: either the whole migration lands or none of it does.
    await db.batch(
      [
        ...migration.statements,
        {
          sql: "INSERT INTO _migrations (id, name) VALUES (?, ?)",
          args: [migration.id, migration.name],
        },
      ],
      "write",
    );
  }
}

/** Open a connection at an explicit URL — used by the seed and reset scripts. */
export async function openDb(url: string = DB_URL): Promise<Client> {
  const db = makeClient(url);
  await migrate(db);
  return db;
}

/** Delete every row, leaving the schema in place. */
export async function wipe(db: Client): Promise<void> {
  await db.batch(
    [
      "DELETE FROM milestones",
      "DELETE FROM snapshots",
      "DELETE FROM posts",
      "DELETE FROM sqlite_sequence WHERE name IN ('posts','snapshots','milestones')",
    ],
    "write",
  );
}

/** libSQL returns INTEGER columns as number or bigint depending on size. */
export function int(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

export type { Client, InArgs };
