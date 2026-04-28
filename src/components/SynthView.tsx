"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SynthBrief, BriefKind } from "@/lib/synth";

export function SynthView({ initial }: { initial: SynthBrief[] }) {
  const router = useRouter();
  const [briefs, setBriefs] = useState<SynthBrief[]>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(initial[0]?.id ?? null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<BriefKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const selected = briefs.find((b) => b.id === selectedId) ?? null;

  async function generate(kind: BriefKind) {
    if (busy) return;
    setBusy(true);
    setBusyKind(kind);
    setErr(null);
    setElapsed(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    try {
      const res = await fetch("/api/synth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, question: question.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `generate failed (${res.status})`);
      const newBrief = data.brief as SynthBrief;
      setBriefs([newBrief, ...briefs]);
      setSelectedId(newBrief.id);
      setQuestion("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(tick);
      setBusy(false);
      setBusyKind(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this brief?")) return;
    setBusy(true);
    try {
      await fetch(`/api/synth/${id}`, { method: "DELETE" });
      const next = briefs.filter((b) => b.id !== id);
      setBriefs(next);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid h-full grid-cols-[300px_1fr] overflow-hidden">
      {/* Left: history + generate */}
      <aside className="flex flex-col overflow-hidden border-r border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Generate brief
          </h2>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Optional: focus question (e.g. 'this week I want to test packaging POVs')"
            rows={3}
            className="mb-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            suppressHydrationWarning
          />
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => generate("sprint")}
              disabled={busy}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
              title="Read your plan + library and produce a 7-day TikTok shoot/post sprint"
            >
              {busy && busyKind === "sprint" ? `Generating sprint… ${elapsed}s` : "📅 Generate 7-day sprint"}
            </button>
            <button
              onClick={() => generate("systems")}
              disabled={busy}
              className="w-full rounded-md border border-violet-500/60 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40 dark:border-violet-400/40 dark:text-violet-300 dark:hover:bg-violet-950/40"
              title="Read your plan + library and propose 3-5 buildable AI systems with repo scaffolds"
            >
              {busy && busyKind === "systems" ? `Generating systems… ${elapsed}s` : "🛠 Generate systems to build"}
            </button>
          </div>
          {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 pb-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              History ({briefs.length})
            </h2>
          </div>
          {briefs.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-zinc-500">
              No briefs yet. Click Generate above.
            </p>
          ) : (
            <ul className="px-2 pb-4">
              {briefs.map((b) => {
                const isActive = b.id === selectedId;
                return (
                  <li key={b.id} className="group relative">
                    <button
                      onClick={() => setSelectedId(b.id)}
                      className={`block w-full rounded-md px-2 py-2 pr-7 text-left text-xs transition-colors ${
                        isActive
                          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <KindBadge kind={b.kind} active={isActive} />
                        <div className="min-w-0 flex-1 truncate font-medium">
                          {b.question || (b.kind === "systems" ? "Systems brief" : "Sprint brief")}
                        </div>
                      </div>
                      <div className={"mt-0.5 " + (isActive ? "opacity-70" : "text-zinc-500")}>
                        {fmtTime(b.created_at)} · {b.library_size} entities · {b.source_searches} searches
                      </div>
                    </button>
                    <button
                      onClick={() => remove(b.id)}
                      className={
                        "absolute right-1 top-1 hidden rounded p-1 text-xs leading-none group-hover:inline-block " +
                        (isActive ? "text-zinc-300 hover:bg-zinc-700 hover:text-white dark:text-zinc-600 dark:hover:bg-zinc-200 dark:hover:text-zinc-900"
                                  : "text-zinc-400 hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-800")
                      }
                      title="Delete brief"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Right: brief content */}
      <main className="flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <div>
              <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
                Synth brief
              </h3>
              <p className="mt-2 max-w-md text-sm text-zinc-500">
                Reads your Plan + Library + recent action plans, generates a 7-day content sprint
                tailored to your products. Click <b>Generate</b>.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-baseline justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <KindBadge kind={selected.kind} active={false} />
                <div>
                  <h2 className="text-sm font-semibold">
                    {selected.question || (selected.kind === "systems" ? "Systems brief" : "Sprint brief")}
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {fmtTime(selected.created_at)} · {selected.library_size} library entities · {selected.source_searches} source searches
                    {selected.cost_usd ? ` · $${selected.cost_usd.toFixed(3)}` : ""}
                  </p>
                </div>
              </div>
            </header>
            <article className="prose prose-zinc max-w-none flex-1 overflow-y-auto px-8 py-6 dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content_md}</ReactMarkdown>
            </article>
          </>
        )}
      </main>
    </div>
  );
}

function KindBadge({ kind, active }: { kind: BriefKind; active: boolean }) {
  const isSystems = kind === "systems";
  const baseCls = "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide flex-shrink-0";
  if (active) {
    // On dark/active rows, use a subtle inverted treatment.
    return <span className={baseCls + " bg-white/20 text-white dark:bg-zinc-900/30 dark:text-zinc-900"}>{isSystems ? "sys" : "spr"}</span>;
  }
  const cls = isSystems
    ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  return <span className={`${baseCls} ${cls}`}>{isSystems ? "sys" : "spr"}</span>;
}

function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}
