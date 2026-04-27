/**
 * Read-side queries for the Reddit dashboard. Mirrors src/lib/queries.ts.
 */
import { getDB } from "../db";

export interface RedditRunRow {
  id: number;
  label: string;
  notes: string | null;
  created_at: number;
  query_count: number;
  post_count: number;
  analyzed_count: number;
}

export function listRuns(): RedditRunRow[] {
  return getDB().prepare(
    `SELECT r.id, r.label, r.notes, r.created_at,
            (SELECT COUNT(*) FROM reddit_queries q WHERE q.run_id = r.id) AS query_count,
            (SELECT COUNT(DISTINCT a.post_id) FROM reddit_post_appearances a WHERE a.run_id = r.id) AS post_count,
            (SELECT COUNT(*) FROM reddit_post_analyses pa WHERE pa.run_id = r.id) AS analyzed_count
       FROM reddit_runs r
      ORDER BY r.created_at DESC, r.id DESC`
  ).all() as RedditRunRow[];
}

export function getRun(runId: number): RedditRunRow | null {
  const r = getDB().prepare(
    `SELECT r.id, r.label, r.notes, r.created_at,
            (SELECT COUNT(*) FROM reddit_queries q WHERE q.run_id = r.id) AS query_count,
            (SELECT COUNT(DISTINCT a.post_id) FROM reddit_post_appearances a WHERE a.run_id = r.id) AS post_count,
            (SELECT COUNT(*) FROM reddit_post_analyses pa WHERE pa.run_id = r.id) AS analyzed_count
       FROM reddit_runs r WHERE r.id = ?`
  ).get(runId) as RedditRunRow | undefined;
  return r ?? null;
}

export interface RedditPostListRow {
  id: number;
  reddit_id: string;
  subreddit: string;
  title: string;
  permalink: string;
  url: string;
  author: string | null;
  score: number;
  num_comments: number;
  upvote_ratio: number | null;
  created_utc: number;
  signal_score: number | null;
  ranking_sources: string[];
  has_analysis: 0 | 1;
  analyzed_summary: string | null;
}

export function listPostsForRun(runId: number, opts: { minScore?: number; limit?: number } = {}): RedditPostListRow[] {
  const minScore = opts.minScore ?? 0;
  const limit = opts.limit ?? 500;
  const rows = getDB().prepare(
    `SELECT p.id, p.reddit_id, p.subreddit, p.title, p.permalink, p.url, p.author,
            p.score, p.num_comments, p.upvote_ratio, p.created_utc, p.signal_score,
            (SELECT GROUP_CONCAT(DISTINCT a.ranking_source)
               FROM reddit_post_appearances a
              WHERE a.post_id = p.id AND a.run_id = ?) AS ranking_sources_csv,
            CASE WHEN pa.id IS NULL THEN 0 ELSE 1 END AS has_analysis,
            pa.summary AS analyzed_summary
       FROM reddit_posts p
       JOIN reddit_post_appearances ap ON ap.post_id = p.id AND ap.run_id = ?
  LEFT JOIN reddit_post_analyses pa  ON pa.post_id = p.id AND pa.run_id = ?
      WHERE COALESCE(p.signal_score, 0) >= ?
   GROUP BY p.id
   ORDER BY p.signal_score DESC, p.score DESC
      LIMIT ?`
  ).all(runId, runId, runId, minScore, limit) as Array<{
    id: number; reddit_id: string; subreddit: string; title: string;
    permalink: string; url: string; author: string | null; score: number;
    num_comments: number; upvote_ratio: number | null; created_utc: number;
    signal_score: number | null; ranking_sources_csv: string | null;
    has_analysis: 0 | 1; analyzed_summary: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id, reddit_id: r.reddit_id, subreddit: r.subreddit, title: r.title,
    permalink: r.permalink, url: r.url, author: r.author, score: r.score,
    num_comments: r.num_comments, upvote_ratio: r.upvote_ratio,
    created_utc: r.created_utc, signal_score: r.signal_score,
    ranking_sources: r.ranking_sources_csv ? r.ranking_sources_csv.split(",") : [],
    has_analysis: r.has_analysis,
    analyzed_summary: r.analyzed_summary,
  }));
}

export interface RedditAggregateRow {
  action_plan_md: string;
  trends:        { name: string; explanation: string; post_ids: number[] }[];
  pain_points:   { text: string; post_ids: number[] }[];
  workflows:     { name: string; summary: string; post_ids: number[] }[];
  opportunities: { kind: string; description: string; rationale: string; post_ids: number[] }[];
  tools:         { name: string; category: string; best_confidence: string; mention_count?: number; post_ids: number[] }[];
}

export function getRunAggregate(runId: number): RedditAggregateRow | null {
  const r = getDB().prepare(
    `SELECT action_plan_md, trends_json, pain_points_json, workflows_json,
            opportunities_json, tools_json
       FROM reddit_aggregates WHERE run_id = ?`
  ).get(runId) as Record<string, string | null> | undefined;
  if (!r) return null;
  const j = <T,>(s: string | null): T => (s ? JSON.parse(s) : ([] as unknown as T));
  return {
    action_plan_md: r.action_plan_md ?? "",
    trends:        j(r.trends_json),
    pain_points:   j(r.pain_points_json),
    workflows:     j(r.workflows_json),
    opportunities: j(r.opportunities_json),
    tools:         j(r.tools_json),
  };
}

export interface CrossSourceListRow {
  id: number;
  label: string;
  tiktok_search_id: number | null;
  reddit_run_id: number | null;
  has_action_plan: 0 | 1;
  created_at: number;
}

export function listCrossSourceAggregates(): CrossSourceListRow[] {
  return getDB().prepare(
    `SELECT id, label, tiktok_search_id, reddit_run_id,
            CASE WHEN action_plan_md IS NULL THEN 0 ELSE 1 END AS has_action_plan,
            created_at
       FROM cross_source_aggregates
      ORDER BY created_at DESC, id DESC`
  ).all() as CrossSourceListRow[];
}

export interface CrossSourceFullRow {
  id: number;
  label: string;
  tiktok_search_id: number | null;
  reddit_run_id: number | null;
  action_plan_md: string;
  repeated_trends: unknown[];
  reddit_only: unknown[];
  tiktok_only: unknown[];
  repeated_tools: unknown[];
  workflows: unknown[];
  hooks: unknown[];
  video_ideas: unknown[];
  pain_points: unknown[];
  ad_candidates: unknown[];
  opportunities: unknown[];
  created_at: number;
}

export function getCrossSourceAggregate(id: number): CrossSourceFullRow | null {
  const r = getDB().prepare(
    `SELECT id, label, tiktok_search_id, reddit_run_id, action_plan_md,
            repeated_trends_json, reddit_only_json, tiktok_only_json,
            repeated_tools_json, workflows_json, hooks_json, video_ideas_json,
            pain_points_json, ad_candidates_json, opportunities_json, created_at
       FROM cross_source_aggregates WHERE id = ?`
  ).get(id) as Record<string, string | number | null> | undefined;
  if (!r) return null;
  const j = (s: unknown): unknown[] => (typeof s === "string" && s ? JSON.parse(s) : []);
  return {
    id: r.id as number,
    label: r.label as string,
    tiktok_search_id: r.tiktok_search_id as number | null,
    reddit_run_id: r.reddit_run_id as number | null,
    action_plan_md: (r.action_plan_md as string) ?? "",
    repeated_trends: j(r.repeated_trends_json),
    reddit_only:     j(r.reddit_only_json),
    tiktok_only:     j(r.tiktok_only_json),
    repeated_tools:  j(r.repeated_tools_json),
    workflows:       j(r.workflows_json),
    hooks:           j(r.hooks_json),
    video_ideas:     j(r.video_ideas_json),
    pain_points:     j(r.pain_points_json),
    ad_candidates:   j(r.ad_candidates_json),
    opportunities:   j(r.opportunities_json),
    created_at: r.created_at as number,
  };
}

export interface RunQueryRow {
  id: number;
  subreddit: string;
  mode: string;
  time_range: string | null;
  keyword: string | null;
  status: string;
  error: string | null;
  fetched_count: number;
  created_at: number;
}

export function listRunQueries(runId: number): RunQueryRow[] {
  return getDB().prepare(
    `SELECT id, subreddit, mode, time_range, keyword, status, error, fetched_count, created_at
       FROM reddit_queries WHERE run_id = ?
      ORDER BY id ASC`
  ).all(runId) as RunQueryRow[];
}
