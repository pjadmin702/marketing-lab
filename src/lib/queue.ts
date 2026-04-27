import { getDB } from "./db";

export interface QueueItem {
  id: number;
  term: string;
  notes: string | null;
  category: string | null;
  priority: number;
  added_at: number;
  done: boolean;
  search_id: number | null;
}

/**
 * Categorized starter searches surfaced when the queue is empty. Tuned for
 * "use Claude/AI to grow a one-person operation that drives organic traffic
 * to e-commerce shops" — works for both Kooki Studio and Psychic Jahari.
 */
export const STARTER_SEARCHES: { term: string; notes?: string; category: string }[] = [
  // Foundation: Claude / AI tooling for building the pipeline
  { term: "claude skills",                   category: "Foundation",          notes: "bleeding-edge, fast-changing — scrape soon" },
  { term: "claude code agentic SDK",         category: "Foundation",          notes: "agentic workflow patterns" },
  { term: "claude desktop agent workflow",   category: "Foundation",          notes: "computer-use / desktop agent patterns" },
  { term: "solopreneur AI stack",            category: "Foundation",          notes: "tool-stack inspiration" },
  { term: "AI marketing automation 2026",    category: "Foundation",          notes: "current state of the art" },

  // Content automation
  { term: "automate tiktok content with AI", category: "Content automation",  notes: "content pipeline for TikTok" },
  { term: "AI UGC creator workflow",         category: "Content automation",  notes: "UGC / ad creator workflows" },

  // Content strategy: hooks + copy patterns that work
  { term: "viral hook formula AI",           category: "Content strategy",    notes: "first-3-second hooks that scroll-stop" },
  { term: "direct response copywriting AI",  category: "Content strategy",    notes: "high-conversion copy patterns" },

  // Solo business model
  { term: "one person AI agency",            category: "Business model",      notes: "solo / one-person model + stack" },

  // E-commerce — broad enough for any Etsy-style shop
  { term: "etsy organic traffic tiktok",     category: "E-commerce",          notes: "TikTok → Etsy traffic tactics" },
  { term: "tiktok shop creator strategy",    category: "E-commerce",          notes: "TikTok Shop creator angle" },
  { term: "etsy seller content strategy",    category: "E-commerce",          notes: "Etsy-specific content patterns" },
];

/**
 * Old starter terms that we now consider weak fits for the goal
 * (organic Etsy traffic). Reseed strips them and inserts the new set.
 */
const OBSOLETE_STARTERS = [
  "claude code marketing agency",
  "claude AI ad creation",
  "AI marketing agency tutorial",
  "AI funnel builder tutorial",
  // The original "ai content" / "claude ai marketing" tests can stay or
  // get cleaned up via the per-row × button — they aren't in this list.
];

export function listQueue(): QueueItem[] {
  return getDB().prepare(
    `SELECT q.id, q.term, q.notes, q.category, q.priority, q.added_at,
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

export function addToQueue(
  term: string,
  notes?: string | null,
  priority = 0,
  category?: string | null,
): QueueItem | null {
  const t = term.trim();
  if (!t) return null;
  getDB().prepare(
    `INSERT INTO search_queue (term, notes, priority, category)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(term) DO UPDATE SET
       notes    = COALESCE(excluded.notes,    search_queue.notes),
       priority = MAX(excluded.priority, search_queue.priority),
       category = COALESCE(excluded.category, search_queue.category)`
  ).run(t, notes ?? null, priority, category ?? null);
  return listQueue().find((q) => q.term.toLowerCase() === t.toLowerCase()) ?? null;
}

export function removeFromQueue(id: number): void {
  getDB().prepare("DELETE FROM search_queue WHERE id = ?").run(id);
}

/**
 * Insert any starter terms that aren't already in the queue. Existing rows
 * keep their notes/category (we only fill nulls).
 */
export function seedStarterSearches(): number {
  const db = getDB();
  const insert = db.prepare(
    `INSERT INTO search_queue (term, notes, category)
     VALUES (?, ?, ?)
     ON CONFLICT(term) DO UPDATE SET
       notes    = COALESCE(search_queue.notes,    excluded.notes),
       category = COALESCE(search_queue.category, excluded.category)`
  );
  const tx = db.transaction(() => {
    let n = 0;
    for (const s of STARTER_SEARCHES) {
      const r = insert.run(s.term, s.notes ?? null, s.category);
      if (r.changes > 0) n++;
    }
    return n;
  });
  return tx();
}

/**
 * Reseed: strip the obsolete weak-fit terms (only if they haven't been
 * completed yet — we don't delete history attached to a real search) and
 * insert/update the categorized starter set.
 *
 * Returns counts so the UI can confirm what changed.
 */
export function reseedStarterSearches(): { removed: number; upserted: number } {
  const db = getDB();
  const removeStmt = db.prepare(
    `DELETE FROM search_queue
       WHERE term = ? COLLATE NOCASE
         AND NOT EXISTS (
           SELECT 1
             FROM searches s
             JOIN aggregate_analyses a ON a.search_id = s.id
            WHERE s.term = search_queue.term COLLATE NOCASE
         )`
  );
  const upsertStmt = db.prepare(
    `INSERT INTO search_queue (term, notes, category)
     VALUES (?, ?, ?)
     ON CONFLICT(term) DO UPDATE SET
       notes    = COALESCE(excluded.notes,    search_queue.notes),
       category = COALESCE(excluded.category, search_queue.category)`
  );
  return db.transaction(() => {
    let removed = 0;
    for (const t of OBSOLETE_STARTERS) {
      removed += removeStmt.run(t).changes;
    }
    let upserted = 0;
    for (const s of STARTER_SEARCHES) {
      upserted += upsertStmt.run(s.term, s.notes ?? null, s.category).changes;
    }
    return { removed, upserted };
  })();
}
