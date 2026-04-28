import { NextResponse } from "next/server";
import { runClaude } from "@/lib/claude";
import { listQueue, addSuggestedTerms, type QueueSuggestion } from "@/lib/queue";
import { getPlan } from "@/lib/plan";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are a TikTok research advisor for a solo Etsy seller.

Given the user's PLAN doc (containing their shop info, products, and goal) and a list of search terms they've ALREADY queued, suggest 5-10 NEW TikTok search terms that would help them research successful creators and tactics for their specific niche.

Rules:
- Tailor terms to the user's actual products (read the plan carefully — shop URLs, product descriptions, niche).
- Don't repeat terms already in the queue (case-insensitive substring matches count as duplicates too).
- Prefer NICHE-SPECIFIC terms (e.g. "polymer clay earring tiktok" if they sell polymer earrings) over GENERIC marketing terms (which they already have plenty of).
- For each suggestion, pick a category from this list when it fits:
  "Hooks & openings", "Content formats", "Funnel: TikTok → Etsy", "Content sustainability", "Tier 2: Foundation"
  Or invent a NEW niche-specific category like "Earrings niche", "3D printing makers", "Polymer clay", etc.
- Each note should be 1 line explaining WHY this search matters to this specific seller.

Return JSON only.`;

const SUGGEST_SCHEMA = {
  type: "object",
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        required: ["term", "category", "note"],
        properties: {
          term:     { type: "string" },
          category: { type: "string" },
          note:     { type: "string" },
        },
      },
    },
  },
};

export async function POST() {
  const plan = getPlan();
  if (!plan.content || plan.content.trim().length < 50) {
    return NextResponse.json(
      { error: "fill in your /plan doc first — Synth needs your shop info to tailor suggestions" },
      { status: 400 }
    );
  }

  const queue = listQueue();
  const queueLines = queue.map((q) => `- ${q.term}${q.category ? ` (${q.category})` : ""}`).join("\n");

  const userPrompt = [
    `# PLAN DOC`,
    plan.content,
    "",
    `# ALREADY QUEUED (${queue.length} terms — don't repeat)`,
    queueLines || "_empty_",
    "",
    `# YOUR TASK`,
    "Suggest 5-10 NEW TikTok search terms tailored to THIS seller's products and goal.",
  ].join("\n");

  try {
    const r = await runClaude<{ suggestions: QueueSuggestion[] }>({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schema: SUGGEST_SCHEMA,
      timeoutMs: 180_000,
    });

    const added = addSuggestedTerms(r.output.suggestions);
    return NextResponse.json({
      suggested: r.output.suggestions,
      added,
      cost_usd: r.cost_usd,
      items: listQueue(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
