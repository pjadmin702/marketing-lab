import { NextRequest, NextResponse } from "next/server";
import { analyzeSearch } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * POST /api/analyze  body: { searchId: number, force?: boolean }
 *
 * Runs the two-pass analysis: per-video extraction (skipped if already
 * analyzed unless force=true) + aggregate synthesis. Persists to
 * video_analyses, tools, tool_mentions, aggregate_analyses.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { searchId, force } = (body ?? {}) as { searchId?: number; force?: boolean };
  if (typeof searchId !== "number") {
    return NextResponse.json({ error: "searchId (number) required" }, { status: 400 });
  }
  try {
    const report = await analyzeSearch(searchId, !!force);
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
