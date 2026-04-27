/**
 * Tool research enrichment: for each canonical tool surfaced in the inventory,
 * run a Claude WebSearch+WebFetch call to fill in what_it_does, pricing,
 * price_note, and official_url.
 */
import { getDB } from "./db";
import { runClaude } from "./claude";

export const RESEARCH_SYSTEM = `You research a single SaaS or open-source tool by name and return verified facts. Use WebSearch and WebFetch to find the real product.

Disambiguation rules:
- The user is researching tools surfaced in TikTok content-creator videos. If multiple products share a name, pick the one most likely referenced in content-creation, video editing, AI generation, marketing automation, or developer-tooling contexts. Use the provided "context_quotes" to disambiguate.
- If you can't confidently identify the tool from web results (or it's clearly not a real product), set verified=false, leave fields null/unknown, and explain in notes.

Filling fields:
- what_it_does: ONE sentence, factual, no marketing fluff. Example: "AI video editing tool that auto-clips long videos into short-form."
- pricing: pick from {free, freemium, paid, unknown}. "freemium" = has both a free tier and paid tiers.
- price_note: concrete pricing if you can find it (e.g. "Free + Pro at $12/mo"); null if unknown.
- official_url: the canonical homepage URL. Prefer the root domain (https://example.com) over subpages.
- notes: any disambiguation caveats, version info, or warnings (1-2 sentences max).

Be terse. Don't editorialize. Don't recommend.`;

export const RESEARCH_SCHEMA = {
  type: "object",
  required: ["verified", "pricing"],
  properties: {
    verified:     { type: "boolean" },
    what_it_does: { type: ["string", "null"] },
    pricing:      { type: "string", enum: ["free", "freemium", "paid", "unknown"] },
    price_note:   { type: ["string", "null"] },
    official_url: { type: ["string", "null"] },
    notes:        { type: ["string", "null"] },
  },
};

export interface ResearchOutput {
  verified: boolean;
  what_it_does: string | null;
  pricing: "free" | "freemium" | "paid" | "unknown";
  price_note: string | null;
  official_url: string | null;
  notes: string | null;
}

export interface ResearchReport {
  searchId: number;
  results: { tool_id: number; name: string; status: "ok" | "skipped" | "error"; verified?: boolean; error?: string }[];
  skipped_low_signal: number;
  cost_usd: number;
}

export type ResearchProgress =
  | { kind: "start"; total: number }
  | {
      kind: "tool";
      completed: number;
      total: number;
      toolId: number;
      name: string;
      result: "ok" | "skipped" | "error";
      verified?: boolean;
      error?: string;
    };

interface ContextRow {
  raw_mention: string;
  video_title: string | null;
}

function getResearchContext(toolId: number, searchId: number): ContextRow[] {
  return getDB()
    .prepare(
      `SELECT tm.raw_mention, v.title AS video_title
         FROM tool_mentions tm
         JOIN videos v ON v.id = tm.video_id
        WHERE tm.tool_id = ? AND tm.search_id = ?
        ORDER BY tm.id ASC LIMIT 5`
    )
    .all(toolId, searchId) as ContextRow[];
}

function buildResearchPrompt(toolName: string, contexts: ContextRow[]): string {
  const lines = [
    `TOOL NAME: ${toolName}`,
    "",
    "context_quotes (verbatim mentions from TikTok transcripts that named this tool):",
  ];
  for (const c of contexts) {
    lines.push(`- ${c.video_title ? `(${c.video_title}) ` : ""}"${c.raw_mention}"`);
  }
  lines.push("", "Research this tool and return the structured response.");
  return lines.join("\n");
}

async function researchOne(toolId: number, name: string, contexts: ContextRow[]): Promise<{ out: ResearchOutput; cost: number }> {
  const r = await runClaude<ResearchOutput>({
    systemPrompt: RESEARCH_SYSTEM,
    userPrompt: buildResearchPrompt(name, contexts),
    schema: RESEARCH_SCHEMA,
    allowedTools: ["WebSearch", "WebFetch"],
    timeoutMs: 300_000,
  });
  return { out: r.output, cost: r.cost_usd };
}

function persistResearch(toolId: number, out: ResearchOutput): void {
  // Even if not verified we still timestamp so we don't infinitely retry.
  // Fields stay null when unverified so the UI can show them as unresearched.
  getDB()
    .prepare(
      `UPDATE tools
          SET what_it_does  = COALESCE(?, what_it_does),
              pricing       = ?,
              price_note    = COALESCE(?, price_note),
              official_url  = COALESCE(?, official_url),
              researched_at = strftime('%s','now')
        WHERE id = ?`
    )
    .run(
      out.verified ? out.what_it_does : null,
      out.verified ? out.pricing : "unknown",
      out.verified ? out.price_note : null,
      out.verified ? out.official_url : null,
      toolId,
    );
}

interface ToolToResearch {
  id: number;
  name: string;
}

export async function researchSearch(
  searchId: number,
  force = false,
  onProgress?: (event: ResearchProgress) => void,
): Promise<ResearchReport> {
  const db = getDB();
  const search = db.prepare("SELECT id FROM searches WHERE id = ?").get(searchId);
  if (!search) throw new Error(`search ${searchId} not found`);

  // Skip tools only mentioned in low-signal-density videos (default 20%).
  // Tools mentioned in even ONE high-signal video pass the filter.
  // RESEARCH_MIN_SIGNAL=0 disables the filter entirely.
  const minSignal = Number(process.env.RESEARCH_MIN_SIGNAL ?? "0.2");

  const allTools = db
    .prepare(
      `SELECT t.id, t.name, t.researched_at,
              MAX(COALESCE(va.signal_density, 0)) AS max_signal
         FROM tools t
         JOIN tool_mentions tm ON tm.tool_id = t.id
    LEFT JOIN video_analyses va ON va.video_id = tm.video_id
        WHERE tm.search_id = ?
     GROUP BY t.id`
    )
    .all(searchId) as Array<ToolToResearch & { researched_at: number | null; max_signal: number }>;

  const tools = allTools.filter((t) => t.max_signal >= minSignal);
  const skippedLowSignal = allTools.length - tools.length;

  const report: ResearchReport = { searchId, results: [], skipped_low_signal: skippedLowSignal, cost_usd: 0 };
  const total = tools.length;
  let completed = 0;

  onProgress?.({ kind: "start", total });

  // Concurrency: web-search-bound, so going high helps until you hit
  // Anthropic's WebSearch rate gate. Default 3 is conservative; 6-8 is
  // usually safe on a Max subscription. Tune via RESEARCH_CONCURRENCY.
  const CONCURRENCY = Math.max(1, Number(process.env.RESEARCH_CONCURRENCY) || 3);
  const queue = tools.filter((t) => force || !t.researched_at);
  const skipped = tools.filter((t) => !force && t.researched_at);
  for (const t of skipped) {
    report.results.push({ tool_id: t.id, name: t.name, status: "skipped" });
    completed++;
    onProgress?.({
      kind: "tool", completed, total,
      toolId: t.id, name: t.name, result: "skipped",
    });
  }

  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const idx = i++;
      const t = queue[idx];
      try {
        const ctx = getResearchContext(t.id, searchId);
        const { out, cost } = await researchOne(t.id, t.name, ctx);
        persistResearch(t.id, out);
        report.cost_usd += cost;
        report.results.push({ tool_id: t.id, name: t.name, status: "ok", verified: out.verified });
        completed++;
        onProgress?.({
          kind: "tool", completed, total,
          toolId: t.id, name: t.name, result: "ok", verified: out.verified,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        report.results.push({ tool_id: t.id, name: t.name, status: "error", error: errMsg });
        completed++;
        onProgress?.({
          kind: "tool", completed, total,
          toolId: t.id, name: t.name, result: "error", error: errMsg,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  // Sort results by tool name for stable output
  report.results.sort((a, b) => a.name.localeCompare(b.name));
  return report;
}
