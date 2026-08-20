import os
import time
import json
import glob
import pandas as pd
from dotenv import load_dotenv
from pymongo import MongoClient

json_files = glob.glob("../spotify_json/Streaming_History_Audio_*.json")

spotify_df = pd.concat([pd.read_json(f) for f in json_files], ignore_index=True)

load_dotenv(".env.local")
#print("URI IS:", os.environ.get("MONGODB_URI"))


client = MongoClient(os.environ.get("MONGODB_URI"))
db = client["spotify_database"]
collection = db["spotify_collection"]

payload = spotify_df.to_dict(orient="records")
batch_size = 5000

for i in range(0, len(payload), batch_size):
    collection.insert_many(payload[i : i + batch_size])
    print(f"Inserted {i + batch_size} of {len(payload)}")

#collection.insert_many(payload)