# moss-tracker

Instagram performance tracking and benchmarking for **@moss_robotics**.

Every time you log a post, it answers one question: *did this beat my current normal,
and by how much?* Runs entirely on your machine — no accounts, no cloud, no API keys.

```bash
npm install
npm run dev         # http://localhost:3000
```

Then open **Settings → Starting point** and enter what a normal Reel currently does
for you. From then on, log each Reel as you post it.

> `npm run db:seed` loads 12 **invented** demo Reels so you can see a populated
> dashboard. They are not real @moss_robotics posts. Run `npm run db:reset` to clear
> them before tracking for real.

## Screens

| Route | What it's for |
|---|---|
| `/` | Dashboard — current baseline, latest post vs baseline, follower growth, next milestone |
| `/add` | Log a new post, or add a later reading to an existing one |
| `/posts` | Every post, sortable and filterable, with its change vs baseline |
| `/posts/[id]` | Full metric breakdown, snapshot history, rank per metric |
| `/milestones` | Permanent reverse-chronological record |
| `/settings` | Baseline window (N), CSV import/export, database location |

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Start the app |
| `npm test` | Run the unit tests (71 of them, covering the metric and milestone logic) |
| `npm run db:seed` | Wipe, then load 12 sample Reels with realistic snapshot history |
| `npm run db:reset` | Wipe every post, reading and milestone. Schema and settings survive |
| `npm run build` | Production build |
| `npm run clean` | Delete `.next`. The dev server sometimes 500s with `Unexpected end of JSON input` on the very first request after a cold start — refresh and it is fine. Production builds are unaffected. |

## Deploying to Vercel

The database is Postgres, with the backend chosen by environment:

| Environment | Backend |
|---|---|
| No `DATABASE_URL` set | **PGlite** — Postgres compiled to WASM, stored under `data/pg` |
| `DATABASE_URL` set | **Postgres** via node-postgres (Vercel Postgres / Neon / any Postgres) |

PGlite is genuine Postgres, so local development runs exactly the SQL production
runs — no second dialect to keep in sync, no server to install, no cloud account
needed to work on the app.

Vercel's filesystem is ephemeral: anything written to disk is discarded between
requests. A file-backed database would appear to work and then silently lose every
post, which is why production needs a real Postgres over the network.

**1. Create the database.** In your Vercel project → **Storage** → **Create Database**
→ **Postgres** (Neon). The free tier is ample for this. Vercel injects
`DATABASE_URL` into the project automatically — there is nothing to copy or paste.

**2. Deploy.** Import the repo at [vercel.com/new](https://vercel.com/new) and deploy.
Migrations run on the first request, so the schema creates itself.

**3. Move existing data across**, if you have any: export the CSV from Settings
locally, then import it on the deployed app from the same screen.

> **The deployed app has no login.** Anyone with the URL can read your figures and add
> posts. That is a deliberate choice — it is a single-user tool and a password was not
> wanted. If that changes, a Basic-auth middleware gated on one environment variable is
> about twenty lines.

### One local quirk

PGlite allows **one process at a time**. Stop the dev server before running
`npm run db:seed` or `npm run db:reset`, or the second process will wait forever for
a lock it can never get. Hosted Postgres has no such limit.

## The starting point

A trailing average has a cold-start problem: your first ten posts have nothing to be
compared against, which is exactly when you most want to know if something worked.

So you declare where you already are. In **Settings → Starting point** you enter what
a normal post currently gets — views, reach, likes, comments, shares, saves, profile
visits, follows — plus today's follower count. Not a target, not your best: your
current normal.

That figure set does three things:

1. **It fills the baseline slots no real post has filled yet.** With N=10, a starting
   point and 3 tracked posts, the baseline is `(3 measured + 7 declared) / 10`. Your
   declared figures fade out one slot at a time and are gone entirely at post N, at
   which point the baseline is purely measured. The dashboard always says which mix
   you're looking at.
2. **It is the fixed line progress is measured against.** The dashboard's *Progress
   since you started* card shows, per metric, your starting figure → what your tracked
   posts actually average now → the change. The "now" column is measured from posts
   **only**, never from the declared figures, so it cannot flatter itself.
3. **It stops retroactive milestones.** Follower thresholds at or below your starting
   count never fire — you passed 1k followers before this app existed, and being told
   otherwise would be noise. Likewise a baseline-band milestone is only awarded above
   the band your declared figure already sat in.

Skipping it is fine. Without a starting point the app behaves as it did before:
"baseline forming — 4 of 10 posts", and no comparisons until N posts exist.

## Metric categories

The 13 metrics are grouped into three, in the order the questions matter. The grouping
is used by the entry form, the post breakdown and the progress card, and it comes from
one registry in `src/lib/metrics.ts`:

| Category | Question | Metrics |
|---|---|---|
| **Reach** | Did people see it? | views, reach |
| **Engagement** | Did it land? | likes, comments, shares, saves, engagement rate, share rate, save rate |
| **Growth** | Did it grow the account? | profile visits, follows from post, follow conversion, profile visit rate |

The entry form keeps Instagram's own headings (Reach / Interactions / Profile activity)
so it matches the screen you are copying from, in Instagram's field order.

## How baselines are calculated

This is the part that has to be right, so it is worth reading.

**A post is never part of its own baseline.** Each post is compared against the N
posts that came *strictly before* it. Including the post in its own average would
drag the baseline toward it and shrink every delta — a post 5× your normal would
report far less than 5×. N defaults to 10 and is configurable in Settings.

**Reels compare to Reels.** By default the baseline, the ranks and the drift chart
are all scoped to one format, because a Reel and a carousel are different products.
The "All formats" toggle on the dashboard and posts table widens the pool.

**Below N posts, either the starting point stands in or there is no baseline.** With
a starting point declared, the unfilled slots use it. Without one, the app says
*"baseline forming — 4 of 10 posts"* rather than quoting an average of four; deltas
read `—`, while values and ranks stay real and still shown.

**Rates are averaged per post, not as a ratio of totals.** A 100-view post at 10%
engagement and a 10,000-view post at 1% give a baseline of 5.5%, not 1.09%. The
baseline describes a typical *post*, not a typical *view* — otherwise one viral post
would define your normal for months.

**Nothing is ever divided by zero.** Every rate is `null` when views are 0, and
renders as `—`. Never `NaN`, never `Infinity`. A zero baseline reports the absolute
change and no percentage, because 0 → 3 follows is not "+300%".

**Green above, red below, grey within ±5%.** Those three colours appear nowhere
else in the app, so a flash of colour always means "against baseline".

### Derived metrics

All computed on read, never stored, so changing N recalculates everything instantly:

```
engagement rate     = (likes + comments + shares + saves) / views
share rate          = shares / views
save rate           = saves / views
follow conversion   = followsFromPost / views
profile visit rate  = profileVisits / views
```

### Baseline drift

The dashboard's drift chart is the actual growth signal: the *rolling average* over
time, not individual post values. Unlike a per-post comparison, each point here
includes its own post — it answers "what did the last N average as of this post".
The line starts at post N rather than ramping up from a partial average.

## How milestones work

Detection is pure and re-derives everything from the current data on every save.
Each milestone carries a stable key with a `UNIQUE` constraint, and inserts use
`INSERT OR IGNORE` — so **a milestone can never fire twice**, and one earned before
you started using the app (seeded or imported history) still lands on the timeline
at the date it was actually earned.

| Type | Fires when |
|---|---|
| Follower threshold | 500, 1k, 2.5k, 5k, 10k, 25k, 50k, 100k followers |
| Cumulative views | 10k, 50k, 100k, 500k, 1M views across tracked posts |
| First to cross | The first post ever past 1k / 5k / 10k / 50k / 100k views |
| Personal best | A new record on views, shares, saves, follows or engagement rate |
| Streak | 3 consecutive posts above their own trailing baseline |
| Baseline band | The trailing average views enters a new 1,000 band |

Four rules worth knowing:

- **The first post sets no record.** There was nothing to beat.
- **Records key on the post that set them**, so a record can be broken repeatedly
  without re-firing for the same post.
- **Streaks are counted within a format.** Three strong Reels in a row is a signal;
  Reel–carousel–Reel is not a sequence of anything. A post whose baseline is still
  forming is skipped — it neither extends nor breaks a run. A run of 6 fires once,
  at post 3. *With the default N of 10, a streak needs at least 13 posts before it
  can happen at all.*
- **Baseline bands are per format**, and start above the band your declared starting
  figure already sits in — saying "my normal is 5k views" does not award you a 5k
  baseline milestone.
- **Nothing pre-dating your starting point fires.** Cumulative view thresholds count
  tracked posts only, which is why they are labelled "tracked views".

Milestones from the last 14 days appear as a dashboard banner; all of them live
permanently at `/milestones`.

## Data model

`data/moss.db`, one SQLite file, three tables plus settings.

All data lives in one Postgres database: PGlite locally, hosted Postgres in
production.

**Post** — identity only: `postedAt`, `label`, `url`, `format`, `notes`.

**Settings** — key/value: the baseline window N, and your starting point
(`startingBaseline` as JSON, `startingFollowers`, `trackingStartedAt`).

**Snapshot** — every number, including `followerCountAfter`. A post's *current*
figures are its newest snapshot; the older ones are kept so you can see how a post
matured (24h vs 7d vs final).

> Metrics live only on Snapshot, never on Post. Storing today's numbers on the post
> and yesterday's on a snapshot would give two sources of truth that drift apart. A
> post always gets a snapshot when created, so it is never numberless.

**Milestone** — `key` (unique), `type`, `label`, `achievedAt`, `postId`, `metric`, `value`.

## Entering numbers

The form is built for speed, since the numbers are copied by hand off Insights:

- Fields appear in the order Instagram shows them — Views, Reach, then Likes,
  Comments, Shares, Saves, then Profile visits, Follows.
- Tab through the whole form without touching the mouse. `⌘/Ctrl + Enter` saves.
- Number fields accept `12,400` pasted straight out of Insights, commas and all.
- Updating an existing post pre-fills its latest numbers, so you only retype what moved.
- **Warnings never block a save.** You're told if a metric went *down* from the
  previous reading (usually a typo — Instagram metrics don't fall) or if engagement
  rate works out above 25%. The button just changes to "Save anyway".

After saving, the comparison appears immediately: what it beat, what it didn't, and
any milestone it triggered.

## CSV import and export

Export from Settings, or `GET /api/export`. One row per reading, with each post's
details repeated across its rows — nothing is lost, so the file reads straight back in.

Import matches columns **by name**, so column order doesn't matter and extra columns
are ignored. Required: `label`, `postedAt`, `capturedAt`, `views`. A post is
recognised by label + posted date, and a reading already recorded at the same instant
is skipped — so importing the same file twice changes nothing. Rows that can't be
read are reported rather than silently dropped.

## Backing up

**Locally**, everything is in `data/pg` — stop the app and copy the folder:

```bash
cp -r data/pg ~/backups/moss-$(date +%F)
```

**In production**, your Postgres provider keeps its own backups. Either way the CSV
export from Settings is the whole database in a portable, readable form, and can be
imported straight back.

## No Instagram API — and where it would go

Deliberately absent. Everything is entered by hand. If you ever want to automate it,
the Instagram Graph API (`/{ig-media-id}/insights`) needs a Business account, a
linked Facebook Page and a reviewed app — which is why this doesn't assume you have one.

The slot is already the right shape. A fetcher would map the API response onto
`SnapshotInput` and call `addSnapshot(postId, snapshot)` from `src/lib/queries.ts`;
`syncMilestones()` afterwards does the rest. Nothing above that layer knows or cares
where the numbers came from — the metric, baseline and milestone modules never touch
the database at all. A nightly job calling those two functions would keep snapshot
history current on its own.

## Layout

```
src/lib/metrics.ts       Metrics, baselines, deltas, ranks, drift — pure, no I/O
src/lib/milestones.ts    Milestone detection and progress — pure, no I/O
src/lib/csv.ts           CSV reading and writing — pure, no I/O
src/lib/db.ts            Postgres connection (pg or PGlite) and numbered migrations
src/lib/queries.ts       All SQL lives here (async, Postgres dialect)
src/lib/actions.ts       Server actions (save, edit, delete, import, settings)
src/components/          UI, shadcn-style; charts under components/charts
scripts/seed.ts          12 sample Reels
scripts/reset.ts         Wipe
```

The three pure modules have no imports from the database layer, which is what makes
them straightforward to test — `npm test` covers baseline self-exclusion, the cold
start, division-by-zero, rank ties, milestone idempotency, streak scoping and CSV
round-tripping.

## Notes on two choices

**Native `<select>` rather than the Radix listbox.** The form is built to be filled
without a mouse, and a native select is the only kind that opens on a keystroke,
supports type-ahead and never traps focus. The rest of the UI follows shadcn/ui
conventions (CVA variants, `cn()`, components owned in-repo).

**Charts use one accent colour and a neutral grey**, validated for contrast and
colour-vision separation. Green and red are reserved entirely for deltas, so they
never appear in a chart.
