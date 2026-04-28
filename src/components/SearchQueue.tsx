"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QueueItem } from "@/lib/queue";

const UNCATEGORIZED = "Other";

export function SearchQueue({ initial }: { initial: QueueItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>(initial);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    const data = await res.json();
    setItems(data.items ?? []);
  }

  async function seed() {
    setBusy(true);
    setInfo(null);
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      await refresh();
    } finally { setBusy(false); }
  }

  async function reseed() {
    setBusy(true);
    setInfo(null);
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reseed" }),
      });
      const data = await res.json();
      setItems(data.items ?? []);
      const parts: string[] = [];
      if (data.removed) parts.push(`removed ${data.removed} weak fits`);
      if (data.recategorized) parts.push(`recategorized ${data.recategorized}`);
      if (data.upserted) parts.push(`refreshed ${data.upserted}`);
      setInfo(parts.length ? parts.join(", ") + "." : "Already up to date.");
    } finally { setBusy(false); }
  }

  async function add() {
    const t = newTerm.trim();
    if (!t) return;
    setBusy(true);
    setInfo(null);
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
    setInfo(null);
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

  // Group pending items by category, preserving original priority/added_at order.
  const grouped = new Map<string, QueueItem[]>();
  for (const it of pending) {
    const c = it.category || UNCATEGORIZED;
    const arr = grouped.get(c) ?? [];
    arr.push(it);
    grouped.set(c, arr);
  }
  // Stable category order. Content-funnel categories first (those move the
  // needle for the user's TikTok → profile → Etsy funnel); Tier 2 / legacy
  // categories last; Other absolute last.
  const CATEGORY_ORDER = [
    "Hooks & openings",
    "Content formats",
    "Funnel: TikTok → Etsy",
    "Content sustainability",
    "Tier 2: Foundation",
    // Legacy categories — only show if user still has rows in them
    "Foundation",
    "Content automation",
    "Content strategy",
    "Business model",
    "E-commerce",
  ];
  const sortedCategories = [
    ...CATEGORY_ORDER.filter((c) => grouped.has(c)),
    ...[...grouped.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

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
              {busy ? "Loading…" : `Add starter set (${/* count */ ""}categorized)`}
            </button>
          </div>
        ) : (
          <>
            {sortedCategories.map((cat) => (
              <div key={cat} className="mb-2">
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {cat}
                </div>
                <ul className="flex flex-col">
                  {grouped.get(cat)!.map((it) => (
                    <QueueRow key={it.id} item={it} busy={busy} onOpen={open} onRemove={remove} />
                  ))}
                </ul>
              </div>
            ))}

            {done.length > 0 && (
              <div className="mb-2">
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Done ({done.length})
                </div>
                <ul className="flex flex-col">
                  {done.map((it) => (
                    <QueueRow key={it.id} item={it} busy={busy} onOpen={open} onRemove={remove} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {items.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5 px-2">
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
                  suppressHydrationWarning
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAdding(true)}
                  className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
                >
                  + add custom term
                </button>
                <button
                  onClick={reseed}
                  disabled={busy}
                  className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline disabled:opacity-40 dark:hover:text-zinc-300"
                  title="Replace weak-fit starter terms with the categorized set"
                >
                  reseed categorized
                </button>
              </div>
            )}
            {info && <p className="text-[10px] text-zinc-500">{info}</p>}
          </div>
        )}
      </div>
    </details>
  );
}

function QueueRow({
  item,
  busy,
  onOpen,
  onRemove,
}: {
  item: QueueItem;
  busy: boolean;
  onOpen: (item: QueueItem) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <li
      className={
        "group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900/60 " +
        (item.done ? "opacity-50" : "")
      }
    >
      <button
        onClick={() => onOpen(item)}
        className="min-w-0 flex-1 text-left"
      >
        <div className={"truncate " + (item.done ? "line-through" : "")}>
          {item.term}
        </div>
        {item.notes && (
          <div className="truncate text-[10px] text-zinc-500">{item.notes}</div>
        )}
      </button>
      <button
        onClick={() => onRemove(item.id)}
        disabled={busy}
        className="hidden text-[10px] text-zinc-400 hover:text-red-600 group-hover:inline disabled:opacity-40"
        title="Remove from queue"
      >
        ×
      </button>
    </li>
  );
}
