import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { CONNECTION_SOURCE, CONNECTION_STRING_VARS, visibleDatabaseVars } from "@/lib/db.ts";

/**
 * Shown instead of a crash when the deployment has no database attached. A
 * server-side exception here would reach the browser as an opaque digest number,
 * which tells you nothing about what to do next.
 */
export function SetupRequired({ problem }: { problem: string }) {
  const visible = visibleDatabaseVars();

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
                Go to <span className="font-medium text-ink">Storage</span> and attach a Postgres
                database — Neon and Supabase both work, and both have a free tier
              </li>
              <li>
                Go to <span className="font-medium text-ink">Deployments</span>, open the{" "}
                <span className="font-medium text-ink">⋯</span> menu on the newest one and choose{" "}
                <span className="font-medium text-ink">Redeploy</span>
              </li>
            </ol>
          </div>
          <p className="text-ink-faint">
            The schema builds itself on the first request after that, so there is no migration
            step. Nothing else needs configuring.
          </p>

          <div className="border-t border-line pt-4">
            <div className="eyebrow mb-2">What this deployment can see</div>
            <p className="mb-2 text-ink-faint">
              Any of these would be used, in order:{" "}
              <span className="num">{CONNECTION_STRING_VARS.join(", ")}</span>
            </p>
            {visible.length === 0 ? (
              <p className="text-ink-faint">
                No database variables are visible at all — which usually means the deployment
                predates the database being attached. Redeploy and they will appear.
              </p>
            ) : (
              <>
                <p className="text-ink-faint">Variables present (names only, never values):</p>
                <p className="num mt-1 break-words text-ink">{visible.join(", ")}</p>
              </>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}


/**
 * A connection string exists but the database refused or could not be reached.
 * The driver's own message is shown because it names the actual cause —
 * authentication, TLS, an unreachable host — and guessing between those wastes
 * far more time than reading it.
 */
export function ConnectionFailed({ detail }: { detail: string }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>Could not reach the database</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4 text-[13px] text-ink-muted">
          <p>
            A connection string is configured
            {CONNECTION_SOURCE ? (
              <>
                {" "}
                (from <span className="num">{CONNECTION_SOURCE}</span>)
              </>
            ) : null}
            , but connecting failed.
          </p>
          <div>
            <div className="eyebrow mb-2">What the database driver said</div>
            <p className="num break-words rounded-md border border-line bg-canvas px-3 py-2 text-ink">
              {detail}
            </p>
          </div>
          <div>
            <div className="eyebrow mb-2">Usual causes</div>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>
                The database was attached after this deployment was built — redeploy from the
                Deployments tab so it picks the variable up.
              </li>
              <li>
                The connection string points at a direct connection rather than the pooled one.
                Serverless needs the pooler.
              </li>
              <li>A self-signed certificate — set PGSSL_NO_VERIFY=1 to skip verification.</li>
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
