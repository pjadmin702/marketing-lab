import { NextRequest, NextResponse } from "next/server";
import { listRuns } from "@/lib/reddit/redditQueries";
import { createRun } from "@/lib/reddit/redditIngestor";
import { parseJsonBody } from "@/lib/route-helpers";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<{ label?: string; notes?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { label, notes } = parsed.body ?? {};
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "label (string) required" }, { status: 400 });
  }
  return NextResponse.json({ run_id: createRun(label, notes) });
}
