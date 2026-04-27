import { NextRequest } from "next/server";
import { analyzeSearch } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * POST /api/analyze  body: { searchId: number, force?: boolean }
 *
 * Streams Server-Sent Events:
 *   event: progress  data: AnalyzeProgress
 *   event: done      data: AnalyzeReport
 *   event: error     data: { message }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return sseBadRequest("invalid json");
  }
  const { searchId, force, limit, skipAggregate } = (body ?? {}) as {
    searchId?: number;
    force?: boolean;
    limit?: number;
    skipAggregate?: boolean;
  };
  if (typeof searchId !== "number") {
    return sseBadRequest("searchId (number) required");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const report = await analyzeSearch(
          searchId,
          !!force,
          (e) => send("progress", e),
          { limit, skipAggregate },
        );
        send("done", report);
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
