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
  category  TEXT,
  priority  INTEGER NOT NULL DEFAULT 0,
  added_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Single-row, free-form markdown north star: mission, tools-to-build,
-- resources, anything the user wants to keep in front of them. id is
-- pinned to 1 so we can UPSERT without juggling row IDs.
CREATE TABLE IF NOT EXISTS plan_doc (
  id         INTEGER PRIMARY KEY CHECK(id = 1),
  content    TEXT    NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Synth briefs: Claude-generated outputs distilled from the user's plan +
-- library + recent aggregates. `kind` distinguishes a 7-day content
-- sprint from a buildable-systems brief; both schemas are otherwise
-- identical so they share the table. Persisted so the user can compare
-- output over time as the brain grows.
CREATE TABLE IF NOT EXISTS synth_briefs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT    NOT NULL DEFAULT 'sprint' CHECK(kind IN ('sprint','systems')),
  question        TEXT,
  content_md      TEXT    NOT NULL,
  cost_usd        REAL    NOT NULL DEFAULT 0,
  library_size    INTEGER NOT NULL DEFAULT 0,
  source_searches INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- ===========================================================================
-- Reddit ingestion. Mirrors the TikTok side but uses different primitives:
--   reddit_runs          ~ searches      (a workspace / saved report)
--   reddit_queries       ~ (no analog)   (each fetch made within a run)
--   reddit_posts         ~ videos        (canonical, dedup by reddit_id)
--   reddit_post_appearances              (M:N — same post can show up via
--                                         top_month + search:claude, etc.)
--   reddit_comments      ~ transcripts   (optional, top-N per post)
--   reddit_post_analyses ~ video_analyses
--   reddit_tool_mentions ~ tool_mentions (shares the `tools` table)
--   reddit_aggregates    ~ aggregate_analyses
-- ===========================================================================

-- Subreddit catalog. Hand-curated list the user can grow over time.
CREATE TABLE IF NOT EXISTS reddit_subreddits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  group_name  TEXT,
  notes       TEXT,
  added_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_reddit_subreddits_group ON reddit_subreddits(group_name);

-- A workspace / saved Reddit report. Holds N queries and the resulting posts.
CREATE TABLE IF NOT EXISTS reddit_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT    NOT NULL,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- One row per HTTP fetch within a run (e.g. r/ClaudeAI top/week).
CREATE TABLE IF NOT EXISTS reddit_queries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES reddit_runs(id) ON DELETE CASCADE,
  subreddit       TEXT    NOT NULL,
  mode            TEXT    NOT NULL CHECK(mode IN ('top','hot','new','search')),
  time_range      TEXT             CHECK(time_range IN ('hour','day','week','month','year','all')),
  keyword         TEXT,
  sort            TEXT,
  fetch_limit     INTEGER NOT NULL DEFAULT 100,
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ok','error','blocked')),
  error           TEXT,
  fetched_count   INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_reddit_queries_run ON reddit_queries(run_id);

-- Canonical Reddit post. Dedup by reddit_id (the t3_ thing without the prefix).
-- Same post seen in top/month + search merges into one row.
CREATE TABLE IF NOT EXISTS reddit_posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reddit_id     TEXT    NOT NULL UNIQUE,
  subreddit     TEXT    NOT NULL,
  author        TEXT,
  title         TEXT    NOT NULL,
  selftext      TEXT,
  url           TEXT,
  permalink     TEXT,
  score         INTEGER,
  upvote_ratio  REAL,
  num_comments  INTEGER,
  created_utc   INTEGER,
  flair         TEXT,
  post_type     TEXT             CHECK(post_type IN ('text','link','video','image','gallery','crosspost','unknown')),
  is_video      INTEGER NOT NULL DEFAULT 0,
  over_18       INTEGER NOT NULL DEFAULT 0,
  signal_score  REAL,
  raw_json      TEXT,
  first_seen_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_subreddit ON reddit_posts(subreddit);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_score     ON reddit_posts(signal_score DESC);

-- M:N — which run/query/ranking surfaced a given post. UNIQUE keeps reruns
-- from creating duplicate appearances under the same conditions.
CREATE TABLE IF NOT EXISTS reddit_post_appearances (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id         INTEGER NOT NULL REFERENCES reddit_posts(id)   ON DELETE CASCADE,
  run_id          INTEGER NOT NULL REFERENCES reddit_runs(id)    ON DELETE CASCADE,
  query_id        INTEGER          REFERENCES reddit_queries(id) ON DELETE SET NULL,
  ranking_source  TEXT    NOT NULL,
  keyword         TEXT,
  rank_position   INTEGER,
  captured_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(post_id, run_id, ranking_source, keyword)
);
CREATE INDEX IF NOT EXISTS idx_reddit_appearances_run  ON reddit_post_appearances(run_id);
CREATE INDEX IF NOT EXISTS idx_reddit_appearances_post ON reddit_post_appearances(post_id);

-- Top comments only, fetched on-demand for high-signal posts.
CREATE TABLE IF NOT EXISTS reddit_comments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  reddit_comment_id  TEXT    NOT NULL UNIQUE,
  post_id            INTEGER NOT NULL REFERENCES reddit_posts(id) ON DELETE CASCADE,
  parent_id          TEXT,
  author             TEXT,
  body               TEXT    NOT NULL,
  score              INTEGER,
  created_utc        INTEGER,
  raw_json           TEXT,
  created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_post  ON reddit_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_score ON reddit_comments(post_id, score DESC);

-- Per-post Claude analysis. Mirrors video_analyses but Reddit-flavored.
CREATE TABLE IF NOT EXISTS reddit_post_analyses (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id             INTEGER NOT NULL UNIQUE REFERENCES reddit_posts(id) ON DELETE CASCADE,
  run_id              INTEGER NOT NULL REFERENCES reddit_runs(id) ON DELETE CASCADE,
  summary             TEXT,
  signal_density      REAL,
  pain_points_json    TEXT,
  workflows_json      TEXT,
  opportunities_json  TEXT,
  raw_json            TEXT,
  created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Reddit-side tool mentions. Shares the `tools` table with the TikTok side
-- so the cross-source aggregator sees a single inventory.
CREATE TABLE IF NOT EXISTS reddit_tool_mentions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id      INTEGER NOT NULL REFERENCES tools(id)        ON DELETE CASCADE,
  post_id      INTEGER NOT NULL REFERENCES reddit_posts(id) ON DELETE CASCADE,
  run_id       INTEGER NOT NULL REFERENCES reddit_runs(id)  ON DELETE CASCADE,
  confidence   TEXT    NOT NULL CHECK(confidence IN ('demoed','named_specific','name_drop','pitch_bait')),
  raw_mention  TEXT,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(tool_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_reddit_tool_mentions_run  ON reddit_tool_mentions(run_id);
CREATE INDEX IF NOT EXISTS idx_reddit_tool_mentions_post ON reddit_tool_mentions(post_id);

-- Per-run aggregate (Reddit only).
CREATE TABLE IF NOT EXISTS reddit_aggregates (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              INTEGER NOT NULL UNIQUE REFERENCES reddit_runs(id) ON DELETE CASCADE,
  action_plan_md      TEXT,
  trends_json         TEXT,
  pain_points_json    TEXT,
  workflows_json      TEXT,
  opportunities_json  TEXT,
  tools_json          TEXT,
  raw_json            TEXT,
  created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Combined TikTok + Reddit synthesis. Either side may be null (e.g. Reddit-only
-- snapshot). Saved as discrete reports so the user can keep history.
CREATE TABLE IF NOT EXISTS cross_source_aggregates (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  label                 TEXT    NOT NULL,
  tiktok_search_id      INTEGER REFERENCES searches(id)    ON DELETE SET NULL,
  reddit_run_id         INTEGER REFERENCES reddit_runs(id) ON DELETE SET NULL,
  action_plan_md        TEXT,
  repeated_trends_json  TEXT,
  reddit_only_json      TEXT,
  tiktok_only_json      TEXT,
  repeated_tools_json   TEXT,
  workflows_json        TEXT,
  hooks_json            TEXT,
  video_ideas_json      TEXT,
  pain_points_json      TEXT,
  ad_candidates_json    TEXT,
  opportunities_json    TEXT,
  raw_json              TEXT,
  created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- HTTP response cache for redditClient. Keyed by full URL+params hash.
-- Lets us re-render dashboards without re-hitting Reddit; also smooths
-- exponential-backoff retries.
CREATE TABLE IF NOT EXISTS reddit_http_cache (
  cache_key   TEXT    PRIMARY KEY,
  url         TEXT    NOT NULL,
  status      INTEGER NOT NULL,
  body        TEXT    NOT NULL,
  fetched_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reddit_http_cache_expires ON reddit_http_cache(expires_at);

-- ---------------------------------------------------------------------------
-- Seed: 25 starter subreddits across 10 groups. Idempotent (INSERT OR IGNORE).
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO reddit_subreddits (name, group_name) VALUES
  ('ArtificialInteligence', 'AI Tools'),
  ('ChatGPT',               'AI Tools'),
  ('ClaudeAI',              'AI Tools'),
  ('OpenAI',                'AI Tools'),
  ('LocalLLaMA',            'AI Tools'),
  ('AI_Agents',             'AI Tools'),
  ('Automation',            'Automation'),
  ('n8n',                   'Automation'),
  ('webscraping',           'Automation'),
  ('Tiktokhelp',            'TikTok Growth'),
  ('NewTubers',             'Content Creation'),
  ('VideoEditing',          'Video Editing'),
  ('Etsy',                  'Etsy Sellers'),
  ('EtsySellers',           'Etsy Sellers'),
  ('EtsyCommunity',         'Etsy Sellers'),
  ('sidehustle',            'Side Hustles'),
  ('smallbusiness',         'Side Hustles'),
  ('Entrepreneur',          'Side Hustles'),
  ('SaaS',                  'No-Code / SaaS'),
  ('nocode',                'No-Code / SaaS'),
  ('PromptEngineering',     'Prompt Engineering'),
  ('marketing',             'Marketing'),
  ('growmybusiness',        'Marketing'),
  ('socialmedia',           'Marketing'),
  ('PPC',                   'Marketing'),
  ('SEO',                   'Marketing');
