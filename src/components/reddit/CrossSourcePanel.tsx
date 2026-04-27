"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CrossSourceListRow } from "@/lib/reddit/redditQueries";

interface SearchOption { id: number; term: string; }

interface Props {
  redditRunId: number;
  tiktokSearches: SearchOption[];
  saved: CrossSourceListRow[];
  selectedAggregate?: { id: number; label: string; action_plan_md: string } | null;
}

export function CrossSourcePanel({ redditRunId, tiktokSearches, saved, selectedAggregate }: Props) {
  const router = useRouter();
  const [tiktokSearchId, setTiktokSearchId] = useState<number | null>(tiktokSearches[0]?.id ?? null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reddit/cross-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || `Cross-source ${new Date().toISOString().slice(0, 16)}`,
          tiktokSearchId,
          redditRunId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status === "error") throw new Error(data.error || "cross-source failed");
      setLabel("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="mb-1 font-medium uppercase tracking-wide text-zinc-500">Combine with TikTok search</div>
        <select
          value={tiktokSearchId ?? ""}
          onChange={(e) => setTiktokSearchId(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="">(reddit only — no TikTok side)</option>
          {tiktokSearches.map((s) => (
            <option key={s.id} value={s.id}>#{s.id} — {s.term}</option>
          ))}
        </select>
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        onClick={generate}
        disabled={busy}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Synthesizing…" : "Generate cross-source brief"}
      </button>
      {err && <p className="text-red-500">{err}</p>}

      {saved.length > 0 && (
        <div>
          <div className="mb-1 font-medium uppercase tracking-wide text-zinc-500">Saved briefs</div>
          <ul className="space-y-1">
            {saved.map((s) => (
              <li key={s.id}>
                <a
                  href={`/reddit?run=${redditRunId}&xs=${s.id}`}
                  className={"block rounded-md px-2 py-1 " + (selectedAggregate?.id === s.id ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900")}
                >
                  <div className="truncate font-medium">{s.label}</div>
                  <div className={"text-[10px] " + (selectedAggregate?.id === s.id ? "opacity-70" : "text-zinc-500")}>
                    tiktok #{s.tiktok_search_id ?? "—"} · reddit #{s.reddit_run_id ?? "—"}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedAggregate && (
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium uppercase tracking-wide text-zinc-500">Brief: {selectedAggregate.label}</span>
            <a href={`/api/reddit/export?crossId=${selectedAggregate.id}&format=md`} target="_blank" rel="noreferrer" className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">export md</a>
          </div>
          <div className="prose prose-xs prose-zinc max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedAggregate.action_plan_md || "_(empty)_"}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
