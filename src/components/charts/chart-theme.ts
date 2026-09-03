/**
 * Shared chart constants.
 *
 * Two marks only: the accent line carries the trend, a recessive grey dot carries
 * the raw per-post value. They are told apart by mark type as well as colour
 * (line vs dot), so identity never rests on colour alone. Green and red never
 * appear in a chart — they mean "vs baseline" and nothing else.
 */

export const CHART = {
  accent: "#2e50c8",
  /** Validated: 3:1+ against the surface, ΔE 20+ from the accent under CVD. */
  neutral: "#7a7973",
  grid: "#eeedea",
  axis: "#9c9b94",
  surface: "#ffffff",
  /** Mark specs: 2px lines, markers >= 8px across with a 2px surface ring. */
  strokeWidth: 2,
  dotRadius: 3.5,
  ringWidth: 2,
} as const;

export const AXIS_PROPS = {
  stroke: CHART.axis,
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: CHART.axis, fontFamily: "var(--font-mono)" },
} as const;
