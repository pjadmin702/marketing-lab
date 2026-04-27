/**
 * Orchestrates a Reddit ingest run:
 *   1. resolves the user's selectors into a flat subreddit list
 *   2. for each (subreddit × mode × time × keyword) tuple, creates a query row
 *   3. fetches the listing, parses, dedup-upserts posts, records appearances
 *   4. computes signal scores
 *   5. optionally fetches top comments for high-signal posts
 *
 * Hard caps keep us inside polite-citizen limits even if the user gets greedy.
 */
import { getDB } from "../db";
import {
  redditGet,
  parseListing,
  parseComments,
  inferPostType,
  RedditBlockedError,
  type RedditPostRaw,
  type RedditCommentRaw,
} from "./redditClient";
import { scorePost } from "./redditRanker";
import { expandSelection } from "./subredditManager";

export type RedditMode = "top" | "hot" | "new" | "search";
export type RedditTimeRange = "hour" | "day" | "week" | "month" | "year" | "all";

export interface IngestQueryConfig {
  subreddit: string;
  mode: RedditMode;
  timeRange?: RedditTimeRange;
  keyword?: string;
  fetchLimit?: number;
}

export interface IngestRunInput {
  runId: number;
  selectors: string[];                // subreddit names or group names
  modes: { mode: RedditMode; timeRange?: RedditTimeRange }[];
  keywords?: string[];
  fetchLimitPerQuery?: number;        // default 100 (Reddit max)
  maxSubreddits?: number;             // default 5
  maxPostsPerSubreddit?: number;      // default 200
  fetchComments?: boolean;            // default false
  maxCommentsPerPost?: number;        // default 20
  signalThresholdForComments?: number; // default 0.55
}

export interface IngestQueryResult {
  query_id: number;
  subreddit: string;
  mode: RedditMode;
  time_range: RedditTimeRange | null;
  keyword: string | null;
  status: "ok" | "error" | "blocked";
  error?: string;
  fetched: number;
  fromCache?: boolean;
}

export interface IngestRunReport {
  run_id: number;
  subreddits: string[];
  queries: IngestQueryResult[];
  posts_upserted: number;
  comments_fetched: number;
  blocked: boolean;
}

const DEFAULTS = {
  fetchLimitPerQuery: 100,
  maxSubreddits: 5,
  maxPostsPerSubreddit: 200,
  fetchComments: false,
  maxCommentsPerPost: 20,
  signalThresholdForComments: 0.55,
};

/* ---------------------------------------------------- run management ----- */

export function createRun(label: string, notes?: string): number {
  const r = getDB().prepare(`INSERT INTO reddit_runs (label, notes) VALUES (?, ?)`).run(label, notes ?? null);
  return Number(r.lastInsertRowid);
}

export function getRun(runId: number): { id: number; label: string; notes: string | null; created_at: number } | null {
  const r = getDB().prepare(`SELECT id, label, notes, created_at FROM reddit_runs WHERE id = ?`).get(runId);
  return (r as { id: number; label: string; notes: string | null; created_at: number } | undefined) ?? null;
}

/* ---------------------------------------------------- URL building ------- */

function buildPath(q: IngestQueryConfig): string {
  const sub = encodeURIComponent(q.subreddit);
  const limit = Math.min(100, q.fetchLimit ?? 100);
  if (q.mode === "search") {
    const params = new URLSearchParams({
      q: q.keyword ?? "",
      restrict_sr: "1",
      sort: q.timeRange ? "top" : "relevance",
      limit: String(limit),
      include_over_18: "off",
    });
    if (q.timeRange) params.set("t", q.timeRange);
    return `/r/${sub}/search.json?${params.toString()}`;
  }
  if (q.mode === "top") {
    const params = new URLSearchParams({ t: q.timeRange ?? "week", limit: String(limit) });
    return `/r/${sub}/top.json?${params.toString()}`;
  }
  return `/r/${sub}/${q.mode}.json?limit=${limit}`;
}

function rankingSourceLabel(q: IngestQueryConfig): string {
  if (q.mode === "search") return `search:${q.keyword ?? ""}`;
  if (q.mode === "top")    return `top_${q.timeRange ?? "week"}`;
  return q.mode; // 'hot' | 'new'
}

/* ---------------------------------------------------- DB writers --------- */

interface UpsertOutcome { post_id: number; was_new: boolean; }

function upsertPost(p: RedditPostRaw, signalScore: number): UpsertOutcome {
  const db = getDB();
  const existing = db.prepare(`SELECT id FROM reddit_posts WHERE reddit_id = ?`).get(p.id) as { id: number } | undefined;
  const postType = inferPostType(p);

  db.prepare(
    `INSERT INTO reddit_posts (
       reddit_id, subreddit, author, title, selftext, url, permalink,
       score, upvote_ratio, num_comments, created_utc, flair, post_type,
       is_video, over_18, signal_score, raw_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(reddit_id) DO UPDATE SET
       score        = excluded.score,
       upvote_ratio = excluded.upvote_ratio,
       num_comments = excluded.num_comments,
       flair        = COALESCE(excluded.flair, reddit_posts.flair),
       signal_score = excluded.signal_score,
       last_seen_at = strftime('%s','now')`
  ).run(
    p.id, p.subreddit, p.author, p.title, p.selftext, p.url, p.permalink,
    p.score, p.upvote_ratio, p.num_comments, p.created_utc, p.link_flair_text, postType,
    p.is_video ? 1 : 0, p.over_18 ? 1 : 0, signalScore,
    JSON.stringify(p),
  );

  const row = db.prepare(`SELECT id FROM reddit_posts WHERE reddit_id = ?`).get(p.id) as { id: number };
  return { post_id: row.id, was_new: !existing };
}

function recordAppearance(args: {
  postId: number; runId: number; queryId: number;
  rankingSource: string; keyword: string | null; rankPosition: number;
}): void {
  getDB().prepare(
    `INSERT INTO reddit_post_appearances (post_id, run_id, query_id, ranking_source, keyword, rank_position)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id, run_id, ranking_source, keyword) DO UPDATE SET
       rank_position = excluded.rank_position,
       captured_at   = strftime('%s','now')`
  ).run(args.postId, args.runId, args.queryId, args.rankingSource, args.keyword, args.rankPosition);
}

function insertQuery(runId: number, q: IngestQueryConfig): number {
  const r = getDB().prepare(
    `INSERT INTO reddit_queries (run_id, subreddit, mode, time_range, keyword, fetch_limit, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).run(runId, q.subreddit, q.mode, q.timeRange ?? null, q.keyword ?? null, q.fetchLimit ?? 100);
  return Number(r.lastInsertRowid);
}

function updateQueryStatus(queryId: number, status: "ok" | "error" | "blocked", fetched: number, error?: string): void {
  getDB().prepare(
    `UPDATE reddit_queries SET status = ?, fetched_count = ?, error = ? WHERE id = ?`
  ).run(status, fetched, error ?? null, queryId);
}

function insertComments(postId: number, comments: RedditCommentRaw[]): number {
  const db = getDB();
  const stmt = db.prepare(
    `INSERT INTO reddit_comments (reddit_comment_id, post_id, parent_id, author, body, score, created_utc, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(reddit_comment_id) DO UPDATE SET
       body  = excluded.body,
       score = excluded.score`
  );
  const tx = db.transaction((rows: RedditCommentRaw[]) => {
    for (const c of rows) {
      stmt.run(c.id, postId, c.parent_id, c.author, c.body, c.score, c.created_utc, JSON.stringify(c));
    }
  });
  tx(comments);
  return comments.length;
}

/* ---------------------------------------------------- main entry --------- */

export async function runIngest(input: IngestRunInput): Promise<IngestRunReport> {
  const cfg = { ...DEFAULTS, ...input };
  const subreddits = expandSelection(input.selectors).slice(0, cfg.maxSubreddits);

  const queries: IngestQueryConfig[] = [];
  for (const sub of subreddits) {
    for (const m of input.modes) {
      if (m.mode === "search") continue; // search needs a keyword
      queries.push({ subreddit: sub, mode: m.mode, timeRange: m.timeRange, fetchLimit: cfg.fetchLimitPerQuery });
    }
    if (input.keywords?.length) {
      for (const kw of input.keywords) {
        queries.push({ subreddit: sub, mode: "search", keyword: kw, timeRange: "year", fetchLimit: cfg.fetchLimitPerQuery });
      }
    }
  }

  const report: IngestRunReport = {
    run_id: input.runId,
    subreddits,
    queries: [],
    posts_upserted: 0,
    comments_fetched: 0,
    blocked: false,
  };

  // Track per-subreddit fetched counts so we can stop early on caps.
  const fetchedBySub = new Map<string, number>();

  for (const q of queries) {
    if (report.blocked) break;
    if ((fetchedBySub.get(q.subreddit) ?? 0) >= cfg.maxPostsPerSubreddit) continue;

    const queryId = insertQuery(input.runId, q);
    const result: IngestQueryResult = {
      query_id: queryId,
      subreddit: q.subreddit,
      mode: q.mode,
      time_range: q.timeRange ?? null,
      keyword: q.keyword ?? null,
      status: "ok",
      fetched: 0,
    };

    try {
      const path = buildPath(q);
      const res = await redditGet(path);
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      const { posts } = parseListing(res.body);

      const rankingSource = rankingSourceLabel(q);
      let saved = 0;
      for (let i = 0; i < posts.length; i++) {
        const subTotal = fetchedBySub.get(q.subreddit) ?? 0;
        if (subTotal >= cfg.maxPostsPerSubreddit) break;
        const p = posts[i];
        if (p.over_18) continue; // we excluded these via include_over_18=off, belt-and-braces
        const score = scorePost({ post: p }).signal_score;
        const { post_id, was_new } = upsertPost(p, score);
        recordAppearance({
          postId: post_id, runId: input.runId, queryId, rankingSource,
          keyword: q.keyword ?? null, rankPosition: i + 1,
        });
        if (was_new) report.posts_upserted++;
        fetchedBySub.set(q.subreddit, subTotal + 1);
        saved++;
      }

      result.fetched = saved;
      result.fromCache = res.fromCache;
      updateQueryStatus(queryId, "ok", saved);
    } catch (e) {
      if (e instanceof RedditBlockedError) {
        result.status = "blocked";
        result.error = e.message;
        report.blocked = true;
      } else {
        result.status = "error";
        result.error = e instanceof Error ? e.message : String(e);
      }
      updateQueryStatus(queryId, result.status, 0, result.error);
    }

    report.queries.push(result);
  }

  // Optional comment fetch for high-signal posts in this run.
  if (cfg.fetchComments && !report.blocked) {
    const targets = getDB().prepare(
      `SELECT DISTINCT p.id, p.permalink, p.signal_score
         FROM reddit_posts p
         JOIN reddit_post_appearances a ON a.post_id = p.id
        WHERE a.run_id = ? AND p.signal_score >= ?
        ORDER BY p.signal_score DESC
        LIMIT 50`
    ).all(input.runId, cfg.signalThresholdForComments) as { id: number; permalink: string; signal_score: number }[];

    for (const t of targets) {
      if (report.blocked) break;
      try {
        const path = `${t.permalink.replace(/^https?:\/\/[^/]+/, "")}.json?limit=${cfg.maxCommentsPerPost}&sort=top`;
        const res = await redditGet(path);
        if (res.status !== 200) continue;
        const comments = parseComments(res.body, cfg.maxCommentsPerPost);
        if (comments.length === 0) continue;
        report.comments_fetched += insertComments(t.id, comments);

        // Re-score now that we have comments, so the dashboard reflects them.
        const post = getDB().prepare(`SELECT raw_json FROM reddit_posts WHERE id = ?`).get(t.id) as { raw_json: string } | undefined;
        if (post?.raw_json) {
          const raw = JSON.parse(post.raw_json) as RedditPostRaw;
          const newScore = scorePost({ post: raw, comments }).signal_score;
          getDB().prepare(`UPDATE reddit_posts SET signal_score = ? WHERE id = ?`).run(newScore, t.id);
        }
      } catch (e) {
        if (e instanceof RedditBlockedError) report.blocked = true;
        // Otherwise swallow: missing comments shouldn't fail the whole run.
      }
    }
  }

  return report;
}
