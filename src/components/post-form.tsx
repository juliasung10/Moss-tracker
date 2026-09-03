"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input, Textarea } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select } from "@/components/ui/select.tsx";
import { SaveResult } from "@/components/save-result.tsx";
import { savePost, type SaveResult as SaveResultState } from "@/lib/actions.ts";
import { formatDate, formatCount, toLocalInputValue } from "@/lib/format.ts";
import { METRIC_CATEGORIES, metricsIn } from "@/lib/metrics.ts";
import { POST_FORMATS, type PostFormat, type RawMetrics } from "@/lib/types.ts";
import { cn } from "@/lib/utils.ts";

export interface FormPost {
  id: number;
  label: string;
  postedAt: string;
  format: PostFormat;
  latest: RawMetrics & { capturedAt: string; followerCountAfter: number };
}

/**
 * Fields in the order Instagram Insights presents them, grouped by the same
 * categories used everywhere else, so you can read straight down the phone and type
 * straight down the form. Derived from the metric registry rather than hardcoded —
 * one place to change if a metric moves.
 */
const GROUPS = METRIC_CATEGORIES.map((category) => ({
  title: category.insightsLabel,
  fields: metricsIn(category.key)
    .filter((m) => m.kind === "count")
    .map((m) => ({ name: m.key as keyof RawMetrics, label: m.label })),
})).filter((g) => g.fields.length > 0);

const METRIC_NAMES = GROUPS.flatMap((g) => g.fields.map((f) => f.name));

const EMPTY: Record<string, string> = Object.fromEntries(METRIC_NAMES.map((n) => [n, ""]));

/** Accepts "12,400" pasted straight out of Insights. */
function toNumber(raw: string): number {
  const n = Number(raw.trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function PostForm({
  posts,
  currentFollowers,
}: {
  posts: FormPost[];
  currentFollowers: number | null;
}) {
  const [state, formAction, pending] = useActionState<SaveResultState, FormData>(savePost, null);
  const [mode, setMode] = useState<"new" | "snapshot">("new");
  const [postId, setPostId] = useState<string>(posts[0]?.id ? String(posts[0].id) : "");
  const [values, setValues] = useState<Record<string, string>>(EMPTY);
  const [followers, setFollowers] = useState<string>(currentFollowers ? String(currentFollowers) : "");
  const [now, setNow] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Default timestamps are set on the client so they land in the user's local time.
  useEffect(() => setNow(toLocalInputValue(new Date())), []);

  const selected = useMemo(
    () => posts.find((p) => String(p.id) === postId) ?? null,
    [posts, postId],
  );

  /** Switching to an existing post pre-fills its latest numbers so you only retype what moved. */
  function selectPost(id: string) {
    setPostId(id);
    const post = posts.find((p) => String(p.id) === id);
    if (!post) return;
    setValues(Object.fromEntries(METRIC_NAMES.map((n) => [n, String(post.latest[n])])));
    setFollowers(String(post.latest.followerCountAfter));
  }

  function reset() {
    setValues(EMPTY);
    setFollowers(currentFollowers ? String(currentFollowers) : "");
    setNow(toLocalInputValue(new Date()));
    formRef.current?.reset();
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  }

  const previous = mode === "snapshot" ? selected?.latest ?? null : null;

  // Warnings, computed live. None of them block a save — they exist because a
  // number that moved the wrong way is usually a typo, not news.
  const warnings = useMemo(() => {
    const out: string[] = [];
    if (previous) {
      const dropped = METRIC_NAMES.filter((n) => {
        const raw = values[n];
        return raw.trim() !== "" && toNumber(raw) < previous[n];
      });
      for (const n of dropped) {
        const label = GROUPS.flatMap((g) => g.fields).find((f) => f.name === n)?.label ?? n;
        out.push(
          `${label} went down: ${formatCount(previous[n])} → ${formatCount(toNumber(values[n]))}. Instagram metrics don't normally fall.`,
        );
      }
      if (followers.trim() !== "" && toNumber(followers) < previous.followerCountAfter) {
        out.push(
          `Followers went down: ${formatCount(previous.followerCountAfter)} → ${formatCount(toNumber(followers))}.`,
        );
      }
    }
    const views = toNumber(values.views);
    if (views > 0) {
      const engagement =
        (toNumber(values.likes) + toNumber(values.comments) + toNumber(values.shares) + toNumber(values.saves)) /
        views;
      if (engagement > 0.25) {
        out.push(
          `Engagement rate works out at ${(engagement * 100).toFixed(1)}% — unusually high. Check the views figure.`,
        );
      }
    }
    return out;
  }, [previous, values, followers]);

  // Cmd/Ctrl+Enter submits from anywhere in the form.
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") formRef.current?.requestSubmit();
  }

  if (state?.ok) {
    return (
      <SaveResult
        label={state.label}
        mode={state.mode}
        postId={state.postId}
        comparison={state.comparison}
        fresh={state.fresh}
        onReset={reset}
      />
    );
  }

  return (
    <form ref={formRef} action={formAction} onKeyDown={onKeyDown} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />

      <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
        {(["new", "snapshot"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={m === "snapshot" && posts.length === 0}
            className={cn(
              "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
              mode === m ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink",
            )}
          >
            {m === "new" ? "New post" : "Update existing"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-surface">
        {mode === "new" ? (
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="Label" hint="A short name you'll recognise">
              <Input
                ref={firstFieldRef}
                name="label"
                autoFocus
                required
                placeholder="arm pick-and-place"
                autoComplete="off"
              />
            </Field>
            <Field label="Format">
              <Select name="format" defaultValue="reel">
                {POST_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Posted at">
              <Input type="datetime-local" name="postedAt" defaultValue={now} key={now} />
            </Field>
            <Field label="Link" hint="Optional">
              <Input name="url" placeholder="https://instagram.com/reel/…" autoComplete="off" />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="Post" hint="Its latest numbers are pre-filled below">
              <Select name="postId" value={postId} onChange={(e) => selectPost(e.target.value)}>
                {posts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {formatDate(p.postedAt)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Captured at" hint="When you read these numbers off Insights">
              <Input type="datetime-local" name="capturedAt" defaultValue={now} key={now} />
            </Field>
          </div>
        )}

        <div className="border-t border-line">
          {GROUPS.map((group) => (
            <div key={group.title} className="border-b border-line px-5 py-4 last:border-0">
              <div className="eyebrow mb-3">{group.title}</div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {group.fields.map((field) => (
                  <Field key={field.name} label={field.label} hint={previous ? `was ${formatCount(previous[field.name])}` : undefined}>
                    <Input
                      name={field.name}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      className="num"
                      value={values[field.name]}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [field.name]: e.target.value }))
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}

          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Followers now"
              hint={previous ? `was ${formatCount(previous.followerCountAfter)}` : "Total account followers"}
            >
              <Input
                name="followerCountAfter"
                inputMode="numeric"
                autoComplete="off"
                className="num"
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
              />
            </Field>
            {mode === "new" ? (
              <Field label="Captured at" hint="Defaults to now">
                <Input type="datetime-local" name="capturedAt" defaultValue={now} key={`c-${now}`} />
              </Field>
            ) : null}
          </div>

          {mode === "new" ? (
            <div className="border-t border-line px-5 py-4">
              <Field label="Notes" hint="Optional — what you tried, what you'd change">
                <Textarea name="notes" rows={2} />
              </Field>
            </div>
          ) : null}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-line bg-surface px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
            <span className="eyebrow">Check before saving</span>
          </div>
          <ul className="space-y-1">
            {warnings.map((w) => (
              <li key={w} className="text-[13px] text-ink-muted">
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state && !state.ok ? (
        <p className="text-[13px] text-down">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? "Saving…" : warnings.length > 0 ? "Save anyway" : "Save and compare"}
        </Button>
        <span className="text-xs text-ink-faint">
          <kbd className="num rounded border border-line bg-surface px-1">⌘</kbd>
          <kbd className="num ml-0.5 rounded border border-line bg-surface px-1">↵</kbd> to save
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {hint ? <span className="num text-[11px] text-ink-faint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
