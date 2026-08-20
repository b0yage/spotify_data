"use client";

import { useState } from "react";

import HEADLINE_ROWS from "@/data/headline_stats.json";
import TOP_TRACKS from "@/data/top_tracks.json";
import TOP_ARTISTS from "@/data/top_artists.json";
import PLAYS_BY_HOUR from "@/data/plays_by_hour.json";
import SESSIONS from "@/data/sessions.json";
import SESSION_PLAYS_RAW from "@/data/session_plays.json";

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
          className="border rounded-sm p-5 min-h-[26rem]"
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
          className="border rounded-sm flex flex-col min-h-[26rem] max-h-[40rem]"
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
    <div
      style={{ background: PANEL, borderColor: EDGE }}
      className="border rounded-sm p-3 flex items-center gap-3 w-full lg:w-[22rem] shrink-0"
    >
      <div
        style={{
          background: `radial-gradient(circle at 50% 50%, ${AMBER} 0 14%, ${INK} 14.5% 22%, ${WELL} 22.5% 100%)`,
          borderColor: EDGE,
        }}
        className="w-14 h-14 rounded-full shrink-0 border"
      />
      <div className="min-w-0 flex-1">
        <div
          style={{ fontFamily: MONO, color: MUTED, letterSpacing: "0.14em" }}
          className="text-[9px] uppercase"
        >
          now playing
        </div>
        <div className="text-sm font-medium truncate">{track.song_name}</div>
        <div style={{ color: MUTED }} className="text-xs truncate mb-1.5">
          {track.artist}
        </div>
        <div style={{ background: EDGE }} className="h-1 rounded-full overflow-hidden">
          <div style={{ background: AMBER, width: "38%" }} className="h-full" />
        </div>
        <div style={{ fontFamily: MONO, color: MUTED }} className="text-[9px] mt-1 truncate">
          {id}
        </div>
      </div>
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
  const max = Math.max(...data.map((d) => d.plays));
  return (
    <div>
      <div className="flex items-end gap-1 h-56">
        {data.map((d) => (
          <div key={d.hour_of_day} className="flex-1 flex flex-col justify-end">
            <div
              style={{
                background: d.plays === max ? AMBER : STEEL,
                height: `${(d.plays / max) * 100}%`,
              }}
              className="rounded-t-sm"
              title={`${String(d.hour_of_day).padStart(2, "0")}:00 — ${d.plays.toLocaleString()} plays`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-2">
        {data.map((d) => (
          <div
            key={d.hour_of_day}
            style={{ fontFamily: MONO, color: MUTED }}
            className="flex-1 text-center text-[9px]"
          >
            {d.hour_of_day % 3 === 0 ? String(d.hour_of_day).padStart(2, "0") : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function Quadrants({ onPick }: { onPick: (id: number) => void }) {
  return (
    <div>
      <div
        style={{ background: WELL, borderColor: EDGE }}
        className="relative border rounded-sm h-64 overflow-hidden"
      >
        {/* threshold lines — p75 on each axis */}
        <div style={{ background: EDGE, left: "32%" }} className="absolute top-0 bottom-0 w-px" />
        <div style={{ background: EDGE, bottom: "18%" }} className="absolute left-0 right-0 h-px" />

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
                left: `${Math.min(s.skip_through_ratio * 100, 97)}%`,
                bottom: `${Math.min(s.intent_ratio * 80, 95)}%`,
                width: size,
                height: size,
              }}
              className="absolute rounded-full -translate-x-1/2 translate-y-1/2"
            />
          );
        })}

        <div
          style={{ fontFamily: MONO, color: MUTED }}
          className="absolute bottom-1.5 right-2 text-[9px]"
        >
          skip_through_ratio &rarr;
        </div>
        <div style={{ fontFamily: MONO, color: MUTED }} className="absolute top-2 left-2 text-[9px]">
          &uarr; intent_ratio
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-3">
        {["active", "mixed", "passive"].map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <div style={{ background: typeColor(t) }} className="w-2.5 h-2.5 rounded-full" />
            <span style={{ fontFamily: MONO, color: MUTED }} className="text-[10px]">
              {t}
            </span>
          </div>
        ))}
        <span style={{ fontFamily: MONO, color: MUTED }} className="text-[10px] sm:ml-auto">
          size = length &middot; solid = has detail
        </span>
      </div>
    </div>
  );
}

function SessionTimeline({ plays, onPlay }: { plays: Play[]; onPlay: (p: Playable) => void }) {
  const max = Math.max(...plays.map((p) => p.seconds_played));
  return (
    <div className="space-y-1.5 max-h-[24rem] overflow-y-auto pr-1">
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
      <Rows
        head={["song_name", "artist", "plays", ""]}
        items={tracks.map((t, i) => ({
          key: `${t.spotify_track_uri}-${i}`,
          cells: [t.song_name, t.artist, t.plays],
          action: (
            <button
              onClick={() => onPlay(t)}
              style={{ borderColor: EDGE, color: AMBER }}
              className="w-5 h-5 border rounded-full text-[8px]"
            >
              &#9654;
            </button>
          ),
        }))}
      />
    );
  }

  if (table === "top_artists") {
    return (
      <Rows
        head={["artist", "hours", "plays"]}
        items={artists.map((a) => ({
          key: a.artist,
          cells: [a.artist, a.hours.toFixed(1), a.plays.toLocaleString()],
        }))}
      />
    );
  }

  if (table === "plays_by_hour") {
    return (
      <Rows
        head={["hour_of_day", "plays"]}
        items={hours.map((h) => ({
          key: h.hour_of_day,
          cells: [`${String(h.hour_of_day).padStart(2, "0")}:00`, h.plays.toLocaleString()],
        }))}
      />
    );
  }

  // 13k sessions would blow up the DOM — show the ones with detail first.
  const listed = [...sessions]
    .filter((s) => hasDetail.has(s.session_id))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  return (
    <Rows
      head={["session_id", "started_at", "type", "min"]}
      items={listed.map((s) => ({
        key: s.session_id,
        selected: openSession === s.session_id,
        onClick: () => onOpenSession(s.session_id),
        cells: [
          s.session_id,
          shortDate(s.started_at),
          <span key="t" style={{ color: typeColor(s.session_type) }}>
            {s.session_type}
          </span>,
          s.minutes,
        ],
      }))}
    />
  );
}

type Row = {
  key: string | number;
  cells: React.ReactNode[];
  action?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
};

function Rows({ head, items }: { head: string[]; items: Row[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderColor: EDGE }} className="border-b">
          {head.map((h, i) => (
            <th
              key={i}
              style={{ fontFamily: MONO, color: MUTED, letterSpacing: "0.1em" }}
              className="text-[9px] uppercase text-left font-normal px-3 py-2"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr
            key={row.key}
            onClick={row.onClick}
            style={{
              borderColor: EDGE,
              background: row.selected ? "#2A2338" : "transparent",
              cursor: row.onClick ? "pointer" : "default",
            }}
            className="border-b"
          >
            {row.cells.map((c, i) => (
              <td
                key={i}
                style={{ fontFamily: MONO }}
                className="px-3 py-2 text-[11px] max-w-[9rem] truncate"
              >
                {c}
              </td>
            ))}
            {row.action && <td className="px-3 py-2">{row.action}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}