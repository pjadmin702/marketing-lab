"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(force: boolean) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch("/api/research-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "research failed");
      const ok = (data.results || []).filter((r: { status: string }) => r.status === "ok").length;
      const errs = (data.results || []).filter((r: { status: string }) => r.status === "error").length;
      setInfo(`${ok} researched${errs ? `, ${errs} failed` : ""}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!hasTools) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => run(false)}
        disabled={busy || unresearchedCount === 0}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {busy
          ? "Researching tools…"
          : unresearchedCount > 0
          ? `Research ${unresearchedCount} new tool${unresearchedCount > 1 ? "s" : ""}`
          : "All tools researched"}
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
