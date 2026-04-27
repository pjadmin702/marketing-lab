import { NextRequest, NextResponse } from "next/server";
import { researchSearch } from "@/lib/research-tools";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * POST /api/research-tool  body: { searchId: number, force?: boolean }
 *
 * For every canonical tool surfaced in this search, run a Claude WebSearch+
 * WebFetch call and fill in what_it_does / pricing / price_note /
 * official_url. Skips tools that have a researched_at timestamp unless
 * force=true.
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
    const report = await researchSearch(searchId, !!force);
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
