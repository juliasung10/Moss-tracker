"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { saveStartingPoint, type StartingPointResult } from "@/lib/actions.ts";
import { METRIC_CATEGORIES, metricsIn } from "@/lib/metrics.ts";
import { toLocalInputValue } from "@/lib/format.ts";
import type { RawMetrics } from "@/lib/types.ts";

/**
 * Declare where the account stands today.
 *
 * These are the numbers a normal post currently gets — not a target, not a best.
 * They fill the baseline until real posts replace them, and they stay put as the
 * line that progress is measured against.
 */
export function StartingPointForm({
  current,
  startingFollowers,
  trackingStartedAt,
}: {
  current: RawMetrics | null;
  startingFollowers: number | null;
  trackingStartedAt: string | null;
}) {
  const [state, action, pending] = useActionState<StartingPointResult, FormData>(
    saveStartingPoint,
    null,
  );

  const startedDefault = toLocalInputValue(
    trackingStartedAt ? new Date(trackingStartedAt) : new Date(),
  );

  return (
    <form action={action} className="space-y-5">
      {METRIC_CATEGORIES.map((category) => {
        const fields = metricsIn(category.key).filter((m) => m.kind === "count");
        if (fields.length === 0) return null;
        return (
          <div key={category.key}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="eyebrow">{category.label}</span>
              <span className="text-[11px] text-ink-faint">{category.insightsLabel} in Insights</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {fields.map((def) => (
                <div key={def.key} className="space-y-1.5">
                  <Label htmlFor={`sp-${def.key}`}>{def.label}</Label>
                  <Input
                    id={`sp-${def.key}`}
                    name={def.key}
                    inputMode="numeric"
                    autoComplete="off"
                    className="num"
                    placeholder="0"
                    defaultValue={current ? String(current[def.key as keyof RawMetrics]) : ""}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="startingFollowers">Followers today</Label>
          <Input
            id="startingFollowers"
            name="startingFollowers"
            inputMode="numeric"
            autoComplete="off"
            className="num"
            defaultValue={startingFollowers ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trackingStartedAt">Tracking from</Label>
          <Input
            id="trackingStartedAt"
            type="datetime-local"
            name="trackingStartedAt"
            defaultValue={startedDefault}
          />
        </div>
      </div>

      {state && !state.ok ? <p className="text-[13px] text-down">{state.error}</p> : null}
      {state?.ok ? (
        <p className="text-[13px] text-ink-muted">
          Saved. Every post from here is measured against these figures.
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : current ? "Update starting point" : "Set starting point"}
      </Button>
    </form>
  );
}
