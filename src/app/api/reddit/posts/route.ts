import { NextRequest, NextResponse } from "next/server";
import { listPostsForRun } from "@/lib/reddit/redditQueries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const runId = Number(url.searchParams.get("runId"));
  if (!Number.isFinite(runId)) {
    return NextResponse.json({ error: "runId query param (number) required" }, { status: 400 });
  }
  const minScore = url.searchParams.get("minScore");
  const limit = url.searchParams.get("limit");
  const posts = listPostsForRun(runId, {
    minScore: minScore != null ? Number(minScore) : undefined,
    limit:    limit    != null ? Number(limit)    : undefined,
  });
  return NextResponse.json({ posts });
}
