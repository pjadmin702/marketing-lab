/**
 * Reddit-flavored Claude prompts. The TikTok prompts target transcripts of
 * short-form videos with a funnel-detection lens; Reddit threads need a
 * different lens — pain points, workflows, "what worked", tool stacks.
 */
import { TOOL_CATEGORIES, CONFIDENCE_LEVELS } from "../analyze-prompts";

/* ------------------------------------------- per-post --------------------- */

export const REDDIT_PER_POST_SYSTEM = `You are reading a single Reddit post (and optionally its top comments) so the user can build a marketing-intelligence brief: what tools are working, what workflows people run, what pain points keep coming up, and what concrete opportunities exist for content/products.

The user's primary goal: discover what smart people are doing right now — AI tools, automation methods, content/video strategies, TikTok/Etsy traffic plays — before they go mainstream.

For the structured response:

1. summary — one or two sentences on what this post is actually about.

2. signal_density (0.0 to 1.0): fraction of the post that contains concrete actionable info (specific tools, prompts, numbers, steps, settings). Use the scale:
   - 0.85+ : detailed walkthrough or postmortem with specifics
   - 0.5   : useful but mixed with hype/venting
   - 0.2   : mostly question or rant, little concrete content
   - 0.0   : pure meme, drama, or one-liner

3. pain_points: array of distinct user pain points expressed in the post or comments. Be specific — "Etsy SEO is a black box" is good, "marketing is hard" is too vague. Include verbatim quote when useful.

4. workflows: array of concrete workflows / pipelines / multi-step setups described. For each:
   - name: short label (e.g. "n8n + Airtable content scheduler")
   - steps: 2–6 ordered steps as strings
   - source_quote: a representative verbatim line, max 240 chars

5. opportunities: array of distinct opportunities the user could act on. For each:
   - kind: one of "content_idea" | "product_idea" | "ad_test" | "traffic_play" | "tool_to_install" | "experiment"
   - description: one sentence on what to do
   - rationale: why this is worth doing (1 sentence, grounded in the post)

6. tools_mentioned: every tool / service / library named, including in comments. For EACH:
   - name: canonical capitalization (e.g. "n8n", "Claude", "Submagic")
   - category: pick one from the enum
   - confidence:
       demoed         = the author or a top commenter describes actually using it with steps/settings
       named_specific = named with concrete usage details
       name_drop      = mentioned without details
       pitch_bait     = mentioned only as part of a sales pitch / "DM me"
   - raw_mention: verbatim quote, max 240 chars
   - what_it_does: one sentence based on context (don't invent if context is empty)

Be precise. If something isn't in the text, leave it empty rather than inventing it. Penalize meme/joke/drama posts in signal_density.`;

export const REDDIT_PER_POST_SCHEMA = {
  type: "object",
  required: ["summary", "signal_density", "pain_points", "workflows", "opportunities", "tools_mentioned"],
  properties: {
    summary:        { type: "string" },
    signal_density: { type: "number", minimum: 0, maximum: 1 },
    pain_points: {
      type: "array",
      items: {
        type: "object",
        required: ["text"],
        properties: {
          text:   { type: "string" },
          quote:  { type: "string", maxLength: 280 },
        },
      },
    },
    workflows: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "steps"],
        properties: {
          name:         { type: "string" },
          steps:        { type: "array", items: { type: "string" } },
          source_quote: { type: "string", maxLength: 280 },
        },
      },
    },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "description", "rationale"],
        properties: {
          kind:        { type: "string", enum: ["content_idea", "product_idea", "ad_test", "traffic_play", "tool_to_install", "experiment"] },
          description: { type: "string" },
          rationale:   { type: "string" },
        },
      },
    },
    tools_mentioned: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "category", "confidence", "raw_mention", "what_it_does"],
        properties: {
          name:         { type: "string" },
          category:     { type: "string", enum: [...TOOL_CATEGORIES] },
          confidence:   { type: "string", enum: [...CONFIDENCE_LEVELS] },
          raw_mention:  { type: "string", maxLength: 280 },
          what_it_does: { type: "string" },
        },
      },
    },
  },
};

export interface RedditPerPostOutput {
  summary: string;
  signal_density: number;
  pain_points: { text: string; quote?: string }[];
  workflows: { name: string; steps: string[]; source_quote?: string }[];
  opportunities: {
    kind: "content_idea" | "product_idea" | "ad_test" | "traffic_play" | "tool_to_install" | "experiment";
    description: string;
    rationale: string;
  }[];
  tools_mentioned: {
    name: string;
    category: typeof TOOL_CATEGORIES[number];
    confidence: typeof CONFIDENCE_LEVELS[number];
    raw_mention: string;
    what_it_does: string;
  }[];
}

/* ------------------------------------------- aggregate (Reddit only) ----- */

export const REDDIT_AGGREGATE_SYSTEM = `You're synthesizing per-post analyses from a Reddit ingest run into a prioritized action plan.

The user wants to know:
- What tools and workflows are people praising right now?
- What pain points keep coming up that I could solve, sell into, or build content around?
- What opportunities (content ideas, product ideas, traffic plays, ad tests) should I prioritize this week?

Hard rules:
- Be concrete and source-cited. Reference reddit_post_ids in every item.
- For tools, only put high-trust tools in the action plan. Tools that only appear in 'name_drop' or 'pitch_bait' contexts go in low_trust_mentions in the action plan.
- Rank everything by frequency × max confidence × signal_density.
- Prioritize speed-to-act. The user wants to ship fast.

action_plan_md should be markdown with these sections in order:
  ## This week
  ## Tools to install
  ## Workflows to copy
  ## Pain points to address
  ## Content / video ideas
  ## Product or offer ideas
  ## Traffic plays
  ## Low-trust mentions

For the structured fields, every item must reference post_ids.`;

export const REDDIT_AGGREGATE_SCHEMA = {
  type: "object",
  required: ["action_plan_md", "trends", "pain_points", "workflows", "opportunities", "tools"],
  properties: {
    action_plan_md: { type: "string" },
    trends: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "explanation", "post_ids"],
        properties: {
          name:        { type: "string" },
          explanation: { type: "string" },
          post_ids:    { type: "array", items: { type: "number" } },
        },
      },
    },
    pain_points: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "post_ids"],
        properties: {
          text:     { type: "string" },
          post_ids: { type: "array", items: { type: "number" } },
        },
      },
    },
    workflows: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "summary", "post_ids"],
        properties: {
          name:     { type: "string" },
          summary:  { type: "string" },
          post_ids: { type: "array", items: { type: "number" } },
        },
      },
    },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "description", "rationale", "post_ids"],
        properties: {
          kind:        { type: "string", enum: ["content_idea", "product_idea", "ad_test", "traffic_play", "tool_to_install", "experiment"] },
          description: { type: "string" },
          rationale:   { type: "string" },
          post_ids:    { type: "array", items: { type: "number" } },
        },
      },
    },
    tools: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "category", "best_confidence", "post_ids"],
        properties: {
          name:            { type: "string" },
          category:        { type: "string", enum: [...TOOL_CATEGORIES] },
          best_confidence: { type: "string", enum: [...CONFIDENCE_LEVELS] },
          mention_count:   { type: "number" },
          post_ids:        { type: "array", items: { type: "number" } },
        },
      },
    },
  },
};

export interface RedditAggregateOutput {
  action_plan_md: string;
  trends:        { name: string; explanation: string; post_ids: number[] }[];
  pain_points:   { text: string; post_ids: number[] }[];
  workflows:     { name: string; summary: string; post_ids: number[] }[];
  opportunities: {
    kind: "content_idea" | "product_idea" | "ad_test" | "traffic_play" | "tool_to_install" | "experiment";
    description: string;
    rationale: string;
    post_ids: number[];
  }[];
  tools: { name: string; category: string; best_confidence: string; mention_count?: number; post_ids: number[] }[];
}

/* ------------------------------------------- cross-source ---------------- */

export const CROSS_SOURCE_SYSTEM = `You are combining a TikTok aggregate analysis and a Reddit aggregate analysis into a single marketing-intelligence brief.

The user runs short-form content (TikTok) and an Etsy / digital-product business, and is constantly looking for AI tools, automations, and content angles that are working RIGHT NOW.

Compare and synthesize:
- repeated_trends: themes both sources agree on (high confidence — these are real)
- reddit_only: emerging tools / pain points / workflows that haven't hit TikTok yet (early-mover opportunities)
- tiktok_only: viral content formats that haven't been discussed on Reddit yet (formats to ride before saturation)
- repeated_tools: tools mentioned across both sources, ranked by confidence and frequency
- workflows: concrete pipelines worth copying (cite source side: tiktok | reddit | both)
- hooks: hook formulas worth testing (mostly TikTok-side)
- video_ideas: specific video concepts the user could film this week
- pain_points: user pain points that could become content angles or product offers
- ad_candidates: specific videos or angles that look like good paid-ad test material
- opportunities: distinct prioritized actions (act-now flag where applicable)

Hard rules:
- Cite source: every item carries source: "tiktok" | "reddit" | "both" plus the relevant ids.
- Be concrete. Bad: "improve hooks". Good: "test 'I tried X for 7 days' hook on r/<sub> pain point about Y".
- The action_plan_md is the top-level rollout. Sections in order:
    ## Act this week
    ## Tools to install
    ## Workflows to copy
    ## Hooks to test
    ## Content / video ideas
    ## Etsy + traffic plays
    ## Paid ad test candidates
    ## Pain points to mine
    ## Watch list (early signals from Reddit only)`;

export const CROSS_SOURCE_SCHEMA = {
  type: "object",
  required: [
    "action_plan_md", "repeated_trends", "reddit_only", "tiktok_only",
    "repeated_tools", "workflows", "hooks", "video_ideas", "pain_points",
    "ad_candidates", "opportunities",
  ],
  properties: {
    action_plan_md: { type: "string" },
    repeated_trends: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "explanation", "tiktok_video_ids", "reddit_post_ids"],
        properties: {
          name:             { type: "string" },
          explanation:      { type: "string" },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
    reddit_only:  { type: "array", items: refItem("reddit") },
    tiktok_only:  { type: "array", items: refItem("tiktok") },
    repeated_tools: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "category", "tiktok_video_ids", "reddit_post_ids"],
        properties: {
          name:             { type: "string" },
          category:         { type: "string" },
          best_confidence:  { type: "string" },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
    workflows: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "summary", "source"],
        properties: {
          name:    { type: "string" },
          summary: { type: "string" },
          source:  { type: "string", enum: ["tiktok", "reddit", "both"] },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
    hooks: {
      type: "array",
      items: {
        type: "object",
        required: ["formula", "example"],
        properties: {
          formula:          { type: "string" },
          example:          { type: "string" },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
    video_ideas: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "angle"],
        properties: {
          title:            { type: "string" },
          angle:            { type: "string" },
          source_signal:    { type: "string" },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
    pain_points: {
      type: "array",
      items: {
        type: "object",
        required: ["text", "source"],
        properties: {
          text:             { type: "string" },
          source:           { type: "string", enum: ["tiktok", "reddit", "both"] },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
    ad_candidates: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "rationale"],
        properties: {
          description: { type: "string" },
          rationale:   { type: "string" },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "description", "act_now"],
        properties: {
          kind:        { type: "string", enum: ["content_idea", "product_idea", "ad_test", "traffic_play", "tool_to_install", "experiment"] },
          description: { type: "string" },
          rationale:   { type: "string" },
          act_now:     { type: "boolean" },
          tiktok_video_ids: { type: "array", items: { type: "number" } },
          reddit_post_ids:  { type: "array", items: { type: "number" } },
        },
      },
    },
  },
};

function refItem(side: "tiktok" | "reddit") {
  const idsKey = side === "tiktok" ? "tiktok_video_ids" : "reddit_post_ids";
  return {
    type: "object",
    required: ["name", "explanation", idsKey],
    properties: {
      name:        { type: "string" },
      explanation: { type: "string" },
      [idsKey]:    { type: "array", items: { type: "number" } },
    },
  };
}

export interface CrossSourceOutput {
  action_plan_md: string;
  repeated_trends: { name: string; explanation: string; tiktok_video_ids: number[]; reddit_post_ids: number[] }[];
  reddit_only:     { name: string; explanation: string; reddit_post_ids: number[] }[];
  tiktok_only:     { name: string; explanation: string; tiktok_video_ids: number[] }[];
  repeated_tools:  { name: string; category: string; best_confidence?: string; tiktok_video_ids: number[]; reddit_post_ids: number[] }[];
  workflows:       { name: string; summary: string; source: "tiktok" | "reddit" | "both"; tiktok_video_ids?: number[]; reddit_post_ids?: number[] }[];
  hooks:           { formula: string; example: string; tiktok_video_ids?: number[]; reddit_post_ids?: number[] }[];
  video_ideas:     { title: string; angle: string; source_signal?: string; tiktok_video_ids?: number[]; reddit_post_ids?: number[] }[];
  pain_points:     { text: string; source: "tiktok" | "reddit" | "both"; tiktok_video_ids?: number[]; reddit_post_ids?: number[] }[];
  ad_candidates:   { description: string; rationale: string; tiktok_video_ids?: number[]; reddit_post_ids?: number[] }[];
  opportunities:   { kind: string; description: string; rationale?: string; act_now: boolean; tiktok_video_ids?: number[]; reddit_post_ids?: number[] }[];
}
