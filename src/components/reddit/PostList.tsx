"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RedditPostListRow } from "@/lib/reddit/redditQueries";

interface Props {
  runId: number;
  posts: RedditPostListRow[];
}

const PERMA = "https://www.reddit.com";

function fmtDate(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleDateString();
}

function signalBadge(score: number | null) {
  if (score == null) return { cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400", label: "—" };
  if (score >= 0.65) return { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", label: score.toFixed(2) };
  if (score >= 0.45) return { cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",        label: score.toFixed(2) };
  if (score >= 0.25) return { cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200", label: score.toFixed(2) };
  return { cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400", label: score.toFixed(2) };
}

export function PostList({ runId, posts }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filterMin, setFilterMin] = useState(0);
  const [busy, setBusy] = useState<"selected" | "all" | "fetch" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const visible = useMemo(
    () => posts.filter((p) => (p.signal_score ?? 0) >= filterMin),
    [posts, filterMin],
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelected(new Set(visible.map((p) => p.id)));
  }
  function clear() { setSelected(new Set()); }

  async function analyze(scope: "selected" | "all") {
    setBusy(scope);
    setErr(null);
    setInfo(null);
    try {
      const body: { runId: number; postIds?: number[] } = { runId };
      if (scope === "selected") {
        if (selected.size === 0) throw new Error("nothing selected");
        body.postIds = [...selected];
      }
      const res = await fetch("/api/reddit/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "analyze failed");
      const ok = data.per_post.filter((r: { status: string }) => r.status === "ok").length;
      const errs = data.per_post.filter((r: { status: string }) => r.status === "error").length;
      setInfo(`analyzed ${ok}${errs ? `, ${errs} errors` : ""}, aggregate ${data.aggregate.status}, $${data.cost_usd.toFixed(3)}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function fetchComments(postId: number) {
    setBusy("fetch");
    setErr(null);
    try {
      const res = await fetch("/api/reddit/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, limit: 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "fetch comments failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-3 text-xs dark:border-zinc-800">
        <label className="flex items-center gap-1">
          min signal:
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={filterMin}
            onChange={(e) => setFilterMin(Number(e.target.value))}
            className="w-32"
          />
          <span className="font-mono">{filterMin.toFixed(2)}</span>
        </label>
        <span className="text-zinc-500">{visible.length} of {posts.length} posts</span>
        <span className="ml-auto flex gap-1">
          <button onClick={selectAllVisible} className="rounded-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">select visible</button>
          {selected.size > 0 && (
            <button onClick={clear} className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">clear ({selected.size})</button>
          )}
          <button
            onClick={() => analyze("selected")}
            disabled={!!busy || selected.size === 0}
            className="rounded-md bg-zinc-900 px-2 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy === "selected" ? "analyzing…" : `analyze selected (${selected.size})`}
          </button>
          <button
            onClick={() => analyze("all")}
            disabled={!!busy}
            className="rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {busy === "all" ? "analyzing…" : "analyze all"}
          </button>
        </span>
      </div>
      {(err || info) && (
        <div className="border-b border-zinc-200 px-3 py-1 text-xs dark:border-zinc-800">
          {err && <span className="text-red-500">{err}</span>}
          {info && <span className="text-emerald-600 dark:text-emerald-400">{info}</span>}
        </div>
      )}
      {posts.length === 0 ? (
        <div className="flex-1 p-6 text-sm text-zinc-500">No posts in this run yet — run an ingest from the left panel.</div>
      ) : (
        <ul className="flex-1 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
          {visible.map((p) => {
            const sb = signalBadge(p.signal_score);
            const isSelected = selected.has(p.id);
            return (
              <li key={p.id} className={"flex gap-3 p-3 " + (isSelected ? "bg-zinc-100 dark:bg-zinc-900" : "hover:bg-white dark:hover:bg-zinc-900")}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(p.id)}
                  className="mt-1 h-3 w-3 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={`${PERMA}${p.permalink}`}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-sm font-medium hover:underline"
                    >
                      {p.title}
                    </a>
                    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${sb.cls}`}>{sb.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                    <span>r/{p.subreddit}</span>
                    {p.author && <span>u/{p.author}</span>}
                    <span>{p.score} pts</span>
                    <span>{p.num_comments} cmts</span>
                    {p.upvote_ratio != null && <span>{Math.round(p.upvote_ratio * 100)}% ↑</span>}
                    <span>{fmtDate(p.created_utc)}</span>
                    {p.has_analysis === 1 && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">analyzed</span>}
                  </div>
                  {p.ranking_sources.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.ranking_sources.map((s) => (
                        <span key={s} className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{s}</span>
                      ))}
                    </div>
                  )}
                  {p.analyzed_summary && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-zinc-600 dark:text-zinc-400">{p.analyzed_summary}</p>
                  )}
                  <button
                    onClick={() => fetchComments(p.id)}
                    disabled={busy === "fetch"}
                    className="mt-1 text-[10px] text-zinc-500 hover:underline"
                  >
                    fetch top comments
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
