# Spotify Streaming Data Pipeline

A public-safe data engineering portfolio project built from personal Spotify Extended Streaming History. The project demonstrates an end-to-end analytics workflow: ingest source JSON, model a cleaned analytics table in BigQuery, build behavioural metrics as Delta tables in Databricks, and expose dashboard insights through a planned Next.js application.

## Contents

**Start here**
- [Architecture](#architecture) — how the pieces fit together
- [Why two platforms](#why-two-platforms) — the BigQuery / Databricks split and why Databricks stays out of the request path

**Running it yourself**
- [Project structure](#project-structure)
- [Setup](#setup) — virtualenv, dependencies, credentials
- [Ingest the Spotify JSON](#ingest-the-spotify-json) — raw load into BigQuery
- [Create the cleaned table](#create-the-cleaned-table) — typing and renaming in SQL
- [Build the Databricks layer](#build-the-databricks-layer) — the ten Delta tables

**The interesting part**
- [Sessionization](#sessionization) — gaps and islands, and the two behavioural measures
- [Thresholds are derived, not chosen](#thresholds-are-derived-not-chosen) — why the cutoffs are percentiles

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
Databricks: workspace.spotify    (Delta tables — KPIs and sessionization)
        ↓
Statement Execution API          (batch export on refresh)
        ↓
Next.js dashboard                (planned)
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
│   ├── .env.local                # Local configuration (not committed)
│   └── <service-account-key>.json # Google credential (not committed)
├── databricks/
│   └── BQ connection to Tables.ipynb   # Delta transform layer + methodology
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

3. In `coding/.env.local`, provide your own BigQuery credentials and destination table.

   ```env
   GOOGLE_APPLICATION_CREDENTIALS=your-service-account-key.json
   TABLE_ID=your-project.your_dataset.spotify
   ```

   Place the referenced service-account JSON file in `coding/`. It must never be committed.

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

Casting `ts` once here rather than parsing it in every downstream query keeps the type decision in the cleaning layer, where it belongs. Note that BigQuery uses strftime-style format tokens (`%Y-%m-%d`) while Spark uses Java patterns (`yyyy-MM-dd`) — a easy difference to trip over when writing both.

`CREATE OR REPLACE TABLE` makes the cleaned layer reproducible: rerun the same SQL whenever the raw table is refreshed instead of manually editing cleaned records.

## Build the Databricks layer

`databricks/BQ connection to Tables.ipynb` reads `spotify_cleaned` through the foreign catalog and writes ten Delta tables to `workspace.spotify`. Cells run top to bottom; later layers depend on earlier ones.

| Layer | Tables | Reads from |
|---|---|---|
| Direct aggregates | `headline_stats`, `top_artists`, `top_tracks`, `daily_listening`, `plays_by_hour` | BigQuery |
| Sessionization | `session_plays` | BigQuery |
| Session summary | `sessions` | `session_plays` |
| Rollups | `session_type_summary`, `session_type_by_month`, `session_quadrants` | `sessions` |

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

## Glossary

Terms used throughout this README and in the Databricks notebook.

**Session** — a stretch of continuous listening. A new session begins when more than 30 minutes pass with no plays. Thirty minutes is a chosen rule, not a fact about the data; a shorter window splits an evening into several sessions, a longer one merges a break into the listening either side of it.

**Gaps and islands** — the SQL pattern used to build sessions. An *island* is a run of plays with no break longer than the rule; a *gap* is the silence between islands. Implemented with `LAG()` to find the gap before each play, a flag when that gap exceeds the threshold, and a running `SUM` over those flags to produce a stable session id.

**Real play** — a play lasting at least 10 seconds. Anything shorter was skipped past without being heard, and is excluded from measures of intent.

**`intent_ratio`** — of a session's real plays, the share that were deliberately picked (`reason_start` of `clickrow` or `playbtn`) rather than autoplayed. Near 1 means steering the session track by track; near 0 means starting something and letting it run.

**`skip_through_ratio`** — the share of a session's plays that lasted under 10 seconds. High means the session was spent hunting rather than listening.

**`session_type`** — active / mixed / passive, from `intent_ratio` split at p90 and p75.

**`listening_mode`** — restless / settled, from `skip_through_ratio` split at p75.

**`reason_start` / `reason_end`** — Spotify's own codes for how a play began and ended. The ones that carry most of the signal: `trackdone` (played to the end), `fwdbtn` (skipped forward), `clickrow` (clicked a track directly), `playbtn` (pressed play), `appload` (app opened).

**Lakehouse Federation** — Unity Catalog feature that mirrors an external database as a *foreign catalog*. Databricks queries the BigQuery tables directly; work pushes down to BigQuery and only results come back. No data is copied.

**Delta table** — Databricks' table format. Used here for the transformed output, which persists between sessions and can be read back by the export step.

**`WRITE_TRUNCATE` / `mode("overwrite")`** — full-refresh write modes in BigQuery and Spark respectively. Both replace the table rather than appending, so a rebuild is idempotent: run it twice, get the same table.

**p75 / p90** — the 75th and 90th percentiles. p75 of a measure is the value below which three-quarters of rows fall. Used here in place of round-number thresholds.

---

## Privacy and secrets

The repository ignores `.env.local`, virtual environments, Spotify source exports, and the Google service-account key. Do not commit Spotify source files or any credential JSON.

The columns `platform`, `conn_country`, and `ip_addr` were removed directly from the current BigQuery `spotify` table. Important: because ingestion uses `WRITE_TRUNCATE` and reads the original JSON schema, a future full reload will add those fields back unless the ingestion script is also changed to exclude them.

## Current status

- BigQuery raw table: complete
- BigQuery cleaned table: complete
- Databricks federation and Delta transform layer: complete
- Batch export to the app: next
- Next.js dashboard: planned
- Vercel deployment: planned

## Next steps

Export the Delta tables via the Databricks SQL Statement Execution API on each refresh, writing aggregated results into the Next.js project as static JSON. The dashboard then reads pre-computed data at build time — no runtime credentials, no live warehouse dependency, and no service-account key ever reaching the browser.
