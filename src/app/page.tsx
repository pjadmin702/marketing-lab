import Link from "next/link";
import {
  listSearches, getSearch, getVideosForSearch, getSearchStats,
  getVideoAnalyses, getToolInventory, getAggregate, countUnresearchedTools,
} from "@/lib/queries";
import { NewSearchForm } from "@/components/NewSearchForm";
import { RefreshButton } from "@/components/RefreshButton";
import { AnalyzeButton } from "@/components/AnalyzeButton";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { ResearchToolsButton } from "@/components/ResearchToolsButton";
import { SearchQueue } from "@/components/SearchQueue";
import { SearchHistoryItem } from "@/components/SearchHistoryItem";
import { listQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function fmtDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sParam = Array.isArray(params.s) ? params.s[0] : params.s;
  const searchId = sParam ? Number(sParam) : null;

  const searches = listSearches();
  const active = searchId ? getSearch(searchId) : null;
  const videos = active ? getVideosForSearch(active.id) : [];
  const stats = active ? getSearchStats(active.id) : null;
  const analyses = active ? getVideoAnalyses(active.id) : [];
  const toolInventory = active ? getToolInventory(active.id) : [];
  const aggregate = active ? getAggregate(active.id) : null;
  const unresearchedTools = active ? countUnresearchedTools(active.id) : 0;

  return (
    <div className="grid h-screen grid-cols-[280px_minmax(0,1fr)_400px] divide-x divide-zinc-200 bg-zinc-50 text-zinc-900 dark:divide-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
      {/* ---- LEFT: search history + new search ---- */}
      <aside className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <div className="mb-1 text-xs font-mono uppercase tracking-widest text-zinc-500">
              marketing-lab
            </div>
            <h1 className="text-sm font-semibold">TikTok Research</h1>
          </div>
          <Link
            href="/library"
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Library →
          </Link>
        </div>
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            New Search
          </h2>
          <NewSearchForm />
        </div>
        <SearchQueue initial={listQueue()} />
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 pb-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              History ({searches.length})
            </h2>
          </div>
          {searches.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-zinc-500">
              No searches yet. Type a term above and hit Open TikTok.
            </p>
          ) : (
            <ul className="px-2 pb-4">
              {searches.map((s) => (
                <SearchHistoryItem
                  key={s.id}
                  id={s.id}
                  term={s.term}
                  videoCount={s.video_count}
                  timeLabel={fmtTime(s.created_at)}
                  isActive={active?.id === s.id}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ---- CENTER: videos in active search ---- */}
      <section className="flex flex-col overflow-hidden">
        {!active ? (
          <EmptyState
            title="Pick a search"
            body="Select one from the left, or start a new one to open TikTok."
          />
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Search
                </div>
                <h2 className="truncate text-lg font-semibold">{active.term}</h2>
                {stats && (
                  <>
                    <p className="mt-1 text-xs text-zinc-500">
                      {stats.total_videos} videos · {stats.with_transcripts} transcribed
                      {stats.via_captions ? ` (${stats.via_captions} captions)` : ""}
                      {stats.via_whisper ? ` (${stats.via_whisper} whisper)` : ""}
                      {" · "}
                      <span className={stats.analyzed === stats.total_videos
                        ? "text-violet-600 dark:text-violet-400"
                        : "text-zinc-500"}>
                        {stats.analyzed}/{stats.total_videos} analyzed
                      </span>
                    </p>
                    {stats.analyzed > 0 && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-400">
                        <span>Signal:</span>
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">high</span>
                        <span>= teaches more than sells (60%+)</span>
                        <span className="ml-1 rounded-md bg-violet-100 px-1.5 py-0.5 font-medium uppercase tracking-wide text-violet-800 dark:bg-violet-950 dark:text-violet-200">mid</span>
                        <span>= mixed (40-59%)</span>
                        <span className="ml-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">low</span>
                        <span>= mostly pitch / lead-gen (&lt;40%)</span>
                      </p>
                    )}
                  </>
                )}
              </div>
              <RefreshButton />
            </header>
            {videos.length === 0 ? (
              <EmptyState
                title="No videos yet"
                body="The TikTok window should be open. Click checkboxes on video tiles, then 'Send to Lab'."
              />
            ) : (
              <ul className="flex-1 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
                {videos.map((v) => (
                  <li key={v.id} className="flex gap-4 p-4 hover:bg-white dark:hover:bg-zinc-900">
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        className="h-24 w-16 flex-shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-24 w-16 flex-shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 text-sm font-medium hover:underline"
                        >
                          {v.title || v.url}
                        </a>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <TranscriptBadge source={v.transcript_source} chars={v.transcript_chars} />
                          <AnalyzedBadge analyzed={v.analyzed} signalDensity={v.signal_density} />
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                        {v.author && <span>@{v.author}</span>}
                        <span>{fmtDuration(v.duration_sec)}</span>
                        {v.transcript_language && <span>lang: {v.transcript_language}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ---- RIGHT: analysis tabs ---- */}
      <aside className="flex flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Analysis</div>
            <h2 className="text-sm font-semibold">
              {!active
                ? "—"
                : aggregate
                ? "Cross-video synthesis"
                : stats && stats.with_transcripts > 0
                ? "Ready to analyze"
                : "Waiting for transcripts"}
            </h2>
          </div>
          {active && (
            <div className="flex flex-col gap-2">
              <AnalyzeButton
                searchId={active.id}
                hasTranscripts={(stats?.with_transcripts ?? 0) > 0}
                hasAggregate={!!aggregate}
              />
              <ResearchToolsButton
                searchId={active.id}
                hasTools={toolInventory.length > 0}
                unresearchedCount={unresearchedTools}
              />
            </div>
          )}
        </header>
        {!active ? (
          <div className="flex-1 p-4">
            <p className="text-sm text-zinc-500">Pick a search to see analysis.</p>
          </div>
        ) : stats && stats.with_transcripts === 0 ? (
          <div className="flex-1 p-4">
            <p className="text-sm text-zinc-500">
              No transcripts yet. Send videos from the TikTok overlay to populate them.
            </p>
          </div>
        ) : (
          <AnalysisPanel
            aggregate={aggregate}
            tools={toolInventory}
            videoAnalyses={analyses}
          />
        )}
      </aside>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">{body}</p>
    </div>
  );
}

function TranscriptBadge({
  source,
  chars,
}: {
  source: "captions" | "whisper" | null;
  chars: number | null;
}) {
  if (!source) {
    return (
      <span className="flex-shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        pending
      </span>
    );
  }
  const label = source === "captions" ? "captions" : "whisper";
  const cls =
    source === "captions"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200";
  return (
    <span className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {label} · {chars ?? 0}c
    </span>
  );
}

function AnalyzedBadge({
  analyzed,
  signalDensity,
}: {
  analyzed: boolean;
  signalDensity: number | null;
}) {
  if (!analyzed) {
    return (
      <span
        title="This video hasn't been analyzed yet. Click 'Run analysis' to process it."
        className="flex-shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500"
      >
        not analyzed
      </span>
    );
  }
  const density = signalDensity == null ? null : Math.round(signalDensity * 100);
  let label = "analyzed";
  let cls = "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  let tooltip = "Analyzed (no signal density score available).";
  if (density != null) {
    if (density >= 60) {
      label = "high signal";
      cls = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
      tooltip = `${density}% signal density — dense actionable content per minute. A "value-dropper" creator who teaches more than they sell.`;
    } else if (density >= 40) {
      label = "mid signal";
      cls = "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
      tooltip = `${density}% signal density — mixed. Some real teaching, some filler or recap.`;
    } else {
      label = "low signal";
      cls = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
      tooltip = `${density}% signal density — mostly sales pitch, lead-gen, or surface-level recap. Likely a "course-shiller" creator.`;
    }
  }
  return (
    <span
      title={tooltip}
      className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}{density != null ? ` · ${density}%` : ""}
    </span>
  );
}
