import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { CsvImport } from "@/components/csv-import.tsx";
import { StartingPointForm } from "@/components/starting-point-form.tsx";
import { saveSettings } from "@/lib/actions.ts";
import { DB_PATH } from "@/lib/db.ts";
import { CSV_COLUMNS } from "@/lib/csv.ts";
import { getSettings, listPosts } from "@/lib/queries.ts";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const { baselineWindow, startingBaseline, startingFollowers, trackingStartedAt } = getSettings();
  const posts = listPosts();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          Everything lives in one SQLite file on this machine.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Starting point</CardTitle>
            <p className="mt-0.5 text-xs text-ink-faint">
              What a normal post does for you right now — not a target, not your best.
            </p>
          </div>
          {startingBaseline ? null : (
            <span className="text-xs text-ink-muted">Not set</span>
          )}
        </CardHeader>
        <CardBody>
          <StartingPointForm
            current={startingBaseline}
            startingFollowers={startingFollowers}
            trackingStartedAt={trackingStartedAt}
          />
          <p className="mt-4 max-w-xl text-[13px] text-ink-muted">
            These figures fill the baseline slots no tracked post has filled yet, so the first Reel
            you log gets a real comparison instead of &ldquo;baseline forming&rdquo;. As real posts
            come in they replace the declared slots one by one, and at{" "}
            <span className="num">{baselineWindow}</span> posts the baseline is entirely measured.
          </p>
          <p className="mt-2 max-w-xl text-[13px] text-ink-faint">
            They also stay put as the fixed line the dashboard measures progress against, and
            follower milestones at or below your starting count never fire — you passed those
            before tracking began.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Baseline window</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={saveSettings} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="baselineWindow">Posts in the trailing average (N)</Label>
              <Input
                id="baselineWindow"
                name="baselineWindow"
                type="number"
                min={2}
                max={100}
                defaultValue={baselineWindow}
                className="num w-28"
              />
            </div>
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>
          <p className="mt-3 max-w-xl text-[13px] text-ink-muted">
            Each post is compared against the N posts of the same format that came before it — never
            against itself. Until N posts exist, the app says the baseline is still forming rather
            than quoting an average of fewer.
          </p>
          <p className="mt-2 max-w-xl text-[13px] text-ink-faint">
            A larger N is steadier but slower to notice a change; a smaller N reacts fast and is
            noisier. Changing it recalculates everything immediately — nothing is stored.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <span className="num text-xs text-ink-faint">{posts.length} posts</span>
        </CardHeader>
        <CardBody>
          <Button asChild size="sm" variant="outline">
            <a href="/api/export">Download CSV</a>
          </Button>
          <p className="mt-3 max-w-xl text-[13px] text-ink-muted">
            One row per reading, with each post&rsquo;s details repeated on its rows. Nothing is
            lost, so the file can be read straight back in.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import</CardTitle>
        </CardHeader>
        <CardBody>
          <CsvImport />
          <p className="mt-3 max-w-xl text-[13px] text-ink-muted">
            Columns are matched by name, so order does not matter and extras are ignored. A post is
            recognised by its label and posted date, and a reading already recorded at the same
            time is skipped — so importing the same file twice changes nothing.
          </p>
          <p className="mt-2 text-[13px] text-ink-faint">
            Required: <span className="num">label</span>, <span className="num">postedAt</span>,{" "}
            <span className="num">capturedAt</span>, <span className="num">views</span>. Full set:{" "}
            <span className="num break-words">{CSV_COLUMNS.join(", ")}</span>.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Database</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-[13px] text-ink-muted">
          <p>
            File: <span className="num break-all text-ink">{DB_PATH}</span>
          </p>
          <p>
            Back it up by copying that file while the app is stopped. Wipe every post, reading and
            milestone with{" "}
            <code className="num rounded border border-line bg-canvas px-1 py-0.5">
              npm run db:reset
            </code>
            , or reload the 12 samples with{" "}
            <code className="num rounded border border-line bg-canvas px-1 py-0.5">
              npm run db:seed
            </code>
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
