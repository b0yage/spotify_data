"use client";

import { Fragment, useState } from "react";

import HEADLINE_ROWS from "@/data/headline_stats.json";
import TOP_TRACKS from "@/data/top_tracks.json";
import TOP_ARTISTS from "@/data/top_artists.json";
import PLAYS_BY_HOUR from "@/data/plays_by_hour.json";
import SESSIONS from "@/data/sessions.json";
import SESSION_PLAYS_RAW from "@/data/session_plays.json";
import ARTIST_TRACKS_RAW from "@/data/artist_tracks.json";
import TRACKS_BY_HOUR_RAW from "@/data/tracks_by_hour.json";

// ---------------------------------------------------------------
// Types — match the Delta table schemas in workspace.spotify
// ---------------------------------------------------------------

type Track = {
  song_name: string;
  artist: string;
  spotify_track_uri: string;
  plays: number;
};

type Artist = { artist: string; hours: number; plays: number };
type Hour = { hour_of_day: number; plays: number };

type Session = {
  session_id: number;
  started_at: string;
  plays: number;
  real_plays: number;
  minutes: number;
  artists: number;
  skip_through_ratio: number;
  intent_ratio: number;
  session_type: string;
  listening_mode: string;
};

type Play = {
  session_id: number;
  ts: string;
  song_name: string;
  artist: string;
  seconds_played: number;
  play_outcome: string;
  spotify_track_uri: string;
};

type Playable = { song_name: string; artist: string; spotify_track_uri: string };

type ArtistTrack = Playable & { plays: number };
type HourTrack = ArtistTrack & { hour_of_day: number };

const headline = HEADLINE_ROWS[0] as {
  total_hours: number;
  artists: number;
  tracks: number;
  skip_rate: number;
};

const tracks = TOP_TRACKS as Track[];
const artists = TOP_ARTISTS as Artist[];
const hours = PLAYS_BY_HOUR as Hour[];
const sessions = SESSIONS as Session[];

// session_plays exports as a flat array; group it once by session so
// opening a session is a lookup rather than a scan.
const playsBySession = (SESSION_PLAYS_RAW as Play[]).reduce<Record<number, Play[]>>(
  (acc, p) => {
    (acc[p.session_id] ||= []).push(p);
    return acc;
  },
  {},
);

// Top tracks per artist and per hour, grouped for the expandable rows.
const tracksByArtist = (ARTIST_TRACKS_RAW as ArtistTrack[]).reduce<
  Record<string, ArtistTrack[]>
>((acc, t) => {
  (acc[t.artist] ||= []).push(t);
  return acc;
}, {});

const tracksByHour = (TRACKS_BY_HOUR_RAW as HourTrack[]).reduce<
  Record<number, HourTrack[]>
>((acc, t) => {
  (acc[t.hour_of_day] ||= []).push(t);
  return acc;
}, {});

// Detail is only exported for a sampled subset of sessions, so the
// scatter shows every session but not all of them open.
const hasDetail = new Set(Object.keys(playsBySession).map(Number));

// ---------------------------------------------------------------

const INK = "#15121B";
const PANEL = "#1D1926";
const EDGE = "#2C2637";
const WELL = "#241E2E";
const AMBER = "#E8A33D";
const STEEL = "#6B8CAE";
const PAPER = "#EDE7DE";
const MUTED = "#877E96";

const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const TABLES = [
  { id: "top_tracks", label: "top_tracks", rows: tracks.length, playable: true },
  { id: "top_artists", label: "top_artists", rows: artists.length, playable: false },
  { id: "sessions", label: "sessions", rows: sessions.length, playable: false },
  { id: "plays_by_hour", label: "plays_by_hour", rows: hours.length, playable: false },
] as const;

type TableId = (typeof TABLES)[number]["id"];

const TITLES: Record<TableId, string> = {
  top_tracks: "Most played tracks",
  top_artists: "Hours by artist",
  sessions: "Intent against skipping",
  plays_by_hour: "Plays by hour of day",
};

const typeColor = (t: string) =>
  t === "active" ? AMBER : t === "mixed" ? "#B9A06B" : STEEL;

const shortDate = (s: string) => (s ?? "").replace("T", " ").slice(0, 16);

// ---------------------------------------------------------------

export default function Dashboard() {
  const [table, setTable] = useState<TableId>("top_tracks");
  const [nowPlaying, setNowPlaying] = useState<Playable>(tracks[0]);
  const [openSession, setOpenSession] = useState<number | null>(null);

  const activeTable = TABLES.find((t) => t.id === table)!;
  const openPlays = openSession !== null ? playsBySession[openSession] ?? [] : [];

  return (
    <div
      style={{ background: INK, color: PAPER, fontFamily: SANS, minHeight: "100vh" }}
      className="p-4 sm:p-6"
    >
      <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-6">
        <div>
          <div
            style={{ fontFamily: MONO, color: MUTED, letterSpacing: "0.18em" }}
            className="text-[10px] uppercase mb-2"
          >
            workspace.spotify
          </div>
          <h1 className="text-3xl font-semibold tracking-tight leading-none">
            Listening log
          </h1>
          <div style={{ color: MUTED }} className="text-sm mt-2">
            {sessions.length.toLocaleString()} sessions &middot; every play, every break
          </div>
        </div>

        <Player track={nowPlaying} />
      </header>

      <div
        style={{ borderColor: EDGE }}
        className="grid grid-cols-2 sm:grid-cols-4 border-y sm:divide-x mb-6"
      >
        {[
          ["hours listened", Math.round(headline.total_hours).toLocaleString()],
          ["artists", headline.artists.toLocaleString()],
          ["tracks", headline.tracks.toLocaleString()],
          ["skip rate", `${(headline.skip_rate * 100).toFixed(1)}%`],
        ].map(([label, value]) => (
          <div key={label} style={{ borderColor: EDGE }} className="px-4 py-3">
            <div
              style={{ fontFamily: MONO, color: MUTED, letterSpacing: "0.14em" }}
              className="text-[10px] uppercase mb-1"
            >
              {label}
            </div>
            <div style={{ fontFamily: MONO }} className="text-xl">
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-6">
        {/* LEFT — canvas */}
        <section
          style={{ background: PANEL, borderColor: EDGE }}
          className="border rounded-sm p-5 min-h-104"
        >
          <PanelHeading
            eyebrow={openSession !== null ? `session ${openSession}` : activeTable.label}
            title={openSession !== null ? "Play-by-play" : TITLES[table]}
            onBack={openSession !== null ? () => setOpenSession(null) : null}
          />

          {openSession !== null ? (
            openPlays.length ? (
              <SessionTimeline plays={openPlays} onPlay={setNowPlaying} />
            ) : (
              <EmptyDetail />
            )
          ) : table === "top_tracks" ? (
            <BarList
              data={tracks.map((t) => ({
                label: t.song_name,
                sub: t.artist,
                value: t.plays,
              }))}
              unit="plays"
            />
          ) : table === "top_artists" ? (
            <BarList
              data={artists.map((a) => ({
                label: a.artist,
                sub: `${a.plays.toLocaleString()} plays`,
                value: Math.round(a.hours),
              }))}
              unit="hrs"
            />
          ) : table === "plays_by_hour" ? (
            <HourChart data={hours} />
          ) : (
            <Quadrants onPick={setOpenSession} />
          )}
        </section>

        {/* RIGHT — rows */}
        <section
          style={{ background: PANEL, borderColor: EDGE }}
          className="border rounded-sm flex flex-col min-h-104 max-h-160"
        >
          <div style={{ borderColor: EDGE }} className="border-b p-3">
            <div
              style={{ fontFamily: MONO, color: MUTED, letterSpacing: "0.14em" }}
              className="text-[10px] uppercase mb-2"
            >
              select a table
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TABLES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTable(t.id);
                    setOpenSession(null);
                  }}
                  style={{
                    fontFamily: MONO,
                    background: table === t.id ? AMBER : "transparent",
                    color: table === t.id ? INK : MUTED,
                    borderColor: table === t.id ? AMBER : EDGE,
                  }}
                  className="text-[11px] px-2.5 py-1 border rounded-sm transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <RowList
              table={table}
              onPlay={setNowPlaying}
              onOpenSession={setOpenSession}
              openSession={openSession}
            />
          </div>

          <div
            style={{ borderColor: EDGE, fontFamily: MONO, color: MUTED }}
            className="border-t px-3 py-2 text-[10px] flex justify-between"
          >
            <span>{activeTable.rows.toLocaleString()} rows</span>
            <span>{activeTable.playable ? "playable" : "no track uri"}</span>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------

function PanelHeading({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow: string;
  title: string;
  onBack: (() => void) | null;
}) {
  return (
    <div className="flex items-baseline gap-3 mb-5">
      {onBack && (
        <button onClick={onBack} style={{ fontFamily: MONO, color: AMBER }} className="text-xs">
          &larr; back
        </button>
      )}
      <div>
        <div
          style={{ fontFamily: MONO, color: MUTED, letterSpacing: "0.14em" }}
          className="text-[10px] uppercase"
        >
          {eyebrow}
        </div>
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div style={{ color: MUTED }} className="text-sm max-w-md leading-relaxed">
      No track detail for this session. The export ships play-by-play for a
      sample of {hasDetail.size} sessions — the most recent, the earliest, the
      longest, and the most deliberate — rather than the full history.
    </div>
  );
}

function Player({ track }: { track: Playable }) {
  const id = track.spotify_track_uri?.split(":").pop() ?? "";

  return (
    <div className="w-full lg:w-88 shrink-0">
      <div
        style={{ fontFamily: MONO, color: MUTED, letterSpacing: "0.18em" }}
        className="text-[10px] uppercase mb-2"
      >
        now playing
      </div>

      {/* Spotify's own embed carries the artwork, title and controls, so
          nothing here repeats them. Signed-in listeners hear the full
          track; everyone else gets a 30-second preview. Keying on the
          track id forces a remount when the selection changes — the
          embed has no API for swapping tracks in place. */}
      <iframe
        key={id}
        src={`https://open.spotify.com/embed/track/${id}`}
        title={`${track.song_name} — ${track.artist}`}
        height={80}
        className="w-full block rounded-sm"
        style={{ border: 0 }}
        allow="encrypted-media; clipboard-write"
        loading="lazy"
      />
    </div>
  );
}

function BarList({
  data,
  unit,
}: {
  data: { label: string; sub: string; value: number }[];
  unit: string;
}) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.slice(0, 12).map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-32 sm:w-44 shrink-0 min-w-0">
            <div className="text-sm truncate">{d.label}</div>
            <div style={{ color: MUTED }} className="text-xs truncate">
              {d.sub}
            </div>
          </div>
          <div style={{ background: WELL }} className="flex-1 h-5 rounded-sm overflow-hidden">
            <div
              style={{ background: AMBER, width: `${(d.value / max) * 100}%` }}
              className="h-full"
            />
          </div>
          <div style={{ fontFamily: MONO }} className="w-16 text-right text-xs shrink-0">
            {d.value} <span style={{ color: MUTED }}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function HourChart({ data }: { data: Hour[] }) {
  const W = 720;
  const H = 240;
  const PAD = { top: 12, right: 8, bottom: 22, left: 40 };

  const max = Math.max(...data.map((d) => d.plays));
  const peak = data.reduce((a, b) => (b.plays > a.plays ? b : a));
  const trough = data.reduce((a, b) => (b.plays < a.plays ? b : a));

  const x = (h: number) =>
    PAD.left + (h / 23) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    PAD.top + (1 - p / max) * (H - PAD.top - PAD.bottom);

  const line = data.map((d) => `${x(d.hour_of_day)},${y(d.plays)}`).join(" ");
  const area = `${x(0)},${y(0)} ${line} ${x(23)},${y(0)}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="hourFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={AMBER} stopOpacity="0.35" />
            <stop offset="100%" stopColor={AMBER} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* horizontal guides */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke={EDGE}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(max * f) + 3}
              textAnchor="end"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {Math.round((max * f) / 1000)}k
            </text>
          </g>
        ))}

        <polygon points={area} fill="url(#hourFill)" />
        <polyline
          points={line}
          fill="none"
          stroke={AMBER}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {data.map((d) => (
          <circle
            key={d.hour_of_day}
            cx={x(d.hour_of_day)}
            cy={y(d.plays)}
            r={d === peak || d === trough ? 4 : 2.5}
            fill={d === trough ? STEEL : AMBER}
          >
            <title>
              {String(d.hour_of_day).padStart(2, "0")}:00 —{" "}
              {d.plays.toLocaleString()} plays
            </title>
          </circle>
        ))}

        {/* hour axis */}
        {data
          .filter((d) => d.hour_of_day % 3 === 0)
          .map((d) => (
            <text
              key={d.hour_of_day}
              x={x(d.hour_of_day)}
              y={H - 6}
              textAnchor="middle"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {String(d.hour_of_day).padStart(2, "0")}
            </text>
          ))}
      </svg>

      <div
        style={{ fontFamily: MONO, color: MUTED }}
        className="text-[10px] mt-3 flex flex-wrap gap-x-6 gap-y-1"
      >
        <span>
          peak{" "}
          <span style={{ color: AMBER }}>
            {String(peak.hour_of_day).padStart(2, "0")}:00
          </span>{" "}
          &middot; {peak.plays.toLocaleString()} plays
        </span>
        <span>
          quietest{" "}
          <span style={{ color: STEEL }}>
            {String(trough.hour_of_day).padStart(2, "0")}:00
          </span>{" "}
          &middot; {trough.plays.toLocaleString()} plays
        </span>
      </div>
    </div>
  );
}

function Quadrants({ onPick }: { onPick: (id: number) => void }) {
  // Padding inside the plot so dots sitting at 0 or 1 on either axis
  // aren't sliced in half by the panel edge.
  const PAD = 14;
  const pct = (v: number, cap: number) =>
    `calc(${PAD}px + ${Math.min(v / cap, 1) * 100}% - ${(PAD * 2 * Math.min(v / cap, 1)).toFixed(2)}px)`;

  // Axis caps. intent_ratio runs to 1 but almost nothing sits above
  // 0.8, so the vertical axis is capped there to use the space.
  const X_MAX = 1;
  const Y_MAX = 0.8;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div
        style={{ background: WELL, borderColor: EDGE }}
        className="relative border rounded-sm h-64"
      >
        {/* threshold lines — p75 on each axis */}
        <div
          style={{ background: EDGE, left: pct(0.32, X_MAX) }}
          className="absolute top-0 bottom-0 w-px"
        />
        <div
          style={{ background: EDGE, bottom: pct(0.14, Y_MAX) }}
          className="absolute left-0 right-0 h-px"
        />

        {sessions.map((s) => {
          const detail = hasDetail.has(s.session_id);
          const size = Math.max(4, Math.min(s.minutes / 8, 18));
          return (
            <button
              key={s.session_id}
              onClick={() => onPick(s.session_id)}
              title={`session ${s.session_id} — ${s.session_type}, ${s.listening_mode}, ${s.minutes}m`}
              style={{
                background: typeColor(s.session_type),
                opacity: detail ? 0.9 : 0.22,
                left: pct(s.skip_through_ratio, X_MAX),
                bottom: pct(s.intent_ratio, Y_MAX),
                width: size,
                height: size,
              }}
              className="absolute rounded-full -translate-x-1/2 translate-y-1/2"
            />
          );
        })}

        <div style={{ fontFamily: MONO, color: MUTED }} className="absolute top-2 left-2 text-[9px]">
          &uarr; intent_ratio
        </div>

        {/* y-axis ticks */}
        {ticks
          .filter((t) => t <= Y_MAX)
          .map((t) => (
            <span
              key={`y${t}`}
              style={{ fontFamily: MONO, color: MUTED, bottom: pct(t, Y_MAX) }}
              className="absolute right-1.5 text-[9px] translate-y-1/2"
            >
              {t}
            </span>
          ))}
      </div>

      {/* x-axis ticks, outside the plot so they don't collide with dots */}
      <div className="relative h-4 mt-1">
        {ticks.map((t) => (
          <span
            key={`x${t}`}
            style={{ fontFamily: MONO, color: MUTED, left: pct(t, X_MAX) }}
            className="absolute text-[9px] -translate-x-1/2"
          >
            {t}
          </span>
        ))}
        <span
          style={{ fontFamily: MONO, color: MUTED }}
          className="absolute right-0 text-[9px]"
        >
          skip_through_ratio &rarr;
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-2">
        {["active", "mixed", "passive"].map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <div style={{ background: typeColor(t) }} className="w-2.5 h-2.5 rounded-full" />
            <span style={{ fontFamily: MONO, color: MUTED }} className="text-[10px]">
              {t}
            </span>
          </div>
        ))}
        <span style={{ fontFamily: MONO, color: MUTED }} className="text-[10px] sm:ml-auto">
          size = length &middot; solid = has detail &middot; lines = p75 thresholds
        </span>
      </div>
    </div>
  );
}

function SessionTimeline({ plays, onPlay }: { plays: Play[]; onPlay: (p: Playable) => void }) {
  const max = Math.max(...plays.map((p) => p.seconds_played));
  return (
    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
      {plays.map((p, i) => {
        const skipped = p.play_outcome === "skipped through";
        return (
          <div key={i} className="flex items-center gap-3">
            <span style={{ fontFamily: MONO, color: MUTED }} className="text-[10px] w-16 shrink-0">
              {shortDate(p.ts).slice(-5)}
            </span>
            <button
              onClick={() => onPlay(p)}
              style={{ borderColor: EDGE, color: AMBER }}
              className="w-6 h-6 shrink-0 border rounded-full text-[9px]"
            >
              &#9654;
            </button>
            <div className="w-32 sm:w-40 shrink-0 min-w-0">
              <div className="text-sm truncate">{p.song_name}</div>
              <div style={{ color: MUTED }} className="text-xs truncate">
                {p.artist}
              </div>
            </div>
            <div style={{ background: WELL }} className="flex-1 h-4 rounded-sm overflow-hidden">
              <div
                style={{
                  background: skipped ? "#4A4157" : AMBER,
                  width: `${(p.seconds_played / max) * 100}%`,
                }}
                className="h-full"
              />
            </div>
            <span
              style={{ fontFamily: MONO, color: skipped ? MUTED : PAPER }}
              className="text-[10px] w-12 text-right shrink-0"
            >
              {p.seconds_played.toFixed(0)}s
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RowList({
  table,
  onPlay,
  onOpenSession,
  openSession,
}: {
  table: TableId;
  onPlay: (t: Playable) => void;
  onOpenSession: (id: number) => void;
  openSession: number | null;
}) {
  if (table === "top_tracks") {
    return (
      <DataTable
        rows={tracks}
        getKey={(t, i) => `${t.spotify_track_uri}-${i}`}
        columns={[
          { key: "song_name", label: "song_name", get: (t) => t.song_name },
          { key: "artist", label: "artist", get: (t) => t.artist },
          { key: "plays", label: "plays", get: (t) => t.plays, numeric: true },
        ]}
        action={(t) => <PlayButton onClick={() => onPlay(t)} />}
      />
    );
  }

  if (table === "top_artists") {
    return (
      <DataTable
        rows={artists}
        getKey={(a) => a.artist}
        columns={[
          { key: "artist", label: "artist", get: (a) => a.artist },
          { key: "hours", label: "hours", get: (a) => a.hours, numeric: true,
            render: (a) => a.hours.toFixed(1) },
          { key: "plays", label: "plays", get: (a) => a.plays, numeric: true,
            render: (a) => a.plays.toLocaleString() },
        ]}
        expand={(a) => (
          <TrackStrip tracks={tracksByArtist[a.artist] ?? []} onPlay={onPlay} showArtist={false} />
        )}
      />
    );
  }

  if (table === "plays_by_hour") {
    return (
      <DataTable
        rows={hours}
        getKey={(h) => h.hour_of_day}
        columns={[
          { key: "hour_of_day", label: "hour_of_day", get: (h) => h.hour_of_day,
            numeric: true,
            render: (h) => `${String(h.hour_of_day).padStart(2, "0")}:00` },
          { key: "plays", label: "plays", get: (h) => h.plays, numeric: true,
            render: (h) => h.plays.toLocaleString() },
        ]}
        expand={(h) => (
          <TrackStrip tracks={tracksByHour[h.hour_of_day] ?? []} onPlay={onPlay} showArtist />
        )}
      />
    );
  }

  // 13k sessions would blow up the DOM — list the ones with detail.
  const listed = sessions.filter((s) => hasDetail.has(s.session_id));

  return (
    <DataTable
      rows={listed}
      getKey={(s) => s.session_id}
      initialSort={{ key: "started_at", dir: "desc" }}
      isSelected={(s) => openSession === s.session_id}
      onRowClick={(s) => onOpenSession(s.session_id)}
      columns={[
        { key: "session_id", label: "id", get: (s) => s.session_id, numeric: true },
        { key: "started_at", label: "started_at", get: (s) => s.started_at,
          render: (s) => shortDate(s.started_at) },
        { key: "session_type", label: "type", get: (s) => s.session_type,
          render: (s) => (
            <span style={{ color: typeColor(s.session_type) }}>{s.session_type}</span>
          ) },
        { key: "minutes", label: "min", get: (s) => s.minutes, numeric: true },
      ]}
    />
  );
}

function PlayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ borderColor: EDGE, color: AMBER }}
      className="w-5 h-5 border rounded-full text-[8px] shrink-0"
    >
      &#9654;
    </button>
  );
}

function TrackStrip({
  tracks,
  onPlay,
  showArtist,
}: {
  tracks: ArtistTrack[];
  onPlay: (t: Playable) => void;
  showArtist: boolean;
}) {
  if (!tracks.length) {
    return (
      <div style={{ color: MUTED, fontFamily: MONO }} className="text-[10px] py-2">
        no tracks exported
      </div>
    );
  }
  return (
    <div className="py-1.5 space-y-1">
      {tracks.map((t, i) => (
        <div key={`${t.spotify_track_uri}-${i}`} className="flex items-center gap-2">
          <PlayButton onClick={() => onPlay(t)} />
          <span className="text-[11px] truncate flex-1 min-w-0">
            {t.song_name}
            {showArtist && (
              <span style={{ color: MUTED }}> &middot; {t.artist}</span>
            )}
          </span>
          <span
            style={{ fontFamily: MONO, color: MUTED }}
            className="text-[10px] shrink-0"
          >
            {t.plays.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Generic sortable / filterable table with optional expandable rows.
// ---------------------------------------------------------------

type Column<T> = {
  key: string;
  label: string;
  get: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  numeric?: boolean;
};

function DataTable<T>({
  rows,
  columns,
  getKey,
  action,
  expand,
  onRowClick,
  isSelected,
  initialSort,
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T, i: number) => string | number;
  action?: (row: T) => React.ReactNode;
  expand?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  isSelected?: (row: T) => boolean;
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | number | null>(null);

  const span = columns.length + (action ? 1 : 0) + (expand ? 1 : 0);

  let view = rows;

  if (query.trim()) {
    const q = query.toLowerCase();
    view = view.filter((r) =>
      columns.some((c) => String(c.get(r)).toLowerCase().includes(q)),
    );
  }

  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    if (col) {
      view = [...view].sort((a, b) => {
        const av = col.get(a);
        const bv = col.get(b);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
  }

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  return (
    <div>
      <div style={{ borderColor: EDGE }} className="border-b px-3 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter rows…"
          style={{ fontFamily: MONO, background: WELL, borderColor: EDGE, color: PAPER }}
          className="w-full text-[11px] px-2 py-1 border rounded-sm outline-none focus:border-white/25"
        />
      </div>

      <table className="w-full">
        <thead>
          <tr style={{ borderColor: EDGE }} className="border-b">
            {expand && <th className="w-6" />}
            {columns.map((c) => {
              const on = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  style={{
                    fontFamily: MONO,
                    color: on ? AMBER : MUTED,
                    letterSpacing: "0.1em",
                  }}
                  className="text-[9px] uppercase text-left font-normal px-3 py-2 cursor-pointer select-none whitespace-nowrap"
                >
                  {c.label}
                  <span className="ml-1">
                    {on ? (sort!.dir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </th>
              );
            })}
            {action && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {view.map((row, i) => {
            const key = getKey(row, i);
            const isOpen = expanded === key;
            return (
              <Fragment key={key}>
                <tr
                  onClick={() => {
                    if (expand) setExpanded(isOpen ? null : key);
                    onRowClick?.(row);
                  }}
                  style={{
                    borderColor: EDGE,
                    background: isSelected?.(row) || isOpen ? "#2A2338" : "transparent",
                    cursor: expand || onRowClick ? "pointer" : "default",
                  }}
                  className="border-b"
                >
                  {expand && (
                    <td
                      style={{ fontFamily: MONO, color: isOpen ? AMBER : MUTED }}
                      className="pl-3 text-[9px]"
                    >
                      {isOpen ? "▾" : "▸"}
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{ fontFamily: MONO }}
                      className="px-3 py-2 text-[11px] max-w-36 truncate"
                    >
                      {c.render ? c.render(row) : c.get(row)}
                    </td>
                  ))}
                  {action && <td className="px-3 py-2">{action(row)}</td>}
                </tr>

                {expand && isOpen && (
                  <tr style={{ borderColor: EDGE, background: "#221C2C" }} className="border-b">
                    <td colSpan={span} className="px-3">
                      {expand(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {!view.length && (
        <div
          style={{ color: MUTED, fontFamily: MONO }}
          className="text-[10px] px-3 py-4"
        >
          no rows match &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}