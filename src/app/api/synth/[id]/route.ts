import { NextResponse } from "next/server";
import { getBrief, deleteBrief } from "@/lib/synth";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const brief = getBrief(Number(id));
  if (!brief) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ brief });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  deleteBrief(Number(id));
  return NextResponse.json({ deleted: Number(id) });
}
