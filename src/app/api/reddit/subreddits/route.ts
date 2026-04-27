import { NextRequest, NextResponse } from "next/server";
import {
  listSubreddits, listGroups, addSubreddit, removeSubreddit, searchSubredditCatalog,
} from "@/lib/reddit/subredditManager";
import { parseJsonBody } from "@/lib/route-helpers";
import { getErrorMessage } from "@/lib/format-utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (q) return NextResponse.json({ subreddits: searchSubredditCatalog(q) });
  return NextResponse.json({ subreddits: listSubreddits(), groups: listGroups() });
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<{ name?: string; group?: string; notes?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { name, group, notes } = parsed.body ?? {};
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name (string) required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ subreddit: addSubreddit(name, group, notes) });
  } catch (e) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name query param required" }, { status: 400 });
  removeSubreddit(name);
  return NextResponse.json({ ok: true });
}
