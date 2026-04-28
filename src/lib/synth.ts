import { getDB } from "./db";
import { runClaude } from "./claude";
import { getPlan } from "./plan";

export interface SynthBrief {
  id: number;
  question: string | null;
  content_md: string;
  cost_usd: number;
  library_size: number;
  source_searches: number;
  created_at: number;
}

const SYSTEM_PROMPT = `You are a content-strategy advisor for a solo Etsy seller who wants organic TikTok traffic to their shop.

You're given:
1. Their PLAN doc — goal, products, what they're trying to do
2. A LIBRARY of methods, hooks, frameworks, viral signals, and tools extracted from successful TikTok creators (filtered to high-signal sources only)
3. Recent ACTION PLANS that prior /api/analyze runs produced for them

Your job: produce a 7-day content sprint they can execute starting today. They will shoot, edit (with AI tools), and post one video per day.

For each of 7 days, give:
- DAY N
- VIDEO IDEA — one specific idea tailored to their products
- HOOK — exact first-3-second line, citing which library hook formula it's based on
- FORMAT — POV / voiceover / talking head / B-roll / etc.
- WHY IT WORKS — cite evidence from the library (mention counts, source creators)
- SHOT LIST — 3-5 specific shots they need to film
- CAPTION + CTA — drives them to the bio link
- POSTING TIPS — best time, sounds, hashtags

After the 7 days, end with:
- WEEKLY POSTING STRATEGY — cadence, batching tips
- WHAT TO MEASURE — which numbers tell them it's working
- NEXT WEEK'S FOCUS — what to double down on or pivot to

Rules:
- Be specific and concrete. No "consider doing X." Tell them exactly what to do.
- Cite the library when you make claims ("hook X appeared in 5 videos across 2 searches").
- Match the ideas to THEIR products (read the plan doc carefully).
- Don't recommend tools you don't see in the LIBRARY TOOLS section.
- Output Markdown. Use ## for day headers, **bold** for key fields.
- No fluff. No "I hope this helps."`;

interface LibraryEntity {
  name: string;
  description: string | null;
  video_count: number;
  search_count: number;
}

function topEntities(table: string, mentionTable: string, fk: string, limit = 20, minSignal = 0.4): LibraryEntity[] {
  return getDB()
    .prepare(
      `SELECT e.name, e.description,
              COUNT(DISTINCT m.video_id)  AS video_count,
              COUNT(DISTINCT m.search_id) AS search_count
         FROM ${table} e
         JOIN ${mentionTable} m ON m.${fk} = e.id
    LEFT JOIN video_analyses va ON va.video_id = m.video_id
        WHERE COALESCE(va.signal_density, 0) >= ?
     GROUP BY e.id
     ORDER BY video_count DESC, search_count DESC
        LIMIT ?`
    )
    .all(minSignal, limit) as LibraryEntity[];
}

function topTools(limit = 25, minSignal = 0.4): Array<LibraryEntity & { pricing: string | null; what_it_does: string | null; official_url: string | null }> {
  return getDB()
    .prepare(
      `SELECT t.name, t.what_it_does AS description,
              t.what_it_does, t.pricing, t.official_url,
              COUNT(DISTINCT tm.video_id)  AS video_count,
              COUNT(DISTINCT tm.search_id) AS search_count
         FROM tools t
         JOIN tool_mentions tm ON tm.tool_id = t.id
    LEFT JOIN video_analyses va ON va.video_id = tm.video_id
        WHERE COALESCE(va.signal_density, 0) >= ?
     GROUP BY t.id
     ORDER BY video_count DESC, search_count DESC
        LIMIT ?`
    )
    .all(minSignal, limit) as Array<LibraryEntity & { pricing: string | null; what_it_does: string | null; official_url: string | null }>;
}

function recentActionPlans(limit = 5): Array<{ search_term: string; action_plan_md: string }> {
  return getDB()
    .prepare(
      `SELECT s.term AS search_term, a.action_plan_md
         FROM aggregate_analyses a
         JOIN searches s ON s.id = a.search_id
        WHERE a.action_plan_md IS NOT NULL AND a.action_plan_md != ''
        ORDER BY a.created_at DESC
        LIMIT ?`
    )
    .all(limit) as Array<{ search_term: string; action_plan_md: string }>;
}

function fmtList(items: LibraryEntity[]): string {
  return items
    .map((it) => `- **${it.name}** (${it.video_count} videos / ${it.search_count} searches)${it.description ? ` — ${truncate(it.description, 200)}` : ""}`)
    .join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function buildUserPrompt(question: string | null): { prompt: string; librarySize: number; sourceSearches: number } {
  const plan = getPlan();
  const methods       = topEntities("methods",       "method_mentions",       "method_id");
  const hooks         = topEntities("hooks",         "hook_mentions",         "hook_id");
  const frameworks    = topEntities("frameworks",    "framework_mentions",    "framework_id");
  const systems       = topEntities("systems",       "system_mentions",       "system_id");
  const viralSignals  = topEntities("viral_signals", "viral_signal_mentions", "viral_signal_id");
  const speedTactics  = topEntities("speed_tactics", "speed_tactic_mentions", "speed_tactic_id");
  const pitfalls      = topEntities("pitfalls",      "pitfall_mentions",      "pitfall_id");
  const tools         = topTools();
  const actionPlans   = recentActionPlans();

  const librarySize =
    methods.length + hooks.length + frameworks.length + systems.length +
    viralSignals.length + speedTactics.length + pitfalls.length + tools.length;

  const sourceSearches = (getDB()
    .prepare("SELECT COUNT(*) as c FROM aggregate_analyses")
    .get() as { c: number }).c;

  const sections = [
    `# PLAN`,
    plan.content || "_no plan doc yet_",
    "",
    question ? `# THIS BRIEF'S FOCUS\n\n${question}\n` : "",
    `# LIBRARY (top entities, sorted by mention count, high-signal sources only)`,
    "",
    `## Hooks (top ${hooks.length})`,
    fmtList(hooks),
    "",
    `## Methods (top ${methods.length})`,
    fmtList(methods),
    "",
    `## Frameworks (top ${frameworks.length})`,
    fmtList(frameworks),
    "",
    `## Systems (top ${systems.length})`,
    fmtList(systems),
    "",
    `## Viral signals (top ${viralSignals.length})`,
    fmtList(viralSignals),
    "",
    `## Speed-to-publish tactics (top ${speedTactics.length})`,
    fmtList(speedTactics),
    "",
    `## Pitfalls to avoid (top ${pitfalls.length})`,
    fmtList(pitfalls),
    "",
    `## Tools (top ${tools.length})`,
    tools.map((t) =>
      `- **${t.name}** [${t.pricing ?? "?"}] (${t.video_count} videos)${t.what_it_does ? ` — ${truncate(t.what_it_does, 200)}` : ""}${t.official_url ? ` · ${t.official_url}` : ""}`
    ).join("\n"),
    "",
    `# PRIOR ACTION PLANS (most recent ${actionPlans.length})`,
    actionPlans.map((p) => `## From search: "${p.search_term}"\n\n${p.action_plan_md}`).join("\n\n---\n\n"),
    "",
    `# YOUR TASK`,
    "",
    "Generate the 7-day content sprint as instructed in the system prompt. Tailor every idea to the products described in the PLAN.",
  ].filter(Boolean);

  return { prompt: sections.join("\n"), librarySize, sourceSearches };
}

export async function generateBrief(question?: string | null): Promise<SynthBrief> {
  const { prompt, librarySize, sourceSearches } = buildUserPrompt(question ?? null);

  const r = await runClaude<{ content_md: string }>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: prompt,
    schema: {
      type: "object",
      required: ["content_md"],
      properties: {
        content_md: { type: "string" },
      },
    },
    timeoutMs: 600_000,
  });

  const db = getDB();
  const insert = db.prepare(
    `INSERT INTO synth_briefs (question, content_md, cost_usd, library_size, source_searches)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, question, content_md, cost_usd, library_size, source_searches, created_at`
  );
  return insert.get(question ?? null, r.output.content_md, r.cost_usd, librarySize, sourceSearches) as SynthBrief;
}

export function listBriefs(): SynthBrief[] {
  return getDB()
    .prepare(
      `SELECT id, question, content_md, cost_usd, library_size, source_searches, created_at
         FROM synth_briefs
        ORDER BY created_at DESC, id DESC`
    )
    .all() as SynthBrief[];
}

export function getBrief(id: number): SynthBrief | null {
  return (getDB()
    .prepare(
      `SELECT id, question, content_md, cost_usd, library_size, source_searches, created_at
         FROM synth_briefs WHERE id = ?`
    )
    .get(id) as SynthBrief | undefined) ?? null;
}

export function deleteBrief(id: number): void {
  getDB().prepare("DELETE FROM synth_briefs WHERE id = ?").run(id);
}
