# Spotify Streaming Data Pipeline

A public-safe data engineering portfolio project built from personal Spotify Extended Streaming History. The project demonstrates an end-to-end analytics workflow: ingest source JSON, model a cleaned analytics table in BigQuery, and expose dashboard insights through a planned Next.js application.

## Architecture

```text
Spotify Extended Streaming History JSON
        ↓
Python ingestion script
        ↓
BigQuery: spotify                (raw reload table)
        ↓
BigQuery: spotify_cleaned        (analytics-ready table)
        ↓
Next.js dashboard                (planned)
```

## Why BigQuery

BigQuery keeps the transformation layer in SQL, which makes the data model easy to inspect, rerun, and extend. It also reflects a typical analytics-engineering workflow: raw source data is loaded first, then transformed into a purpose-built table for analysis and dashboards.

## Project structure

```text
spotify_data/
├── spotify_json/                 # Personal Spotify source exports (do not publish)
├── coding/
│   ├── jsontobq.py               # JSON-to-BigQuery ingestion
│   ├── cleaningBQ.sql            # Raw-to-cleaned SQL transformation
│   ├── .env.local                # Local configuration (not committed)
│   └── <service-account-key>.json # Google credential (not committed)
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

- selects the fields needed for analysis;
- renames verbose Spotify metadata fields to dashboard-friendly names;
- converts `ms_played` to `seconds_played`;
- retains every play, including short or skipped plays; and
- preserves the raw table as the source for the transformation.

`CREATE OR REPLACE TABLE` makes the cleaned layer reproducible: rerun the same SQL whenever the raw table is refreshed instead of manually editing cleaned records.

## Privacy and secrets

The repository ignores `.env.local`, virtual environments, and the Google service-account key. Do not commit Spotify source files or any credential JSON.

**Before making this repository public:** the current Git history includes 36 files in `spotify_json/`. A `.gitignore` rule does not remove files that Git already tracks, so remove those source files from Git history or replace the repository with a public-safe version before publishing it.

The columns `platform`, `conn_country`, and `ip_addr` were removed directly from the current BigQuery `spotify` table. Important: because ingestion uses `WRITE_TRUNCATE` and reads the original JSON schema, a future full reload will add those fields back unless the ingestion query/script is also changed to exclude them.

## Current status

- BigQuery raw table: complete
- BigQuery cleaned table: complete
- Aggregation layer: next
- Next.js dashboard: planned
- Vercel deployment: planned

## Next steps

Build dashboard-specific BigQuery queries for metrics such as listening time by day, top artists, and top tracks. The Next.js app should execute BigQuery queries server-side so service-account credentials are never sent to the browser.
