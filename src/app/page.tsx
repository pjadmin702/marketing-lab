"use client";

import { useState } from "react";

export default function Home() {
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm: term.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "launch failed");
      setMsg(`Opened TikTok search (search id ${data.searchId}). Pick videos in the browser, then click Send to Lab.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-2xl px-8 py-24">
        <div className="mb-2 text-xs font-mono uppercase tracking-widest text-zinc-500">
          marketing-lab
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          TikTok Research Lab
        </h1>
        <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Search TikTok, select videos, transcribe, and extract a tools
          inventory + organic-content action plan.
        </p>

        <form
          onSubmit={launch}
          className="mt-10 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <label htmlFor="term" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Search term
          </label>
          <input
            id="term"
            type="text"
            placeholder="e.g. claude code video editing"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || !term.trim()}
            className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Opening browser…" : "Open TikTok"}
          </button>
          {msg && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{msg}</p>
          )}
        </form>

        <p className="mt-6 text-xs text-zinc-500">
          A real Chrome window will open with a persistent profile (so logins
          stick). The video-selection overlay lands in the next chunk.
        </p>
      </div>
    </main>
  );
}
