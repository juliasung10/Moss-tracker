import { requireDatabase } from "@/lib/guard.tsx";
import Link from "next/link";
import { Button } from "@/components/ui/button.tsx";
import { Segmented } from "@/components/ui/segmented.tsx";
import { PostsTable, type PostRow } from "@/components/posts-table.tsx";
import { TABLE_METRICS, comparePost } from "@/lib/metrics.ts";
import { getSettings, listPosts } from "@/lib/queries.ts";
import { dominantFormat, parseScope, scopeLabel } from "@/lib/scope.ts";

export const dynamic = "force-dynamic";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  // A database that is missing or unreachable must explain itself, not crash.
  const blocked = await requireDatabase();
  if (blocked) return blocked;

  const { scope: rawScope } = await searchParams;
  const scope = parseScope(rawScope);

  const posts = await listPosts();
  const { baselineWindow, startingBaseline } = await getSettings();
  const format = dominantFormat(posts);

  // Each row is compared against the baseline as it stood when that post went up,
  // so an old post is judged by the standard of its own moment.
  const rows: PostRow[] = posts.map((post) => {
    const comparison = comparePost(post, posts, {
      window: baselineWindow,
      scope,
      seed: startingBaseline,
    });
    return {
      id: post.id,
      label: post.label,
      postedAt: post.postedAt,
      format: post.format,
      snapshotCount: post.snapshotCount,
      forming: comparison.baseline.forming,
      deltas: Object.fromEntries(TABLE_METRICS.map((k) => [k, comparison.deltas[k]])),
    };
  });

  const formingCount = rows.filter((r) => r.forming).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">All posts</h1>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            Current numbers, with the change against the baseline as it stood when each post went
            up.
            {formingCount > 0 ? (
              <>
                {" "}
                <span className="num">{formingCount}</span> posted before the baseline had{" "}
                <span className="num">{baselineWindow}</span> {scopeLabel(scope, format)} to draw
                on, so they show no change.
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Segmented
            options={[
              {
                label: `${format[0].toUpperCase()}${format.slice(1)}s only`,
                href: "/posts",
                active: scope === "same",
              },
              { label: "All formats", href: "/posts?scope=all", active: scope === "all" },
            ]}
          />
          <Button asChild size="sm">
            <Link href="/add">Add post</Link>
          </Button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface py-16 text-center">
          <p className="text-[13px] text-ink-muted">No posts logged yet.</p>
          <Button asChild className="mt-4">
            <Link href="/add">Add your first post</Link>
          </Button>
        </div>
      ) : (
        <PostsTable rows={rows} />
      )}
    </div>
  );
}
