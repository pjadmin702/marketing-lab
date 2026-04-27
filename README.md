# marketing-lab

A local-first marketing-intelligence lab. Currently ships two research
tools that share one SQLite brain and one Claude analysis pipeline:

- **TikTok** at `/`            — browse TikTok in your normal browser,
  grab URLs with a one-click bookmarklet, paste into the dashboard,
  transcribe locally, extract tools / hooks / methods across 10
  categories, flag funnel-pitch noise.
- **Reddit** at `/reddit`      — pull posts from public subreddit JSON
  endpoints, score them for signal, extract pain points, workflows,
  tools, and "what's working right now" — without scraping, login, or
  CAPTCHA bypass.
- **Library** at `/library`    — cross-search knowledge graph that
  dedupes methods, hooks, frameworks, etc. by name across every
  search and surfaces what's recurring vs. one-off.
- **Cross-source**             — combine a TikTok search and a Reddit
  run into a single brief: trends repeated on both sides, Reddit-only
  early signals, TikTok-only viral formats, repeated tools, hooks,
  video ideas, ad-test candidates, "act now" opportunities.

Runs on `localhost:3000`. No API keys needed: transcription is local
(yt-dlp captions, whisper.cpp fallback) and analysis uses the local
`claude` CLI from your existing Claude Code subscription.

## TikTok flow (`/`)

```
1. browse tiktok.com in your normal browser, search what you want
2. click the "Lab Grab" bookmarklet  → copies all video URLs to clipboard
3. paste into the dashboard textarea →  POST /api/ingest
4. yt-dlp pulls captions             →  free + instant when available
   else: yt-dlp + whisper.cpp        →  local transcription
5. press "Run analysis"              →  POST /api/analyze (SSE progress)
   per-video pass                    →  signal_density, creator_intent,
                                          funnel_signals, tools_mentioned, hooks…
   aggregate pass                    →  action_plan_md + cross-video synthesis
6. press "Research tools"            →  POST /api/research-tool (SSE progress)
   per-tool WebSearch+Fetch          →  what_it_does, pricing, official_url
7. /library                          →  cross-search knowledge graph
                                          dedupes methods/hooks/etc by name
                                          across every search you've run
```

## Bookmarklet

In your normal browser, save a new bookmark with this URL (single line):

```
javascript:(()=>{const l=[...new Set([...document.querySelectorAll('a[href*="/video/"]')].map(a=>a.href).filter(u=>/\/video\/\d+/.test(u)))];if(!l.length){alert('No TikTok video links found');return}const t=l.join('\n');navigator.clipboard.writeText(t).then(()=>alert(`Copied ${l.length} TikTok URLs. Paste into dashboard.`)).catch(()=>prompt(`Found ${l.length} URLs:`,t));})()
```

Click it on any TikTok search results page → all video URLs land in your
clipboard. Paste into the dashboard, hit **Ingest URLs**.

## Reddit flow (`/reddit`)

```
1. create a Reddit run (label)         →  POST /api/reddit/runs
2. pick subreddits + groups + modes    →  IngestPanel
3. press "Run ingest"                  →  POST /api/reddit/ingest
   redditClient (UA, rate gate, cache) →  /r/<sub>/{top,hot,new,search}.json
   dedup-upserts by reddit_id, records →  reddit_posts + reddit_post_appearances
   appearance per ranking source           (top_week, search:claude, …)
   ranker scores each post 0..1       →  signal_score column
4. (optional) "fetch top comments"     →  POST /api/reddit/comments
   for any post; signal score recomputes
5. select posts → "analyze selected"   →  POST /api/reddit/analyze
   per-post pass                       →  pain_points, workflows,
                                          opportunities, tools_mentioned
   aggregate pass                      →  action_plan_md + trends
6. "Generate cross-source brief"       →  POST /api/reddit/cross-source
   combines newest TikTok aggregate +  →  cross_source_aggregates row
   newest Reddit aggregate                with: repeated_trends,
                                                 reddit_only, tiktok_only,
                                                 hooks, video_ideas,
                                                 ad_candidates, "act now"
7. export                              →  GET /api/reddit/export
                                          ?runId|crossId &format=md|json|csv
```

### Reddit guardrails

- **Public JSON only.** No browser scraping, no login, no CAPTCHA bypass.
  OAuth is supported (set `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`)
  but not required.
- **Polite client.** Descriptive `User-Agent` (override with
  `REDDIT_USER_AGENT`), 1.1s minimum interval between requests
  (`REDDIT_MIN_INTERVAL_MS`), exponential backoff on 429/5xx, hard stop
  on 403. 30-min response cache (`REDDIT_CACHE_TTL_SEC`).
- **Hard caps per run.** 5 subreddits, 200 posts/sub, 20 comments/post.
- **Subreddit name validation.** `[A-Za-z0-9_]{2,50}`; bad input is
  silently dropped from `expandSelection` rather than smuggled into URLs.

### Seeded subreddits

26 starter subreddits across 10 groups (AI Tools, Automation, TikTok
Growth, Etsy Sellers, Video Editing, Content Creation, No-Code / SaaS,
Prompt Engineering, Marketing, Side Hustles). Add more from the UI or
via `POST /api/reddit/subreddits {name, group}`.

## Prerequisites

| Tool         | Version  | macOS / Linux                              |
|--------------|----------|--------------------------------------------|
| Node.js      | 22+      | `brew install node` / `nvm install 22`     |
| ffmpeg       | any      | `brew install ffmpeg` / `apt install ffmpeg` |
| git, cmake, make, gcc | any | usually preinstalled / `xcode-select --install` / `apt install build-essential cmake` |
| Claude Code  | 2.1+     | `npm install -g @anthropic-ai/claude-code` |

Windows: use WSL2 Ubuntu — the setup script is bash and needs the build
toolchain.

## Setup

```sh
git clone <this-repo> marketing-lab
cd marketing-lab
npm install
npm run setup           # downloads yt-dlp, builds whisper.cpp, downloads model
npm run dev             # localhost:3000
```

`npm run setup` is idempotent — re-runnable if anything's missing.

## Usage

Open http://localhost:3000. The left sidebar has a **Suggested** queue —
click **Add starter set** to seed 14 starter searches, then click any
pending term to fill the search input.

For each search:

1. Browse `tiktok.com` in your normal browser, search the term
2. Scroll to load videos you care about
3. Click your **Lab Grab** bookmarklet → URLs copied
4. Paste into the textarea, click **Ingest URLs**
5. Once transcripts populate, click **Run analysis** in the right panel
6. Click **Research tools** to fill pricing + URLs

Visit **/library** any time to see the cross-search knowledge graph:
methods, hooks, frameworks, etc. deduped by name across every search.

## What each tab shows (analysis panel)

| Tab              | Source                                         |
|------------------|------------------------------------------------|
| Action Plan      | Markdown rollout: install-this-week / hooks-to-test / tools-to-install / pitfalls / low-trust mentions |
| Tools            | Canonical inventory grouped by category, confidence-color-coded (green=demoed / blue=named / zinc=name-drop / red=pitch), with researched pricing + official URLs |
| Methods          | Cross-video editing techniques with source video_ids |
| Systems          | End-to-end pipelines (e.g. n8n flows) creators are running |
| Hooks            | First-3-second formulas + verbatim examples    |
| Frameworks       | Structural templates (problem→solve, listicle, POV, …) |
| Viral Signals    | Metrics / cues to optimize for                 |
| Pitfalls         | Common mistakes mentioned                      |
| Speed-to-Publish | Tactics for shipping fast                      |
| Funnel Flags     | Per-video signal_density % + creator_intent + verbatim funnel-pitch quotes |

## Architecture

```
Next.js 16 (App Router, Turbopack, Tailwind 4)
    │
    ├─ /api/ingest                → yt-dlp → whisper.cpp → SQLite (parallel, SSE)
    ├─ /api/analyze               → claude -p (two passes, JSON Schema, SSE)
    ├─ /api/research-tool         → claude -p with WebSearch/WebFetch (SSE)
    ├─ /api/queue                 → search-term checklist (CRUD)
    ├─ /api/searches/[id]         → DELETE search (cascades all data)
    │
    ├─ /api/reddit/runs           → create / list reddit_runs
    ├─ /api/reddit/ingest         → reddit.com/*.json → reddit_posts (+ appearances)
    ├─ /api/reddit/analyze        → claude -p per-post + aggregate
    ├─ /api/reddit/comments       → on-demand top-N comments + re-score
    ├─ /api/reddit/posts          → list posts ranked by signal_score
    ├─ /api/reddit/subreddits     → catalog CRUD
    ├─ /api/reddit/cross-source   → combined TikTok + Reddit synthesis
    ├─ /api/reddit/export         → md / json / csv
    │
    ├─ /library                   → cross-search knowledge graph view
    │
    └─ better-sqlite3 → data/marketing-lab.sqlite
                          TikTok side: searches, videos, transcripts,
                                       video_analyses, aggregate_analyses,
                                       search_queue
                          Library:     methods, systems, hooks, frameworks,
                                       viral_signals, pitfalls, speed_tactics
                                       (+ *_mentions for each)
                          Reddit side: reddit_subreddits, reddit_runs,
                                       reddit_queries, reddit_posts,
                                       reddit_post_appearances, reddit_comments,
                                       reddit_post_analyses, reddit_aggregates,
                                       reddit_http_cache
                          Shared:      tools, tool_mentions,
                                       reddit_tool_mentions,
                                       cross_source_aggregates
```

Bin / vendor:

- `bin/yt-dlp`         — standalone binary
- `bin/whisper-cli`    — built from `vendor/whisper.cpp/`
- `whisper-models/ggml-small.en.bin` — ~250 MB

## Cost

Free against your Claude Max subscription. Heavy use counts toward your
weekly Max quota; no per-token billing.

| Step                       | What runs         |
|----------------------------|-------------------|
| Transcription (captions)   | yt-dlp (local)    |
| Transcription (whisper)    | whisper.cpp (local CPU) |
| Per-video analysis         | claude -p         |
| Aggregate synthesis        | claude -p         |
| Per-tool research          | claude -p (WebSearch + WebFetch) |

## Useful scripts

```sh
npm run dev           # next dev on localhost:3000
npm run setup         # idempotent local-tools install
npm run db:check      # list tables + row counts
npm run kg:backfill   # populate knowledge graph from existing aggregates
npx tsx scripts/test-vtt.ts     # VTT parser unit tests
```

## Privacy & ToS

You browse TikTok in your normal browser, logged into your normal
account. The bookmarklet only reads the URLs of video tiles already
visible on the page — no headless scraping, no automated bulk
extraction. Transcription runs locally on your machine. The SQLite db
lives in `data/` and is gitignored.

## Windows (WSL2 recipe)

WSL is the smoothest Windows path because the setup script is bash and
needs cmake/make/gcc. Open PowerShell as admin and run the commands at
the bottom of this README under "Windows / PowerShell" — they'll get
WSL Ubuntu installed and bootstrap the toolchain inside it.
