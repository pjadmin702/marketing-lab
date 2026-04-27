-- marketing-lab schema. All statements are IF NOT EXISTS so it can be
-- re-run safely on every db open.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS searches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  term        TEXT    NOT NULL,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  search_id     INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  url           TEXT    NOT NULL,
  tiktok_id     TEXT,
  author        TEXT,
  title         TEXT,
  duration_sec  INTEGER,
  thumbnail_url TEXT,
  metadata_json TEXT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(search_id, url)
);
CREATE INDEX IF NOT EXISTS idx_videos_search ON videos(search_id);

-- One transcript per video. Re-transcribing replaces the row.
CREATE TABLE IF NOT EXISTS transcripts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id      INTEGER NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  source        TEXT    NOT NULL CHECK(source IN ('captions','whisper')),
  language      TEXT,
  text          TEXT    NOT NULL,
  segments_json TEXT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Per-video Claude analysis: signal density, funnel flags, summary.
CREATE TABLE IF NOT EXISTS video_analyses (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id            INTEGER NOT NULL UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  signal_density      REAL,
  creator_intent      TEXT,
  funnel_signals_json TEXT,
  summary             TEXT,
  raw_json            TEXT,
  created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Canonical tool inventory. One row per distinct tool name.
CREATE TABLE IF NOT EXISTS tools (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  category      TEXT,
  pricing       TEXT,
  price_note    TEXT,
  what_it_does  TEXT,
  official_url  TEXT,
  researched_at INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Per-video mention of a tool, with confidence + raw quote.
CREATE TABLE IF NOT EXISTS tool_mentions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id      INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  video_id     INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id    INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  confidence   TEXT    NOT NULL CHECK(confidence IN ('demoed','named_specific','name_drop','pitch_bait')),
  raw_mention  TEXT,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(tool_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_tool_mentions_search ON tool_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_tool_mentions_video  ON tool_mentions(video_id);

-- Aggregate per-search analysis (action plan + cross-video synthesis).
CREATE TABLE IF NOT EXISTS aggregate_analyses (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  search_id                INTEGER NOT NULL UNIQUE REFERENCES searches(id) ON DELETE CASCADE,
  action_plan_md           TEXT,
  methods_json             TEXT,
  systems_json             TEXT,
  hooks_json               TEXT,
  frameworks_json          TEXT,
  viral_signals_json       TEXT,
  pitfalls_json            TEXT,
  speed_to_publish_json    TEXT,
  raw_json                 TEXT,
  created_at               INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
