"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RedditMode, RedditTimeRange } from "@/lib/reddit/redditIngestor";
import { getErrorMessage } from "@/lib/format-utils";

interface SubredditRow { name: string; group_name: string | null; }
interface GroupRow     { group_name: string; count: number; }

interface ModePreset { mode: RedditMode; timeRange?: RedditTimeRange; label: string; }

const MODE_PRESETS: ModePreset[] = [
  { mode: "hot",                                label: "hot" },
  { mode: "new",                                label: "new" },
  { mode: "top", timeRange: "day",              label: "top/day" },
  { mode: "top", timeRange: "week",             label: "top/week" },
  { mode: "top", timeRange: "month",            label: "top/month" },
  { mode: "top", timeRange: "year",             label: "top/year" },
  { mode: "top", timeRange: "all",              label: "top/all" },
];

export function IngestPanel({
  runId,
  subreddits,
  groups,
}: {
  runId: number;
  subreddits: SubredditRow[];
  groups: GroupRow[];
}) {
  const router = useRouter();
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [extraInput, setExtraInput] = useState("");
  const [selectedModes, setSelectedModes] = useState<Set<string>>(new Set(["top|week"]));
  const [keywordsInput, setKeywordsInput] = useState("");
  const [fetchComments, setFetchComments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  function toggleSub(name: string) {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  function selectGroup(group: string) {
    const groupSubs = subreddits.filter((s) => s.group_name === group).map((s) => s.name);
    setSelectedSubs((prev) => new Set([...prev, ...groupSubs]));
  }
  function clearSelection() { setSelectedSubs(new Set()); }
  function toggleMode(key: string) {
    setSelectedModes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function run() {
    if (busy) return;
    const extras = extraInput.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const selectors = [...selectedSubs, ...extras];
    if (selectors.length === 0) { setErr("pick at least one subreddit or group"); return; }
    if (selectedModes.size === 0) { setErr("pick at least one mode"); return; }

    const modes = [...selectedModes].map((k) => {
      const [mode, timeRange] = k.split("|") as [RedditMode, RedditTimeRange | undefined];
      return { mode, timeRange };
    });
    const keywords = keywordsInput.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);

    setBusy(true);
    setErr(null);
    setReport(null);
    try {
      const res = await fetch("/api/reddit/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId, selectors, modes,
          keywords: keywords.length > 0 ? keywords : undefined,
          fetchComments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ingest failed");
      setReport(`fetched ${data.posts_upserted} new posts via ${data.queries.length} queries${data.comments_fetched ? `, ${data.comments_fetched} comments` : ""}${data.blocked ? " (BLOCKED — stopped early)" : ""}`);
      router.refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="mb-1 font-medium uppercase tracking-wide text-zinc-500">Groups</div>
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button
              key={g.group_name}
              onClick={() => selectGroup(g.group_name)}
              className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              type="button"
            >
              + {g.group_name} ({g.count})
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-medium uppercase tracking-wide text-zinc-500">Subreddits ({selectedSubs.size})</span>
          {selectedSubs.size > 0 && (
            <button onClick={clearSelection} className="text-[11px] text-zinc-500 hover:underline">clear</button>
          )}
        </div>
        <div className="max-h-40 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
          <ul className="grid grid-cols-2 gap-x-2">
            {subreddits.map((s) => {
              const on = selectedSubs.has(s.name);
              return (
                <li key={s.name}>
                  <label className={"flex cursor-pointer items-center gap-1 py-0.5 " + (on ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400")}>
                    <input type="checkbox" checked={on} onChange={() => toggleSub(s.name)} className="h-3 w-3" />
                    <span className="truncate">r/{s.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        <input
          value={extraInput}
          onChange={(e) => setExtraInput(e.target.value)}
          placeholder="paste more subreddits, comma or space separated"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-50"
        />
      </div>

      <div>
        <div className="mb-1 font-medium uppercase tracking-wide text-zinc-500">Modes</div>
        <div className="flex flex-wrap gap-1">
          {MODE_PRESETS.map((p) => {
            const key = `${p.mode}|${p.timeRange ?? ""}`;
            const on = selectedModes.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleMode(key)}
                className={
                  "rounded-md px-2 py-1 text-[11px] " +
                  (on
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800")
                }
                type="button"
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 font-medium uppercase tracking-wide text-zinc-500">Search keywords (optional)</div>
        <textarea
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="claude, n8n, etsy seo (one per line or comma-separated; runs as search/year)"
          rows={2}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-50"
        />
      </div>

      <label className="flex items-center gap-2 text-[11px]">
        <input type="checkbox" checked={fetchComments} onChange={(e) => setFetchComments(e.target.checked)} className="h-3 w-3" />
        Also fetch top comments for high-signal posts (slower, more requests)
      </label>

      <button
        onClick={run}
        disabled={busy}
        type="button"
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Ingesting from Reddit…" : "Run ingest"}
      </button>
      {report && <p className="text-emerald-600 dark:text-emerald-400">{report}</p>}
      {err && <p className="text-red-500">{err}</p>}
    </div>
  );
}
