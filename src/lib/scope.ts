import type { FormatScope } from "./metrics.ts";
import type { PostFormat, PostWithMetrics } from "./types.ts";

export function parseScope(raw: string | string[] | undefined): FormatScope {
  return raw === "all" ? "all" : "same";
}

/**
 * The format the account mostly posts in — what "my normal" means by default.
 * Falls back to reel for an empty account.
 */
export function dominantFormat(posts: PostWithMetrics[]): PostFormat {
  const counts = new Map<PostFormat, number>();
  for (const p of posts) counts.set(p.format, (counts.get(p.format) ?? 0) + 1);
  let best: PostFormat = "reel";
  let bestCount = -1;
  for (const [format, count] of counts) {
    if (count > bestCount) {
      best = format;
      bestCount = count;
    }
  }
  return best;
}

/** "Reels" / "all formats" — for labelling what a baseline was drawn from. */
export function scopeLabel(scope: FormatScope, format: PostFormat): string {
  return scope === "all" ? "all formats" : `${format}s`;
}
