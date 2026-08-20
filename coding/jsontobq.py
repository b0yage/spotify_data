import os
from pathlib import Path

import pandas as pd
from google.cloud import bigquery
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

load_dotenv(SCRIPT_DIR / ".env.local")

json_files = list((PROJECT_DIR / "spotify_json").glob("Streaming_History_Audio_*.json"))

if not json_files:
    raise FileNotFoundError("No Spotify JSON files found.")

spotify_df = pd.concat([pd.read_json(f) for f in json_files], ignore_index=True)

boolean_columns = ["shuffle", "skipped", "offline", "incognito_mode"]

for column in boolean_columns:
    if column in spotify_df.columns:
        spotify_df[column] = (
            spotify_df[column]
            .map({True: True, False: False, 1: True, 0: False})
            .astype("boolean")
        )

credentials_path = Path(os.environ["GOOGLE_APPLICATION_CREDENTIALS"])
if not credentials_path.is_absolute():
    credentials_path = SCRIPT_DIR / credentials_path
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_path)

client = bigquery.Client()

table_id = os.environ["TABLE_ID"]

job_config = bigquery.LoadJobConfig(
    write_disposition="WRITE_TRUNCATE",
)

job = client.load_table_from_dataframe(spotify_df, table_id, job_config=job_config)

job.result()

print(f"Loaded {job.output_rows} rows into {table_id}.")

