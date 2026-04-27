import { NextRequest, NextResponse } from "next/server";
import { aggregateCrossSource } from "@/lib/reddit/crossSourceAggregator";
import { listCrossSourceAggregates, getCrossSourceAggregate } from "@/lib/reddit/redditQueries";
import { parseJsonBody } from "@/lib/route-helpers";
import { getErrorMessage } from "@/lib/format-utils";

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
  const parsed = await parseJsonBody<{ label?: string; tiktokSearchId?: number | null; redditRunId?: number | null }>(req);
  if ("error" in parsed) return parsed.error;
  const { label, tiktokSearchId, redditRunId } = parsed.body ?? {};
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "label (string) required" }, { status: 400 });
  }
  if (tiktokSearchId == null && redditRunId == null) {
    return NextResponse.json({ error: "at least one of tiktokSearchId or redditRunId required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await aggregateCrossSource({ label, tiktokSearchId, redditRunId }));
  } catch (e) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
