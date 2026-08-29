# Spotify Streaming Data Pipeline

**Live: [spotify-data-ebon.vercel.app](https://spotify-data-ebon.vercel.app/)**

A public-safe data engineering portfolio project built from personal Spotify Extended Streaming History. The project demonstrates an end-to-end analytics workflow: ingest source JSON, model a cleaned analytics table in BigQuery, build behavioural metrics as Delta tables in Databricks, and serve them through a Next.js dashboard.

Actively developed — definitions get revised when the data disagrees with them. The session thresholds were rewritten once already and the completion rule twice; both changes are documented below rather than quietly folded in. See [Current status](#current-status) for where things stand.

## Contents

**Start here**
- [Architecture](#architecture) — how the pieces fit together
- [Why two platforms](#why-two-platforms) — the BigQuery / Databricks split and why Databricks stays out of the request path

**Running it yourself**
- [Project structure](#project-structure)
- [Setup](#setup) — virtualenv, dependencies, credentials
- [Ingest the Spotify JSON](#ingest-the-spotify-json) — raw load into BigQuery
- [Create the cleaned table](#create-the-cleaned-table) — typing and renaming in SQL
- [Build the Databricks layer](#build-the-databricks-layer) — the seventeen Delta tables
- [Export and run the dashboard](#export-and-run-the-dashboard) — Statement Execution API to Next.js
- [Refreshing the data](#refreshing-the-data) — the full loop, start to finish

**The interesting part**
- [Sessionization](#sessionization) — gaps and islands, and the two behavioural measures
- [Thresholds are derived, not chosen](#thresholds-are-derived-not-chosen) — why the cutoffs are percentiles
- [The behavioural KPIs](#the-behavioural-kpis) — discovery, concentration, skipping, streaks
- [The dashboard](#the-dashboard) — what the page does and why the charts are hand-drawn

**Reference**
- [Glossary](#glossary) — terms used throughout
- [Privacy and secrets](#privacy-and-secrets)
- [Current status](#current-status) / [Next steps](#next-steps)

---

## Architecture

```text
Spotify Extended Streaming History JSON
        ↓
Python ingestion script
        ↓
BigQuery: spotify                (raw reload table)
        ↓
BigQuery: spotify_cleaned        (typed, renamed, analytics-ready)
        ↓
Unity Catalog foreign catalog    (federated read — no data copied)
        ↓
Databricks: workspace.spotify    (Delta tables — KPIs, sessionization, behaviour)
        ↓
Statement Execution API          (batch export on refresh)
        ↓
Next.js dashboard                (static JSON, deployed to Vercel)
```

## Why two platforms

**BigQuery** holds the raw and cleaned layers. Keeping the cleaning step in SQL makes the data model easy to inspect, rerun, and extend, and `CREATE OR REPLACE TABLE` means the cleaned layer is reproducible rather than manually maintained.

**Databricks** holds the transformation and metric layer. The interesting questions about listening history — where sessions begin and end, whether a session was steered or left running — need window functions and a two-layer model that would be awkward to express as a single flat query. Building them as Delta tables gives the dashboard a set of small, purpose-shaped tables to read instead of aggregating at render time.

The two are connected by **Lakehouse Federation**: a Unity Catalog foreign catalog mirrors the BigQuery dataset, so Databricks queries push down to BigQuery and only results come back. No data is copied between platforms.

Databricks is deliberately **not** in the request path. Transformations run on demand, results are exported once per refresh, and the dashboard serves pre-computed data. A cold or quota-limited warehouse cannot take the site down.

## Project structure

```text
spotify_data/
├── spotify_json/                 # Personal Spotify source exports (do not publish)
├── coding/
│   ├── jsontobq.py               # JSON-to-BigQuery ingestion
│   ├── cleaningBQ.sql            # Raw-to-cleaned SQL transformation
│   ├── fetch_from_databricks.py  # Delta-to-JSON export via Statement Execution API
│   ├── .env.local                # Local configuration (not committed)
│   └── <service-account-key>.json # Google credential (not committed)
├── databricks/
│   └── BQ connection to Tables.ipynb   # Delta transform layer + methodology
├── web/                          # Next.js dashboard
│   ├── app/page.tsx              # Single-page dashboard
│   └── data/*.json               # Exported table snapshots (committed)
├── requirements.txt
└── .gitignore
```

## Setup

1. Create and activate a virtual environment.

   **Windows PowerShell**

   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

   **macOS / zsh**

   ```zsh
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install the project dependencies.

   ```bash
   python -m pip install -r requirements.txt
   ```

3. In `coding/.env.local`, provide your own BigQuery and Databricks credentials.

   ```env
   GOOGLE_APPLICATION_CREDENTIALS=your-service-account-key.json
   TABLE_ID=your-project.your_dataset.spotify
   DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
   DATABRICKS_TOKEN=your-personal-access-token
   DATABRICKS_WAREHOUSE_ID=your-warehouse-id
   ```

   Place the referenced service-account JSON file in `coding/`. It must never be committed.

   The Databricks SDK reads `DATABRICKS_HOST` and `DATABRICKS_TOKEN` by those exact names and falls back to credential discovery if either is missing — which fails with a generic "cannot configure default credentials" message rather than naming the variable. The export script loads `.env.local` relative to its own location, not the terminal's working directory, so it can be run from anywhere in the repo.

## Ingest the Spotify JSON

Run the ingestion script from the repository root:

```bash
python coding/jsontobq.py
```

`jsontobq.py` finds the Spotify JSON files and configuration relative to the script location rather than the terminal's current directory. This prevents path failures when the script is run from VS Code, the repository root, or another terminal location.

The script normalizes the Spotify Boolean fields (`shuffle`, `skipped`, `offline`, and `incognito_mode`) before loading. Some source records contain missing values, which makes pandas infer a mixed `object` type; BigQuery cannot reliably map that mixed type to a Boolean column.

The load uses `WRITE_TRUNCATE`. This is intentional for the current workflow: a complete Spotify export rebuilds the raw table in one reproducible operation rather than appending duplicate history on every run.

## Create the cleaned table

Run `coding/cleaningBQ.sql` in the BigQuery console after the raw load completes.

The query creates or replaces `spotify_cleaned` from `spotify`. It:

- parses `ts` from the raw string export into a real `TIMESTAMP`;
- selects the fields needed for analysis;
- renames verbose Spotify metadata fields to dashboard-friendly names;
- converts `ms_played` to `seconds_played`;
- retains every play, including short or skipped plays; and
- preserves the raw table as the source for the transformation.

Casting `ts` once here rather than parsing it in every downstream query keeps the type decision in the cleaning layer, where it belongs. Note that BigQuery uses strftime-style format tokens (`%Y-%m-%d`) while Spark uses Java patterns (`yyyy-MM-dd`) — an easy difference to trip over when writing both.

`CREATE OR REPLACE TABLE` makes the cleaned layer reproducible: rerun the same SQL whenever the raw table is refreshed instead of manually editing cleaned records.

## Build the Databricks layer

`databricks/BQ connection to Tables.ipynb` reads `spotify_cleaned` through the foreign catalog and writes seventeen Delta tables to `workspace.spotify`. Cells run top to bottom; later layers depend on earlier ones.

| Layer | Tables | Reads from |
|---|---|---|
| Direct aggregates | `headline_stats`, `top_artists`, `top_tracks`, `daily_listening`, `plays_by_hour` | BigQuery |
| Sessionization | `session_plays` | BigQuery |
| Session summary | `sessions` | `session_plays` |
| Session rollups | `session_type_summary`, `session_type_by_month`, `session_quadrants` | `sessions` |
| Drill-downs | `artist_tracks`, `tracks_by_hour` | BigQuery + `top_artists` |
| Behavioural KPIs | `discovery_by_month`, `outcomes_by_month`, `streaks`, `artist_concentration` | BigQuery |
| Behavioural KPIs | `sessions_by_start_hour` | `sessions` |

Every table is written with `mode("overwrite")`, matching the `WRITE_TRUNCATE` approach in ingestion: a full rebuild is one reproducible operation, and running the notebook twice produces identical tables.

### Sessionization

Raw history is a flat list of timestamps, but most interesting questions are about *sessions* — stretches of continuous listening separated by breaks. This is the **gaps and islands** pattern: `LAG(ts)` gives the gap before each play, a flag fires when that gap exceeds 30 minutes, and a running `SUM` over those flags becomes the session id, incrementing only at a break.

Each session then carries two independent measures:

- **`intent_ratio`** — share of heard tracks that were deliberately picked (`clickrow` or `playbtn`) rather than autoplayed
- **`skip_through_ratio`** — share of tracks skipped past in under 10 seconds

These are separate axes rather than inverses. Intent measures whether tracks were *chosen*; skip measures whether they were *listened to*. A session can be low on both (an album left running) or high on both (hunting for something specific, picking and rejecting).

### Thresholds are derived, not chosen

The cutoffs that split sessions into active/mixed/passive and restless/settled are percentiles of the observed distributions, not round numbers.

An earlier version split active from passive at `0.4`. Nearly every session came back passive — and describing the distribution showed why: `intent_ratio` has a median of `0.03` and a p90 of `0.35`, so the threshold sat above the 90th percentile and fewer than one session in ten could ever have qualified. It was measuring the threshold, not the behaviour.

The notebook's methodology section documents both distributions, the queries used to derive them, and why percentiles are preferred over the mean on data this heavily right-skewed.

### The behavioural KPIs

The session model describes individual sessions. This layer describes how listening changed across the whole history.

**`discovery_by_month`** — new artists and tracks per month, where "new" means their first real play falls in that month. Reported as `artist_discovery_rate` (new artists as a share of all artists heard that month) rather than a raw count, so heavy and light months stay comparable, plus `repeat_ratio` — plays divided by distinct tracks.

One caveat the number carries: the export only reaches as far back as the account does, so every artist in the earliest month registers as new. Read the first month as an artefact, not a finding.

**`artist_concentration`** — the share of monthly listening *time* held by the top artist and the top ten. This is the deliberate opposite of discovery: one rises when listening spreads outward, the other when it collapses onto a handful of names. Read together they separate a month spent exploring from a month spent on repeat.

**`outcomes_by_month`** — how plays ended. Three overlapping skip measures, all shares of every play in the month:

| Measure | Counts | Reads as |
|---|---|---|
| `manual_skip_ratio` | `reason_end = 'fwdbtn'`, any length | Every track the next button ended |
| `instant_skip_ratio` | `fwdbtn` **and** under 10 seconds | The subset dropped before it was heard |
| `skip_through_ratio` | Under 10 seconds, any `reason_end` | The session model's rule, unchanged |

`instant_skip_ratio` is scoped to `fwdbtn` specifically so it sits strictly inside `manual_skip_ratio`. The dashboard draws the two as nested areas from a common zero, which only reads honestly if that containment holds — the gap between the bands is tracks played into and then dropped, and the ratio between them answers "what share of my skipping was instant."

`skip_through_ratio` is deliberately *not* scoped that way. It counts anything under ten seconds however it ended, because that is the rule the sessionization and session-summary layers use, and the two would quietly disagree if this table narrowed it. The difference between it and `instant_skip_ratio` is short plays ended by something other than the next button — `backbtn`, `endplay`, a logout.

The table also carries `completion_ratio` (`trackdone`) and `shuffle_share`. None of these partition the month: a track skipped at 40 seconds is in `manual_skip_ratio` alone, one skipped at 4 seconds is in all three skip measures, and shuffle is a separate axis describing the player's state rather than the outcome.

**`streaks`** — consecutive days with at least one real play, longest first. Gaps and islands again, applied to dates rather than timestamps: `ROW_NUMBER()` over the distinct play dates advances one per row, so subtracting it from the date yields a constant key across any run of consecutive days and a new key at every break. A day of nothing but skip-throughs breaks the streak, which is intended.

**`sessions_by_start_hour`** — sessions grouped by the hour they *began*, split weekday against weekend, with the average intent, skip-through, and length at each hour. A five-hour evening lands in a single bucket rather than being spread across five. The averages are of per-session ratios, not pooled across plays, so a two-track session weighs the same as a fifty-track one — right for "what kind of session starts at 7am," wrong if the question is "what share of plays at 7am."

The ten-second real-play filter applies to `discovery_by_month`, `streaks`, and `artist_concentration`. A track skipped after two seconds isn't a discovery, doesn't keep a streak alive, and shouldn't count toward an artist's share of listening. `outcomes_by_month` deliberately keeps every play, since the skip-throughs are the thing being measured there.

## Export and run the dashboard

```bash
python coding/fetch_from_databricks.py
```

The script runs each table through the Databricks SQL Statement Execution API, polling for async statements and paginating through result chunks, and writes the rows to `web/data/*.json`. Those files are committed. The dashboard imports them like any other module — no runtime credentials, no live warehouse dependency, and no service-account key ever reaching the browser.

`session_plays` is the one exception to a full export. At 13,000 sessions the play-by-play detail is far too large for the API's inline byte limit, so the script ships a stratified sample of 200 sessions: the 50 most recent, the 50 earliest, the 50 longest, and the 50 most intentional with at least five real plays. The dashboard plots every session in the scatter but only opens the sampled ones.

Then:

```bash
cd web
npm install
npm run dev
```

### The dashboard

A single page in `web/app/page.tsx`, two panels. The left renders a visualization for whichever table is selected; the right is a sortable, filterable table of the same rows, with expandable detail where it exists. Selecting a session in either panel opens its play-by-play timeline.

Every visualization is hand-drawn SVG rather than a chart library — the shapes needed here are specific enough that a library would have been fought rather than used:

- **`sessions`** — a quadrant scatter of all 13,005 sessions, intent against skipping, with the p75 thresholds drawn as gridlines and dot size carrying session length. Sessions with exported detail render at full opacity.
- **`discovery_by_month`** — bars for the count of new artists against a line for the discovery rate, on two axes, because a count and a share don't share a scale.
- **`outcomes_by_month`** — nested areas, both bands drawn from a common zero with a Catmull-Rom spline, so the inner band sits inside the outer and the gap between them is readable directly.
- **`artist_concentration`** — two lines on a shared 0–1 scale.
- **`sessions_by_start_hour`** — paired weekday/weekend bars per hour.

One thing worth knowing when reading the code: the Statement Execution API returns every value as a string, so numeric columns are coerced once at import rather than at every use. Without that, the ratio arithmetic fails silently and the charts render as flat lines.

## Refreshing the data

```bash
python coding/jsontobq.py                  # load new exports into BigQuery
# run cleaningBQ.sql in the BigQuery console
# run the notebook in databricks/ top to bottom
python coding/fetch_from_databricks.py     # export Delta tables to web/data/
git add web/data && git commit && git push # redeploy
```

Manual by design. Every step is a full overwrite, so the loop is idempotent — run it twice and the output is identical.

## Glossary

Terms used throughout this README and in the Databricks notebook.

**Session** — a stretch of continuous listening. A new session begins when more than 30 minutes pass with no plays. Thirty minutes is a chosen rule, not a fact about the data; a shorter window splits an evening into several sessions, a longer one merges a break into the listening either side of it.

**Gaps and islands** — the SQL pattern used to build sessions. An *island* is a run of plays with no break longer than the rule; a *gap* is the silence between islands. Implemented with `LAG()` to find the gap before each play, a flag when that gap exceeds the threshold, and a running `SUM` over those flags to produce a stable session id. The same pattern builds `streaks`, applied to dates rather than timestamps.

**Real play** — a play lasting at least 10 seconds. Anything shorter was skipped past without being heard, and is excluded from measures of intent, discovery, streaks, and artist concentration.

**`intent_ratio`** — of a session's real plays, the share that were deliberately picked (`reason_start` of `clickrow` or `playbtn`) rather than autoplayed. Near 1 means steering the session track by track; near 0 means starting something and letting it run.

**`skip_through_ratio`** — the share of plays that lasted under 10 seconds. High means the time was spent hunting rather than listening. Used at session level in `sessions` and at month level in `outcomes_by_month`, with the same definition in both.

**`instant_skip_ratio`** — the share of plays that lasted under 10 seconds *and* ended with the next button. A strict subset of `manual_skip_ratio`, which is what lets the two be drawn as nested areas.

**`artist_discovery_rate`** — new artists as a share of all artists heard in a month, where new means their first real play falls in that month.

**`repeat_ratio`** — plays divided by distinct tracks. 1.0 means nothing was replayed; 4.0 means the average track came round four times.

**`session_type`** — active / mixed / passive, from `intent_ratio` split at p90 and p75.

**`listening_mode`** — restless / settled, from `skip_through_ratio` split at p75.

**`reason_start` / `reason_end`** — Spotify's own codes for how a play began and ended. The ones that carry most of the signal: `trackdone` (played to the end), `fwdbtn` (skipped forward), `clickrow` (clicked a track directly), `playbtn` (pressed play), `appload` (app opened).

**Lakehouse Federation** — Unity Catalog feature that mirrors an external database as a *foreign catalog*. Databricks queries the BigQuery tables directly; work pushes down to BigQuery and only results come back. No data is copied.

**Delta table** — Databricks' table format. Used here for the transformed output, which persists between sessions and can be read back by the export step.

**Statement Execution API** — the Databricks REST endpoint used to run a query and collect its rows from outside the workspace. Statements run asynchronously, so the export script polls for completion and pages through result chunks.

**`WRITE_TRUNCATE` / `mode("overwrite")`** — full-refresh write modes in BigQuery and Spark respectively. Both replace the table rather than appending, so a rebuild is idempotent: run it twice, get the same table.

**p75 / p90** — the 75th and 90th percentiles. p75 of a measure is the value below which three-quarters of rows fall. Used here in place of round-number thresholds.

---

## Privacy and secrets

The repository ignores `.env.local`, virtual environments, Spotify source exports, and the Google service-account key. Do not commit Spotify source files or any credential JSON.

The columns `platform`, `conn_country`, and `ip_addr` were removed directly from the current BigQuery `spotify` table. Important: because ingestion uses `WRITE_TRUNCATE` and reads the original JSON schema, a future full reload will add those fields back unless the ingestion script is also changed to exclude them.

The exported JSON in `web/data/` is aggregated results rather than raw history, and `session_plays` ships only a sampled subset. Nothing in the committed data identifies anything beyond listening itself.

## Current status

- BigQuery raw table: complete
- BigQuery cleaned table: complete
- Databricks federation and Delta transform layer: complete — seventeen tables
- Batch export to the app: complete
- Next.js dashboard: complete
- Vercel deployment: live at [spotify-data-ebon.vercel.app](https://spotify-data-ebon.vercel.app/)

Deployed from a private GitHub repo with the Vercel root directory set to `web`, since the Next.js app is a subdirectory rather than the repository root. Pushes to `master` redeploy automatically — but only when files under `web/` change, so a refresh has to include the regenerated `web/data/*.json` or the site keeps serving the previous numbers.

The code stays private; the dashboard is public. Nothing in the committed JSON is raw history — it is aggregated results, and `session_plays` ships only a sampled subset.

## Next steps

**Catalog enrichment.** The export carries no track duration, so completion is currently inferred from `reason_end = 'trackdone'` — which misses a track skipped at 2:50 of 3:00, functionally a full listen. Pulling `/v1/tracks` and `/v1/artists` from the Spotify Web API would give real durations, turning completion into an exact percentage, and add genre as an axis the history has never had. Planned as a Databricks notebook using `dbutils.secrets` so the client credentials stay out of the committed `.ipynb`.

**Smaller items.**

- Verify the `shuffle` field in the early export. `shuffle_share` sits near 100% through 2018–2019 and then becomes volatile, which looks more like nulls being coerced to true in the cleaning layer than a real change in behaviour.
- Add a rolling average or coarser grain to the monthly charts. At ~100 months, three series on one axis reads as noise even where the underlying trend is real.
- Weight `sessions_by_start_hour` by plays as well as by session, so the two readings of "what happens at 7am" can be compared.
- Replace the scaffold metadata in `web/app/layout.tsx` — the page still titles itself "Create Next App".
- Decide how `top_tracks` should group. Grouping by `spotify_track_uri` is technically correct but splits a track that exists as both a single and an album release, so the same song can appear twice with different counts.
