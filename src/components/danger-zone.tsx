"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { deletePostAction } from "@/lib/actions.ts";

/** Two-step delete. Deleting a post takes its whole snapshot history with it. */
export function DeletePost({ id, label, snapshotCount }: { id: number; label: string; snapshotCount: number }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="danger" size="sm" type="button" onClick={() => setConfirming(true)}>
        Delete post
      </Button>
    );
  }

  return (
    <form action={deletePostAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-[13px] text-ink-muted">
        Delete “{label}” and its <span className="num">{snapshotCount}</span>{" "}
        {snapshotCount === 1 ? "reading" : "readings"}? This cannot be undone.
      </span>
      <Button variant="danger" size="sm" type="submit">
        Delete
      </Button>
      <Button variant="ghost" size="sm" type="button" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}
