import { NextRequest } from "next/server";
import { findOrCreateSearch, ingestUrls } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * POST /api/ingest  body: { searchTerm?: string, searchId?: number, urls: string[], notes?: string }
 *
 * Streams Server-Sent Events:
 *   event: progress  data: IngestProgress
 *   event: done      data: { searchId, results }
 *   event: error     data: { message }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return sseBadRequest("invalid json body");
  }

  const { searchTerm, searchId, urls, notes } = (body ?? {}) as {
    searchTerm?: string;
    searchId?: number;
    urls?: unknown;
    notes?: string;
  };

  if (!Array.isArray(urls) || urls.length === 0 || !urls.every((u) => typeof u === "string")) {
    return sseBadRequest("urls[] required (non-empty array of strings)");
  }
  if (!searchId && !searchTerm) {
    return sseBadRequest("searchTerm or searchId required");
  }

  const finalSearchId = searchId ?? findOrCreateSearch(searchTerm!, notes);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const results = await ingestUrls(finalSearchId, urls as string[], (e) => send("progress", e));
        send("done", { searchId: finalSearchId, results });
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function sseBadRequest(message: string): Response {
  const body = `event: error\ndata: ${JSON.stringify({ message })}\n\n`;
  return new Response(body, {
    status: 400,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}
