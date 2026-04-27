"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewSearchForm() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm: term.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "launch failed");
      setTerm("");
      router.push(`/?s=${data.searchId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function ingestPasted() {
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
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search term…"
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
      />
      <button
        type="submit"
        disabled={busy || !term.trim()}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Working…" : "Open TikTok"}
      </button>
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="…or paste TikTok URLs (one per line)"
        rows={4}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
      />
      <button
        type="button"
        onClick={ingestPasted}
        disabled={busy || !pasted.trim() || !term.trim()}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        {busy ? "Ingesting…" : "Ingest pasted URLs"}
      </button>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </form>
  );
}
