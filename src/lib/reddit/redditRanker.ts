/**
 * Signal scoring for Reddit posts. Pure functions, no DB.
 *
 * Score is in [0, 1]. We blend objective signals (upvotes, comment volume,
 * recency, upvote ratio) with topical signals (target keywords, workflow
 * language) and apply penalties for noise (memes, jokes, deleted, drama).
 *
 * Calibration notes — see README. Defaults are intentionally conservative:
 * a generic "AMA my journey" post should score ~0.3, a tutorial with
 * step-by-step instructions should score ~0.7+.
 */
import type { RedditPostRaw, RedditCommentRaw } from "./redditClient";

/* --------------------------------------- target keyword clusters --------- */

export const KEYWORD_CLUSTERS = {
  ai_tools: [
    "ai agent","claude","chatgpt","gpt-4","gpt-5","gpt","gemini","veo","runway",
    "midjourney","elevenlabs","openai","anthropic","automation","agentic",
    "workflow","prompt","mcp","rag","vector database","no-code ai","cursor",
    "copilot","grok","perplexity","llm",
  ],
  content_creation: [
    "tiktok","short form","reels","youtube shorts","capcut","captions","hook",
    "faceless videos","ugc","viral","retention","editing","storytelling",
    "voiceover","batch content","b-roll",
  ],
  ecommerce: [
    "etsy","etsy ads","etsy seo","printables","digital products","conversion rate",
    "listing photos","thumbnails","pinterest","shopify","landing page","sales funnel",
    "organic traffic",
  ],
  marketing: [
    "growth hacking","cold email","seo","reddit marketing","paid ads","creatives",
    "landing pages","funnels","conversion","lead magnet","creator economy",
  ],
  automation_business: [
    "n8n","make.com","zapier","airtable","google sheets api","scraping","api",
    "browser automation","content pipeline","auto-posting","scheduling","analytics",
    "supabase","cron","webhook",
  ],
} as const;

const ALL_KEYWORDS: string[] = Object.values(KEYWORD_CLUSTERS).flat();

const WORKFLOW_PHRASES = [
  "step by step","step-by-step","step 1","first i","what worked","my workflow",
  "the stack i use","tools i use","my setup","i built","i automated","i made",
  "tutorial","walkthrough","how to","case study","results","experiment","tested",
  "comparison","stack","pipeline","template","prompt i use","my prompt",
];

const NOISE_PHRASES = [
  "lol","lmao","just memes","this sub is dead","mod abuse","mods are","drama",
  "controversy","rant","unpopular opinion","circle jerk","circlejerk",
];

/* --------------------------------------- helpers ------------------------- */

const containsAny = (haystack: string, needles: readonly string[]): number => {
  const text = haystack.toLowerCase();
  let count = 0;
  for (const n of needles) if (text.includes(n)) count++;
  return count;
};

const dayOldness = (createdUtc: number): number => {
  const ageDays = (Date.now() / 1000 - createdUtc) / 86400;
  return Math.max(0, ageDays);
};

/* --------------------------------------- score --------------------------- */

export interface ScoreBreakdown {
  signal_score: number;
  upvote_score: number;
  engagement_score: number;
  recency_score: number;
  ratio_score: number;
  topic_score: number;
  workflow_score: number;
  body_depth_score: number;
  comment_signal_score: number;
  penalty: number;
  matched_keywords: string[];
  matched_workflow_phrases: string[];
  notes: string[];
}

export interface ScoreInput {
  post: RedditPostRaw;
  comments?: RedditCommentRaw[];
}

export function scorePost({ post, comments }: ScoreInput): ScoreBreakdown {
  const notes: string[] = [];

  // upvote score: log scale, capped. 5k+ = 1.0, 100 ≈ 0.5, sub-25 ≈ 0.
  const upvotes = Math.max(0, post.score);
  const upvote_score = Math.min(1, Math.log10(upvotes + 1) / Math.log10(5_000));

  // engagement: comments alone aren't a great signal; cap and boost when paired.
  const engagement_score = Math.min(1, Math.log10(post.num_comments + 1) / Math.log10(500));

  // recency: 0d = 1.0, 30d = 0.6, 365d = 0.2, decays smoothly.
  const ageDays = dayOldness(post.created_utc);
  const recency_score = Math.max(0.05, 1 / (1 + ageDays / 60));

  const ratio_score = post.upvote_ratio == null
    ? 0.5
    : Math.max(0, Math.min(1, (post.upvote_ratio - 0.5) * 2)); // 0.5→0, 1.0→1

  const fullText = `${post.title}\n${post.selftext}`;
  const matched_keywords: string[] = [];
  for (const kw of ALL_KEYWORDS) {
    if (fullText.toLowerCase().includes(kw)) matched_keywords.push(kw);
  }
  const topic_score = Math.min(1, matched_keywords.length / 4);

  const matched_workflow_phrases: string[] = [];
  for (const p of WORKFLOW_PHRASES) {
    if (fullText.toLowerCase().includes(p)) matched_workflow_phrases.push(p);
  }
  const workflow_score = Math.min(1, matched_workflow_phrases.length / 3);

  // body depth: text posts with substantial body get a bonus.
  const bodyLen = post.selftext.trim().length;
  const body_depth_score = bodyLen === 0
    ? 0
    : Math.min(1, Math.log10(bodyLen + 1) / Math.log10(2_000));

  // comment-derived signal: if comments are provided, look for tool/workflow hits.
  let comment_signal_score = 0;
  if (comments && comments.length > 0) {
    const joined = comments.map((c) => c.body).join("\n").toLowerCase();
    const cKeywords = ALL_KEYWORDS.reduce((n, k) => n + (joined.includes(k) ? 1 : 0), 0);
    const cWorkflow = WORKFLOW_PHRASES.reduce((n, p) => n + (joined.includes(p) ? 1 : 0), 0);
    comment_signal_score = Math.min(1, (cKeywords + cWorkflow) / 6);
  }

  // penalties
  let penalty = 0;
  const noiseHits = containsAny(fullText, NOISE_PHRASES);
  if (noiseHits > 0) { penalty += 0.05 * noiseHits; notes.push(`noise:${noiseHits}`); }
  if (post.over_18) { penalty += 0.1; notes.push("nsfw"); }
  if (post.author === null || post.selftext === "[removed]" || post.selftext === "[deleted]") {
    penalty += 0.4; notes.push("deleted_or_removed");
  }
  if (post.title.length < 25 && bodyLen < 80 && post.num_comments < 5) {
    penalty += 0.15; notes.push("low_context");
  }
  if (matched_keywords.length === 0 && matched_workflow_phrases.length === 0) {
    penalty += 0.1; notes.push("no_topic_match");
  }

  // weighted blend
  const W = {
    upvote: 0.18,
    engagement: 0.10,
    recency: 0.10,
    ratio: 0.05,
    topic: 0.20,
    workflow: 0.18,
    body_depth: 0.10,
    comment_signal: 0.09,
  };
  const raw =
    upvote_score      * W.upvote +
    engagement_score  * W.engagement +
    recency_score     * W.recency +
    ratio_score       * W.ratio +
    topic_score       * W.topic +
    workflow_score    * W.workflow +
    body_depth_score  * W.body_depth +
    comment_signal_score * W.comment_signal;

  const signal_score = Math.max(0, Math.min(1, raw - penalty));

  return {
    signal_score: Number(signal_score.toFixed(4)),
    upvote_score: Number(upvote_score.toFixed(4)),
    engagement_score: Number(engagement_score.toFixed(4)),
    recency_score: Number(recency_score.toFixed(4)),
    ratio_score: Number(ratio_score.toFixed(4)),
    topic_score: Number(topic_score.toFixed(4)),
    workflow_score: Number(workflow_score.toFixed(4)),
    body_depth_score: Number(body_depth_score.toFixed(4)),
    comment_signal_score: Number(comment_signal_score.toFixed(4)),
    penalty: Number(penalty.toFixed(4)),
    matched_keywords,
    matched_workflow_phrases,
    notes,
  };
}
