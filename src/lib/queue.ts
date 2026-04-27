import { getDB } from "./db";

export interface QueueItem {
  id: number;
  term: string;
  notes: string | null;
  priority: number;
  added_at: number;
  done: boolean;
  search_id: number | null;
}

/**
 * Suggested starter searches surfaced when the queue is empty. Tuned for
 * "use Claude/AI to grow a one-person marketing operation" workflows.
 */
export const STARTER_SEARCHES: { term: string; notes?: string }[] = [
  { term: "claude skills",                  notes: "bleeding-edge, fast-changing — scrape soon" },
  { term: "claude code agentic SDK",        notes: "agentic workflow patterns" },
  { term: "claude code marketing agency",   notes: "Claude-specific marketing usage" },
  { term: "claude AI ad creation",          notes: "ad workflows with Claude" },
  { term: "claude desktop agent workflow",  notes: "computer-use / desktop agent patterns" },
  { term: "one person AI agency",           notes: "solo business model + stack" },
  { term: "AI marketing agency tutorial",   notes: "agency operations / pricing / pitch" },
  { term: "solopreneur AI stack",           notes: "tool-stack inspiration" },
  { term: "AI marketing automation 2026",   notes: "current state of the art" },
  { term: "automate tiktok content with AI", notes: "content pipeline for TikTok" },
  { term: "AI UGC creator workflow",        notes: "UGC/ad creator workflows" },
  { term: "viral hook formula AI",          notes: "hooks that scroll-stop" },
  { term: "direct response copywriting AI", notes: "copy patterns for high-conversion content" },
  { term: "AI funnel builder tutorial",     notes: "funnel structure + tooling" },
];

export function listQueue(): QueueItem[] {
  return getDB().prepare(
    `SELECT q.id, q.term, q.notes, q.priority, q.added_at,
            (SELECT s.id
               FROM searches s
              WHERE s.term = q.term COLLATE NOCASE
              ORDER BY s.id DESC LIMIT 1)               AS search_id,
            CASE WHEN EXISTS (
              SELECT 1
                FROM searches s
                JOIN aggregate_analyses a ON a.search_id = s.id
               WHERE s.term = q.term COLLATE NOCASE
            ) THEN 1 ELSE 0 END                         AS done
       FROM search_queue q
      ORDER BY done ASC, q.priority DESC, q.added_at ASC`
  ).all().map((r) => ({
    ...(r as Omit<QueueItem, "done">),
    done: Boolean((r as { done: number }).done),
  })) as QueueItem[];
}

export function addToQueue(term: string, notes?: string | null, priority = 0): QueueItem | null {
  const t = term.trim();
  if (!t) return null;
  getDB().prepare(
    `INSERT INTO search_queue (term, notes, priority)
     VALUES (?, ?, ?)
     ON CONFLICT(term) DO UPDATE SET
       notes    = COALESCE(excluded.notes,    search_queue.notes),
       priority = MAX(excluded.priority, search_queue.priority)`
  ).run(t, notes ?? null, priority);
  return listQueue().find((q) => q.term.toLowerCase() === t.toLowerCase()) ?? null;
}

export function removeFromQueue(id: number): void {
  getDB().prepare("DELETE FROM search_queue WHERE id = ?").run(id);
}

export function seedStarterSearches(): number {
  const db = getDB();
  const insert = db.prepare(
    `INSERT INTO search_queue (term, notes)
     VALUES (?, ?)
     ON CONFLICT(term) DO NOTHING`
  );
  const tx = db.transaction(() => {
    let n = 0;
    for (const s of STARTER_SEARCHES) {
      const r = insert.run(s.term, s.notes ?? null);
      if (r.changes > 0) n++;
    }
    return n;
  });
  return tx();
}
