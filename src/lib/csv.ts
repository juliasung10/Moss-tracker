/**
 * CSV import and export.
 *
 * One row per snapshot, with the post's own fields repeated on each of its rows.
 * That makes the export lossless — snapshot history and all — and lets the same
 * file be read straight back in.
 */

import { POST_FORMATS, type PostFormat, type RawMetrics } from "./types.ts";

export const CSV_COLUMNS = [
  "label",
  "postedAt",
  "format",
  "url",
  "notes",
  "capturedAt",
  "views",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "profileVisits",
  "followsFromPost",
  "followerCountAfter",
] as const;

export interface CsvSnapshot extends RawMetrics {
  capturedAt: string;
  followerCountAfter: number;
}

export interface CsvPost {
  label: string;
  postedAt: string;
  format: PostFormat;
  url: string | null;
  notes: string | null;
  snapshots: CsvSnapshot[];
}

/* --- writing ---------------------------------------------------------------- */

function escape(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serializePostsCsv(posts: CsvPost[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const post of posts) {
    for (const s of post.snapshots) {
      lines.push(
        [
          post.label,
          post.postedAt,
          post.format,
          post.url,
          post.notes,
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
        ]
          .map(escape)
          .join(","),
      );
    }
  }
  return lines.join("\n") + "\n";
}

/* --- reading ---------------------------------------------------------------- */

/** Split CSV text into rows of fields, honouring quotes, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip a BOM if Excel added one

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function toInt(raw: string | undefined): number {
  const n = Number(String(raw ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function toIso(raw: string | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface ParseResult {
  rows: CsvPost[];
  errors: string[];
}

/**
 * Read a CSV back into posts and their snapshots.
 *
 * Columns are matched by header name, so column order does not matter and extra
 * columns are ignored. Rows that cannot be understood are reported rather than
 * silently dropped.
 */
export function parsePostsCsv(text: string): ParseResult {
  const errors: string[] = [];
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: ["The file has no data rows."] };

  const header = table[0].map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h.toLowerCase(), i]));
  const col = (row: string[], name: string) => {
    const i = index.get(name.toLowerCase());
    return i === undefined ? undefined : row[i];
  };

  for (const required of ["label", "postedat", "capturedat", "views"]) {
    if (!index.has(required)) {
      return { rows: [], errors: [`Missing required column "${required}". Expected: ${CSV_COLUMNS.join(", ")}`] };
    }
  }

  const grouped = new Map<string, CsvPost>();

  table.slice(1).forEach((row, i) => {
    const lineNo = i + 2;
    const label = String(col(row, "label") ?? "").trim();
    const postedAt = toIso(col(row, "postedAt"));
    const capturedAt = toIso(col(row, "capturedAt")) ?? postedAt;

    if (!label) {
      errors.push(`Line ${lineNo}: no label — skipped.`);
      return;
    }
    if (!postedAt) {
      errors.push(`Line ${lineNo}: "${label}" has an unreadable postedAt — skipped.`);
      return;
    }

    const rawFormat = String(col(row, "format") ?? "reel").trim().toLowerCase();
    const format = (POST_FORMATS as string[]).includes(rawFormat) ? (rawFormat as PostFormat) : "reel";
    if (!(POST_FORMATS as string[]).includes(rawFormat) && rawFormat !== "") {
      errors.push(`Line ${lineNo}: unknown format "${rawFormat}" — treated as reel.`);
    }

    const key = `${label.toLowerCase()}::${postedAt.slice(0, 10)}`;
    let post = grouped.get(key);
    if (!post) {
      const url = String(col(row, "url") ?? "").trim();
      const notes = String(col(row, "notes") ?? "").trim();
      post = {
        label,
        postedAt,
        format,
        url: url === "" ? null : url,
        notes: notes === "" ? null : notes,
        snapshots: [],
      };
      grouped.set(key, post);
    }

    post.snapshots.push({
      capturedAt: capturedAt ?? postedAt,
      views: toInt(col(row, "views")),
      reach: toInt(col(row, "reach")),
      likes: toInt(col(row, "likes")),
      comments: toInt(col(row, "comments")),
      shares: toInt(col(row, "shares")),
      saves: toInt(col(row, "saves")),
      profileVisits: toInt(col(row, "profileVisits")),
      followsFromPost: toInt(col(row, "followsFromPost")),
      followerCountAfter: toInt(col(row, "followerCountAfter")),
    });
  });

  const rows = [...grouped.values()]
    .map((p) => ({
      ...p,
      snapshots: p.snapshots.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)),
    }))
    .sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));

  return { rows, errors };
}
