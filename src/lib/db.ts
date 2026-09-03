/**
 * Postgres connection and migrations.
 *
 * One SQL dialect, two backends chosen by environment:
 *
 *   - DATABASE_URL set  -> real Postgres (Vercel Postgres / Neon) via node-postgres
 *   - nothing set       -> PGlite, Postgres compiled to WASM, persisted under data/pg
 *
 * PGlite is genuine Postgres, so local development runs exactly the SQL that
 * production runs, with no server to install and no cloud account. It is loaded
 * lazily so it never enters the production bundle.
 *
 * Note on identifiers: Postgres folds unquoted names to lowercase, so every
 * camelCase column is quoted — "postedAt", not postedAt. Miss a quote and the
 * column will not be found.
 */

import path from "node:path";

/**
 * Postgres integrations each pick their own variable name: Neon and Vercel use
 * DATABASE_URL, Supabase uses POSTGRES_URL, Prisma-flavoured setups use
 * POSTGRES_PRISMA_URL. Accept any of them rather than making the user rename one.
 *
 * Pooled URLs come first: serverless functions open and drop connections
 * constantly, which a direct connection limit will not survive.
 */
export const CONNECTION_STRING_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "SUPABASE_DB_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
] as const;

function findConnectionString(): { name: string; value: string } | null {
  for (const name of CONNECTION_STRING_VARS) {
    const value = process.env[name];
    if (value && value.trim() !== "") return { name, value };
  }
  return null;
}

const FOUND = findConnectionString();

export const CONNECTION_STRING = FOUND?.value ?? null;
/** Which variable supplied it — shown on the Settings screen, never the value. */
export const CONNECTION_SOURCE = FOUND?.name ?? null;

/**
 * Names only, never values, of the database-ish variables this deployment can see.
 * Shown when no connection string is found so a misnamed variable is visible
 * instead of guessed at.
 */
export function visibleDatabaseVars(): string[] {
  return Object.keys(process.env)
    .filter((k) => /^(DATABASE|POSTGRES|PG|SUPABASE)/.test(k))
    .sort();
}

export const IS_REMOTE = CONNECTION_STRING !== null;

/**
 * Vercel (and any serverless host) has a read-only, ephemeral filesystem. PGlite
 * writes files, so falling back to it there would either crash or — worse — appear
 * to work and lose every post between requests.
 */
export const IS_SERVERLESS = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;

/**
 * Why the database cannot be opened, or null if it can. Pages check this and render
 * setup instructions rather than throwing a server-side exception the host reduces
 * to a digest number.
 */
export function databaseProblem(): string | null {
  if (CONNECTION_STRING) return null;
  if (IS_SERVERLESS) {
    return "No database connection string is set. This deployment has no database attached, and the local file-backed fallback cannot run on a serverless host.";
  }
  return null;
}

/** Where PGlite keeps its files when running locally. */
export const LOCAL_DATA_DIR = path.join(process.cwd(), "data", "pg");

export interface QueryResult<T> {
  rows: T[];
}

/** The narrow surface both backends share. */
export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  /**
   * Run several statements in one go. Parameterised queries use the extended
   * protocol, which permits exactly one command — so schema work needs its own
   * door. Never pass user input here.
   */
  exec(sql: string): Promise<void>;
  /**
   * Release the connection. Long-running servers never call this; one-shot scripts
   * must, or a file-backed PGlite database is left locked for the next process.
   */
  close(): Promise<void>;
}

const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE posts (
        id          SERIAL PRIMARY KEY,
        "postedAt"  TEXT NOT NULL,
        label       TEXT NOT NULL,
        url         TEXT,
        format      TEXT NOT NULL CHECK (format IN ('reel', 'carousel', 'image')),
        notes       TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_posts_posted_at ON posts ("postedAt");

      -- Every number lives here. A post always has at least one snapshot; its
      -- "current" figures are the row with the newest capturedAt.
      CREATE TABLE snapshots (
        id                   SERIAL PRIMARY KEY,
        "postId"             INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
        "capturedAt"         TEXT NOT NULL,
        views                INTEGER NOT NULL DEFAULT 0,
        reach                INTEGER NOT NULL DEFAULT 0,
        likes                INTEGER NOT NULL DEFAULT 0,
        comments             INTEGER NOT NULL DEFAULT 0,
        shares               INTEGER NOT NULL DEFAULT 0,
        saves                INTEGER NOT NULL DEFAULT 0,
        "profileVisits"      INTEGER NOT NULL DEFAULT 0,
        "followsFromPost"    INTEGER NOT NULL DEFAULT 0,
        "followerCountAfter" INTEGER NOT NULL DEFAULT 0,
        "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_snapshots_post ON snapshots ("postId", "capturedAt" DESC);

      -- "key" is UNIQUE: this is what makes milestone detection idempotent.
      CREATE TABLE milestones (
        id           SERIAL PRIMARY KEY,
        "key"        TEXT NOT NULL UNIQUE,
        type         TEXT NOT NULL,
        label        TEXT NOT NULL,
        "achievedAt" TEXT NOT NULL,
        "postId"     INTEGER REFERENCES posts (id) ON DELETE SET NULL,
        metric       TEXT,
        value        DOUBLE PRECISION NOT NULL,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_milestones_achieved_at ON milestones ("achievedAt" DESC);

      CREATE TABLE settings (
        "key" TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

async function createBackend(connectionString: string | null): Promise<Db> {
  const problem = databaseProblem();
  if (problem) throw new Error(problem);

  if (connectionString) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString,
      ssl: sslConfig(connectionString),
      // Serverless functions are short-lived; a big pool just exhausts the server.
      max: 3,
      idleTimeoutMillis: 10_000,
    });
    return {
      query: async (sql, params) => {
        const result = await pool.query(sql, params as never[]);
        return { rows: result.rows };
      },
      // Without parameters node-postgres uses the simple protocol, which accepts
      // multiple statements and wraps them in an implicit transaction.
      exec: async (sql) => {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const pglite = new PGlite(LOCAL_DATA_DIR);
  await pglite.waitReady;
  return {
    query: async (sql, params) => {
      const result = await pglite.query(sql, params as never[]);
      return { rows: result.rows as never[] };
    },
    exec: async (sql) => {
      await pglite.exec(sql);
    },
    close: () => pglite.close(),
  };
}

/**
 * TLS settings, following libpq's sslmode semantics rather than inventing our own.
 *
 * The distinction matters: `require` means "encrypt the connection", NOT "verify
 * the server's identity" — only `verify-ca` and `verify-full` ask for verification.
 * Managed providers (Supabase's pooler among them) routinely present certificates
 * signed by their own CA, so verifying by default rejects a perfectly normal setup
 * with "self-signed certificate in certificate chain".
 *
 * Traffic is still encrypted in every mode except `disable`. Set
 * sslmode=verify-full in the connection string to demand a publicly trusted chain.
 */
export function sslConfig(connectionString: string): false | { rejectUnauthorized: boolean } | undefined {
  const mode = readSslMode(connectionString);

  if (mode === "disable") return false;
  if (/@(localhost|127\.0\.0\.1)/.test(connectionString) && mode === null) return undefined;
  if (process.env.PGSSL_NO_VERIFY === "1") return { rejectUnauthorized: false };

  return { rejectUnauthorized: mode === "verify-ca" || mode === "verify-full" };
}

function readSslMode(connectionString: string): string | null {
  try {
    return new URL(connectionString).searchParams.get("sslmode");
  } catch {
    return null;
  }
}

interface Cache {
  db?: Promise<Db>;
}

function cache(): Cache {
  const g = globalThis as typeof globalThis & { __moss?: Cache };
  g.__moss ??= {};
  return g.__moss;
}

/**
 * The shared connection, guaranteed migrated. Cached on globalThis so Next's
 * dev-mode module reloading does not reconnect or re-migrate on every edit.
 */
export function getDb(): Promise<Db> {
  const c = cache();
  c.db ??= (async () => {
    const db = await createBackend(CONNECTION_STRING);
    await migrate(db);
    return db;
  })();
  return c.db;
}

export async function migrate(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const { rows } = await db.query<{ id: number }>("SELECT id FROM _migrations");
  const applied = new Set(rows.map((r) => Number(r.id)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    // Wrapped in a transaction: the whole migration lands or none of it does.
    await db.exec(`
      BEGIN;
      ${migration.sql}
      INSERT INTO _migrations (id, name) VALUES (${migration.id}, '${migration.name.replace(/'/g, "''")}');
      COMMIT;
    `);
  }
}

/** Open a connection explicitly — used by the seed and reset scripts and by tests. */
export async function openDb(connectionString: string | null = CONNECTION_STRING): Promise<Db> {
  const db = await createBackend(connectionString);
  await migrate(db);
  return db;
}

/** Delete every row, leaving the schema in place. */
export async function wipe(db: Db): Promise<void> {
  // RESTART IDENTITY resets the id sequences; CASCADE clears dependent rows.
  await db.query("TRUNCATE milestones, snapshots, posts RESTART IDENTITY CASCADE");
}

/** Postgres returns BIGINT and NUMERIC as strings; counts come back as numbers. */
export function int(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** A human-readable description of where the data lives, for the Settings screen. */
export function describeDatabase(): string {
  if (!CONNECTION_STRING) return LOCAL_DATA_DIR;
  try {
    const url = new URL(CONNECTION_STRING);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "hosted Postgres";
  }
}
