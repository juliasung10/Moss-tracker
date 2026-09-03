import { PostForm, type FormPost } from "@/components/post-form.tsx";
import { latestFollowerCount } from "@/lib/metrics.ts";
import { listPosts } from "@/lib/queries.ts";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  const posts = await listPosts();

  const formPosts: FormPost[] = posts.map((p) => ({
    id: p.id,
    label: p.label,
    postedAt: p.postedAt,
    format: p.format,
    latest: {
      capturedAt: p.current.capturedAt,
      views: p.current.views,
      reach: p.current.reach,
      likes: p.current.likes,
      comments: p.current.comments,
      shares: p.current.shares,
      saves: p.current.saves,
      profileVisits: p.current.profileVisits,
      followsFromPost: p.current.followsFromPost,
      followerCountAfter: p.current.followerCountAfter,
    },
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Add / update post</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          Log a new post, or add a later reading to one you already have. Fields follow the order
          Instagram Insights shows them in.
        </p>
      </div>
      <PostForm posts={formPosts} currentFollowers={latestFollowerCount(posts)} />
    </div>
  );
}
