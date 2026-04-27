import { NextRequest, NextResponse } from "next/server";
import { aggregateCrossSource } from "@/lib/reddit/crossSourceAggregator";
import { listCrossSourceAggregates, getCrossSourceAggregate } from "@/lib/reddit/redditQueries";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const row = getCrossSourceAggregate(Number(id));
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  return NextResponse.json({ aggregates: listCrossSourceAggregates() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { label, tiktokSearchId, redditRunId } = (body ?? {}) as {
    label?: string; tiktokSearchId?: number | null; redditRunId?: number | null;
  };
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "label (string) required" }, { status: 400 });
  }
  if (tiktokSearchId == null && redditRunId == null) {
    return NextResponse.json({ error: "at least one of tiktokSearchId or redditRunId required" }, { status: 400 });
  }
  try {
    const r = await aggregateCrossSource({ label, tiktokSearchId, redditRunId });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
