/**
 * On-demand top-comments fetch for a single Reddit post.
 *
 * The bulk path is the ingestor's signal-threshold gate; this exists so the
 * dashboard can pull comments for an individual post the user marks as
 * interesting without re-running the whole ingest.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { redditGet, parseComments, RedditBlockedError, type RedditPostRaw } from "@/lib/reddit/redditClient";
import { scorePost } from "@/lib/reddit/redditRanker";
import { parseJsonBody } from "@/lib/route-helpers";
import { getErrorMessage } from "@/lib/format-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_COMMENTS = 30;

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<{ postId?: number; limit?: number }>(req);
  if ("error" in parsed) return parsed.error;
  const { postId, limit } = parsed.body ?? {};
  if (typeof postId !== "number") {
    return NextResponse.json({ error: "postId (number) required" }, { status: 400 });
  }
  const want = Math.min(MAX_COMMENTS, Math.max(1, limit ?? 20));

  const post = getDB().prepare(
    `SELECT id, permalink, raw_json FROM reddit_posts WHERE id = ?`
  ).get(postId) as { id: number; permalink: string; raw_json: string } | undefined;
  if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });

  const path = `${post.permalink.replace(/^https?:\/\/[^/]+/, "")}.json?limit=${want}&sort=top`;

  try {
    const res = await redditGet(path);
    if (res.status !== 200) {
      return NextResponse.json({ error: `reddit returned ${res.status}` }, { status: 502 });
    }
    const comments = parseComments(res.body, want);

    const stmt = getDB().prepare(
      `INSERT INTO reddit_comments (reddit_comment_id, post_id, parent_id, author, body, score, created_utc, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(reddit_comment_id) DO UPDATE SET body = excluded.body, score = excluded.score`
    );
    const tx = getDB().transaction((rows: typeof comments) => {
      for (const c of rows) stmt.run(c.id, post.id, c.parent_id, c.author, c.body, c.score, c.created_utc, JSON.stringify(c));
    });
    tx(comments);

    // Re-score now that we have comments.
    const raw = JSON.parse(post.raw_json) as RedditPostRaw;
    const newScore = scorePost({ post: raw, comments }).signal_score;
    getDB().prepare(`UPDATE reddit_posts SET signal_score = ? WHERE id = ?`).run(newScore, post.id);

    return NextResponse.json({ post_id: post.id, comments_inserted: comments.length, signal_score: newScore });
  } catch (e) {
    const status = e instanceof RedditBlockedError ? 502 : 500;
    return NextResponse.json({ error: getErrorMessage(e) }, { status });
  }
}
