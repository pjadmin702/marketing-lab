/**
 * Format a stored Reddit post into the text block the analyze pipeline
 * consumes. Matches the user-spec template:
 *
 *   SOURCE: Reddit
 *   SUBREDDIT: ...
 *   RANKING TYPE: ...
 *   TITLE: ...
 *   URL: ...
 *   SCORE: ...
 *   COMMENTS: ...
 *   DATE: ...
 *   POST BODY:
 *   ...
 *   TOP COMMENTS:
 *   ...
 */
import { getDB } from "../db";

export interface FormattedPost {
  post_id: number;
  reddit_id: string;
  text: string;
}

interface PostRow {
  id: number;
  reddit_id: string;
  subreddit: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
  flair: string | null;
  post_type: string | null;
}

interface AppearanceRow { ranking_source: string; keyword: string | null; }
interface CommentRow { author: string | null; body: string; score: number; created_utc: number; }

const PERMA_PREFIX = "https://www.reddit.com";

export function formatPost(postId: number, opts: { runId?: number; maxComments?: number } = {}): FormattedPost {
  const db = getDB();
  const post = db.prepare(
    `SELECT id, reddit_id, subreddit, title, selftext, url, permalink, score, num_comments, created_utc, flair, post_type
       FROM reddit_posts WHERE id = ?`
  ).get(postId) as PostRow | undefined;
  if (!post) throw new Error(`reddit_post ${postId} not found`);

  const appearances = db.prepare(
    opts.runId
      ? `SELECT DISTINCT ranking_source, keyword FROM reddit_post_appearances WHERE post_id = ? AND run_id = ?`
      : `SELECT DISTINCT ranking_source, keyword FROM reddit_post_appearances WHERE post_id = ?`
  ).all(...(opts.runId ? [postId, opts.runId] : [postId])) as AppearanceRow[];

  const comments = db.prepare(
    `SELECT author, body, score, created_utc FROM reddit_comments
      WHERE post_id = ? ORDER BY score DESC LIMIT ?`
  ).all(postId, opts.maxComments ?? 10) as CommentRow[];

  const rankingTypes = appearances.length > 0
    ? appearances.map((a) => a.keyword ? `${a.ranking_source}` : a.ranking_source).join(", ")
    : "n/a";

  const dateIso = new Date(post.created_utc * 1000).toISOString().slice(0, 10);
  const fullUrl = post.permalink ? `${PERMA_PREFIX}${post.permalink}` : post.url;

  const lines: string[] = [];
  lines.push(`SOURCE: Reddit`);
  lines.push(`SUBREDDIT: r/${post.subreddit}`);
  lines.push(`RANKING TYPE: ${rankingTypes}`);
  lines.push(`TITLE: ${post.title}`);
  lines.push(`URL: ${fullUrl}`);
  lines.push(`SCORE: ${post.score}`);
  lines.push(`COMMENTS: ${post.num_comments}`);
  lines.push(`DATE: ${dateIso}`);
  if (post.flair) lines.push(`FLAIR: ${post.flair}`);
  if (post.post_type) lines.push(`POST TYPE: ${post.post_type}`);
  lines.push("");
  lines.push("POST BODY:");
  lines.push(post.selftext?.trim() || "(no body — link or media post)");

  if (comments.length > 0) {
    lines.push("");
    lines.push(`TOP COMMENTS (${comments.length}):`);
    for (const c of comments) {
      const author = c.author ? `u/${c.author}` : "anon";
      const date = new Date(c.created_utc * 1000).toISOString().slice(0, 10);
      lines.push(`---`);
      lines.push(`[${author} | ${c.score} pts | ${date}]`);
      lines.push(c.body.trim());
    }
  }

  lines.push("");
  lines.push("WHY THIS MATTERS: (analyzer to fill — focus on tools, workflows, pain points, opportunities)");
  lines.push("POSSIBLE USE CASE FOR MY BUSINESS: (analyzer to fill — content/product/ad/traffic angle)");

  return { post_id: post.id, reddit_id: post.reddit_id, text: lines.join("\n") };
}

/** Format every post above a signal threshold for a run. Convenience wrapper. */
export function formatRunPosts(runId: number, minScore = 0, maxComments = 10): FormattedPost[] {
  const ids = getDB().prepare(
    `SELECT DISTINCT p.id FROM reddit_posts p
       JOIN reddit_post_appearances a ON a.post_id = p.id
      WHERE a.run_id = ? AND COALESCE(p.signal_score, 0) >= ?
      ORDER BY p.signal_score DESC`
  ).all(runId, minScore) as { id: number }[];
  return ids.map((r) => formatPost(r.id, { runId, maxComments }));
}
