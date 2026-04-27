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

-- ─────────────────────────────────────────────────────────────────────────────
-- Cross-search knowledge graph. Each entity type gets a normalized table
-- (UNIQUE name COLLATE NOCASE so casing differences merge automatically) +
-- a mentions table linking entity → video → search.
-- For "hook" the name column stores the hook formula; for viral_signal it
-- stores the signal text; for speed_to_publish it stores the tactic.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS methods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  first_seen  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS method_mentions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method_id  INTEGER NOT NULL REFERENCES methods(id) ON DELETE CASCADE,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id  INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(method_id, video_id, search_id)
);
CREATE INDEX IF NOT EXISTS idx_method_mentions_search ON method_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_method_mentions_video  ON method_mentions(video_id);

CREATE TABLE IF NOT EXISTS systems (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  first_seen  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS system_mentions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id  INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id  INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(system_id, video_id, search_id)
);
CREATE INDEX IF NOT EXISTS idx_system_mentions_search ON system_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_system_mentions_video  ON system_mentions(video_id);

CREATE TABLE IF NOT EXISTS hooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  first_seen  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS hook_mentions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hook_id    INTEGER NOT NULL REFERENCES hooks(id) ON DELETE CASCADE,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id  INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(hook_id, video_id, search_id)
);
CREATE INDEX IF NOT EXISTS idx_hook_mentions_search ON hook_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_hook_mentions_video  ON hook_mentions(video_id);

CREATE TABLE IF NOT EXISTS frameworks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  first_seen  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS framework_mentions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  framework_id INTEGER NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  video_id     INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id    INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(framework_id, video_id, search_id)
);
CREATE INDEX IF NOT EXISTS idx_framework_mentions_search ON framework_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_framework_mentions_video  ON framework_mentions(video_id);

CREATE TABLE IF NOT EXISTS viral_signals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  first_seen  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS viral_signal_mentions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  viral_signal_id INTEGER NOT NULL REFERENCES viral_signals(id) ON DELETE CASCADE,
  video_id        INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id       INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(viral_signal_id, video_id, search_id)
);
CREATE INDEX IF NOT EXISTS idx_viral_signal_mentions_search ON viral_signal_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_viral_signal_mentions_video  ON viral_signal_mentions(video_id);

CREATE TABLE IF NOT EXISTS pitfalls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  first_seen  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS pitfall_mentions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pitfall_id INTEGER NOT NULL REFERENCES pitfalls(id) ON DELETE CASCADE,
  video_id   INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id  INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(pitfall_id, video_id, search_id)
);
CREATE INDEX IF NOT EXISTS idx_pitfall_mentions_search ON pitfall_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_pitfall_mentions_video  ON pitfall_mentions(video_id);

CREATE TABLE IF NOT EXISTS speed_tactics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  first_seen  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS speed_tactic_mentions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  speed_tactic_id INTEGER NOT NULL REFERENCES speed_tactics(id) ON DELETE CASCADE,
  video_id        INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  search_id       INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(speed_tactic_id, video_id, search_id)
);
CREATE INDEX IF NOT EXISTS idx_speed_tactic_mentions_search ON speed_tactic_mentions(search_id);
CREATE INDEX IF NOT EXISTS idx_speed_tactic_mentions_video  ON speed_tactic_mentions(video_id);

-- Search-term checklist: things you want to scrape, with auto-computed
-- "done" status by joining against the searches + aggregate_analyses tables.
CREATE TABLE IF NOT EXISTS search_queue (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  term      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  notes     TEXT,
  priority  INTEGER NOT NULL DEFAULT 0,
  added_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
