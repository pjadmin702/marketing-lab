import Link from "next/link";
import {
  listRuns, getRun, listPostsForRun, getRunAggregate,
  listCrossSourceAggregates, getCrossSourceAggregate, listRunQueries,
} from "@/lib/reddit/redditQueries";
import { listSubreddits, listGroups } from "@/lib/reddit/subredditManager";
import { listSearches } from "@/lib/queries";
import { NavTabs } from "@/components/NavTabs";
import { NewRunForm } from "@/components/reddit/NewRunForm";
import { IngestPanel } from "@/components/reddit/IngestPanel";
import { PostList } from "@/components/reddit/PostList";
import { RedditAnalysisPanel } from "@/components/reddit/RedditAnalysisPanel";
import { CrossSourcePanel } from "@/components/reddit/CrossSourcePanel";
import { fmtTime } from "@/lib/format-utils";

export const dynamic = "force-dynamic";

export default async function RedditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const runParam = Array.isArray(params.run) ? params.run[0] : params.run;
  const xsParam  = Array.isArray(params.xs)  ? params.xs[0]  : params.xs;
  const runId = runParam ? Number(runParam) : null;
  const xsId  = xsParam  ? Number(xsParam)  : null;

  const runs = listRuns();
  const active = runId ? getRun(runId) : null;
  const subreddits = listSubreddits();
  const groups = listGroups();
  const posts = active ? listPostsForRun(active.id, { limit: 500 }) : [];
  const aggregate = active ? getRunAggregate(active.id) : null;
  const queries = active ? listRunQueries(active.id) : [];
  const tiktokSearches = listSearches().map((s) => ({ id: s.id, term: s.term }));
  const savedCross = listCrossSourceAggregates();
  const xsFull = xsId ? getCrossSourceAggregate(xsId) : null;
  const xsView = xsFull ? { id: xsFull.id, label: xsFull.label, action_plan_md: xsFull.action_plan_md } : null;

  return (
    <div className="flex h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <NavTabs active="reddit" />
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_440px] divide-x divide-zinc-200 dark:divide-zinc-800">
        {/* ---- LEFT: runs list + new run + ingest panel ---- */}
        <aside className="flex flex-col overflow-hidden">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <h1 className="text-sm font-semibold">Reddit Research</h1>
            <p className="mt-1 text-xs text-zinc-500">Polite-citizen Reddit ingestion. Public JSON only.</p>
          </div>
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">New run</h2>
            <NewRunForm />
          </div>
          <div className="overflow-y-auto">
            <div className="p-4 pb-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Runs ({runs.length})</h2>
            </div>
            {runs.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-zinc-500">No runs yet.</p>
            ) : (
              <ul className="px-2 pb-4">
                {runs.map((r) => {
                  const isActive = active?.id === r.id;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/reddit?run=${r.id}`}
                        className={"block rounded-md px-2 py-2 text-sm " + (isActive ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900")}
                      >
                        <div className="truncate font-medium">{r.label}</div>
                        <div className={"flex justify-between text-xs " + (isActive ? "opacity-70" : "text-zinc-500")}>
                          <span>{r.post_count} posts · {r.analyzed_count} analyzed</span>
                          <span>{fmtTime(r.created_at)}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {active && (
            <div className="mt-auto border-t border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Ingest into &ldquo;{active.label}&rdquo;</h2>
              <IngestPanel runId={active.id} subreddits={subreddits} groups={groups} />
            </div>
          )}
        </aside>

        {/* ---- CENTER: post list ---- */}
        <section className="flex flex-col overflow-hidden">
          {!active ? (
            <EmptyState title="Pick a run" body="Select a run on the left, or create a new one." />
          ) : (
            <>
              <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">Run</div>
                  <h2 className="truncate text-lg font-semibold">{active.label}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {active.post_count} posts · {active.analyzed_count} analyzed · {queries.length} queries
                  </p>
                  {queries.some((q) => q.status === "blocked") && (
                    <p className="mt-1 text-xs text-red-500">
                      Some queries were blocked by Reddit. Set REDDIT_CLIENT_ID/SECRET in .env.local for OAuth.
                    </p>
                  )}
                </div>
              </header>
              <PostList runId={active.id} posts={posts} />
            </>
          )}
        </section>

        {/* ---- RIGHT: analysis + cross-source ---- */}
        <aside className="flex flex-col overflow-hidden">
          {!active ? (
            <div className="p-4 text-sm text-zinc-500">Pick a run to see analysis.</div>
          ) : (
            <>
              <header className="border-b border-zinc-200 p-4 dark:border-zinc-800">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Analysis</div>
                <h2 className="text-sm font-semibold">{aggregate ? "Run synthesis" : "Run analysis to see synthesis"}</h2>
              </header>
              <div className="flex-1 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
                <RedditAnalysisPanel runId={active.id} aggregate={aggregate} />
              </div>
              <div className="overflow-y-auto p-4">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Cross-source brief</h2>
                <CrossSourcePanel
                  redditRunId={active.id}
                  tiktokSearches={tiktokSearches}
                  saved={savedCross}
                  selectedAggregate={xsView}
                />
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">{body}</p>
    </div>
  );
}
