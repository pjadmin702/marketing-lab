import { getDB } from "./db";

export interface SearchRow {
  id: number;
  term: string;
  notes: string | null;
  created_at: number;
  video_count: number;
}

export interface VideoRow {
  id: number;
  search_id: number;
  url: string;
  tiktok_id: string | null;
  author: string | null;
  title: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  created_at: number;
  transcript_source: "captions" | "whisper" | null;
  transcript_chars: number | null;
  transcript_language: string | null;
  analyzed: boolean;
  signal_density: number | null;
}

export function listSearches(): SearchRow[] {
  return getDB()
    .prepare(
      `SELECT s.id, s.term, s.notes, s.created_at,
              (SELECT COUNT(*) FROM videos v WHERE v.search_id = s.id) AS video_count
         FROM searches s
        ORDER BY s.created_at DESC, s.id DESC`
    )
    .all() as SearchRow[];
}

export function getSearch(id: number): SearchRow | null {
  const row = getDB()
    .prepare(
      `SELECT s.id, s.term, s.notes, s.created_at,
              (SELECT COUNT(*) FROM videos v WHERE v.search_id = s.id) AS video_count
         FROM searches s WHERE s.id = ?`
    )
    .get(id) as SearchRow | undefined;
  return row ?? null;
}

export function getVideosForSearch(searchId: number): VideoRow[] {
  const rows = getDB()
    .prepare(
      `SELECT v.id, v.search_id, v.url, v.tiktok_id, v.author, v.title,
              v.duration_sec, v.thumbnail_url, v.created_at,
              t.source                AS transcript_source,
              LENGTH(t.text)          AS transcript_chars,
              t.language              AS transcript_language,
              CASE WHEN va.id IS NOT NULL THEN 1 ELSE 0 END AS analyzed,
              va.signal_density       AS signal_density
         FROM videos v
    LEFT JOIN transcripts     t  ON t.video_id  = v.id
    LEFT JOIN video_analyses  va ON va.video_id = v.id
        WHERE v.search_id = ?
        ORDER BY v.created_at ASC, v.id ASC`
    )
    .all(searchId) as Array<Omit<VideoRow, "analyzed"> & { analyzed: number }>;
  return rows.map((r) => ({ ...r, analyzed: Boolean(r.analyzed) }));
}

export interface SearchStats {
  total_videos: number;
  with_transcripts: number;
  via_captions: number;
  via_whisper: number;
  analyzed: number;
}

export interface VideoAnalysisRow {
  video_id: number;
  title: string | null;
  author: string | null;
  url: string;
  signal_density: number | null;
  creator_intent: string | null;
  funnel_signals: string[];
  summary: string | null;
}

export function getVideoAnalyses(searchId: number): VideoAnalysisRow[] {
  const rows = getDB()
    .prepare(
      `SELECT v.id AS video_id, v.title, v.author, v.url,
              va.signal_density, va.creator_intent, va.funnel_signals_json, va.summary
         FROM videos v
    LEFT JOIN video_analyses va ON va.video_id = v.id
        WHERE v.search_id = ?
        ORDER BY va.signal_density DESC, v.id ASC`
    )
    .all(searchId) as Array<{
      video_id: number;
      title: string | null;
      author: string | null;
      url: string;
      signal_density: number | null;
      creator_intent: string | null;
      funnel_signals_json: string | null;
      summary: string | null;
    }>;
  return rows.map((r) => ({
    video_id: r.video_id,
    title: r.title,
    author: r.author,
    url: r.url,
    signal_density: r.signal_density,
    creator_intent: r.creator_intent,
    funnel_signals: r.funnel_signals_json ? (JSON.parse(r.funnel_signals_json) as string[]) : [],
    summary: r.summary,
  }));
}

export interface ToolInventoryRow {
  tool_id: number;
  name: string;
  category: string | null;
  pricing: string | null;
  what_it_does: string | null;
  official_url: string | null;
  best_confidence: "demoed" | "named_specific" | "name_drop" | "pitch_bait";
  mention_count: number;
  source_videos: { video_id: number; title: string | null; author: string | null; confidence: string; raw_mention: string }[];
}

const CONFIDENCE_RANK = "CASE confidence WHEN 'demoed' THEN 4 WHEN 'named_specific' THEN 3 WHEN 'name_drop' THEN 2 WHEN 'pitch_bait' THEN 1 ELSE 0 END";

export function getToolInventory(searchId: number): ToolInventoryRow[] {
  const tools = getDB()
    .prepare(
      `SELECT t.id AS tool_id, t.name, t.category, t.pricing, t.what_it_does, t.official_url,
              COUNT(tm.id) AS mention_count,
              MAX(${CONFIDENCE_RANK}) AS best_rank
         FROM tools t
         JOIN tool_mentions tm ON tm.tool_id = t.id
        WHERE tm.search_id = ?
     GROUP BY t.id
     ORDER BY best_rank DESC, mention_count DESC, t.name COLLATE NOCASE`
    )
    .all(searchId) as Array<{
      tool_id: number;
      name: string;
      category: string | null;
      pricing: string | null;
      what_it_does: string | null;
      official_url: string | null;
      mention_count: number;
      best_rank: number;
    }>;

  const rankToConf: Record<number, ToolInventoryRow["best_confidence"]> = {
    4: "demoed",
    3: "named_specific",
    2: "name_drop",
    1: "pitch_bait",
  };

  const mentionsStmt = getDB().prepare(
    `SELECT tm.video_id, tm.confidence, tm.raw_mention, v.title, v.author
       FROM tool_mentions tm JOIN videos v ON v.id = tm.video_id
      WHERE tm.tool_id = ? AND tm.search_id = ?
      ORDER BY ${CONFIDENCE_RANK} DESC, v.id ASC`
  );

  return tools.map((t) => ({
    tool_id: t.tool_id,
    name: t.name,
    category: t.category,
    pricing: t.pricing,
    what_it_does: t.what_it_does,
    official_url: t.official_url,
    best_confidence: rankToConf[t.best_rank] ?? "name_drop",
    mention_count: t.mention_count,
    source_videos: mentionsStmt.all(t.tool_id, searchId) as ToolInventoryRow["source_videos"],
  }));
}

export function countUnresearchedTools(searchId: number): number {
  const r = getDB()
    .prepare(
      `SELECT COUNT(DISTINCT t.id) AS c
         FROM tools t
         JOIN tool_mentions tm ON tm.tool_id = t.id
        WHERE tm.search_id = ? AND t.researched_at IS NULL`
    )
    .get(searchId) as { c: number };
  return r.c ?? 0;
}

export interface AggregateRow {
  action_plan_md: string;
  methods: { name: string; explanation: string; video_ids: number[] }[];
  systems: { name: string; pipeline: string; video_ids: number[] }[];
  hooks: { formula: string; example: string; video_ids: number[] }[];
  frameworks: { name: string; structure: string; video_ids: number[] }[];
  viral_signals: { signal: string; explanation: string; video_ids: number[] }[];
  pitfalls: { name: string; explanation: string; video_ids: number[] }[];
  speed_to_publish: { tactic: string; explanation: string; video_ids: number[] }[];
}

export function getAggregate(searchId: number): AggregateRow | null {
  const r = getDB()
    .prepare(
      `SELECT action_plan_md, methods_json, systems_json, hooks_json,
              frameworks_json, viral_signals_json, pitfalls_json, speed_to_publish_json
         FROM aggregate_analyses WHERE search_id = ?`
    )
    .get(searchId) as Record<string, string | null> | undefined;
  if (!r) return null;
  const j = (s: string | null) => (s ? JSON.parse(s) : []);
  return {
    action_plan_md: r.action_plan_md ?? "",
    methods: j(r.methods_json),
    systems: j(r.systems_json),
    hooks: j(r.hooks_json),
    frameworks: j(r.frameworks_json),
    viral_signals: j(r.viral_signals_json),
    pitfalls: j(r.pitfalls_json),
    speed_to_publish: j(r.speed_to_publish_json),
  };
}

export function getSearchStats(searchId: number): SearchStats {
  const r = getDB()
    .prepare(
      `SELECT
         COUNT(v.id) AS total_videos,
         SUM(CASE WHEN t.video_id  IS NOT NULL THEN 1 ELSE 0 END) AS with_transcripts,
         SUM(CASE WHEN t.source = 'captions'   THEN 1 ELSE 0 END) AS via_captions,
         SUM(CASE WHEN t.source = 'whisper'    THEN 1 ELSE 0 END) AS via_whisper,
         SUM(CASE WHEN va.video_id IS NOT NULL THEN 1 ELSE 0 END) AS analyzed
       FROM videos v
       LEFT JOIN transcripts    t  ON t.video_id  = v.id
       LEFT JOIN video_analyses va ON va.video_id = v.id
       WHERE v.search_id = ?`
    )
    .get(searchId) as Record<string, number | null>;
  return {
    total_videos: r.total_videos ?? 0,
    with_transcripts: r.with_transcripts ?? 0,
    via_captions: r.via_captions ?? 0,
    via_whisper: r.via_whisper ?? 0,
    analyzed: r.analyzed ?? 0,
  };
}
