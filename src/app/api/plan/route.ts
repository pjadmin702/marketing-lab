import { NextRequest, NextResponse } from "next/server";
import { getPlan, setPlan } from "@/lib/plan";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getPlan());
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { content } = (body ?? {}) as { content?: unknown };
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content (string) required" }, { status: 400 });
  }
  return NextResponse.json(setPlan(content));
}
