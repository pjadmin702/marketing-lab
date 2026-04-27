"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RedditAggregateRow } from "@/lib/reddit/redditQueries";
import { CONFIDENCE_BADGE, OPPORTUNITY_KIND_BADGE } from "@/lib/badge-styles";

const TABS = ["Action Plan", "Tools", "Pain Points", "Workflows", "Opportunities", "Trends"] as const;
type Tab = typeof TABS[number];

interface Props {
  runId: number;
  aggregate: RedditAggregateRow | null;
}

export function RedditAnalysisPanel({ runId, aggregate }: Props) {
  const [tab, setTab] = useState<Tab>("Action Plan");
  const counts: Record<Tab, number> = {
    "Action Plan":    aggregate?.action_plan_md ? 1 : 0,
    "Tools":          aggregate?.tools.length ?? 0,
    "Pain Points":    aggregate?.pain_points.length ?? 0,
    "Workflows":      aggregate?.workflows.length ?? 0,
    "Opportunities":  aggregate?.opportunities.length ?? 0,
    "Trends":         aggregate?.trends.length ?? 0,
  };

  return (
    <div className="flex h-full flex-col">
      <nav className="flex flex-wrap gap-1 border-b border-zinc-200 p-3 text-xs dark:border-zinc-800">
        {TABS.map((t) => {
          const active = t === tab;
          const empty = counts[t] === 0;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-md px-2 py-1 transition-colors " +
                (active
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : empty
                  ? "text-zinc-400 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:bg-zinc-900"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800")
              }
            >
              {t}
              {counts[t] > 0 && <span className={"ml-1 " + (active ? "opacity-70" : "opacity-50")}>{counts[t]}</span>}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {tab === "Action Plan" && (
          aggregate?.action_plan_md
            ? <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{aggregate.action_plan_md}</ReactMarkdown></div>
            : <p className="text-zinc-500">No action plan yet. Analyze posts to generate one.</p>
        )}
        {tab === "Tools" && (
          !aggregate || aggregate.tools.length === 0
            ? <p className="text-zinc-500">No tools surfaced yet.</p>
            : (
              <ul className="space-y-2">
                {aggregate.tools.map((t, i) => (
                  <li key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{t.name}</span>
                      <span className="text-[10px] text-zinc-500">{t.category}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CONFIDENCE_BADGE[t.best_confidence] ?? CONFIDENCE_BADGE.name_drop}`}>{t.best_confidence}</span>
                      {t.mention_count != null && <span className="text-[10px] text-zinc-500">×{t.mention_count}</span>}
                    </div>
                    {t.post_ids.length > 0 && (
                      <p className="mt-1 text-[10px] text-zinc-500">posts: {t.post_ids.map((id) => `#${id}`).join(", ")}</p>
                    )}
                  </li>
                ))}
              </ul>
            )
        )}
        {tab === "Pain Points" && (
          !aggregate || aggregate.pain_points.length === 0
            ? <p className="text-zinc-500">Nothing here yet.</p>
            : (
              <ul className="space-y-2">
                {aggregate.pain_points.map((p, i) => (
                  <li key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="text-sm">{p.text}</div>
                    {p.post_ids.length > 0 && <p className="mt-1 text-[10px] text-zinc-500">posts: {p.post_ids.map((id) => `#${id}`).join(", ")}</p>}
                  </li>
                ))}
              </ul>
            )
        )}
        {tab === "Workflows" && (
          !aggregate || aggregate.workflows.length === 0
            ? <p className="text-zinc-500">Nothing here yet.</p>
            : (
              <ul className="space-y-2">
                {aggregate.workflows.map((w, i) => (
                  <li key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="text-sm font-medium">{w.name}</div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{w.summary}</p>
                    {w.post_ids.length > 0 && <p className="mt-1 text-[10px] text-zinc-500">posts: {w.post_ids.map((id) => `#${id}`).join(", ")}</p>}
                  </li>
                ))}
              </ul>
            )
        )}
        {tab === "Opportunities" && (
          !aggregate || aggregate.opportunities.length === 0
            ? <p className="text-zinc-500">Nothing here yet.</p>
            : (
              <ul className="space-y-2">
                {aggregate.opportunities.map((o, i) => (
                  <li key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${OPPORTUNITY_KIND_BADGE[o.kind] ?? OPPORTUNITY_KIND_BADGE.experiment}`}>{o.kind.replace(/_/g, " ")}</span>
                      <span className="text-sm">{o.description}</span>
                    </div>
                    <p className="mt-1 text-xs italic text-zinc-600 dark:text-zinc-400">{o.rationale}</p>
                    {o.post_ids.length > 0 && <p className="mt-1 text-[10px] text-zinc-500">posts: {o.post_ids.map((id) => `#${id}`).join(", ")}</p>}
                  </li>
                ))}
              </ul>
            )
        )}
        {tab === "Trends" && (
          !aggregate || aggregate.trends.length === 0
            ? <p className="text-zinc-500">Nothing here yet.</p>
            : (
              <ul className="space-y-2">
                {aggregate.trends.map((t, i) => (
                  <li key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="text-sm font-medium">{t.name}</div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t.explanation}</p>
                    {t.post_ids.length > 0 && <p className="mt-1 text-[10px] text-zinc-500">posts: {t.post_ids.map((id) => `#${id}`).join(", ")}</p>}
                  </li>
                ))}
              </ul>
            )
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-zinc-200 p-3 text-[11px] dark:border-zinc-800">
        <a href={`/api/reddit/export?runId=${runId}&format=md`} target="_blank" rel="noreferrer" className="rounded-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">export md</a>
        <a href={`/api/reddit/export?runId=${runId}&format=json`} target="_blank" rel="noreferrer" className="rounded-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">export json</a>
        <a href={`/api/reddit/export?runId=${runId}&format=csv`} target="_blank" rel="noreferrer" className="rounded-md bg-zinc-100 px-2 py-1 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800">export csv</a>
      </div>
    </div>
  );
}
