"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [err, setErr] = useState<string | null>(null);

  async function run(force: boolean) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "analyze failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!hasTranscripts) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => run(false)}
        disabled={busy}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Analyzing… (~1–3 min/video)" : hasAggregate ? "Re-run new only" : "Run analysis"}
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
