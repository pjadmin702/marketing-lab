import { NextRequest, NextResponse } from "next/server";
import { generateBrief, listBriefs } from "@/lib/synth";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function GET() {
  return NextResponse.json({ briefs: listBriefs() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { question, kind } = (body ?? {}) as { question?: string; kind?: string };
  const briefKind = kind === "systems" ? "systems" : "sprint";
  try {
    const brief = await generateBrief(briefKind, question?.trim() || null);
    return NextResponse.json({ brief });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
