/**
 * SQLite connection and migrations.
 *
 * One file, data/moss.db, holds everything. Migrations are numbered and applied
 * once, tracked in `_migrations`, so an existing database upgrades in place rather
 * than needing a wipe.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const DB_PATH = process.env.MOSS_DB_PATH ?? path.join(process.cwd(), "data", "moss.db");

interface Migration {
  id: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE posts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        postedAt    TEXT    NOT NULL,
        label       TEXT    NOT NULL,
        url         TEXT,
        format      TEXT    NOT NULL CHECK (format IN ('reel', 'carousel', 'image')),
        notes       TEXT,
        createdAt   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_posts_postedAt ON posts (postedAt);

      -- Every number lives here. A post always has at least one snapshot; its
      -- "current" figures are the row with the newest capturedAt.
      CREATE TABLE snapshots (
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
      );
      CREATE INDEX idx_snapshots_post ON snapshots (postId, capturedAt DESC);

      -- "key" is UNIQUE: this is what makes milestone detection idempotent.
      CREATE TABLE milestones (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        "key"       TEXT    NOT NULL UNIQUE,
        type        TEXT    NOT NULL,
        label       TEXT    NOT NULL,
        achievedAt  TEXT    NOT NULL,
        postId      INTEGER REFERENCES posts (id) ON DELETE SET NULL,
        metric      TEXT,
        value       REAL    NOT NULL,
        createdAt   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_milestones_achievedAt ON milestones (achievedAt DESC);

      CREATE TABLE settings (
        "key"  TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      );
    `,
  },
];

let cached: Database.Database | null = null;

/**
 * The shared connection. Cached on globalThis so Next's dev-mode module reloading
 * doesn't open a new handle on every edit.
 */
export function getDb(): Database.Database {
  const g = globalThis as typeof globalThis & { __mossDb?: Database.Database };
  if (g.__mossDb) return g.__mossDb;
  if (cached) return cached;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  cached = db;
  g.__mossDb = db;
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    appliedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  const applied = new Set(
    db.prepare("SELECT id FROM _migrations").all().map((r) => (r as { id: number }).id),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (id, name) VALUES (?, ?)").run(migration.id, migration.name);
    })();
  }
}

/** Open a connection at an explicit path — used by the seed and reset scripts. */
export function openDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** Delete every row, leaving the schema in place. */
export function wipe(db: Database.Database): void {
  db.transaction(() => {
    db.exec("DELETE FROM milestones");
    db.exec("DELETE FROM snapshots");
    db.exec("DELETE FROM posts");
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('posts','snapshots','milestones')");
  })();
}
