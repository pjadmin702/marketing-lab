"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/format-utils";

export function NewRunForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reddit/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "create run failed");
      setLabel("");
      router.push(`/reddit?run=${data.run_id}`);
      router.refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Run label (e.g. AI tools — week 17)"
        suppressHydrationWarning
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
      />
      <button
        type="submit"
        disabled={busy || !label.trim()}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Creating…" : "New Reddit Run"}
      </button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </form>
  );
}
