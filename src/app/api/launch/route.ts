import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import path from "node:path";
import { findOrCreateSearch } from "@/lib/ingest";

export const runtime = "nodejs";

/**
 * POST /api/launch  body: { searchTerm: string }
 *
 * Spawns scripts/launch-tiktok.ts as a detached child so it survives this
 * request and any Next.js dev-server reloads. The browser window stays open
 * until the user closes it.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { searchTerm, notes } = (body ?? {}) as { searchTerm?: string; notes?: string };
  if (!searchTerm || typeof searchTerm !== "string" || !searchTerm.trim()) {
    return NextResponse.json({ error: "searchTerm required" }, { status: 400 });
  }

  const searchId = findOrCreateSearch(searchTerm.trim(), notes);

  const logPath = path.join(process.cwd(), "data", `launch-${searchId}.log`);
  const out = openSync(logPath, "a");
  const err = openSync(logPath, "a");

  const child = spawn(
    "npx",
    ["tsx", "scripts/launch-tiktok.ts", searchTerm, String(searchId)],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", out, err],
      env: { ...process.env, APP_BASE: process.env.APP_BASE || "http://localhost:3000" },
    }
  );
  child.unref();

  return NextResponse.json({ searchId, pid: child.pid, logPath });
}
