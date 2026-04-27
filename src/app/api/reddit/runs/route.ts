import { NextRequest, NextResponse } from "next/server";
import { listRuns } from "@/lib/reddit/redditQueries";
import { createRun } from "@/lib/reddit/redditIngestor";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { label, notes } = (body ?? {}) as { label?: string; notes?: string };
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "label (string) required" }, { status: 400 });
  }
  const id = createRun(label, notes);
  return NextResponse.json({ run_id: id });
}
