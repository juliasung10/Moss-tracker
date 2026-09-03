"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { comparePost, type PostComparison } from "./metrics.ts";
import {
  addSnapshot,
  createPost,
  listSnapshots,
  deletePost,
  deleteSnapshot,
  getPost,
  getSettings,
  listPosts,
  setSetting,
  syncMilestones,
  updatePost,
} from "./queries.ts";
import { parsePostsCsv } from "./csv.ts";
import { POST_FORMATS, type Milestone, type PostFormat, type RawMetrics } from "./types.ts";

export type SaveResult =
  | { ok: false; error: string }
  | {
      ok: true;
      mode: "new" | "snapshot";
      postId: number;
      label: string;
      comparison: PostComparison;
      fresh: Milestone[];
    }
  | null;

const METRIC_FIELDS: (keyof RawMetrics)[] = [
  "views",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "profileVisits",
  "followsFromPost",
];

function num(form: FormData, name: string): number {
  const raw = String(form.get(name) ?? "").trim().replace(/,/g, "");
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function str(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function nullable(form: FormData, name: string): string | null {
  const v = str(form, name);
  return v === "" ? null : v;
}

function isoOrNow(form: FormData, name: string): string {
  const v = str(form, name);
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function readMetrics(form: FormData): RawMetrics {
  return Object.fromEntries(METRIC_FIELDS.map((f) => [f, num(form, f)])) as unknown as RawMetrics;
}

/**
 * Save a new post, or a later reading for an existing one, then immediately answer
 * the question that prompted it: did this beat my normal?
 */
export async function savePost(_prev: SaveResult, form: FormData): Promise<SaveResult> {
  const mode = str(form, "mode") === "snapshot" ? "snapshot" : "new";
  const metrics = readMetrics(form);
  const followerCountAfter = num(form, "followerCountAfter");

  let postId: number;

  if (mode === "snapshot") {
    postId = Number(str(form, "postId"));
    const existing = getPost(postId);
    if (!existing) return { ok: false, error: "Pick a post to add a reading to." };
    addSnapshot(postId, {
      capturedAt: isoOrNow(form, "capturedAt"),
      ...metrics,
      followerCountAfter,
    });
  } else {
    const label = str(form, "label");
    if (!label) return { ok: false, error: "Give the post a short label so you can find it later." };

    const format = str(form, "format") as PostFormat;
    if (!POST_FORMATS.includes(format)) return { ok: false, error: "Unknown post format." };

    const postedAt = isoOrNow(form, "postedAt");
    postId = createPost(
      { postedAt, label, url: nullable(form, "url"), format, notes: nullable(form, "notes") },
      {
        // A first reading is captured at posting time unless told otherwise.
        capturedAt: isoOrNow(form, "capturedAt"),
        ...metrics,
        followerCountAfter,
      },
    );
  }

  const fresh = syncMilestones();
  const posts = listPosts();
  const saved = posts.find((p) => p.id === postId);
  if (!saved) return { ok: false, error: "Saved, but the post could not be read back." };

  const { baselineWindow, startingBaseline } = getSettings();
  const comparison = comparePost(saved, posts, {
    window: baselineWindow,
    scope: "same",
    seed: startingBaseline,
  });

  revalidatePath("/");
  revalidatePath("/posts");
  revalidatePath("/milestones");
  revalidatePath(`/posts/${postId}`);

  return { ok: true, mode, postId, label: saved.label, comparison, fresh };
}

export async function updatePostDetails(form: FormData): Promise<void> {
  const id = Number(str(form, "id"));
  const format = str(form, "format") as PostFormat;
  updatePost(id, {
    postedAt: isoOrNow(form, "postedAt"),
    label: str(form, "label"),
    url: nullable(form, "url"),
    format: POST_FORMATS.includes(format) ? format : "reel",
    notes: nullable(form, "notes"),
  });
  syncMilestones();
  revalidatePath("/");
  revalidatePath("/posts");
  revalidatePath(`/posts/${id}`);
}

export async function deletePostAction(form: FormData): Promise<void> {
  const id = Number(str(form, "id"));
  deletePost(id);
  revalidatePath("/");
  revalidatePath("/posts");
  revalidatePath("/milestones");
  redirect("/posts");
}

export async function deleteSnapshotAction(form: FormData): Promise<void> {
  const id = Number(str(form, "id"));
  const postId = Number(str(form, "postId"));
  deleteSnapshot(id);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
}

export async function saveSettings(form: FormData): Promise<void> {
  const window = Number(str(form, "baselineWindow"));
  if (Number.isFinite(window) && window >= 2 && window <= 100) {
    setSetting("baselineWindow", String(Math.round(window)));
  }
  revalidatePath("/", "layout");
}

export type StartingPointResult = { ok: false; error: string } | { ok: true } | null;

/**
 * Record where the account stands today: what a normal post currently does, and the
 * follower count to measure growth from. This is the line every future post is
 * judged against until enough real posts exist to replace it.
 */
export async function saveStartingPoint(
  _prev: StartingPointResult,
  form: FormData,
): Promise<StartingPointResult> {
  const metrics = readMetrics(form);
  if (metrics.views <= 0) {
    return { ok: false, error: "Enter the views a typical post gets — every rate is measured against it." };
  }

  setSetting("startingBaseline", JSON.stringify(metrics));
  setSetting("startingFollowers", String(num(form, "startingFollowers")));

  const startedAt = str(form, "trackingStartedAt");
  const iso = startedAt ? isoOrNow(form, "trackingStartedAt") : new Date().toISOString();
  setSetting("trackingStartedAt", iso);

  // Thresholds already passed at the starting point must not fire retroactively.
  syncMilestones();
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ImportResult =
  | { ok: false; error: string }
  | { ok: true; postsCreated: number; snapshotsCreated: number; skipped: number; warnings: string[] }
  | null;

/**
 * Import posts and snapshots from CSV.
 *
 * Additive and re-runnable: a post is matched on label + posted date, and a
 * snapshot is skipped if that post already has a reading at the same instant. So
 * importing the same file twice does not double anything.
 */
export async function importCsv(_prev: ImportResult, form: FormData): Promise<ImportResult> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file first." };

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "That file could not be read." };
  }

  const parsed = parsePostsCsv(text);
  if (parsed.rows.length === 0) {
    return { ok: false, error: parsed.errors[0] ?? "No usable rows found in that file." };
  }

  const existing = listPosts();
  const keyOf = (label: string, postedAt: string) =>
    `${label.toLowerCase()}::${new Date(postedAt).toISOString().slice(0, 10)}`;
  const byKey = new Map(existing.map((p) => [keyOf(p.label, p.postedAt), p.id]));

  let postsCreated = 0;
  let snapshotsCreated = 0;
  let skipped = 0;

  for (const group of parsed.rows) {
    const key = keyOf(group.label, group.postedAt);
    let postId = byKey.get(key);
    let pending = group.snapshots;

    if (postId === undefined) {
      // A post is never created without a reading, so the earliest one goes with it.
      const [first, ...later] = pending;
      postId = createPost(
        {
          postedAt: group.postedAt,
          label: group.label,
          url: group.url,
          format: group.format,
          notes: group.notes,
        },
        first,
      );
      byKey.set(key, postId);
      postsCreated += 1;
      snapshotsCreated += 1;
      pending = later;
    }

    const seen = new Set(listSnapshots(postId).map((s) => s.capturedAt));
    for (const snap of pending) {
      if (seen.has(snap.capturedAt)) {
        skipped += 1;
        continue;
      }
      addSnapshot(postId, snap);
      seen.add(snap.capturedAt);
      snapshotsCreated += 1;
    }
  }

  syncMilestones();
  revalidatePath("/", "layout");

  return { ok: true, postsCreated, snapshotsCreated, skipped, warnings: parsed.errors.slice(0, 5) };
}
