import { NextRequest, NextResponse } from "next/server";
import { analyzeRun } from "@/lib/reddit/redditAnalyze";
import { parseJsonBody } from "@/lib/route-helpers";
import { getErrorMessage } from "@/lib/format-utils";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<{ runId?: number; force?: boolean; postIds?: number[] }>(req);
  if ("error" in parsed) return parsed.error;
  const { runId, force, postIds } = parsed.body ?? {};
  if (typeof runId !== "number") {
    return NextResponse.json({ error: "runId (number) required" }, { status: 400 });
  }
  if (postIds && !postIds.every((n) => typeof n === "number")) {
    return NextResponse.json({ error: "postIds must be number[]" }, { status: 400 });
  }
  try {
    return NextResponse.json(await analyzeRun(runId, { force: !!force, postIds }));
  } catch (e) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
