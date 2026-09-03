/**
 * Display formatting. Locale is pinned to en-US so the server and the browser
 * render identical strings (Next would otherwise flag a hydration mismatch).
 * Dates are always rendered in the machine's local time — never as ISO strings.
 */

import type { MetricKind } from "./metrics.ts";

/** What a missing or undefined number looks like. Never "NaN", never "Infinity". */
export const DASH = "—";

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return Math.round(n).toLocaleString("en-US");
}

/** 12,400 -> "12.4k". Used where space is tight. */
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1_000_000) {
    const k = n / 1000;
    return `${trimZero(abs < 10_000 ? k.toFixed(1) : String(Math.round(k)))}k`;
  }
  return `${trimZero((n / 1_000_000).toFixed(abs < 10_000_000 ? 2 : 1))}M`;
}

function trimZero(s: string): string {
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** 0.0982 -> "9.8%" */
export function formatPercent(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  return `${(x * 100).toFixed(digits)}%`;
}

/** A metric value rendered according to its kind. */
export function formatMetric(value: number | null | undefined, kind: MetricKind): string {
  return kind === "rate" ? formatPercent(value) : formatCount(value);
}

/** Percent change with an explicit sign: "+23%", "-8%", "0%". */
export function formatPctChange(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const pct = x * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(Math.abs(pct) < 10 && digits === 0 ? 0 : digits)}%`;
}

/** Absolute change with an explicit sign, in the metric's own units. */
export function formatAbsChange(x: number | null | undefined, kind: MetricKind): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return DASH;
  const sign = x > 0 ? "+" : x < 0 ? "-" : "";
  const body = kind === "rate" ? formatPercent(Math.abs(x)) : formatCount(Math.abs(x));
  return `${sign}${body}`;
}

/** "Aug 14" — local time, never ISO. */
export function formatDate(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return DASH;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Aug 14, 2024" — for anything older than the current year. */
export function formatDateFull(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return DASH;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Aug 14, 2:30 PM" — snapshot capture times, where the hour matters. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return DASH;
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** "3d" / "5h" / "just now" — how mature a snapshot is relative to posting. */
export function formatAge(fromIso: string, toIso: string): string {
  const a = parse(fromIso);
  const b = parse(toIso);
  if (!a || !b) return DASH;
  const mins = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
  if (mins < 60) return mins <= 1 ? "at post" : `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Whole days between two instants, used for the 14-day "fresh milestone" window. */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = parse(fromIso);
  const b = parse(toIso);
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 86_400_000;
}

/** Local datetime string for an <input type="datetime-local"> value. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse an <input type="datetime-local"> value (local time) into an ISO instant. */
export function fromLocalInputValue(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 1 -> "1st", 23 -> "23rd". Used for "3rd best of 27". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
