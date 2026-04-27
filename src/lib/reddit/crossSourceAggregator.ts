/**
 * Combine the latest TikTok aggregate (searches → aggregate_analyses) and
 * Reddit aggregate (reddit_runs → reddit_aggregates) into a single brief.
 * Either side may be missing (Reddit-only or TikTok-only snapshot).
 *
 * Persists the result into cross_source_aggregates so the user can keep
 * history of these reports.
 */
import { getDB } from "../db";
import { runClaude } from "../claude";
import { CROSS_SOURCE_SYSTEM, CROSS_SOURCE_SCHEMA, CrossSourceOutput } from "./redditAnalyzePrompts";

export interface CrossSourceInput {
  label: string;
  tiktokSearchId?: number | null;
  redditRunId?: number | null;
}

export interface CrossSourceReport {
  cross_id: number;
  status: "ok" | "error";
  error?: string;
  cost_usd: number;
}

/* ------------------------------------------------ shared tools rollup --- */

function buildSharedToolsRollup(tiktokSearchId: number | null, redditRunId: number | null) {
  const db = getDB();
  // Tools mentioned on either side — left/right join doesn't exist in sqlite,
  // so we union and group in-memory.
  const tikRows = tiktokSearchId == null ? [] : db.prepare(
    `SELECT t.id AS tool_id, t.name, t.category, tm.confidence, tm.video_id
       FROM tool_mentions tm JOIN tools t ON t.id = tm.tool_id
      WHERE tm.search_id = ?`
  ).all(tiktokSearchId) as { tool_id: number; name: string; category: string | null; confidence: string; video_id: number }[];

  const redRows = redditRunId == null ? [] : db.prepare(
    `SELECT t.id AS tool_id, t.name, t.category, rtm.confidence, rtm.post_id
       FROM reddit_tool_mentions rtm JOIN tools t ON t.id = rtm.tool_id
      WHERE rtm.run_id = ?`
  ).all(redditRunId) as { tool_id: number; name: string; category: string | null; confidence: string; post_id: number }[];

  const map = new Map<number, {
    tool_id: number; name: string; category: string | null;
    tiktok: { video_id: number; confidence: string }[];
    reddit: { post_id: number; confidence: string }[];
  }>();
  for (const r of tikRows) {
    const cur = map.get(r.tool_id) ?? { tool_id: r.tool_id, name: r.name, category: r.category, tiktok: [], reddit: [] };
    cur.tiktok.push({ video_id: r.video_id, confidence: r.confidence });
    map.set(r.tool_id, cur);
  }
  for (const r of redRows) {
    const cur = map.get(r.tool_id) ?? { tool_id: r.tool_id, name: r.name, category: r.category, tiktok: [], reddit: [] };
    cur.reddit.push({ post_id: r.post_id, confidence: r.confidence });
    map.set(r.tool_id, cur);
  }
  return [...map.values()];
}

/* ------------------------------------------------ entry ------------------ */

export async function aggregateCrossSource(input: CrossSourceInput): Promise<CrossSourceReport> {
  const db = getDB();

  if (input.tiktokSearchId == null && input.redditRunId == null) {
    throw new Error("aggregateCrossSource requires at least one of tiktokSearchId or redditRunId");
  }

  const tikAgg = input.tiktokSearchId == null ? null : db.prepare(
    `SELECT raw_json FROM aggregate_analyses WHERE search_id = ?`
  ).get(input.tiktokSearchId) as { raw_json: string | null } | undefined;

  const redAgg = input.redditRunId == null ? null : db.prepare(
    `SELECT raw_json FROM reddit_aggregates WHERE run_id = ?`
  ).get(input.redditRunId) as { raw_json: string | null } | undefined;

  if (!tikAgg && !redAgg) {
    throw new Error("no aggregate analyses found for the given ids — run /api/analyze and /api/reddit/analyze first");
  }

  const sharedTools = buildSharedToolsRollup(input.tiktokSearchId ?? null, input.redditRunId ?? null);

  // Insert empty row first so we have an id to return even on failure.
  const cross = db.prepare(
    `INSERT INTO cross_source_aggregates (label, tiktok_search_id, reddit_run_id) VALUES (?, ?, ?)`
  ).run(input.label, input.tiktokSearchId ?? null, input.redditRunId ?? null);
  const crossId = Number(cross.lastInsertRowid);

  const userPrompt = [
    `LABEL: ${input.label}`,
    input.tiktokSearchId != null ? `TIKTOK_SEARCH_ID: ${input.tiktokSearchId}` : null,
    input.redditRunId    != null ? `REDDIT_RUN_ID: ${input.redditRunId}`       : null,
    "",
    tikAgg?.raw_json ? `TIKTOK_AGGREGATE_JSON:\n${tikAgg.raw_json}` : "TIKTOK_AGGREGATE_JSON: (none)",
    "",
    redAgg?.raw_json ? `REDDIT_AGGREGATE_JSON:\n${redAgg.raw_json}` : "REDDIT_AGGREGATE_JSON: (none)",
    "",
    `SHARED_TOOLS_ROLLUP_JSON:\n${JSON.stringify(sharedTools, null, 2)}`,
  ].filter(Boolean).join("\n");

  let costUsd = 0;
  try {
    const r = await runClaude<CrossSourceOutput>({
      systemPrompt: CROSS_SOURCE_SYSTEM,
      userPrompt,
      schema: CROSS_SOURCE_SCHEMA,
      timeoutMs: 600_000,
    });
    costUsd = r.cost_usd;

    db.prepare(
      `UPDATE cross_source_aggregates SET
         action_plan_md       = ?,
         repeated_trends_json = ?,
         reddit_only_json     = ?,
         tiktok_only_json     = ?,
         repeated_tools_json  = ?,
         workflows_json       = ?,
         hooks_json           = ?,
         video_ideas_json     = ?,
         pain_points_json     = ?,
         ad_candidates_json   = ?,
         opportunities_json   = ?,
         raw_json             = ?
       WHERE id = ?`
    ).run(
      r.output.action_plan_md,
      JSON.stringify(r.output.repeated_trends),
      JSON.stringify(r.output.reddit_only),
      JSON.stringify(r.output.tiktok_only),
      JSON.stringify(r.output.repeated_tools),
      JSON.stringify(r.output.workflows),
      JSON.stringify(r.output.hooks),
      JSON.stringify(r.output.video_ideas),
      JSON.stringify(r.output.pain_points),
      JSON.stringify(r.output.ad_candidates),
      JSON.stringify(r.output.opportunities),
      JSON.stringify(r.output),
      crossId,
    );
    return { cross_id: crossId, status: "ok", cost_usd: costUsd };
  } catch (e) {
    return { cross_id: crossId, status: "error", error: e instanceof Error ? e.message : String(e), cost_usd: costUsd };
  }
}
