import { NextRequest, NextResponse } from "next/server";
import { findOrCreateSearch, ingestUrls } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { searchTerm, searchId, urls, notes } = (body ?? {}) as {
    searchTerm?: string;
    searchId?: number;
    urls?: unknown;
    notes?: string;
  };

  if (!Array.isArray(urls) || urls.length === 0 || !urls.every((u) => typeof u === "string")) {
    return NextResponse.json({ error: "urls[] required (non-empty array of strings)" }, { status: 400 });
  }
  if (!searchId && !searchTerm) {
    return NextResponse.json({ error: "searchTerm or searchId required" }, { status: 400 });
  }

  const finalSearchId = searchId ?? findOrCreateSearch(searchTerm!, notes);
  const results = await ingestUrls(finalSearchId, urls as string[]);
  return NextResponse.json({ searchId: finalSearchId, results });
}
