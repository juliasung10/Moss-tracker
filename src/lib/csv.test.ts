import { describe, expect, it } from "vitest";
import { parseCsv, parsePostsCsv, serializePostsCsv, type CsvPost } from "./csv.ts";

const sample: CsvPost[] = [
  {
    label: "arm vs egg",
    postedAt: "2025-01-05T19:15:00.000Z",
    format: "reel",
    url: "https://example.com/p/1",
    notes: 'Went "wide", finally',
    snapshots: [
      {
        capturedAt: "2025-01-06T13:15:00.000Z",
        views: 5200,
        reach: 4800,
        likes: 310,
        comments: 26,
        shares: 79,
        saves: 111,
        profileVisits: 170,
        followsFromPost: 40,
        followerCountAfter: 780,
      },
      {
        capturedAt: "2025-01-12T13:15:00.000Z",
        views: 12400,
        reach: 10800,
        likes: 742,
        comments: 63,
        shares: 188,
        saves: 264,
        profileVisits: 402,
        followsFromPost: 96,
        followerCountAfter: 830,
      },
    ],
  },
];

describe("csv parsing", () => {
  it("handles quotes, escaped quotes, embedded commas and CRLF", () => {
    const rows = parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x,1", 'he said "hi"'],
    ]);
  });

  it("ignores blank lines and a leading BOM", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("round trip", () => {
  it("survives export then import unchanged", () => {
    const parsed = parsePostsCsv(serializePostsCsv(sample));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    const post = parsed.rows[0];
    expect(post.label).toBe("arm vs egg");
    expect(post.notes).toBe('Went "wide", finally');
    expect(post.format).toBe("reel");
    expect(post.snapshots).toHaveLength(2);
    expect(post.snapshots[1].views).toBe(12400);
    expect(post.snapshots[1].followerCountAfter).toBe(830);
  });

  it("groups every snapshot of a post onto one record, oldest first", () => {
    const csv = serializePostsCsv(sample);
    const reordered = csv.split("\n");
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    const parsed = parsePostsCsv(reordered.join("\n"));
    expect(parsed.rows[0].snapshots.map((s) => s.views)).toEqual([5200, 12400]);
  });
});

describe("import robustness", () => {
  const header = "label,postedAt,capturedAt,views,format";

  it("matches columns by name, not position", () => {
    const parsed = parsePostsCsv("views,capturedAt,postedAt,label\n900,2025-01-02,2025-01-01,test\n");
    expect(parsed.rows[0].snapshots[0].views).toBe(900);
    expect(parsed.rows[0].label).toBe("test");
  });

  it("rejects a file missing a required column", () => {
    const parsed = parsePostsCsv("label,views\nfoo,10\n");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0]).toContain("postedat");
  });

  it("skips unusable rows and says why, keeping the good ones", () => {
    const parsed = parsePostsCsv(
      `${header}\n,2025-01-01,2025-01-01,10,reel\ngood,2025-01-01,2025-01-01,20,reel\nbad,not-a-date,2025-01-01,30,reel\n`,
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].label).toBe("good");
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[1]).toContain("unreadable postedAt");
  });

  it("falls back to reel on an unknown format and notes it", () => {
    const parsed = parsePostsCsv(`${header}\nx,2025-01-01,2025-01-01,10,story\n`);
    expect(parsed.rows[0].format).toBe("reel");
    expect(parsed.errors[0]).toContain('unknown format "story"');
  });

  it("treats missing metric columns as zero rather than NaN", () => {
    const parsed = parsePostsCsv(`${header}\nx,2025-01-01,2025-01-01,10,reel\n`);
    const snap = parsed.rows[0].snapshots[0];
    expect(snap.saves).toBe(0);
    expect(Number.isNaN(snap.saves)).toBe(false);
  });

  it("strips thousands separators pasted in from a spreadsheet", () => {
    const parsed = parsePostsCsv(`${header}\nx,2025-01-01,2025-01-01,"12,400",reel\n`);
    expect(parsed.rows[0].snapshots[0].views).toBe(12400);
  });

  it("falls back to postedAt when capturedAt is blank", () => {
    const parsed = parsePostsCsv(`${header}\nx,2025-01-01T00:00:00Z,,10,reel\n`);
    expect(parsed.rows[0].snapshots[0].capturedAt).toBe("2025-01-01T00:00:00.000Z");
  });
});
