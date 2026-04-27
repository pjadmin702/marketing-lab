import { NextRequest, NextResponse } from "next/server";
import { runIngest, createRun, type RedditMode, type RedditTimeRange } from "@/lib/reddit/redditIngestor";
import { parseJsonBody } from "@/lib/route-helpers";
import { getErrorMessage } from "@/lib/format-utils";

export const runtime = "nodejs";
export const maxDuration = 600;

interface IngestBody {
  runId?: number;
  label?: string;
  selectors?: string[];                                      // subreddits + group names
  modes?: { mode: RedditMode; timeRange?: RedditTimeRange }[];
  keywords?: string[];
  fetchComments?: boolean;
  fetchLimitPerQuery?: number;
  maxSubreddits?: number;
  maxPostsPerSubreddit?: number;
  maxCommentsPerPost?: number;
  signalThresholdForComments?: number;
}

const VALID_MODES: RedditMode[] = ["top", "hot", "new", "search"];
const VALID_TIMES: RedditTimeRange[] = ["hour", "day", "week", "month", "year", "all"];

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody<IngestBody>(req);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  if (!Array.isArray(body.selectors) || body.selectors.length === 0) {
    return NextResponse.json({ error: "selectors[] required (subreddit and/or group names)" }, { status: 400 });
  }
  if (!Array.isArray(body.modes) || body.modes.length === 0) {
    return NextResponse.json({ error: "modes[] required" }, { status: 400 });
  }
  for (const m of body.modes) {
    if (!VALID_MODES.includes(m.mode)) {
      return NextResponse.json({ error: `invalid mode: ${m.mode}` }, { status: 400 });
    }
    if (m.timeRange && !VALID_TIMES.includes(m.timeRange)) {
      return NextResponse.json({ error: `invalid timeRange: ${m.timeRange}` }, { status: 400 });
    }
  }

  let runId = body.runId;
  if (!runId) {
    const label = body.label?.trim() || `Reddit run ${new Date().toISOString().slice(0, 16)}`;
    runId = createRun(label);
  }

  try {
    const report = await runIngest({
      runId,
      selectors: body.selectors,
      modes: body.modes,
      keywords: body.keywords,
      fetchComments: body.fetchComments,
      fetchLimitPerQuery: body.fetchLimitPerQuery,
      maxSubreddits: body.maxSubreddits,
      maxPostsPerSubreddit: body.maxPostsPerSubreddit,
      maxCommentsPerPost: body.maxCommentsPerPost,
      signalThresholdForComments: body.signalThresholdForComments,
    });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: getErrorMessage(e) }, { status: 500 });
  }
}
