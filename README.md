# marketing-lab

A local-first marketing-intelligence lab. Currently ships two research
tools that share one SQLite brain and one Claude analysis pipeline:

- **TikTok** at `/`            — search a topic, pick videos in a real
  Chrome window, transcribe locally, extract tools / hooks / methods,
  flag funnel-pitch noise.
- **Reddit** at `/reddit`      — pull posts from public subreddit JSON
  endpoints, score them for signal, extract pain points, workflows,
  tools, and "what's working right now" — without scraping, login, or
  CAPTCHA bypass.
- **Cross-source**             — combine a TikTok search and a Reddit
  run into a single brief: trends repeated on both sides, Reddit-only
  early signals, TikTok-only viral formats, repeated tools, hooks,
  video ideas, ad-test candidates, "act now" opportunities.

Runs on `localhost:3000`. No API keys needed: transcription is local
(yt-dlp captions, whisper.cpp fallback) and analysis uses the local
`claude` CLI from your existing Claude Code subscription.

## TikTok flow (`/`)

```
1. type a search term         →  POST /api/launch
2. real Chrome opens at TikTok →  Playwright with persistent profile
3. click checkboxes on tiles  →  injected overlay
4. press "Send to Lab"        →  POST /api/ingest
5. yt-dlp pulls captions      →  free + instant when available
   else: yt-dlp + whisper.cpp →  local transcription
6. press "Run analysis"       →  POST /api/analyze
   per-video pass             →  signal_density, creator_intent,
                                  funnel_signals, tools_mentioned, hooks…
   aggregate pass             →  action_plan_md + cross-video synthesis
7. press "Research tools"     →  POST /api/research-tool
   per-tool WebSearch+Fetch   →  what_it_does, pricing, official_url
```

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

Windows: see the WSL recipe below — that's the path of least resistance.

## Setup

```sh
git clone <this-repo> marketing-lab
cd marketing-lab
npm install
npm run setup           # downloads yt-dlp, builds whisper.cpp, downloads model, installs Playwright Chromium
npm run dev             # localhost:3000
```

`npm run setup` is idempotent — re-runnable if anything's missing.

## Usage

Open http://localhost:3000 → type a search term → "Open TikTok".

A real Chromium window pops up at the TikTok search results with a
persistent profile (`playwright-profile/`), so when you log in once it
sticks for next time. Each video tile gets a green checkbox in the
top-left corner. Pick what you want, then click the floating
**Send to Lab** bar at the bottom-right.

Back in the dashboard, the videos appear with transcript-source badges
(green = TikTok auto-captions, blue = whisper, amber = pending). Once
you have transcripts, hit **Run analysis** in the right panel. Then
**Research tools** to fill in the tool inventory facts.

## What each tab shows

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
    ├─ /api/launch                → scripts/launch-tiktok.ts (detached Playwright)
    ├─ /api/ingest                → yt-dlp → whisper.cpp → SQLite
    ├─ /api/analyze               → claude -p (two passes, JSON Schema)
    ├─ /api/research-tool         → claude -p with WebSearch/WebFetch
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
    └─ better-sqlite3 → data/marketing-lab.sqlite
                          TikTok side: searches, videos, transcripts,
                                       video_analyses, aggregate_analyses
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

## Cost (approximate)

| Step                       | Per call          |
|----------------------------|-------------------|
| Transcription (captions)   | $0                |
| Transcription (whisper)    | $0 (local CPU)    |
| Per-video analysis         | ~$0.05 – $0.20    |
| Aggregate synthesis        | ~$0.10 – $0.30    |
| Per-tool research          | ~$0.10 – $0.20    |

Billed against your Claude Code subscription.

## Useful scripts

```sh
npm run dev          # next dev on localhost:3000
npm run setup        # idempotent local-tools install
npm run db:check     # list tables + row counts
npx tsx scripts/test-vtt.ts     # VTT parser unit tests
npx tsx scripts/test-overlay.ts # JSDOM overlay unit tests
```

## Privacy & ToS

The Playwright launcher uses a real browser with you driving — no
headless scraping, no automated bulk extraction. The overlay just adds
checkboxes to the page. Transcription runs locally on your machine.
The SQLite db lives in `data/`, the persistent browser profile lives
in `playwright-profile/`, and both are gitignored.

## Windows (WSL2 recipe)

WSL is the smoothest Windows path because the setup script is bash and
needs cmake/make/gcc. Open PowerShell as admin and run the commands at
the bottom of this README under "Windows / PowerShell" — they'll get
WSL Ubuntu installed and bootstrap the toolchain inside it.
