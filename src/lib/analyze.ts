import { getDB } from "./db";
import { runClaude } from "./claude";
import {
  PER_VIDEO_SYSTEM, PER_VIDEO_SCHEMA, buildPerVideoUserPrompt, PerVideoOutput,
  AGGREGATE_SYSTEM, AGGREGATE_SCHEMA, AggregateOutput,
} from "./analyze-prompts";

export interface AnalyzeReport {
  searchId: number;
  perVideo: { videoId: number; status: "ok" | "skipped" | "error"; error?: string }[];
  aggregate: { status: "ok" | "skipped" | "error"; error?: string };
  cost_usd: number;
}

export type AnalyzeProgress =
  | { kind: "start"; total: number }
  | {
      kind: "video";
      index: number;
      total: number;
      videoId: number;
      title: string | null;
      result: "ok" | "skipped" | "error";
      error?: string;
    }
  | { kind: "aggregate"; phase: "start" | "ok" | "skipped" | "error"; error?: string };

interface TranscriptRow {
  video_id: number;
  title: string | null;
  author: string | null;
  duration_sec: number | null;
  text: string;
  search_term: string;
}

/* --- per-video --- */

async function analyzeOneVideo(row: TranscriptRow): Promise<PerVideoOutput & { _cost: number }> {
  const userPrompt = buildPerVideoUserPrompt({
    searchTerm: row.search_term,
    videoId: row.video_id,
    title: row.title,
    author: row.author,
    duration_sec: row.duration_sec,
    transcript: row.text,
  });
  const r = await runClaude<PerVideoOutput>({
    systemPrompt: PER_VIDEO_SYSTEM,
    userPrompt,
    schema: PER_VIDEO_SCHEMA,
    timeoutMs: 600_000,
  });
  return { ...r.output, _cost: r.cost_usd };
}

function persistPerVideo(searchId: number, videoId: number, out: PerVideoOutput): void {
  const db = getDB();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO video_analyses (video_id, signal_density, creator_intent, funnel_signals_json, summary, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET
        signal_density      = excluded.signal_density,
        creator_intent      = excluded.creator_intent,
        funnel_signals_json = excluded.funnel_signals_json,
        summary             = excluded.summary,
        raw_json            = excluded.raw_json,
        created_at          = strftime('%s','now')
    `).run(
      videoId,
      out.signal_density,
      out.creator_intent,
      JSON.stringify(out.funnel_signals),
      out.summary,
      JSON.stringify(out),
    );

    const insertTool = db.prepare(`
      INSERT INTO tools (name, category) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET
        category = COALESCE(tools.category, excluded.category)
      RETURNING id
    `);
    const insertMention = db.prepare(`
      INSERT INTO tool_mentions (tool_id, video_id, search_id, confidence, raw_mention)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tool_id, video_id) DO UPDATE SET
        confidence  = excluded.confidence,
        raw_mention = excluded.raw_mention
    `);

    for (const t of out.tools_mentioned) {
      const tool = insertTool.get(t.name, t.category) as { id: number };
      // Persist what_it_does as a fallback when the canonical tool row has no description yet.
      db.prepare(`
        UPDATE tools SET what_it_does = COALESCE(what_it_does, ?) WHERE id = ?
      `).run(t.what_it_does || null, tool.id);
      insertMention.run(tool.id, videoId, searchId, t.confidence, t.raw_mention);
    }
  });
  tx();
}

/* --- aggregate --- */

interface AggregateInput {
  search_id: number;
  search_term: string;
  videos: {
    video_id: number;
    title: string | null;
    author: string | null;
    duration_sec: number | null;
    summary: string;
    signal_density: number;
    creator_intent: string;
    funnel_signals: string[];
    tools_mentioned: PerVideoOutput["tools_mentioned"];
    methods: string[];
    hooks_used: string[];
    frameworks_used: string[];
    pitfalls: string[];
  }[];
}

async function analyzeAggregate(input: AggregateInput): Promise<AggregateOutput & { _cost: number }> {
  const userPrompt = [
    `SEARCH TERM: ${input.search_term}`,
    `${input.videos.length} videos analyzed.`,
    "",
    "PER-VIDEO ANALYSES (JSON):",
    JSON.stringify(input.videos, null, 2),
  ].join("\n");

  const r = await runClaude<AggregateOutput>({
    systemPrompt: AGGREGATE_SYSTEM,
    userPrompt,
    schema: AGGREGATE_SCHEMA,
    timeoutMs: 600_000,
  });
  return { ...r.output, _cost: r.cost_usd };
}

function persistAggregate(searchId: number, out: AggregateOutput): void {
  getDB().prepare(`
    INSERT INTO aggregate_analyses (
      search_id, action_plan_md, methods_json, systems_json, hooks_json,
      frameworks_json, viral_signals_json, pitfalls_json, speed_to_publish_json, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(search_id) DO UPDATE SET
      action_plan_md         = excluded.action_plan_md,
      methods_json           = excluded.methods_json,
      systems_json           = excluded.systems_json,
      hooks_json             = excluded.hooks_json,
      frameworks_json        = excluded.frameworks_json,
      viral_signals_json     = excluded.viral_signals_json,
      pitfalls_json          = excluded.pitfalls_json,
      speed_to_publish_json  = excluded.speed_to_publish_json,
      raw_json               = excluded.raw_json,
      created_at             = strftime('%s','now')
  `).run(
    searchId,
    out.action_plan_md,
    JSON.stringify(out.methods),
    JSON.stringify(out.systems),
    JSON.stringify(out.hooks),
    JSON.stringify(out.frameworks),
    JSON.stringify(out.viral_signals),
    JSON.stringify(out.pitfalls),
    JSON.stringify(out.speed_to_publish),
    JSON.stringify(out),
  );
}

/* --- top-level --- */

export async function analyzeSearch(
  searchId: number,
  force = false,
  onProgress?: (event: AnalyzeProgress) => void,
): Promise<AnalyzeReport> {
  const db = getDB();
  const search = db.prepare("SELECT term FROM searches WHERE id = ?").get(searchId) as { term: string } | undefined;
  if (!search) throw new Error(`search ${searchId} not found`);

  const rows = db.prepare(`
    SELECT v.id AS video_id, v.title, v.author, v.duration_sec, t.text
      FROM videos v JOIN transcripts t ON t.video_id = v.id
     WHERE v.search_id = ?
     ORDER BY v.id ASC
  `).all(searchId) as Omit<TranscriptRow, "search_term">[];

  const report: AnalyzeReport = { searchId, perVideo: [], aggregate: { status: "skipped" }, cost_usd: 0 };

  onProgress?.({ kind: "start", total: rows.length });

  // Per-video pass — sequential so we don't hit Claude rate limits or burst the cache.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const existing = db.prepare("SELECT 1 FROM video_analyses WHERE video_id = ?").get(row.video_id);
    if (existing && !force) {
      report.perVideo.push({ videoId: row.video_id, status: "skipped" });
      onProgress?.({
        kind: "video", index: i + 1, total: rows.length,
        videoId: row.video_id, title: row.title, result: "skipped",
      });
      continue;
    }
    try {
      const out = await analyzeOneVideo({ ...row, search_term: search.term });
      persistPerVideo(searchId, row.video_id, out);
      report.cost_usd += out._cost;
      report.perVideo.push({ videoId: row.video_id, status: "ok" });
      onProgress?.({
        kind: "video", index: i + 1, total: rows.length,
        videoId: row.video_id, title: row.title, result: "ok",
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      report.perVideo.push({ videoId: row.video_id, status: "error", error: errMsg });
      onProgress?.({
        kind: "video", index: i + 1, total: rows.length,
        videoId: row.video_id, title: row.title, result: "error", error: errMsg,
      });
    }
  }

  // Aggregate pass — only if at least 1 video has analysis.
  const analyzedRows = db.prepare(`
    SELECT v.id AS video_id, v.title, v.author, v.duration_sec, va.raw_json
      FROM videos v JOIN video_analyses va ON va.video_id = v.id
     WHERE v.search_id = ?
     ORDER BY v.id ASC
  `).all(searchId) as { video_id: number; title: string | null; author: string | null; duration_sec: number | null; raw_json: string }[];

  if (analyzedRows.length === 0) {
    report.aggregate = { status: "skipped", error: "no per-video analyses" };
    onProgress?.({ kind: "aggregate", phase: "skipped", error: "no per-video analyses" });
    return report;
  }

  onProgress?.({ kind: "aggregate", phase: "start" });

  try {
    const videos = analyzedRows.map((r) => {
      const v = JSON.parse(r.raw_json) as PerVideoOutput;
      return {
        video_id: r.video_id,
        title: r.title,
        author: r.author,
        duration_sec: r.duration_sec,
        ...v,
      };
    });
    const out = await analyzeAggregate({ search_id: searchId, search_term: search.term, videos });
    persistAggregate(searchId, out);
    report.cost_usd += out._cost;
    report.aggregate = { status: "ok" };
    onProgress?.({ kind: "aggregate", phase: "ok" });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    report.aggregate = { status: "error", error: errMsg };
    onProgress?.({ kind: "aggregate", phase: "error", error: errMsg });
  }

  return report;
}
