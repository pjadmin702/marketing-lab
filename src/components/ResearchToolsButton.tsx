"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readSse } from "@/lib/sse-client";
import type { ResearchProgress } from "@/lib/research-tools";

export function ResearchToolsButton({
  searchId,
  hasTools,
  unresearchedCount,
}: {
  searchId: number;
  hasTools: boolean;
  unresearchedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(force: boolean) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    setProgress("Starting…");
    try {
      const res = await fetch("/api/research-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, force }),
      });
      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `research failed (${res.status})`);
      }

      let okCount = 0;
      let errCount = 0;
      let skippedLowSignal = 0;
      let serverErr: string | null = null;

      for await (const ev of readSse(res)) {
        if (ev.event === "progress") {
          const p = ev.data as ResearchProgress;
          if (p.kind === "start") {
            setProgress(`Researching 0/${p.total}…`);
          } else if (p.kind === "tool") {
            if (p.result === "ok") okCount++;
            else if (p.result === "error") errCount++;
            setProgress(`Researching ${p.completed}/${p.total}: ${truncate(p.name, 28)}`);
          }
        } else if (ev.event === "done") {
          skippedLowSignal = (ev.data as { skipped_low_signal?: number }).skipped_low_signal ?? 0;
        } else if (ev.event === "error") {
          serverErr = (ev.data as { message: string }).message;
        }
      }
      if (serverErr) throw new Error(serverErr);

      const parts = [`${okCount} researched`];
      if (errCount) parts.push(`${errCount} failed`);
      if (skippedLowSignal) parts.push(`${skippedLowSignal} low-signal skipped`);
      setInfo(parts.join(", "));
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!hasTools) return null;

  const idleLabel =
    unresearchedCount > 0
      ? `Research ${unresearchedCount} new tool${unresearchedCount > 1 ? "s" : ""}`
      : "All tools researched";

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => run(false)}
        disabled={busy || unresearchedCount === 0}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {busy ? progress ?? "Researching…" : idleLabel}
      </button>
      {unresearchedCount === 0 && !busy && (
        <button
          onClick={() => run(true)}
          disabled={busy}
          className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline disabled:opacity-40 dark:hover:text-zinc-300"
        >
          force re-research all
        </button>
      )}
      {info && <p className="text-[10px] text-zinc-500">{info}</p>}
      {err && <p className="text-[10px] text-red-500">{err}</p>}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
