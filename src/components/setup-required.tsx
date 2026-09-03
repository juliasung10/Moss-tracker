import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card.tsx";

/**
 * Shown instead of a crash when the deployment has no database attached. A
 * server-side exception here would reach the browser as an opaque digest number,
 * which tells you nothing about what to do next.
 */
export function SetupRequired({ problem }: { problem: string }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>Database not connected</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4 text-[13px] text-ink-muted">
          <p>{problem}</p>
          <div>
            <div className="eyebrow mb-2">To fix it on Vercel</div>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Open your project on vercel.com</li>
              <li>
                Go to <span className="font-medium text-ink">Storage</span> →{" "}
                <span className="font-medium text-ink">Create Database</span> →{" "}
                <span className="font-medium text-ink">Postgres</span> (the free tier is plenty)
              </li>
              <li>Connect it to this project — Vercel sets DATABASE_URL for you</li>
              <li>
                Go to <span className="font-medium text-ink">Deployments</span> and redeploy the
                latest one
              </li>
            </ol>
          </div>
          <p className="text-ink-faint">
            The schema builds itself on the first request after that, so there is no migration
            step. Nothing else needs configuring.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
