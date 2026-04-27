import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export const runtime = "nodejs";

/**
 * DELETE /api/searches/[id]
 *
 * Removes the search row. ON DELETE CASCADE on every dependent table
 * (videos, transcripts, video_analyses, tool_mentions, *_mentions for
 * the knowledge graph, aggregate_analyses) cleans up the rest.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "id must be a number" }, { status: 400 });
  }
  const r = getDB().prepare("DELETE FROM searches WHERE id = ?").run(numId);
  if (r.changes === 0) {
    return NextResponse.json({ error: "search not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: numId });
}
