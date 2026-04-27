import { NextRequest, NextResponse } from "next/server";
import { analyzeRun } from "@/lib/reddit/redditAnalyze";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { runId, force, postIds } = (body ?? {}) as { runId?: number; force?: boolean; postIds?: number[] };
  if (typeof runId !== "number") {
    return NextResponse.json({ error: "runId (number) required" }, { status: 400 });
  }
  if (postIds && !postIds.every((n) => typeof n === "number")) {
    return NextResponse.json({ error: "postIds must be number[]" }, { status: 400 });
  }
  try {
    const report = await analyzeRun(runId, { force: !!force, postIds });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
