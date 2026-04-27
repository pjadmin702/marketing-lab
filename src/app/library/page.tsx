import Link from "next/link";
import { getDB } from "@/lib/db";

const ENTITY_TYPES = [
  { type: "methods",       label: "Methods",        table: "methods",       mentions: "method_mentions",        fk: "method_id" },
  { type: "systems",       label: "Systems",        table: "systems",       mentions: "system_mentions",        fk: "system_id" },
  { type: "hooks",         label: "Hooks",          table: "hooks",         mentions: "hook_mentions",          fk: "hook_id" },
  { type: "frameworks",    label: "Frameworks",     table: "frameworks",    mentions: "framework_mentions",     fk: "framework_id" },
  { type: "viral_signals", label: "Viral Signals",  table: "viral_signals", mentions: "viral_signal_mentions",  fk: "viral_signal_id" },
  { type: "pitfalls",      label: "Pitfalls",       table: "pitfalls",      mentions: "pitfall_mentions",       fk: "pitfall_id" },
  { type: "speed_tactics", label: "Speed Tactics",  table: "speed_tactics", mentions: "speed_tactic_mentions",  fk: "speed_tactic_id" },
  { type: "tools",         label: "Tools",          table: "tools",         mentions: "tool_mentions",          fk: "tool_id" },
] as const;

type EntityType = typeof ENTITY_TYPES[number]["type"];

interface EntityListRow {
  id: number;
  name: string;
  description: string | null;
  first_seen: number | null;
  last_seen: number | null;
  video_count: number;
  search_count: number;
}

interface ToolListRow extends EntityListRow {
  pricing: string | null;
  price_note: string | null;
  official_url: string | null;
}

interface MentionVideoRow {
  video_id: number;
  title: string | null;
  author: string | null;
  url: string;
  search_id: number;
  search_term: string;
}

function findType(t: string | undefined): typeof ENTITY_TYPES[number] {
  return ENTITY_TYPES.find((e) => e.type === t) ?? ENTITY_TYPES[0];
}

function getCounts(): Record<EntityType, number> {
  const db = getDB();
  const counts = {} as Record<EntityType, number>;
  for (const e of ENTITY_TYPES) {
    counts[e.type] = (db.prepare(`SELECT COUNT(*) as c FROM ${e.table}`).get() as { c: number }).c;
  }
  return counts;
}

function getEntities(t: typeof ENTITY_TYPES[number]): EntityListRow[] | ToolListRow[] {
  const db = getDB();
  if (t.type === "tools") {
    return db.prepare(
      `SELECT e.id, e.name,
              e.what_it_does AS description,
              e.created_at  AS first_seen,
              e.researched_at AS last_seen,
              e.pricing, e.price_note, e.official_url,
              COUNT(DISTINCT m.video_id)  AS video_count,
              COUNT(DISTINCT m.search_id) AS search_count
         FROM tools e
         LEFT JOIN tool_mentions m ON m.tool_id = e.id
        GROUP BY e.id
        ORDER BY video_count DESC, e.name COLLATE NOCASE ASC`
    ).all() as ToolListRow[];
  }
  return db.prepare(
    `SELECT e.id, e.name, e.description, e.first_seen, e.last_seen,
            COUNT(DISTINCT m.video_id)  AS video_count,
            COUNT(DISTINCT m.search_id) AS search_count
       FROM ${t.table} e
       LEFT JOIN ${t.mentions} m ON m.${t.fk} = e.id
      GROUP BY e.id
      ORDER BY video_count DESC, e.last_seen DESC`
  ).all() as EntityListRow[];
}

function getEntity(t: typeof ENTITY_TYPES[number], id: number): (EntityListRow | ToolListRow) | null {
  const db = getDB();
  if (t.type === "tools") {
    return db.prepare(
      `SELECT e.id, e.name,
              e.what_it_does AS description,
              e.created_at  AS first_seen,
              e.researched_at AS last_seen,
              e.pricing, e.price_note, e.official_url,
              COUNT(DISTINCT m.video_id)  AS video_count,
              COUNT(DISTINCT m.search_id) AS search_count
         FROM tools e
         LEFT JOIN tool_mentions m ON m.tool_id = e.id
        WHERE e.id = ?
        GROUP BY e.id`
    ).get(id) as ToolListRow | undefined ?? null;
  }
  return db.prepare(
    `SELECT e.id, e.name, e.description, e.first_seen, e.last_seen,
            COUNT(DISTINCT m.video_id)  AS video_count,
            COUNT(DISTINCT m.search_id) AS search_count
       FROM ${t.table} e
       LEFT JOIN ${t.mentions} m ON m.${t.fk} = e.id
      WHERE e.id = ?
      GROUP BY e.id`
  ).get(id) as EntityListRow | undefined ?? null;
}

function getMentions(t: typeof ENTITY_TYPES[number], id: number): MentionVideoRow[] {
  return getDB().prepare(
    `SELECT v.id  AS video_id, v.title, v.author, v.url,
            s.id  AS search_id, s.term AS search_term
       FROM ${t.mentions} m
       JOIN videos   v ON v.id = m.video_id
       JOIN searches s ON s.id = m.search_id
      WHERE m.${t.fk} = ?
      ORDER BY m.created_at DESC, v.id DESC`
  ).all(id) as MentionVideoRow[];
}

function fmtDate(epoch: number | null): string {
  if (!epoch) return "—";
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const params = await searchParams;
  const t = findType(params.type);
  const counts = getCounts();
  const items = getEntities(t);
  const detailId = params.id ? Number(params.id) : null;
  const detail = detailId ? getEntity(t, detailId) : null;
  const mentions = detail ? getMentions(t, detail.id) : [];

  return (
    <div className="grid h-screen grid-cols-[260px_1fr] grid-rows-1">
      {/* Left sidebar: tabs */}
      <aside className="flex flex-col overflow-y-auto border-r border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Marketing-Lab</div>
        <h1 className="mb-4 text-lg font-bold">Library</h1>
        <Link
          href="/"
          className="mb-4 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
        >
          ← back to searches
        </Link>
        <nav className="flex flex-col gap-1">
          {ENTITY_TYPES.map((e) => {
            const active = e.type === t.type;
            const c = counts[e.type] ?? 0;
            return (
              <Link
                key={e.type}
                href={`/library?type=${e.type}`}
                className={
                  "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors " +
                  (active
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900")
                }
              >
                <span>{e.label}</span>
                <span className={"text-xs " + (active ? "opacity-70" : "opacity-50")}>{c}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Right: list + optional detail */}
      <main className="flex flex-col overflow-hidden">
        <header className="flex items-baseline justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">{t.label}</h2>
          <span className="text-xs text-zinc-500">{items.length} unique · sorted by mention count</span>
        </header>

        {detail ? (
          <DetailView t={t} detail={detail} mentions={mentions} />
        ) : items.length === 0 ? (
          <div className="flex-1 p-6 text-sm text-zinc-500">
            No entries yet. Run analysis on a search (or run <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-900">npm run kg:backfill</code>).
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-zinc-200 overflow-y-auto dark:divide-zinc-800">
            {items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/library?type=${t.type}&id=${it.id}`}
                  className="block px-6 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{it.name}</div>
                      {it.description && (
                        <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{it.description}</div>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-[11px] text-zinc-500">
                      <span><b className="text-zinc-700 dark:text-zinc-300">{it.video_count}</b> videos</span>
                      <span><b className="text-zinc-700 dark:text-zinc-300">{it.search_count}</b> searches</span>
                      {"pricing" in it && it.pricing && it.pricing !== "unknown" && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase dark:bg-zinc-800">
                          {it.pricing}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function DetailView({
  t, detail, mentions,
}: {
  t: typeof ENTITY_TYPES[number];
  detail: EntityListRow | ToolListRow;
  mentions: MentionVideoRow[];
}) {
  const tool = "pricing" in detail ? (detail as ToolListRow) : null;
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <Link
        href={`/library?type=${t.type}`}
        className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
      >
        ← back to {t.label.toLowerCase()}
      </Link>

      <h3 className="mt-3 text-xl font-semibold">{detail.name}</h3>

      {detail.description && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{detail.description}</p>
      )}

      {tool && (
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
          {tool.pricing && (
            <>
              <dt className="text-zinc-500">Pricing</dt>
              <dd>{tool.pricing}{tool.price_note ? ` · ${tool.price_note}` : ""}</dd>
            </>
          )}
          {tool.official_url && (
            <>
              <dt className="text-zinc-500">Site</dt>
              <dd>
                <a href={tool.official_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                  {tool.official_url}
                </a>
              </dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-4 flex gap-4 text-xs text-zinc-500">
        <span><b className="text-zinc-700 dark:text-zinc-300">{detail.video_count}</b> source videos</span>
        <span><b className="text-zinc-700 dark:text-zinc-300">{detail.search_count}</b> searches</span>
        <span>first seen {fmtDate(detail.first_seen)}</span>
        <span>last seen {fmtDate(detail.last_seen)}</span>
      </div>

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Source videos ({mentions.length})
      </h4>
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {mentions.map((m) => (
          <li key={`${m.search_id}-${m.video_id}`} className="py-2">
            <a
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm hover:underline"
            >
              {m.title || `(untitled video ${m.video_id})`}
            </a>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
              {m.author && <span>@{m.author}</span>}
              <span>
                search:{" "}
                <Link href={`/?s=${m.search_id}`} className="underline-offset-2 hover:underline">
                  {m.search_term}
                </Link>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
