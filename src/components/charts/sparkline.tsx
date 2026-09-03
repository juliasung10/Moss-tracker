"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { CHART } from "./chart-theme.ts";

/**
 * A bare trend shape beside a headline number. No axes, no tooltip — the figure
 * next to it carries the value; this only carries the direction.
 */
export function Sparkline({ values, height = 28 }: { values: (number | null)[]; height?: number }) {
  const points = values.map((v, i) => ({ i, v }));
  const defined = values.filter((v): v is number => v !== null);
  if (defined.length < 2) {
    return <div style={{ height }} className="flex items-end text-[11px] text-ink-faint">—</div>;
  }
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={CHART.accent}
            strokeWidth={1.5}
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
