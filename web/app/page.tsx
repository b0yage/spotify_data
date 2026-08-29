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
import DISCOVERY_RAW from "@/data/discovery_by_month.json";
import OUTCOMES_RAW from "@/data/outcomes_by_month.json";
import STREAKS_RAW from "@/data/streaks.json";
import CONCENTRATION_RAW from "@/data/artist_concentration.json";
import START_HOURS_RAW from "@/data/sessions_by_start_hour.json";

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

type Discovery = {
  month: string;
  real_plays: number;
  artists: number;
  tracks: number;
  new_artists: number;
  new_tracks: number;
  artist_discovery_rate: number;
  repeat_ratio: number;
};

type Outcome = {
  month: string;
  plays: number;
  manual_skip_ratio: number;
  instant_skip_ratio: number;
  skip_through_ratio: number;
  completion_ratio: number;
  shuffle_share: number;
  hours: number;
};

type Streak = {
  streak_start: string;
  streak_end: string;
  streak_days: number;
  plays: number;
  hours: number;
  avg_minutes_per_day: number;
  artists: number;
  completion_ratio: number;
  skip_through_ratio: number;
};

type Concentration = {
  month: string;
  total_hours: number;
  top1_hours: number;
  next9_hours: number;
  rest_hours: number;
  top1_share: number;
  top10_share: number;
  artists: number;
};

type StartHour = {
  start_hour: number;
  day_type: string;
  sessions: number;
  avg_minutes: number;
  avg_real_plays: number;
  avg_intent_ratio: number;
  avg_skip_through_ratio: number;
};

// The Statement Execution API returns every value as a string, so the
// numeric columns are coerced once at load rather than at every use.
const num = (v: unknown) => Number(v ?? 0);

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

const discovery = (DISCOVERY_RAW as Discovery[]).map((d) => ({
  ...d,
  real_plays: num(d.real_plays),
  artists: num(d.artists),
  tracks: num(d.tracks),
  new_artists: num(d.new_artists),
  new_tracks: num(d.new_tracks),
  artist_discovery_rate: num(d.artist_discovery_rate),
  repeat_ratio: num(d.repeat_ratio),
}));

const outcomes = (OUTCOMES_RAW as Outcome[]).map((o) => ({
  ...o,
  plays: num(o.plays),
  manual_skip_ratio: num(o.manual_skip_ratio),
  instant_skip_ratio: num(o.instant_skip_ratio),
  skip_through_ratio: num(o.skip_through_ratio),
  completion_ratio: num(o.completion_ratio),
  shuffle_share: num(o.shuffle_share),
  hours: num(o.hours),
}));

const streaks = (STREAKS_RAW as Streak[]).map((s) => ({
  ...s,
  streak_days: num(s.streak_days),
  plays: num(s.plays),
  hours: num(s.hours),
  avg_minutes_per_day: num(s.avg_minutes_per_day),
  artists: num(s.artists),
  completion_ratio: num(s.completion_ratio),
  skip_through_ratio: num(s.skip_through_ratio),
}));

const concentration = (CONCENTRATION_RAW as Concentration[]).map((c) => ({
  ...c,
  total_hours: num(c.total_hours),
  top1_hours: num(c.top1_hours),
  next9_hours: num(c.next9_hours),
  rest_hours: num(c.rest_hours),
  top1_share: num(c.top1_share),
  top10_share: num(c.top10_share),
  artists: num(c.artists),
}));

const startHours = (START_HOURS_RAW as StartHour[]).map((s) => ({
  ...s,
  start_hour: num(s.start_hour),
  sessions: num(s.sessions),
  avg_minutes: num(s.avg_minutes),
  avg_real_plays: num(s.avg_real_plays),
  avg_intent_ratio: num(s.avg_intent_ratio),
  avg_skip_through_ratio: num(s.avg_skip_through_ratio),
}));

const longestStreak = streaks.length ? streaks[0].streak_days : 0;

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
const SAGE = "#7FA98C";
const PAPER = "#EDE7DE";
const MUTED = "#877E96";

const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const TABLES = [
  { id: "top_tracks", label: "top_tracks", rows: tracks.length, playable: true },
  { id: "top_artists", label: "top_artists", rows: artists.length, playable: false },
  { id: "sessions", label: "sessions", rows: sessions.length, playable: false },
  { id: "plays_by_hour", label: "plays_by_hour", rows: hours.length, playable: false },
  { id: "discovery", label: "discovery_by_month", rows: discovery.length, playable: false },
  { id: "outcomes", label: "outcomes_by_month", rows: outcomes.length, playable: false },
  { id: "concentration", label: "artist_concentration", rows: concentration.length, playable: false },
  { id: "streaks", label: "streaks", rows: streaks.length, playable: false },
  { id: "start_hours", label: "sessions_by_start_hour", rows: startHours.length, playable: false },
] as const;

type TableId = (typeof TABLES)[number]["id"];

const TITLES: Record<TableId, string> = {
  top_tracks: "Most played tracks",
  top_artists: "Hours by artist",
  sessions: "Intent against skipping",
  plays_by_hour: "Plays by hour of day",
  discovery: "New artists against the month's total",
  outcomes: "How much of a skip was instant",
  concentration: "Where the listening hours went",
  streaks: "Longest runs, and what they were made of",
  start_hours: "When sessions begin",
};

const typeColor = (t: string) =>
  t === "active" ? AMBER : t === "mixed" ? "#B9A06B" : STEEL;

const shortDate = (s: string) => (s ?? "").replace("T", " ").slice(0, 16);
const monthLabel = (s: string) => (s ?? "").slice(0, 7);
const pctText = (v: number) => `${(v * 100).toFixed(1)}%`;

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
            workspace.spotify - Actively developed. The table list and metrics change as the model gets refined.
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
        className="grid grid-cols-2 sm:grid-cols-5 border-y sm:divide-x mb-6"
      >
        {[
          ["hours listened", Math.round(headline.total_hours).toLocaleString()],
          ["artists", headline.artists.toLocaleString()],
          ["tracks", headline.tracks.toLocaleString()],
          ["skip rate", `${(headline.skip_rate * 100).toFixed(1)}%`],
          ["longest streak", `${longestStreak.toLocaleString()}d`],
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
          ) : table === "discovery" ? (
            <DiscoveryChart />
          ) : table === "outcomes" ? (
            <NestedAreas
              rows={outcomes}
              format={pctText}
              series={[
                { label: "manual skip (fwdbtn)", color: STEEL, get: (o) => o.manual_skip_ratio },
                { label: "instant skip (<10s)", color: AMBER, get: (o) => o.instant_skip_ratio },
              ]}
              note="Both bands are shares of every play in the month. The inner band is
                    the part of the skipping that happened inside ten seconds; the gap up
                    to the outer band is tracks played into and then dropped. Because the
                    inner measure is scoped to fwdbtn, it sits strictly inside the outer
                    one — the ratio between them is what share of skipping was instant."
            />
          ) : table === "concentration" ? (
            <StackedHours />
          ) : table === "streaks" ? (
            <BarList
              data={streaks.slice(0, 12).map((s) => ({
                label: `${s.streak_days} days · ${s.avg_minutes_per_day.toFixed(0)} min/day`,
                sub: `${s.streak_start} → ${s.streak_end} · ${pctText(
                  s.completion_ratio,
                )} played fully`,
                value: s.streak_days,
              }))}
              unit="days"
            />
          ) : table === "start_hours" ? (
            <StartHourChart />
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
      {data.slice(0, 12).map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex items-center gap-3">
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

// ---------------------------------------------------------------
// Generic monthly line chart — one polyline per series, shared axes.
// Used by outcomes_by_month and artist_concentration, both of which
// are ratios on the same 0–1 scale.
// ---------------------------------------------------------------

function MonthLines<T extends { month: string }>({
  rows,
  series,
  domain,
  format,
  note,
}: {
  rows: T[];
  series: { label: string; color: string; get: (row: T) => number }[];
  domain?: [number, number];
  format?: (v: number) => string;
  note?: string;
}) {
  const W = 720;
  const H = 240;
  const PAD = { top: 12, right: 8, bottom: 24, left: 42 };

  if (!rows.length) return <EmptyPanel />;

  const values = rows.flatMap((r) => series.map((s) => s.get(r)));
  const lo = domain ? domain[0] : 0;
  const hi = domain ? domain[1] : Math.max(...values) * 1.05 || 1;
  const fmt = format ?? ((v: number) => v.toFixed(2));

  const x = (i: number) =>
    PAD.left + (rows.length === 1 ? 0.5 : i / (rows.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  // Enough month labels to orient without crowding the axis.
  const step = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(lo + (hi - lo) * f)}
              y2={y(lo + (hi - lo) * f)}
              stroke={EDGE}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(lo + (hi - lo) * f) + 3}
              textAnchor="end"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {fmt(lo + (hi - lo) * f)}
            </text>
          </g>
        ))}

        {series.map((s) => (
          <g key={s.label}>
            <polyline
              points={rows.map((r, i) => `${x(i)},${y(s.get(r))}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {rows.map((r, i) => (
              <circle key={i} cx={x(i)} cy={y(s.get(r))} r={2.5} fill={s.color}>
                <title>
                  {monthLabel(r.month)} — {s.label} {fmt(s.get(r))}
                </title>
              </circle>
            ))}
          </g>
        ))}

        {rows.map((r, i) =>
          i % step === 0 ? (
            <text
              key={r.month}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {monthLabel(r.month)}
            </text>
          ) : null,
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-4 mt-3">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div style={{ background: s.color }} className="w-2.5 h-2.5 rounded-full" />
            <span style={{ fontFamily: MONO, color: MUTED }} className="text-[10px]">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {note && (
        <p style={{ color: MUTED }} className="text-xs mt-3 max-w-2xl leading-relaxed">
          {note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Stacked hours — the three tiers of artist_concentration summed
// into the month's total listening time. Genuinely additive, unlike
// the shares, so stacking is honest here: top artist, ranks 2-10,
// and everyone below.
// ---------------------------------------------------------------

function StackedHours() {
  const W = 720;
  const H = 260;
  const PAD = { top: 12, right: 8, bottom: 24, left: 42 };

  if (!concentration.length) return <EmptyPanel />;

  const tiers = [
    { label: "top artist", color: AMBER, get: (c: Concentration) => c.top1_hours },
    { label: "ranks 2–10", color: SAGE, get: (c: Concentration) => c.next9_hours },
    { label: "everyone else", color: STEEL, get: (c: Concentration) => c.rest_hours },
  ];

  const hi = Math.max(...concentration.map((c) => c.total_hours)) * 1.08 || 1;
  const slot = (W - PAD.left - PAD.right) / concentration.length;
  const bw = Math.max(1.5, slot * 0.72);

  const x = (i: number) => PAD.left + i * slot + slot / 2;
  const y = (v: number) => PAD.top + (1 - v / hi) * (H - PAD.top - PAD.bottom);
  const base = H - PAD.bottom;

  const step = Math.max(1, Math.ceil(concentration.length / 8));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(hi * f)}
              y2={y(hi * f)}
              stroke={EDGE}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(hi * f) + 3}
              textAnchor="end"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {`${Math.round(hi * f)}h`}
            </text>
          </g>
        ))}

        {concentration.map((c, i) => {
          let acc = 0;
          return (
            <g key={c.month}>
              {tiers.map((t) => {
                const v = t.get(c);
                const yTop = y(acc + v);
                const h = Math.max(0, y(acc) - yTop);
                acc += v;
                return (
                  <rect
                    key={t.label}
                    x={x(i) - bw / 2}
                    y={yTop}
                    width={bw}
                    height={h}
                    fill={t.color}
                    opacity={0.85}
                  />
                );
              })}
              {/* One transparent column per month carries the tooltip for
                  the whole stack, so hovering anywhere in the bar works. */}
              <rect
                x={x(i) - slot / 2}
                y={PAD.top}
                width={slot}
                height={base - PAD.top}
                fill="transparent"
              >
                <title>
                  {monthLabel(c.month)} — {c.total_hours.toFixed(1)}h across{" "}
                  {c.artists} artists · top {pctText(c.top1_share)} · top 10{" "}
                  {pctText(c.top10_share)}
                </title>
              </rect>
            </g>
          );
        })}

        {concentration.map((c, i) =>
          i % step === 0 ? (
            <text
              key={`x-${c.month}`}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {monthLabel(c.month)}
            </text>
          ) : null,
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-4 mt-3">
        {tiers.map((t) => (
          <Legend key={t.label} color={t.color} label={t.label} />
        ))}
      </div>

      <p style={{ color: MUTED }} className="text-xs mt-3 max-w-2xl leading-relaxed">
        Bar height is the month’s total real-play listening time; the three
        tiers sum to it. Reading the shares alone can’t tell a concentrated
        month from a quiet one — a 95% top-ten share means something
        different over eighty hours than over two.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------
// Nested area bands with a cardinal-spline through the points.
// Every band is drawn from zero rather than stacked, so a smaller
// series sits inside a larger one and the visible gap between them
// is the difference. Pass the largest series first — a later band
// paints over an earlier one.
// ---------------------------------------------------------------

function NestedAreas<T extends { month: string }>({
  rows,
  series,
  format,
  note,
}: {
  rows: T[];
  series: { label: string; color: string; get: (row: T) => number }[];
  format?: (v: number) => string;
  note?: string;
}) {
  const W = 720;
  const H = 260;
  const PAD = { top: 12, right: 8, bottom: 24, left: 42 };

  if (!rows.length) return <EmptyPanel />;

  const hi =
    Math.max(...rows.flatMap((r) => series.map((s) => s.get(r)))) * 1.08 || 1;

  const x = (i: number) =>
    PAD.left +
    (rows.length === 1 ? 0.5 : i / (rows.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / hi) * (H - PAD.top - PAD.bottom);

  // Catmull-Rom converted to cubic bezier. Tension below 1 keeps the
  // curve from overshooting below zero on sharp month-to-month drops.
  const spline = (pts: [number, number][], tension = 0.85) => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
      const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
      const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
      const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  };

  const fmt = format ?? ((v: number) => `${(v * 100).toFixed(0)}%`);
  const step = Math.max(1, Math.ceil(rows.length / 8));
  const base = H - PAD.bottom;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`nested${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.12" />
            </linearGradient>
          ))}
        </defs>

        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(hi * f)}
              y2={y(hi * f)}
              stroke={EDGE}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(hi * f) + 3}
              textAnchor="end"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {fmt(hi * f)}
            </text>
          </g>
        ))}

        {series.map((s, si) => {
          const top = rows.map((r, i) => [x(i), y(s.get(r))] as [number, number]);
          const area = `${spline(top)} L ${x(rows.length - 1)},${base} L ${x(0)},${base} Z`;
          return (
            <g key={s.label}>
              <path d={area} fill={`url(#nested${si})`} />
              <path d={spline(top)} fill="none" stroke={s.color} strokeWidth="1.5" />
            </g>
          );
        })}

        {/* Invisible hit columns — one per month, so the tooltip works
            anywhere in the vertical strip rather than only on a point. */}
        {rows.map((r, i) => (
          <rect
            key={`hit-${r.month}`}
            x={x(i) - (W - PAD.left - PAD.right) / rows.length / 2}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / rows.length}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
          >
            <title>
              {monthLabel(r.month)}
              {series.map((s) => ` · ${s.label} ${fmt(s.get(r))}`).join("")}
            </title>
          </rect>
        ))}

        {rows.map((r, i) =>
          i % step === 0 ? (
            <text
              key={`x-${r.month}`}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {monthLabel(r.month)}
            </text>
          ) : null,
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-4 mt-3">
        {series.map((s) => (
          <Legend key={s.label} color={s.color} label={s.label} />
        ))}
      </div>

      {note && (
        <p style={{ color: MUTED }} className="text-xs mt-3 max-w-2xl leading-relaxed">
          {note}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Discovery needs two scales at once — a count of new artists and a
// rate — so it pairs bars with a line rather than reusing MonthLines.
// ---------------------------------------------------------------

function DiscoveryChart() {
  const W = 720;
  const H = 240;
  const PAD = { top: 12, right: 8, bottom: 24, left: 42 };

  if (!discovery.length) return <EmptyPanel />;

  const maxNew = Math.max(...discovery.map((d) => d.new_artists)) || 1;
  const bw = Math.max(
    2,
    ((W - PAD.left - PAD.right) / discovery.length) * 0.6,
  );

  const x = (i: number) =>
    PAD.left +
    (i + 0.5) * ((W - PAD.left - PAD.right) / discovery.length);
  const yBar = (v: number) =>
    PAD.top + (1 - v / maxNew) * (H - PAD.top - PAD.bottom);
  const yRate = (v: number) =>
    PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);

  const step = Math.max(1, Math.ceil(discovery.length / 8));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yBar(maxNew * f)}
              y2={yBar(maxNew * f)}
              stroke={EDGE}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={yBar(maxNew * f) + 3}
              textAnchor="end"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {Math.round(maxNew * f)}
            </text>
            <text
              x={W - PAD.right + 6}
              y={yRate(f) + 3}
              textAnchor="start"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {`${Math.round(f * 100)}%`}
            </text>
          </g>
        ))}

        {discovery.map((d, i) => (
          <rect
            key={d.month}
            x={x(i) - bw / 2}
            y={yBar(d.new_artists)}
            width={bw}
            height={H - PAD.bottom - yBar(d.new_artists)}
            fill={AMBER}
            opacity={0.55}
          >
            <title>
              {monthLabel(d.month)} — {d.new_artists} new of {d.artists} artists
            </title>
          </rect>
        ))}

        <polyline
          points={discovery.map((d, i) => `${x(i)},${yRate(d.artist_discovery_rate)}`).join(" ")}
          fill="none"
          stroke={STEEL}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {discovery.map((d, i) =>
          i % step === 0 ? (
            <text
              key={`l-${d.month}`}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {monthLabel(d.month)}
            </text>
          ) : null,
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-4 mt-3">
        <Legend color={AMBER} label="new artists (count, left)" />
        <Legend color={STEEL} label="discovery rate (share, right)" />
      </div>

      <p style={{ color: MUTED }} className="text-xs mt-3 max-w-2xl leading-relaxed">
        An artist counts as new in the month of their first real play. The
        earliest month is an artefact rather than a finding — the export only
        reaches as far back as the account does, so everything there is new by
        definition.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------

function StartHourChart() {
  const W = 720;
  const H = 240;
  const PAD = { top: 12, right: 8, bottom: 24, left: 42 };

  if (!startHours.length) return <EmptyPanel />;

  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    weekday: startHours.find((s) => s.start_hour === h && s.day_type === "weekday"),
    weekend: startHours.find((s) => s.start_hour === h && s.day_type === "weekend"),
  }));

  const max = Math.max(...startHours.map((s) => s.sessions)) || 1;
  const slot = (W - PAD.left - PAD.right) / 24;
  const bw = (slot * 0.7) / 2;

  const x = (h: number) => PAD.left + h * slot + slot / 2;
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
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
              {Math.round(max * f).toLocaleString()}
            </text>
          </g>
        ))}

        {byHour.map((b) => (
          <g key={b.hour}>
            {b.weekday && (
              <rect
                x={x(b.hour) - bw}
                y={y(b.weekday.sessions)}
                width={bw - 1}
                height={H - PAD.bottom - y(b.weekday.sessions)}
                fill={AMBER}
              >
                <title>
                  {String(b.hour).padStart(2, "0")}:00 weekday —{" "}
                  {b.weekday.sessions.toLocaleString()} sessions, intent{" "}
                  {b.weekday.avg_intent_ratio.toFixed(2)}
                </title>
              </rect>
            )}
            {b.weekend && (
              <rect
                x={x(b.hour)}
                y={y(b.weekend.sessions)}
                width={bw - 1}
                height={H - PAD.bottom - y(b.weekend.sessions)}
                fill={STEEL}
              >
                <title>
                  {String(b.hour).padStart(2, "0")}:00 weekend —{" "}
                  {b.weekend.sessions.toLocaleString()} sessions, intent{" "}
                  {b.weekend.avg_intent_ratio.toFixed(2)}
                </title>
              </rect>
            )}
          </g>
        ))}

        {byHour
          .filter((b) => b.hour % 3 === 0)
          .map((b) => (
            <text
              key={`t-${b.hour}`}
              x={x(b.hour)}
              y={H - 6}
              textAnchor="middle"
              fill={MUTED}
              style={{ fontFamily: MONO, fontSize: 9 }}
            >
              {String(b.hour).padStart(2, "0")}
            </text>
          ))}
      </svg>

      <div className="flex flex-wrap items-center gap-4 mt-3">
        <Legend color={AMBER} label="weekday" />
        <Legend color={STEEL} label="weekend" />
      </div>

      <p style={{ color: MUTED }} className="text-xs mt-3 max-w-2xl leading-relaxed">
        Counted by the hour a session started, not by the hours it ran through —
        one long evening session lands in a single bar. Hover for the average
        intent at that hour.
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ background: color }} className="w-2.5 h-2.5 rounded-full" />
      <span style={{ fontFamily: MONO, color: MUTED }} className="text-[10px]">
        {label}
      </span>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div style={{ color: MUTED, fontFamily: MONO }} className="text-[11px] py-6">
      no rows exported for this table
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

  if (table === "discovery") {
    return (
      <DataTable
        rows={discovery}
        getKey={(d) => d.month}
        initialSort={{ key: "month", dir: "desc" }}
        columns={[
          { key: "month", label: "month", get: (d) => d.month,
            render: (d) => monthLabel(d.month) },
          { key: "new_artists", label: "new_artists", get: (d) => d.new_artists, numeric: true },
          { key: "artist_discovery_rate", label: "rate",
            get: (d) => d.artist_discovery_rate, numeric: true,
            render: (d) => pctText(d.artist_discovery_rate) },
          { key: "repeat_ratio", label: "repeat", get: (d) => d.repeat_ratio, numeric: true,
            render: (d) => d.repeat_ratio.toFixed(2) },
        ]}
      />
    );
  }

  if (table === "outcomes") {
    return (
      <DataTable
        rows={outcomes}
        getKey={(o) => o.month}
        initialSort={{ key: "month", dir: "desc" }}
        columns={[
          { key: "month", label: "month", get: (o) => o.month,
            render: (o) => monthLabel(o.month) },
          { key: "manual_skip_ratio", label: "manual_skip",
            get: (o) => o.manual_skip_ratio, numeric: true,
            render: (o) => pctText(o.manual_skip_ratio) },
          { key: "instant_skip_ratio", label: "instant",
            get: (o) => o.instant_skip_ratio, numeric: true,
            render: (o) => pctText(o.instant_skip_ratio) },
          { key: "instant_share", label: "instant_of_skips",
            get: (o) => (o.manual_skip_ratio ? o.instant_skip_ratio / o.manual_skip_ratio : 0),
            numeric: true,
            render: (o) =>
              o.manual_skip_ratio
                ? pctText(o.instant_skip_ratio / o.manual_skip_ratio)
                : "—" },
          { key: "completion_ratio", label: "played_fully",
            get: (o) => o.completion_ratio, numeric: true,
            render: (o) => pctText(o.completion_ratio) },
        ]}
      />
    );
  }

  if (table === "concentration") {
    return (
      <DataTable
        rows={concentration}
        getKey={(c) => c.month}
        initialSort={{ key: "month", dir: "desc" }}
        columns={[
          { key: "month", label: "month", get: (c) => c.month,
            render: (c) => monthLabel(c.month) },
          { key: "top1_hours", label: "top_artist_h", get: (c) => c.top1_hours,
            numeric: true, render: (c) => c.top1_hours.toFixed(1) },
          { key: "next9_hours", label: "next_9_h", get: (c) => c.next9_hours,
            numeric: true, render: (c) => c.next9_hours.toFixed(1) },
          { key: "rest_hours", label: "rest_h", get: (c) => c.rest_hours,
            numeric: true, render: (c) => c.rest_hours.toFixed(1) },
          { key: "top10_share", label: "top_10", get: (c) => c.top10_share, numeric: true,
            render: (c) => pctText(c.top10_share) },
        ]}
      />
    );
  }

  if (table === "streaks") {
    return (
      <DataTable
        rows={streaks}
        getKey={(s) => s.streak_start}
        initialSort={{ key: "streak_days", dir: "desc" }}
        columns={[
          { key: "streak_days", label: "days", get: (s) => s.streak_days, numeric: true },
          { key: "streak_start", label: "start", get: (s) => s.streak_start },
          { key: "avg_minutes_per_day", label: "min/day", get: (s) => s.avg_minutes_per_day,
            numeric: true, render: (s) => s.avg_minutes_per_day.toFixed(0) },
          { key: "completion_ratio", label: "played_fully", get: (s) => s.completion_ratio,
            numeric: true, render: (s) => pctText(s.completion_ratio) },
          { key: "skip_through_ratio", label: "skipped", get: (s) => s.skip_through_ratio,
            numeric: true, render: (s) => pctText(s.skip_through_ratio) },
        ]}
      />
    );
  }

  if (table === "start_hours") {
    return (
      <DataTable
        rows={startHours}
        getKey={(s) => `${s.start_hour}-${s.day_type}`}
        initialSort={{ key: "sessions", dir: "desc" }}
        columns={[
          { key: "start_hour", label: "hour", get: (s) => s.start_hour, numeric: true,
            render: (s) => `${String(s.start_hour).padStart(2, "0")}:00` },
          { key: "day_type", label: "day_type", get: (s) => s.day_type },
          { key: "sessions", label: "sessions", get: (s) => s.sessions, numeric: true,
            render: (s) => s.sessions.toLocaleString() },
          { key: "avg_intent_ratio", label: "intent", get: (s) => s.avg_intent_ratio,
            numeric: true, render: (s) => s.avg_intent_ratio.toFixed(2) },
        ]}
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