"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button.tsx";
import { importCsv, type ImportResult } from "@/lib/actions.ts";

export function CsvImport() {
  const [state, action, pending] = useActionState<ImportResult, FormData>(importCsv, null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="text-[13px] text-ink-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-2.5 file:py-1 file:text-[13px] file:font-medium file:text-ink hover:file:bg-canvas"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </Button>
      </form>

      {state && !state.ok ? <p className="text-[13px] text-down">{state.error}</p> : null}

      {state?.ok ? (
        <div className="rounded-md border border-line bg-canvas px-3 py-2.5 text-[13px]">
          <p>
            Added <span className="num font-medium">{state.postsCreated}</span>{" "}
            {state.postsCreated === 1 ? "post" : "posts"} and{" "}
            <span className="num font-medium">{state.snapshotsCreated}</span>{" "}
            {state.snapshotsCreated === 1 ? "reading" : "readings"}.
            {state.skipped > 0 ? (
              <>
                {" "}
                <span className="num">{state.skipped}</span> already present, skipped.
              </>
            ) : null}
          </p>
          {state.warnings.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-ink-muted">
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
