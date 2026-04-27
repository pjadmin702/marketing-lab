"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function SearchHistoryItem({
  id,
  term,
  videoCount,
  timeLabel,
  isActive,
}: {
  id: number;
  term: string;
  videoCount: number;
  timeLabel: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const msg =
      videoCount > 0
        ? `Delete "${term}" and all ${videoCount} videos + analyses? This can't be undone.`
        : `Delete "${term}"?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/searches/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `delete failed (${res.status})`);
      }
      // If we just deleted the active one, drop the ?s= param.
      if (isActive) router.push("/");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="group relative">
      <Link
        href={`/?s=${id}`}
        className={`block rounded-md px-2 py-2 pr-7 text-sm transition-colors ${
          isActive
            ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
        }`}
      >
        <div className="truncate font-medium">{term}</div>
        <div
          className={`flex justify-between text-xs ${
            isActive ? "opacity-70" : "text-zinc-500"
          }`}
        >
          <span>{videoCount} videos</span>
          <span>{timeLabel}</span>
        </div>
      </Link>
      <button
        onClick={remove}
        disabled={busy}
        title="Delete search"
        className={
          "absolute right-1 top-1 hidden rounded p-1 text-xs leading-none group-hover:inline-block disabled:opacity-40 " +
          (isActive
            ? "text-zinc-300 hover:bg-zinc-700 hover:text-white dark:text-zinc-600 dark:hover:bg-zinc-200 dark:hover:text-zinc-900"
            : "text-zinc-400 hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-800")
        }
      >
        ×
      </button>
    </li>
  );
}
