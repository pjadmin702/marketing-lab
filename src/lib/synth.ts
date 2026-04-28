import { getDB } from "./db";
import { runClaude } from "./claude";
import { getPlan } from "./plan";

export type BriefKind = "sprint" | "systems";

export interface SynthBrief {
  id: number;
  kind: BriefKind;
  question: string | null;
  content_md: string;
  cost_usd: number;
  library_size: number;
  source_searches: number;
  created_at: number;
}

const SPRINT_SYSTEM_PROMPT = `You are a content-strategy advisor for a solo Etsy seller who wants organic TikTok traffic to their shop.

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

const SYSTEMS_SYSTEM_PROMPT = `You are a software architect advising a solo Etsy seller who wants to build AI tools to automate their content marketing pipeline. Their primary build tool is Claude Code (the CLI).

You're given:
1. Their PLAN doc — goal, products, current bottlenecks, tools-they-want-to-build wishlist
2. A LIBRARY of methods, systems, and tools extracted from successful TikTok creators
3. Recent ACTION PLANS

Your job: propose 3-5 concrete software systems they could build to accomplish their plan. Each system should be:
- Targeted at a SPECIFIC bottleneck from the plan (cite which one)
- Buildable with Claude Code in 1-3 sessions (1-15 hours of dev work total)
- Preferring tools from the LIBRARY where possible (cite mention counts as evidence)
- Sized for a solo operator — no microservices, no Kubernetes

For each system, output the following sections (Markdown):

## System name (short, memorable)

**Pitch:** One sentence describing what it does.

**Solves:** Which bottleneck from the plan this addresses, in plain English. Quote the plan when relevant.

**Inputs / Outputs:**
- Input: ...
- Output: ...

**Tech stack:**
- List specific tools/libraries/APIs. Prefer items from /library tools (cite mention counts: "Remotion — 7 videos / 2 searches").

**Implementation steps:**
1. ...
2. ...
(5-10 concrete steps Claude Code could execute. Be opinionated — pick one approach, don't list alternatives.)

**Effort:** ~X hours of dev work

**Repo structure:**
\`\`\`
repo-name/
├── package.json
├── src/
│   ├── ...
└── README.md
\`\`\`

**Why this over alternatives:** 1-2 sentences on why this approach beats the obvious alternative.

**Why it accomplishes the plan:** 1-2 sentences linking back to specific plan goals.

---

After all systems, end with:

## Recommended starting order

A ranked list (#1 to #N) of which to build first, with one-sentence justification per item based on highest-leverage-first ordering — what unblocks the most other work or addresses the biggest plan bottleneck.

Rules:
- Be concrete and shippable. Not "consider integrating X." Tell them exactly what files and folders to create.
- Cite library evidence by mention count.
- Match the scope to "I'm a solo seller" — no enterprise-grade stuff.
- Don't propose any system whose tech stack relies on tools NOT in the library, unless it's a standard library (next.js, ffmpeg, etc.).
- Output Markdown only. No "I hope this helps."`;

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
    `# LIBRARY (top entities by mention count, high-signal sources only)`,
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
    "Follow the instructions in the system prompt. Tailor every recommendation to the products and bottlenecks described in the PLAN. Output Markdown only.",
  ].filter(Boolean);

  return { prompt: sections.join("\n"), librarySize, sourceSearches };
}

export async function generateBrief(kind: BriefKind, question?: string | null): Promise<SynthBrief> {
  const { prompt, librarySize, sourceSearches } = buildUserPrompt(question ?? null);
  const systemPrompt = kind === "systems" ? SYSTEMS_SYSTEM_PROMPT : SPRINT_SYSTEM_PROMPT;

  const r = await runClaude<{ content_md: string }>({
    systemPrompt,
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
    `INSERT INTO synth_briefs (kind, question, content_md, cost_usd, library_size, source_searches)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id, kind, question, content_md, cost_usd, library_size, source_searches, created_at`
  );
  return insert.get(kind, question ?? null, r.output.content_md, r.cost_usd, librarySize, sourceSearches) as SynthBrief;
}

export function listBriefs(): SynthBrief[] {
  return getDB()
    .prepare(
      `SELECT id, kind, question, content_md, cost_usd, library_size, source_searches, created_at
         FROM synth_briefs
        ORDER BY created_at DESC, id DESC`
    )
    .all() as SynthBrief[];
}

export function getBrief(id: number): SynthBrief | null {
  return (getDB()
    .prepare(
      `SELECT id, kind, question, content_md, cost_usd, library_size, source_searches, created_at
         FROM synth_briefs WHERE id = ?`
    )
    .get(id) as SynthBrief | undefined) ?? null;
}

export function deleteBrief(id: number): void {
  getDB().prepare("DELETE FROM synth_briefs WHERE id = ?").run(id);
}
