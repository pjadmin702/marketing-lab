import { NextRequest, NextResponse } from "next/server";
import {
  listSubreddits, listGroups, addSubreddit, removeSubreddit, searchSubredditCatalog,
} from "@/lib/reddit/subredditManager";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (q) return NextResponse.json({ subreddits: searchSubredditCatalog(q) });
  return NextResponse.json({ subreddits: listSubreddits(), groups: listGroups() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { name, group, notes } = (body ?? {}) as { name?: string; group?: string; notes?: string };
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name (string) required" }, { status: 400 });
  }
  try {
    const row = addSubreddit(name, group, notes);
    return NextResponse.json({ subreddit: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name query param required" }, { status: 400 });
  removeSubreddit(name);
  return NextResponse.json({ ok: true });
}
