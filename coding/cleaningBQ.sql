CREATE OR REPLACE TABLE
  `clean-facility-505402-v2.spotify_dataset.spotify_cleaned` AS
SELECT
  PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ts) AS ts,
  ms_played / 1000 AS seconds_played,
  master_metadata_track_name AS song_name,
  master_metadata_album_artist_name AS artist,
  master_metadata_album_album_name AS album,
  reason_start,
  reason_end,
  shuffle,
  skipped,
  spotify_track_uri
FROM
  `clean-facility-505402-v2.spotify_dataset.spotify`;