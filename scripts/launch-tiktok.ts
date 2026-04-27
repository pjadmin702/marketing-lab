/**
 * Launches a real Chromium window at a TikTok search.
 * Uses a persistent profile so logins stick across runs.
 *
 * Args: <searchTerm> [searchId]
 *
 * The browser stays open until the user closes it. In Chunk 6 we'll
 * inject the click-to-select overlay and wire sendToLab() back to
 * /api/ingest via Playwright's exposeFunction.
 */
import { chromium } from "playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";

const PROFILE_DIR = path.join(process.cwd(), "playwright-profile");
const APP_BASE    = process.env.APP_BASE || "http://localhost:3000";

async function main() {
  const term = process.argv[2];
  const searchId = process.argv[3] ? Number(process.argv[3]) : undefined;
  if (!term) {
    console.error("usage: launch-tiktok <searchTerm> [searchId]");
    process.exit(2);
  }

  mkdirSync(PROFILE_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });

  // Expose a callback so a future overlay (Chunk 6) can post selected URLs
  // back to /api/ingest without dealing with CORS.
  await ctx.exposeFunction("sendToLab", async (urls: string[]) => {
    try {
      const res = await fetch(`${APP_BASE}/api/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchId ? { searchId, urls } : { searchTerm: term, urls }),
      });
      const json = await res.json();
      console.log(`[sendToLab] ${urls.length} url(s) -> /api/ingest:`, JSON.stringify(json));
      return json;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[sendToLab] failed: ${msg}`);
      return { error: msg };
    }
  });

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const url = `https://www.tiktok.com/search?q=${encodeURIComponent(term)}`;
  console.log(`[launch] opening ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});

  // Stay alive until the user closes the browser.
  await new Promise<void>((resolve) => ctx.on("close", () => resolve()));
  console.log("[launch] context closed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
