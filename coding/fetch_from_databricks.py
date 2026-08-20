"""
Export the Databricks Delta tables to JSON for the Next.js dashboard.

Runs locally, not in Databricks. Reads workspace.spotify via the SQL
Statement Execution API and writes one JSON file per table into
web/data/, where the app imports them at build time.

This is a batch step, not a live query: Databricks is never in the
request path, so a cold or quota-limited warehouse cannot take the
dashboard down. Re-run after each pipeline refresh, then commit and
redeploy.

    cd coding
    python fetch_from_databricks.py

Requires DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_WAREHOUSE_ID
in coding/.env.local.
"""

import os
import json
import time
from pathlib import Path

from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv


# The Statement Execution API returns every cell as a string, including
# numbers and booleans. Left alone that means the dashboard receives
# "16336" instead of 16336, so arithmetic and lookups silently fail.
# Restore real JSON types at the boundary using the column types the
# API reports alongside the data.

NUMERIC_TYPES = {"LONG", "INT", "SHORT", "BYTE", "DOUBLE", "FLOAT", "DECIMAL"}


def coerce(value, type_name: str):
    if value is None:
        return None
    if type_name in NUMERIC_TYPES:
        return float(value) if "." in value or "E" in value.upper() else int(value)
    if type_name == "BOOLEAN":
        return value.lower() == "true"
    return value

load_dotenv(".env.local")

w = WorkspaceClient()
WAREHOUSE = os.environ["DATABRICKS_WAREHOUSE_ID"]

OUT = Path("../web/data")
OUT.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------
# Session sampling
#
# The full session_plays table is the entire play history and exceeds
# the Statement Execution API's inline byte limit, so the export ships
# detail for a subset of sessions.
#
# That subset is a stratified sample rather than a single top-N slice.
# Taking only the longest sessions would bias the export toward one
# corner of the data — and, since long sessions contain the most plays,
# also produce the largest possible file. Four strata of 50 each cover
# different listening behaviour:
#
#   recent          what listening looks like now
#   earliest        what it looked like at the start of the history
#   longest         the extended sessions
#   most deliberate the sessions where tracks were actively picked
#
# "Most deliberate" takes the slot a "shortest sessions" stratum would
# otherwise fill: a one-play session has no tracklist worth opening,
# while high-intent sessions are where curating behaviour is visible.
# The real_plays floor stops tiny sessions from topping the intent
# ranking on a single hand-picked track.
#
# UNION DISTINCT dedupes, since a session can qualify on more than one
# criterion — so the final count is at or below STRATUM_SIZE * 4.
# ---------------------------------------------------------------------

STRATUM_SIZE = 50
MIN_REAL_PLAYS_FOR_INTENT = 5


def _stratum(order_by: str, where: str = "") -> str:
    clause = f"WHERE {where}" if where else ""
    return f"""
        SELECT session_id FROM (
            SELECT session_id,
                   ROW_NUMBER() OVER (ORDER BY {order_by}) AS rn
            FROM workspace.spotify.sessions
            {clause}
        ) WHERE rn <= {STRATUM_SIZE}
    """


SAMPLED_SESSIONS = " UNION DISTINCT ".join([
    _stratum("started_at DESC"),
    _stratum("started_at ASC"),
    _stratum("minutes DESC"),
    _stratum("intent_ratio DESC", f"real_plays >= {MIN_REAL_PLAYS_FOR_INTENT}"),
])


# Tables not listed here are exported with SELECT *.
QUERIES = {
    # Every session, so the scatter plot shows the full distribution.
    "sessions": """
        SELECT * FROM workspace.spotify.sessions
        ORDER BY started_at
    """,
    # Detail for the sampled sessions only, and only the columns the UI
    # renders — the full table has seventeen.
    "session_plays": f"""
        SELECT session_id, ts, song_name, artist,
               seconds_played, play_outcome, spotify_track_uri
        FROM workspace.spotify.session_plays
        WHERE session_id IN ({SAMPLED_SESSIONS})
        ORDER BY session_id, ts
    """,
}

TABLES = [
    "headline_stats",
    "top_artists",
    "top_tracks",
    "daily_listening",
    "plays_by_hour",
    "sessions",
    "session_plays",
    "session_type_summary",
    "session_type_by_month",
    "session_quadrants",
]


def fetch(table: str) -> list[dict]:
    """Run the table's query and return every row as a list of dicts."""
    statement = QUERIES.get(table, f"SELECT * FROM workspace.spotify.{table}")

    resp = w.statement_execution.execute_statement(
        warehouse_id=WAREHOUSE,
        statement=statement,
        wait_timeout="50s",
    )

    # Anything slower than wait_timeout comes back PENDING with no
    # manifest attached, so poll until the statement settles.
    while resp.status.state.value in ("PENDING", "RUNNING"):
        time.sleep(2)
        resp = w.statement_execution.get_statement(resp.statement_id)

    if resp.status.state.value != "SUCCEEDED":
        raise RuntimeError(f"{table}: {resp.status.state.value} — {resp.status.error}")

    columns = [c.name for c in resp.manifest.schema.columns]
    types = [c.type_name.value for c in resp.manifest.schema.columns]

    def to_dict(row):
        return {c: coerce(v, t) for c, t, v in zip(columns, types, row)}

    rows = [to_dict(r) for r in (resp.result.data_array or [])]

    # Large results arrive split across chunks.
    chunk = resp.result.next_chunk_index
    while chunk is not None:
        part = w.statement_execution.get_statement_result_chunk_n(
            resp.statement_id, chunk
        )
        rows += [to_dict(r) for r in (part.data_array or [])]
        chunk = part.next_chunk_index

    return rows


def main() -> None:
    total_mb = 0.0

    for name in TABLES:
        rows = fetch(name)

        path = OUT / f"{name}.json"
        path.write_text(json.dumps(rows))

        size_mb = path.stat().st_size / 1_000_000
        total_mb += size_mb
        print(f"{name:<24} {len(rows):>7,} rows   {size_mb:>6.2f} MB")

    print(f"{'':<24} {'':>7}         {total_mb:>6.2f} MB total")

    # session_plays only covers the sampled sessions, so the UI must
    # handle a session with no tracklist rather than assuming one.
    sampled = {r["session_id"] for r in json.loads((OUT / "session_plays.json").read_text())}
    print(f"\ndetail available for {len(sampled)} sessions")


if __name__ == "__main__":
    main()