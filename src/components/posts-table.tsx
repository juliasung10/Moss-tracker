"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Table, TD, TH, THead, TR } from "@/components/ui/table.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select } from "@/components/ui/select.tsx";
import { DeltaChip, Figure } from "@/components/delta.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { TABLE_METRICS, metricDef, type MetricDelta } from "@/lib/metrics.ts";
import { formatDate } from "@/lib/format.ts";
import { POST_FORMATS, type PostFormat } from "@/lib/types.ts";
import { cn } from "@/lib/utils.ts";

export interface PostRow {
  id: number;
  label: string;
  postedAt: string;
  format: PostFormat;
  snapshotCount: number;
  /** Baseline was still forming when this post went up. */
  forming: boolean;
  deltas: Record<string, MetricDelta>;
}

type SortKey = "postedAt" | "label" | (typeof TABLE_METRICS)[number];

export function PostsTable({ rows }: { rows: PostRow[] }) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<"all" | PostFormat>("all");
  const [standing, setStanding] = useState<"all" | "up" | "down">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "postedAt",
    dir: "desc",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = rows.filter((r) => {
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (format !== "all" && r.format !== format) return false;
      if (standing !== "all" && r.deltas.views?.direction !== standing) return false;
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      if (sort.key === "postedAt") return (Date.parse(a.postedAt) - Date.parse(b.postedAt)) * dir;
      if (sort.key === "label") return a.label.localeCompare(b.label) * dir;
      // Nulls sort to the bottom regardless of direction — a missing rate is not "worst".
      const av = a.deltas[sort.key]?.value ?? null;
      const bv = b.deltas[sort.key]?.value ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [rows, query, format, standing, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by label"
            className="pl-8"
            aria-label="Filter posts by label"
          />
        </div>
        <Select
          value={format}
          onChange={(e) => setFormat(e.target.value as "all" | PostFormat)}
          className="w-36"
          aria-label="Filter by format"
        >
          <option value="all">All formats</option>
          {POST_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Select
          value={standing}
          onChange={(e) => setStanding(e.target.value as "all" | "up" | "down")}
          className="w-44"
          aria-label="Filter by standing against baseline"
        >
          <option value="all">Any standing</option>
          <option value="up">Views above baseline</option>
          <option value="down">Views below baseline</option>
        </Select>
        <span className="num text-xs text-ink-faint">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="rounded-lg border border-line bg-surface">
        <Table>
          <THead>
            <TR>
              <SortableTH label="Date" active={sort} sortKey="postedAt" onSort={toggleSort} />
              <SortableTH label="Post" active={sort} sortKey="label" onSort={toggleSort} />
              {TABLE_METRICS.map((key) => (
                <SortableTH
                  key={key}
                  label={metricDef(key).short}
                  active={sort}
                  sortKey={key}
                  onSort={toggleSort}
                  align="right"
                />
              ))}
            </TR>
          </THead>
          <tbody>
            {filtered.length === 0 ? (
              <TR>
                <TD colSpan={2 + TABLE_METRICS.length} className="py-10 text-center text-ink-faint">
                  No posts match those filters.
                </TD>
              </TR>
            ) : (
              filtered.map((row) => (
                <TR key={row.id} className="hover:bg-canvas">
                  <TD className="whitespace-nowrap">
                    <span className="num text-ink-muted">{formatDate(row.postedAt)}</span>
                  </TD>
                  <TD>
                    <Link
                      href={`/posts/${row.id}`}
                      className="flex items-center gap-2 font-medium hover:text-accent"
                    >
                      <span className="max-w-[240px] truncate">{row.label}</span>
                      <Badge>{row.format}</Badge>
                      {row.snapshotCount > 1 ? (
                        <span className="num text-[11px] text-ink-faint">
                          {row.snapshotCount} readings
                        </span>
                      ) : null}
                    </Link>
                  </TD>
                  {TABLE_METRICS.map((key) => {
                    const delta = row.deltas[key];
                    const def = metricDef(key);
                    return (
                      <TD key={key} align="right">
                        <div className="flex flex-col items-end gap-0.5">
                          <Figure value={delta?.value ?? null} kind={def.kind} className="font-medium" />
                          {delta ? <DeltaChip delta={delta} size="sm" /> : null}
                        </div>
                      </TD>
                    );
                  })}
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

function SortableTH({
  label,
  sortKey,
  active,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active.key === sortKey;
  const Icon = active.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH align={align} aria-sort={isActive ? (active.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-ink",
          align === "right" && "flex-row-reverse",
          isActive && "text-ink",
        )}
      >
        {label}
        {isActive ? <Icon className="h-3 w-3" aria-hidden /> : null}
      </button>
    </TH>
  );
}
