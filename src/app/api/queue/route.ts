import { NextRequest, NextResponse } from "next/server";
import { listQueue, addToQueue, removeFromQueue, seedStarterSearches } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ items: listQueue() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { action, term, notes, priority } = (body ?? {}) as {
    action?: "add" | "seed";
    term?: string;
    notes?: string | null;
    priority?: number;
  };

  if (action === "seed") {
    const inserted = seedStarterSearches();
    return NextResponse.json({ inserted, items: listQueue() });
  }

  if (typeof term !== "string" || !term.trim()) {
    return NextResponse.json({ error: "term required" }, { status: 400 });
  }
  const item = addToQueue(term, notes ?? null, priority ?? 0);
  return NextResponse.json({ item, items: listQueue() });
}

export async function DELETE(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { id } = (body ?? {}) as { id?: number };
  if (typeof id !== "number") {
    return NextResponse.json({ error: "id (number) required" }, { status: 400 });
  }
  removeFromQueue(id);
  return NextResponse.json({ items: listQueue() });
}
