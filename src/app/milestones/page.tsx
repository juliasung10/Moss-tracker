import { databaseProblem } from "@/lib/db.ts";
import { SetupRequired } from "@/components/setup-required.tsx";
import Link from "next/link";
import { Badge } from "@/components/ui/badge.tsx";
import { formatDateFull } from "@/lib/format.ts";
import { listMilestones, listPosts } from "@/lib/queries.ts";
import type { Milestone, MilestoneType } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<MilestoneType, string> = {
  follower_threshold: "Followers",
  cumulative_views: "Total views",
  personal_best: "Record",
  first_to_cross: "First",
  streak: "Streak",
  baseline_band: "Baseline",
};

/** Group by month so a long timeline stays navigable. */
function byMonth(milestones: Milestone[]): { month: string; items: Milestone[] }[] {
  const groups: { month: string; items: Milestone[] }[] = [];
  for (const m of milestones) {
    const month = new Date(m.achievedAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(m);
    else groups.push({ month, items: [m] });
  }
  return groups;
}

export default async function MilestonesPage() {
  // A deployment with no database attached must explain itself, not crash.
  const problem = databaseProblem();
  if (problem) return <SetupRequired problem={problem} />;

  const milestones = await listMilestones();
  const posts = await listPosts();
  const labelById = new Map(posts.map((p) => [p.id, p.label]));
  const groups = byMonth(milestones);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Milestones</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          A permanent record, most recent first. Each one fires once and is dated when it was
          actually earned.
        </p>
      </div>

      {milestones.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface py-16 text-center text-[13px] text-ink-muted">
          No milestones yet. They appear on their own as you log posts.
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.month}>
              <h2 className="eyebrow mb-2">{group.month}</h2>
              <ul className="rounded-lg border border-line bg-surface">
                {group.items.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3 last:border-0"
                  >
                    <span className="num w-24 shrink-0 text-xs text-ink-faint">
                      {formatDateFull(m.achievedAt)}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] font-medium">{m.label}</span>
                    {m.postId && labelById.has(m.postId) ? (
                      <Link
                        href={`/posts/${m.postId}`}
                        className="max-w-[180px] truncate text-xs text-accent hover:underline"
                      >
                        {labelById.get(m.postId)}
                      </Link>
                    ) : null}
                    <Badge className="shrink-0">{TYPE_LABEL[m.type] ?? m.type}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
