"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function NewSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Prefill from ?seed=<term> when a queue item is clicked. Only fills when
  // the field is empty so user-typed terms aren't clobbered on re-render.
  useEffect(() => {
    const seed = searchParams.get("seed");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seed && !term) setTerm(seed);
  }, [searchParams, term]);

  async function ingestPasted(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const urls = Array.from(
      new Set(
        pasted
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => /^https?:\/\/\S+/i.test(s))
      )
    );
    if (!urls.length) {
      setErr("paste at least one URL");
      return;
    }
    if (!term.trim()) {
      setErr("search term required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm: term.trim(), urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ingest failed");
      setPasted("");
      setTerm("");
      router.push(`/?s=${data.searchId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={ingestPasted} className="flex flex-col gap-2">
      <input
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search term label…"
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
        suppressHydrationWarning
      />
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Paste TikTok URLs (one per line) — use the Lab Grab bookmarklet"
        rows={4}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
        suppressHydrationWarning
      />
      <button
        type="submit"
        disabled={busy || !pasted.trim() || !term.trim()}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Ingesting…" : "Ingest URLs"}
      </button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </form>
  );
}
