"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readSse } from "@/lib/sse-client";
import type { AnalyzeProgress } from "@/lib/analyze";

export function AnalyzeButton({
  searchId,
  hasTranscripts,
  hasAggregate,
}: {
  searchId: number;
  hasTranscripts: boolean;
  hasAggregate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(force: boolean) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setProgress("Starting…");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, force }),
      });
      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `analyze failed (${res.status})`);
      }

      let serverErr: string | null = null;
      for await (const ev of readSse(res)) {
        if (ev.event === "progress") {
          const p = ev.data as AnalyzeProgress;
          if (p.kind === "start") {
            setProgress(`Analyzing 0/${p.total}…`);
          } else if (p.kind === "video") {
            const label = p.title ? truncate(p.title, 36) : `video ${p.videoId}`;
            setProgress(`Analyzing ${p.index}/${p.total}: ${label}`);
          } else if (p.kind === "aggregate" && p.phase === "start") {
            setProgress("Synthesizing aggregate…");
          }
        } else if (ev.event === "error") {
          serverErr = (ev.data as { message: string }).message;
        }
      }
      if (serverErr) throw new Error(serverErr);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!hasTranscripts) return null;

  const primaryLabel = busy
    ? progress ?? "Analyzing…"
    : hasAggregate
    ? "Re-run new only"
    : "Run analysis";

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => run(false)}
        disabled={busy}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {primaryLabel}
      </button>
      {hasAggregate && (
        <button
          onClick={() => run(true)}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Force full re-analyze
        </button>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
