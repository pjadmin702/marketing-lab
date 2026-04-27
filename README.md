# marketing-lab

A local-first TikTok research lab. Search a topic, pick videos in a real
Chrome window, get them transcribed, and have Claude pull out a tools
inventory + a prioritized organic-content action plan — with a built-in
filter for funnel-pitch / course-seller noise.

Runs on `localhost:3000`. No API keys needed: transcription is local
(yt-dlp captions, whisper.cpp fallback) and analysis uses the local
`claude` CLI from your existing Claude Code subscription.

## Flow

```
1. type a search term         →  POST /api/launch
2. real Chrome opens at TikTok →  Playwright with persistent profile
3. click checkboxes on tiles  →  injected overlay (chunk 6)
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
    ├─ /api/launch         → spawns scripts/launch-tiktok.ts (detached)
    │                          └─ Playwright addInitScript injects scripts/overlay.client.js
    ├─ /api/ingest         → yt-dlp (captions or audio) → whisper.cpp → SQLite
    ├─ /api/analyze        → claude -p (two passes, JSON Schema)
    ├─ /api/research-tool  → claude -p with WebSearch/WebFetch
    │
    └─ better-sqlite3 → data/marketing-lab.sqlite
                          searches, videos, transcripts,
                          video_analyses, tools, tool_mentions,
                          aggregate_analyses
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
