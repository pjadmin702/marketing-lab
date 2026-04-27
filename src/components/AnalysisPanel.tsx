"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AggregateRow, ToolInventoryRow, VideoAnalysisRow,
} from "@/lib/queries";

const TABS = [
  "Action Plan",
  "Tools",
  "Methods",
  "Systems",
  "Hooks",
  "Frameworks",
  "Viral Signals",
  "Pitfalls",
  "Speed-to-Publish",
  "Funnel Flags",
] as const;
type Tab = typeof TABS[number];

interface Props {
  aggregate: AggregateRow | null;
  tools: ToolInventoryRow[];
  videoAnalyses: VideoAnalysisRow[];
}

export function AnalysisPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("Action Plan");
  const counts: Record<Tab, number> = {
    "Action Plan":      props.aggregate ? 1 : 0,
    "Tools":            props.tools.length,
    "Methods":          props.aggregate?.methods.length ?? 0,
    "Systems":          props.aggregate?.systems.length ?? 0,
    "Hooks":            props.aggregate?.hooks.length ?? 0,
    "Frameworks":       props.aggregate?.frameworks.length ?? 0,
    "Viral Signals":    props.aggregate?.viral_signals.length ?? 0,
    "Pitfalls":         props.aggregate?.pitfalls.length ?? 0,
    "Speed-to-Publish": props.aggregate?.speed_to_publish.length ?? 0,
    "Funnel Flags":     props.videoAnalyses.filter((v) => v.funnel_signals.length > 0).length,
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
              {counts[t] > 0 && (
                <span className={"ml-1 " + (active ? "opacity-70" : "opacity-50")}>{counts[t]}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {tab === "Action Plan" && <ActionPlan agg={props.aggregate} />}
        {tab === "Tools" && <ToolsView tools={props.tools} />}
        {tab === "Methods" && <NamedList items={props.aggregate?.methods} keyName="name" textName="explanation" />}
        {tab === "Systems" && <NamedList items={props.aggregate?.systems} keyName="name" textName="pipeline" />}
        {tab === "Hooks" && <HooksView hooks={props.aggregate?.hooks} />}
        {tab === "Frameworks" && <NamedList items={props.aggregate?.frameworks} keyName="name" textName="structure" />}
        {tab === "Viral Signals" && <NamedList items={props.aggregate?.viral_signals} keyName="signal" textName="explanation" />}
        {tab === "Pitfalls" && <NamedList items={props.aggregate?.pitfalls} keyName="name" textName="explanation" />}
        {tab === "Speed-to-Publish" && <NamedList items={props.aggregate?.speed_to_publish} keyName="tactic" textName="explanation" />}
        {tab === "Funnel Flags" && <FunnelFlagsView analyses={props.videoAnalyses} />}
      </div>
    </div>
  );
}

/* ---------- subviews ---------- */

function ActionPlan({ agg }: { agg: AggregateRow | null }) {
  if (!agg || !agg.action_plan_md) {
    return <p className="text-zinc-500">No action plan yet. Run analysis once transcripts are ready.</p>;
  }
  return (
    <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{agg.action_plan_md}</ReactMarkdown>
    </div>
  );
}

const CONFIDENCE_BADGE: Record<string, string> = {
  demoed:         "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  named_specific: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  name_drop:      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  pitch_bait:     "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function confidenceLabel(c: string): string {
  return c === "named_specific" ? "named" : c === "pitch_bait" ? "pitch" : c;
}

function ToolsView({ tools }: { tools: ToolInventoryRow[] }) {
  const [filter, setFilter] = useState<"all" | "trustworthy" | "low_trust">("all");
  const visible = tools.filter((t) => {
    if (filter === "all") return true;
    const trust = t.best_confidence === "demoed" || t.best_confidence === "named_specific";
    return filter === "trustworthy" ? trust : !trust;
  });

  if (tools.length === 0) {
    return <p className="text-zinc-500">No tools surfaced yet.</p>;
  }

  // Group by category
  const groups = new Map<string, ToolInventoryRow[]>();
  for (const t of visible) {
    const k = t.category || "other";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  return (
    <div>
      <div className="mb-3 flex gap-1 text-xs">
        {(["all", "trustworthy", "low_trust"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "rounded-md px-2 py-1 " +
              (filter === f
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800")
            }
          >
            {f === "trustworthy" ? "demoed/named" : f === "low_trust" ? "name-drop/pitch" : "all"}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {[...groups.entries()].map(([cat, list]) => (
          <section key={cat}>
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              {cat.replace(/_/g, " ")}
            </h3>
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.tool_id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {t.official_url ? (
                          <a href={t.official_url} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline">
                            {t.name}
                          </a>
                        ) : (
                          <span className="text-sm font-semibold">{t.name}</span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CONFIDENCE_BADGE[t.best_confidence]}`}>
                          {confidenceLabel(t.best_confidence)}
                        </span>
                        {t.pricing && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {t.pricing}
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500">×{t.mention_count}</span>
                      </div>
                      {t.what_it_does && (
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t.what_it_does}</p>
                      )}
                    </div>
                  </div>
                  {t.source_videos.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                        {t.source_videos.length} mention{t.source_videos.length > 1 ? "s" : ""}
                      </summary>
                      <ul className="mt-1 space-y-1 border-l-2 border-zinc-200 pl-3 dark:border-zinc-800">
                        {t.source_videos.map((sv, i) => (
                          <li key={i} className="text-[11px]">
                            <span className={`mr-1 rounded px-1 py-0.5 text-[9px] ${CONFIDENCE_BADGE[sv.confidence]}`}>
                              {confidenceLabel(sv.confidence)}
                            </span>
                            <span className="text-zinc-500">@{sv.author || "?"}:</span>{" "}
                            <span className="italic text-zinc-600 dark:text-zinc-400">&ldquo;{sv.raw_mention}&rdquo;</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

interface ListItem { video_ids: number[] }

function NamedList<T extends ListItem>({
  items,
  keyName,
  textName,
}: {
  items: T[] | undefined;
  keyName: keyof T;
  textName: keyof T;
}) {
  if (!items || items.length === 0) return <p className="text-zinc-500">Nothing here yet.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
          <div className="text-sm font-medium">{String(item[keyName])}</div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{String(item[textName])}</p>
          {item.video_ids.length > 0 && (
            <p className="mt-1 text-[10px] text-zinc-500">
              Source videos: {item.video_ids.map((id) => `#${id}`).join(", ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function HooksView({ hooks }: { hooks: AggregateRow["hooks"] | undefined }) {
  if (!hooks || hooks.length === 0) return <p className="text-zinc-500">No hooks captured yet.</p>;
  return (
    <ul className="space-y-2">
      {hooks.map((h, i) => (
        <li key={i} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
          <div className="text-sm font-medium">{h.formula}</div>
          <p className="mt-1 text-xs italic text-zinc-600 dark:text-zinc-400">&ldquo;{h.example}&rdquo;</p>
          {h.video_ids.length > 0 && (
            <p className="mt-1 text-[10px] text-zinc-500">
              Source videos: {h.video_ids.map((id) => `#${id}`).join(", ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function FunnelFlagsView({ analyses }: { analyses: VideoAnalysisRow[] }) {
  if (analyses.length === 0 || !analyses.some((v) => v.signal_density != null)) {
    return <p className="text-zinc-500">Run analysis to see per-video funnel flags.</p>;
  }
  return (
    <ul className="space-y-2">
      {analyses.map((v) => (
        <li key={v.video_id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <a
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-1 flex-1 text-sm font-medium hover:underline"
            >
              {v.title || `video #${v.video_id}`}
            </a>
            <SignalBadge density={v.signal_density} />
          </div>
          <div className="mt-1 flex gap-2 text-[11px] text-zinc-500">
            {v.author && <span>@{v.author}</span>}
            {v.creator_intent && <span>intent: {v.creator_intent.replace(/_/g, " ")}</span>}
          </div>
          {v.summary && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{v.summary}</p>
          )}
          {v.funnel_signals.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-red-600 hover:text-red-700 dark:text-red-400">
                {v.funnel_signals.length} funnel signal{v.funnel_signals.length > 1 ? "s" : ""}
              </summary>
              <ul className="mt-1 space-y-1 border-l-2 border-red-200 pl-3 dark:border-red-900">
                {v.funnel_signals.map((s, i) => (
                  <li key={i} className="text-[11px] italic text-zinc-600 dark:text-zinc-400">
                    &ldquo;{s}&rdquo;
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

function SignalBadge({ density }: { density: number | null }) {
  if (density == null) {
    return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">pending</span>;
  }
  const pct = Math.round(density * 100);
  let cls = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  if (density >= 0.7) cls = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  else if (density >= 0.4) cls = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return (
    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      signal {pct}%
    </span>
  );
}
