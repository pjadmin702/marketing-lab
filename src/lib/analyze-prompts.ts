/**
 * Prompts + JSON schemas for the two-pass analysis pipeline.
 *  Pass 1 (per-video): extract tools, signal_density, funnel signals, methods, hooks.
 *  Pass 2 (aggregate):  synthesize a prioritized organic-content action plan.
 */

export const TOOL_CATEGORIES = [
  "video_editing",
  "ai_video_gen",
  "ai_image_gen",
  "voice_audio",
  "avatars",
  "llm_scriptwriting",
  "claude_code_skill",
  "captions",
  "automation",
  "scheduling",
  "analytics",
  "monetization",
  "stock_assets",
  "other",
] as const;

export const CONFIDENCE_LEVELS = ["demoed", "named_specific", "name_drop", "pitch_bait"] as const;
export const CREATOR_INTENTS = ["practitioner", "course_seller", "agency", "affiliate", "unknown"] as const;

/* ---------- per-video ---------- */

export const PER_VIDEO_SYSTEM = `You are analyzing a single TikTok transcript so the user can build a tools inventory and an organic-content action plan for their businesses.

The user's primary need is filtering signal from noise. Many TikToks are mostly funnel/sales: "I made $X with this tool, link in bio." Still extract every tool name those videos mention — but tag the confidence honestly so the user can filter later.

For the structured response:

1. summary — one or two sentences on what the video is actually about.

2. signal_density (0.0 to 1.0): the fraction of runtime that is concrete actionable information. Use the scale:
   - 0.85+ : dense walkthrough with specifics (clicks, settings, prompts)
   - 0.5   : mixed — useful but with hook/funnel padding
   - 0.2   : mostly hook + sales pitch, very little concrete content
   - 0.0   : pure pitch / teaser

3. creator_intent — practitioner | course_seller | agency | affiliate | unknown
   Pick based on cues like "join my cohort", "DM me to work with us", "use my code", or whether they actually demonstrate doing the thing.

4. funnel_signals: array of detected sales/funnel phrases. Examples to look for:
   "link in bio", "DM me", "comment X to get", "I made $X in Y days",
   "limited spots", "free guide", course/cohort pitch, scarcity, urgency,
   "this is the tool that changed everything", vague flexes without process.
   Empty array if clean.

5. tools_mentioned: every tool / plugin / Claude Code skill / MCP server / library named in the video. For EACH:
   - name: canonical capitalization (e.g. "CapCut", "Submagic", "Claude Code", "ElevenLabs")
   - category: pick one from the enum
   - confidence:
       demoed         = shown in action on screen
       named_specific = named with concrete usage details (settings, workflow)
       name_drop      = mentioned without details
       pitch_bait     = mentioned only as part of a sales pitch / "this tool made me $X"
   - raw_mention: verbatim quote from the transcript, max 200 chars
   - what_it_does: one sentence based on the video's context (will be verified by web research later — do not invent if context is empty)

   Important: still include pitch_bait tools. They go into the inventory tagged so the user can audit.

6. methods: specific techniques shown (editing styles, B-roll patterns, pacing tricks, prompt structures, automation steps).

7. hooks_used: the actual first-3-seconds formula(s) used in this video — be concrete. Bad: "good hook". Good: "rhetorical question + cut to result".

8. frameworks_used: structural template (e.g. "problem → agitate → solve", "before/after", "listicle of 5", "POV reaction").

9. pitfalls: any mistakes the video says to avoid.

Be precise. If something isn't in the transcript, leave it empty rather than inventing it.`;

export const PER_VIDEO_SCHEMA = {
  type: "object",
  required: [
    "summary", "signal_density", "creator_intent", "funnel_signals",
    "tools_mentioned", "methods", "hooks_used", "frameworks_used", "pitfalls",
  ],
  properties: {
    summary: { type: "string" },
    signal_density: { type: "number", minimum: 0, maximum: 1 },
    creator_intent: { type: "string", enum: [...CREATOR_INTENTS] },
    funnel_signals: { type: "array", items: { type: "string" } },
    tools_mentioned: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "category", "confidence", "raw_mention", "what_it_does"],
        properties: {
          name:          { type: "string" },
          category:      { type: "string", enum: [...TOOL_CATEGORIES] },
          confidence:    { type: "string", enum: [...CONFIDENCE_LEVELS] },
          raw_mention:   { type: "string", maxLength: 240 },
          what_it_does:  { type: "string" },
        },
      },
    },
    methods:          { type: "array", items: { type: "string" } },
    hooks_used:       { type: "array", items: { type: "string" } },
    frameworks_used:  { type: "array", items: { type: "string" } },
    pitfalls:         { type: "array", items: { type: "string" } },
  },
};

export interface PerVideoOutput {
  summary: string;
  signal_density: number;
  creator_intent: typeof CREATOR_INTENTS[number];
  funnel_signals: string[];
  tools_mentioned: {
    name: string;
    category: typeof TOOL_CATEGORIES[number];
    confidence: typeof CONFIDENCE_LEVELS[number];
    raw_mention: string;
    what_it_does: string;
  }[];
  methods: string[];
  hooks_used: string[];
  frameworks_used: string[];
  pitfalls: string[];
}

export function buildPerVideoUserPrompt(args: {
  searchTerm: string;
  videoId: number;
  title: string | null;
  author: string | null;
  duration_sec: number | null;
  transcript: string;
}): string {
  return [
    `SEARCH TERM: ${args.searchTerm}`,
    `VIDEO ID: ${args.videoId}`,
    args.title    ? `TITLE: ${args.title}`     : null,
    args.author   ? `AUTHOR: @${args.author}`  : null,
    args.duration_sec ? `DURATION: ${args.duration_sec}s` : null,
    "",
    "TRANSCRIPT:",
    args.transcript,
  ].filter(Boolean).join("\n");
}

/* ---------- aggregate ---------- */

export const AGGREGATE_SYSTEM = `You're synthesizing per-video analyses into a prioritized rollout playbook for ORGANIC TikTok content.

The user's goal: ship organic videos that have a chance of going viral, for their businesses. Not paid ads.

Hard rules:
- Only cite tools/methods in the action_plan_md when at least ONE source video has confidence='demoed' OR 'named_specific'. Tools that only appear in 'name_drop' or 'pitch_bait' contexts go in a "low_trust_mentions" bullet list at the end of the action plan, NOT the main rollout.
- Be concrete. "Improve hook quality" is bad. "Test the 'I tried X for 7 days' hook from videos #2 and #5" is good.
- Prioritize speed-to-publish — the user wants to ship fast.
- The action plan should answer: what to install/learn this week, what to film first, which hook to try, which metric to watch.
- Across categories: rank by frequency × max confidence. Always cite source video_ids.

action_plan_md should be cleanly-formatted markdown with these sections in order:
  ## This week
  ## Hooks to test
  ## Tools to install
  ## Methods to copy
  ## Pitfalls to avoid
  ## Low-trust mentions (raw inventory the user should sanity-check)

For the structured fields (methods, systems, hooks, frameworks, viral_signals, pitfalls, speed_to_publish): each item must reference video_ids. Aggregate cross-video patterns; don't just concatenate.`;

export const AGGREGATE_SCHEMA = {
  type: "object",
  required: [
    "action_plan_md", "methods", "systems", "hooks",
    "frameworks", "viral_signals", "pitfalls", "speed_to_publish",
  ],
  properties: {
    action_plan_md: { type: "string" },
    methods: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "explanation", "video_ids"],
        properties: {
          name:        { type: "string" },
          explanation: { type: "string" },
          video_ids:   { type: "array", items: { type: "number" } },
        },
      },
    },
    systems: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "pipeline", "video_ids"],
        properties: {
          name:      { type: "string" },
          pipeline:  { type: "string" },
          video_ids: { type: "array", items: { type: "number" } },
        },
      },
    },
    hooks: {
      type: "array",
      items: {
        type: "object",
        required: ["formula", "example", "video_ids"],
        properties: {
          formula:   { type: "string" },
          example:   { type: "string" },
          video_ids: { type: "array", items: { type: "number" } },
        },
      },
    },
    frameworks: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "structure", "video_ids"],
        properties: {
          name:      { type: "string" },
          structure: { type: "string" },
          video_ids: { type: "array", items: { type: "number" } },
        },
      },
    },
    viral_signals: {
      type: "array",
      items: {
        type: "object",
        required: ["signal", "explanation", "video_ids"],
        properties: {
          signal:      { type: "string" },
          explanation: { type: "string" },
          video_ids:   { type: "array", items: { type: "number" } },
        },
      },
    },
    pitfalls: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "explanation", "video_ids"],
        properties: {
          name:        { type: "string" },
          explanation: { type: "string" },
          video_ids:   { type: "array", items: { type: "number" } },
        },
      },
    },
    speed_to_publish: {
      type: "array",
      items: {
        type: "object",
        required: ["tactic", "explanation", "video_ids"],
        properties: {
          tactic:      { type: "string" },
          explanation: { type: "string" },
          video_ids:   { type: "array", items: { type: "number" } },
        },
      },
    },
  },
};

export interface AggregateOutput {
  action_plan_md: string;
  methods:         { name: string; explanation: string; video_ids: number[] }[];
  systems:         { name: string; pipeline: string; video_ids: number[] }[];
  hooks:           { formula: string; example: string; video_ids: number[] }[];
  frameworks:      { name: string; structure: string; video_ids: number[] }[];
  viral_signals:   { signal: string; explanation: string; video_ids: number[] }[];
  pitfalls:        { name: string; explanation: string; video_ids: number[] }[];
  speed_to_publish:{ tactic: string; explanation: string; video_ids: number[] }[];
}
