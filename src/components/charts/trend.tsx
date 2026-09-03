"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact, formatDate, formatPercent } from "@/lib/format.ts";
import type { MetricKind } from "@/lib/metrics.ts";
import { AXIS_PROPS, CHART } from "./chart-theme.ts";
import { ChartTooltip } from "./tooltip.tsx";

function tickFormatter(kind: MetricKind) {
  return (v: number) => (kind === "rate" ? formatPercent(v, 0) : formatCompact(v));
}

/** Legend rendered in HTML above the plot — identity by mark shape, not colour alone. */
function Legend({ items }: { items: { name: string; color: string; mark: "line" | "dot" }[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          {i.mark === "line" ? (
            <span className="h-0.5 w-4 rounded-full" style={{ background: i.color }} />
          ) : (
            <span
              className="h-[7px] w-[7px] rounded-full ring-2 ring-surface"
              style={{ background: i.color }}
            />
          )}
          {i.name}
        </span>
      ))}
    </div>
  );
}

export interface TrendPoint {
  x: string;
  value: number | null;
}

/** One series over time. No legend — the card title already names what this is. */
export function TrendLine({
  points,
  kind,
  name,
  height = 180,
}: {
  points: TrendPoint[];
  kind: MetricKind;
  name: string;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-ink-faint">
        Not enough data to plot yet
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="x" {...AXIS_PROPS} tickFormatter={(v: string) => formatDate(v)} minTickGap={28} />
          <YAxis {...AXIS_PROPS} width={46} tickFormatter={tickFormatter(kind)} domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                label={label as string}
                kind={kind}
                rows={(payload ?? []).map((p) => ({
                  name,
                  value: p.value as number,
                  color: CHART.accent,
                }))}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART.accent}
            strokeWidth={CHART.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: CHART.dotRadius, fill: CHART.accent, stroke: CHART.surface, strokeWidth: CHART.ringWidth }}
            activeDot={{ r: 5, fill: CHART.accent, stroke: CHART.surface, strokeWidth: CHART.ringWidth }}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DriftDatum {
  x: string;
  label: string;
  value: number | null;
  trailing: number | null;
}

/**
 * Baseline drift: the rolling average as a line, each post as a recessive dot.
 * The line is the point of the chart — how the normal itself is moving — so the
 * individual posts sit behind it in grey rather than competing for attention.
 */
export function DriftChart({
  data,
  kind,
  window,
  startingValue = null,
  height = 220,
}: {
  data: DriftDatum[];
  kind: MetricKind;
  window: number;
  /** The declared starting level, drawn as a fixed line to measure the trend against. */
  startingValue?: number | null;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-ink-faint">
        Not enough posts to plot a trend yet
      </div>
    );
  }
  return (
    <div>
      <Legend
        items={[
          { name: `Trailing average (last ${window})`, color: CHART.accent, mark: "line" },
          { name: "Individual post", color: CHART.neutral, mark: "dot" },
          ...(startingValue !== null
            ? [{ name: "Where you started", color: CHART.axis, mark: "line" as const }]
            : []),
        ]}
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} strokeWidth={1} vertical={false} />
            <XAxis dataKey="x" {...AXIS_PROPS} tickFormatter={(v: string) => formatDate(v)} minTickGap={28} />
            <YAxis {...AXIS_PROPS} width={46} tickFormatter={tickFormatter(kind)} domain={["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                const datum = payload?.[0]?.payload as DriftDatum | undefined;
                return (
                  <ChartTooltip
                    active={active}
                    label={label as string}
                    kind={kind}
                    rows={[
                      { name: datum?.label ?? "Post", value: datum?.value ?? null, color: CHART.neutral },
                      { name: "Trailing avg", value: datum?.trailing ?? null, color: CHART.accent },
                    ]}
                  />
                );
              }}
            />
            {/* The line to beat: where the account was when tracking began. */}
            {startingValue !== null ? (
              <ReferenceLine
                y={startingValue}
                stroke={CHART.axis}
                strokeWidth={1}
                label={{
                  value: "start",
                  position: "insideTopLeft",
                  fontSize: 10,
                  fill: CHART.axis,
                }}
              />
            ) : null}
            {/* Raw posts: dots only, no connecting line. */}
            <Line
              dataKey="value"
              stroke="none"
              strokeWidth={0}
              dot={{ r: CHART.dotRadius, fill: CHART.neutral, stroke: CHART.surface, strokeWidth: CHART.ringWidth }}
              activeDot={{ r: 5, fill: CHART.neutral, stroke: CHART.surface, strokeWidth: CHART.ringWidth }}
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="trailing"
              stroke={CHART.accent}
              strokeWidth={CHART.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 5, fill: CHART.accent, stroke: CHART.surface, strokeWidth: CHART.ringWidth }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
