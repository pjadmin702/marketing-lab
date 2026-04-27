"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QueueItem } from "@/lib/queue";

export function SearchQueue({ initial }: { initial: QueueItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>(initial);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTerm, setNewTerm] = useState("");

  async function refresh() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    const data = await res.json();
    setItems(data.items ?? []);
  }

  async function seed() {
    setBusy(true);
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      await refresh();
    } finally { setBusy(false); }
  }

  async function add() {
    const t = newTerm.trim();
    if (!t) return;
    setBusy(true);
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: t }),
      });
      setNewTerm("");
      setAdding(false);
      await refresh();
    } finally { setBusy(false); }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await fetch("/api/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await refresh();
    } finally { setBusy(false); }
  }

  function open(item: QueueItem) {
    if (item.done && item.search_id) {
      router.push(`/?s=${item.search_id}`);
    } else {
      router.push(`/?seed=${encodeURIComponent(item.term)}`);
    }
  }

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <details open className="border-b border-zinc-200 dark:border-zinc-800">
      <summary className="flex cursor-pointer items-center justify-between p-4 text-xs font-medium uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
        <span>Suggested ({pending.length}/{items.length})</span>
        <span className="text-[10px] normal-case tracking-normal">click to expand</span>
      </summary>
      <div className="px-2 pb-3">
        {items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-zinc-500">
            <p className="mb-2">No suggested searches yet.</p>
            <button
              onClick={seed}
              disabled={busy}
              className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {busy ? "Loading…" : "Add starter set (14 terms)"}
            </button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {[...pending, ...done].map((it) => (
              <li
                key={it.id}
                className={
                  "group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900/60 " +
                  (it.done ? "opacity-50" : "")
                }
              >
                <button
                  onClick={() => open(it)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className={"truncate " + (it.done ? "line-through" : "")}>
                    {it.term}
                  </div>
                  {it.notes && (
                    <div className="truncate text-[10px] text-zinc-500">{it.notes}</div>
                  )}
                </button>
                <button
                  onClick={() => remove(it.id)}
                  disabled={busy}
                  className="hidden text-[10px] text-zinc-400 hover:text-red-600 group-hover:inline disabled:opacity-40"
                  title="Remove from queue"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <div className="mt-2 px-2">
            {adding ? (
              <form
                onSubmit={(e) => { e.preventDefault(); add(); }}
                className="flex gap-1"
              >
                <input
                  autoFocus
                  type="text"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  placeholder="Search term…"
                  className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button
                  type="submit"
                  disabled={busy || !newTerm.trim()}
                  className="rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
                >
                  add
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewTerm(""); }}
                  className="text-[11px] text-zinc-500"
                >
                  cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
              >
                + add custom term
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
