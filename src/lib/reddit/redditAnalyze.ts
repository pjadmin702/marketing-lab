/**
 * Two-pass Reddit analyzer:
 *   1. per-post: extract pain points, workflows, opportunities, tools
 *   2. aggregate: synthesize the prioritized action plan for the whole run
 *
 * Mirrors the shape of src/lib/analyze.ts (TikTok side) and shares the
 * canonical `tools` table via reddit_tool_mentions.
 */
import { getDB } from "../db";
import { runClaude } from "../claude";
import {
  REDDIT_PER_POST_SYSTEM, REDDIT_PER_POST_SCHEMA, RedditPerPostOutput,
  REDDIT_AGGREGATE_SYSTEM, REDDIT_AGGREGATE_SCHEMA, RedditAggregateOutput,
} from "./redditAnalyzePrompts";
import { formatPost } from "./redditFormatter";

export interface RedditAnalyzeReport {
  run_id: number;
  per_post: { post_id: number; status: "ok" | "skipped" | "error"; error?: string }[];
  aggregate: { status: "ok" | "skipped" | "error"; error?: string };
  cost_usd: number;
}

/* --- per-post --- */

async function analyzeOnePost(postId: number, runId: number, runLabel: string): Promise<RedditPerPostOutput & { _cost: number }> {
  const formatted = formatPost(postId, { runId, maxComments: 15 });
  const userPrompt = [
    `RUN: ${runLabel}`,
    `POST_ID: ${postId}`,
    "",
    formatted.text,
  ].join("\n");

  const r = await runClaude<RedditPerPostOutput>({
    systemPrompt: REDDIT_PER_POST_SYSTEM,
    userPrompt,
    schema: REDDIT_PER_POST_SCHEMA,
    timeoutMs: 600_000,
  });
  return { ...r.output, _cost: r.cost_usd };
}

function persistPerPost(runId: number, postId: number, out: RedditPerPostOutput): void {
  const db = getDB();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO reddit_post_analyses (
         post_id, run_id, summary, signal_density,
         pain_points_json, workflows_json, opportunities_json, raw_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         run_id              = excluded.run_id,
         summary             = excluded.summary,
         signal_density      = excluded.signal_density,
         pain_points_json    = excluded.pain_points_json,
         workflows_json      = excluded.workflows_json,
         opportunities_json  = excluded.opportunities_json,
         raw_json            = excluded.raw_json,
         created_at          = strftime('%s','now')`
    ).run(
      postId, runId, out.summary, out.signal_density,
      JSON.stringify(out.pain_points),
      JSON.stringify(out.workflows),
      JSON.stringify(out.opportunities),
      JSON.stringify(out),
    );

    const insertTool = db.prepare(
      `INSERT INTO tools (name, category) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET category = COALESCE(tools.category, excluded.category)
       RETURNING id`
    );
    const updateToolDesc = db.prepare(
      `UPDATE tools SET what_it_does = COALESCE(what_it_does, ?) WHERE id = ?`
    );
    const insertMention = db.prepare(
      `INSERT INTO reddit_tool_mentions (tool_id, post_id, run_id, confidence, raw_mention)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tool_id, post_id) DO UPDATE SET
         confidence  = excluded.confidence,
         raw_mention = excluded.raw_mention`
    );

    for (const t of out.tools_mentioned) {
      const tool = insertTool.get(t.name, t.category) as { id: number };
      updateToolDesc.run(t.what_it_does || null, tool.id);
      insertMention.run(tool.id, postId, runId, t.confidence, t.raw_mention);
    }
  });
  tx();
}

/* --- aggregate --- */

async function analyzeRunAggregate(runId: number, runLabel: string): Promise<RedditAggregateOutput & { _cost: number }> {
  const db = getDB();
  const rows = db.prepare(
    `SELECT pa.post_id, p.subreddit, p.title, p.score, p.num_comments, p.signal_score,
            pa.raw_json
       FROM reddit_post_analyses pa
       JOIN reddit_posts p ON p.id = pa.post_id
      WHERE pa.run_id = ?
      ORDER BY p.signal_score DESC, p.score DESC`
  ).all(runId) as { post_id: number; subreddit: string; title: string; score: number; num_comments: number; signal_score: number | null; raw_json: string }[];

  const condensed = rows.map((r) => {
    const v = JSON.parse(r.raw_json) as RedditPerPostOutput;
    return {
      post_id: r.post_id,
      subreddit: r.subreddit,
      title: r.title,
      score: r.score,
      num_comments: r.num_comments,
      signal_score: r.signal_score,
      ...v,
    };
  });

  const userPrompt = [
    `RUN: ${runLabel}`,
    `${condensed.length} posts analyzed.`,
    "",
    "PER-POST ANALYSES (JSON):",
    JSON.stringify(condensed, null, 2),
  ].join("\n");

  const r = await runClaude<RedditAggregateOutput>({
    systemPrompt: REDDIT_AGGREGATE_SYSTEM,
    userPrompt,
    schema: REDDIT_AGGREGATE_SCHEMA,
    timeoutMs: 600_000,
  });
  return { ...r.output, _cost: r.cost_usd };
}

function persistAggregate(runId: number, out: RedditAggregateOutput): void {
  getDB().prepare(
    `INSERT INTO reddit_aggregates (
       run_id, action_plan_md, trends_json, pain_points_json, workflows_json,
       opportunities_json, tools_json, raw_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id) DO UPDATE SET
       action_plan_md     = excluded.action_plan_md,
       trends_json        = excluded.trends_json,
       pain_points_json   = excluded.pain_points_json,
       workflows_json     = excluded.workflows_json,
       opportunities_json = excluded.opportunities_json,
       tools_json         = excluded.tools_json,
       raw_json           = excluded.raw_json,
       created_at         = strftime('%s','now')`
  ).run(
    runId,
    out.action_plan_md,
    JSON.stringify(out.trends),
    JSON.stringify(out.pain_points),
    JSON.stringify(out.workflows),
    JSON.stringify(out.opportunities),
    JSON.stringify(out.tools),
    JSON.stringify(out),
  );
}

/* --- top-level --- */

export async function analyzeRun(runId: number, opts: { force?: boolean; postIds?: number[] } = {}): Promise<RedditAnalyzeReport> {
  const db = getDB();
  const run = db.prepare(`SELECT label FROM reddit_runs WHERE id = ?`).get(runId) as { label: string } | undefined;
  if (!run) throw new Error(`reddit_run ${runId} not found`);

  // Default to all posts attached to this run via appearances. Caller may pass postIds to scope.
  const postRows = (opts.postIds && opts.postIds.length > 0)
    ? opts.postIds.map((id) => ({ post_id: id }))
    : db.prepare(
        `SELECT DISTINCT a.post_id FROM reddit_post_appearances a
          WHERE a.run_id = ?
          ORDER BY a.post_id ASC`
      ).all(runId) as { post_id: number }[];

  const report: RedditAnalyzeReport = { run_id: runId, per_post: [], aggregate: { status: "skipped" }, cost_usd: 0 };

  for (const { post_id } of postRows) {
    const existing = db.prepare(`SELECT 1 FROM reddit_post_analyses WHERE post_id = ?`).get(post_id);
    if (existing && !opts.force) {
      report.per_post.push({ post_id, status: "skipped" });
      continue;
    }
    try {
      const out = await analyzeOnePost(post_id, runId, run.label);
      persistPerPost(runId, post_id, out);
      report.cost_usd += out._cost;
      report.per_post.push({ post_id, status: "ok" });
    } catch (e) {
      report.per_post.push({ post_id, status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const analyzedCount = db.prepare(`SELECT COUNT(*) AS c FROM reddit_post_analyses WHERE run_id = ?`).get(runId) as { c: number };
  if (analyzedCount.c === 0) {
    report.aggregate = { status: "skipped", error: "no per-post analyses" };
    return report;
  }

  try {
    const out = await analyzeRunAggregate(runId, run.label);
    persistAggregate(runId, out);
    report.cost_usd += out._cost;
    report.aggregate = { status: "ok" };
  } catch (e) {
    report.aggregate = { status: "error", error: e instanceof Error ? e.message : String(e) };
  }

  return report;
}
