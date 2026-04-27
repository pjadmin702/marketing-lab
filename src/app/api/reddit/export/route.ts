/**
 * Export a Reddit run as markdown, json, or csv.
 *
 *   GET /api/reddit/export?runId=N&format=md
 *   GET /api/reddit/export?runId=N&format=json
 *   GET /api/reddit/export?runId=N&format=csv
 *   GET /api/reddit/export?crossId=N&format=md   (cross-source brief)
 */
import { NextRequest } from "next/server";
import { listPostsForRun, getRunAggregate, getRun, getCrossSourceAggregate } from "@/lib/reddit/redditQueries";
import { formatRunPosts } from "@/lib/reddit/redditFormatter";

export const runtime = "nodejs";

type Fmt = "md" | "json" | "csv";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

function postsToCsv(posts: ReturnType<typeof listPostsForRun>): string {
  const headers = [
    "id","reddit_id","subreddit","author","title","permalink","score","num_comments",
    "upvote_ratio","created_utc","signal_score","ranking_sources","has_analysis",
  ];
  const lines = [headers.join(",")];
  for (const p of posts) {
    lines.push([
      p.id, p.reddit_id, p.subreddit, p.author, p.title,
      `https://www.reddit.com${p.permalink}`,
      p.score, p.num_comments, p.upvote_ratio, p.created_utc,
      p.signal_score, p.ranking_sources.join("|"), p.has_analysis,
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

function runToMarkdown(runId: number): string {
  const run = getRun(runId);
  if (!run) return `# Run ${runId} not found`;
  const posts = listPostsForRun(runId, { limit: 500 });
  const agg = getRunAggregate(runId);

  const out: string[] = [];
  out.push(`# Reddit run: ${run.label}`);
  out.push(`Run ID: ${run.id}  ·  Created: ${new Date(run.created_at * 1000).toISOString()}`);
  out.push(`Posts: ${run.post_count}  ·  Analyzed: ${run.analyzed_count}  ·  Queries: ${run.query_count}`);
  out.push("");
  if (agg) {
    out.push("## Action plan");
    out.push(agg.action_plan_md || "_(empty)_");
    out.push("");
    out.push("## Tools");
    if (agg.tools.length === 0) out.push("_(none)_");
    for (const t of agg.tools) {
      out.push(`- **${t.name}** (${t.category}, ${t.best_confidence}) — posts: ${t.post_ids.join(", ")}`);
    }
    out.push("");
    out.push("## Pain points");
    for (const p of agg.pain_points) out.push(`- ${p.text} _(posts ${p.post_ids.join(", ")})_`);
    out.push("");
    out.push("## Workflows");
    for (const w of agg.workflows) out.push(`- **${w.name}** — ${w.summary} _(posts ${w.post_ids.join(", ")})_`);
    out.push("");
    out.push("## Opportunities");
    for (const o of agg.opportunities) out.push(`- [${o.kind}] ${o.description} — _${o.rationale}_`);
    out.push("");
  }
  out.push("## Posts");
  for (const p of posts) {
    out.push(`### r/${p.subreddit} — ${p.title}`);
    out.push(`Score ${p.score} · ${p.num_comments} comments · signal ${p.signal_score?.toFixed(2) ?? "-"} · sources: ${p.ranking_sources.join(", ")}`);
    out.push(`https://www.reddit.com${p.permalink}`);
    if (p.analyzed_summary) out.push(`> ${p.analyzed_summary}`);
    out.push("");
  }
  return out.join("\n");
}

function crossToMarkdown(crossId: number): string {
  const r = getCrossSourceAggregate(crossId);
  if (!r) return `# Cross-source ${crossId} not found`;
  return [
    `# ${r.label}`,
    `tiktok_search_id: ${r.tiktok_search_id ?? "-"}  ·  reddit_run_id: ${r.reddit_run_id ?? "-"}`,
    `Created: ${new Date(r.created_at * 1000).toISOString()}`,
    "",
    r.action_plan_md || "_(empty)_",
  ].join("\n");
}

export function GET(req: NextRequest) {
  const url = req.nextUrl;
  const format = (url.searchParams.get("format") ?? "md") as Fmt;
  const runId = url.searchParams.get("runId");
  const crossId = url.searchParams.get("crossId");

  if (crossId) {
    if (format === "json") {
      const r = getCrossSourceAggregate(Number(crossId));
      if (!r) return new Response("not found", { status: 404 });
      return Response.json(r);
    }
    if (format === "md") {
      return new Response(crossToMarkdown(Number(crossId)), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }
    return new Response("only md or json supported for cross-source", { status: 400 });
  }

  if (!runId) return new Response("runId or crossId required", { status: 400 });
  const id = Number(runId);

  if (format === "csv") {
    const posts = listPostsForRun(id, { limit: 5000 });
    return new Response(postsToCsv(posts), {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  if (format === "json") {
    return Response.json({
      run:  getRun(id),
      agg:  getRunAggregate(id),
      posts: listPostsForRun(id, { limit: 5000 }),
      formatted_posts: formatRunPosts(id, 0, 10).map((p) => ({ post_id: p.post_id, reddit_id: p.reddit_id, text: p.text })),
    });
  }
  return new Response(runToMarkdown(id), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
