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
 * the user's actual funnel: TikTok content → profile → bio link → Etsy.
 * The lever is the content itself, so the priority categories are about
 * what to film, how to hook, and how to convert profile clicks. The old
 * AI-Foundation items are kept but demoted to "Tier 2 (later)" — useful
 * for building the factory but secondary to landing the first wins.
 */
export const STARTER_SEARCHES: { term: string; notes?: string; category: string }[] = [
  // Hooks & openings — first 3 seconds, highest leverage
  { term: "tiktok hook product video",            category: "Hooks & openings",        notes: "first-3s for product-focused TikToks" },
  { term: "viral product reveal tiktok",          category: "Hooks & openings",        notes: "reveal / transformation formats" },
  { term: "small business pov tiktok",            category: "Hooks & openings",        notes: "POV-style packaging/making — converts well" },

  // Content formats — what to actually film
  { term: "tiktok product showcase formula",      category: "Content formats",         notes: "frameworks for showing products" },
  { term: "behind the scenes small business",     category: "Content formats",         notes: "BTS / making-of / packing orders" },
  { term: "etsy maker process video",             category: "Content formats",         notes: "design / craft process content" },

  // Funnel: profile → bio link → Etsy (closing the leak)
  { term: "tiktok bio link conversion",           category: "Funnel: TikTok → Etsy",   notes: "what makes people leave TikTok" },
  { term: "tiktok profile to website strategy",   category: "Funnel: TikTok → Etsy",   notes: "profile → external click rates" },
  { term: "etsy shop link in bio",                category: "Funnel: TikTok → Etsy",   notes: "Etsy-specific bio CTAs" },

  // Content sustainability — solo creator batching
  { term: "tiktok content batching small business", category: "Content sustainability", notes: "shoot many at once" },
  { term: "7 videos in one day creator",          category: "Content sustainability",  notes: "high-volume solo workflow" },

  // Tier 2 — build the factory after you've landed wins with the content
  { term: "claude skills",                        category: "Tier 2: Foundation",      notes: "bleeding-edge — scrape soon" },
  { term: "claude code agentic SDK",              category: "Tier 2: Foundation",      notes: "agentic workflow patterns" },
  { term: "claude desktop agent workflow",        category: "Tier 2: Foundation",      notes: "computer-use / desktop agent" },
  { term: "AI marketing automation 2026",         category: "Tier 2: Foundation",      notes: "current state of the art" },
];

/**
 * Old starter terms (or near-matches) that should be removed from the
 * queue when the user reseeds. Already-completed terms are protected.
 */
const OBSOLETE_STARTERS = [
  "claude code marketing agency",
  "claude AI ad creation",
  "AI marketing agency tutorial",
  "AI funnel builder tutorial",
];

/**
 * Recategorize map: when reseeding, move existing rows from the old
 * categories into the new structure. Keeps history rows intact, just
 * shifts where they appear in the sidebar.
 */
const RECATEGORIZE: Record<string, string> = {
  // Old Foundation/Business/Content automation → Tier 2
  "solopreneur AI stack":            "Tier 2: Foundation",
  "automate tiktok content with AI": "Tier 2: Foundation",
  "AI UGC creator workflow":         "Tier 2: Foundation",
  "direct response copywriting AI":  "Tier 2: Foundation",
  "one person AI agency":            "Tier 2: Foundation",
  "viral hook formula AI":           "Hooks & openings",
  // Old E-commerce → Funnel / Content formats
  "etsy organic traffic tiktok":     "Funnel: TikTok → Etsy",
  "tiktok shop creator strategy":    "Content formats",
  "etsy seller content strategy":    "Content formats",
};

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
 * completed yet — we don't delete history attached to a real search),
 * recategorize legacy rows that exist in RECATEGORIZE, and insert/update
 * the categorized starter set. Reseed is idempotent: running it twice
 * gives the same final state.
 */
/**
 * Suggest niche-specific search terms by feeding the user's plan doc +
 * existing queue terms to Claude. Returns suggestions; caller decides
 * whether to insert them.
 */
export interface QueueSuggestion {
  term: string;
  category: string;
  note: string;
}

export function reseedStarterSearches(): { removed: number; recategorized: number; upserted: number } {
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
  // Force-overwrite category for known-old terms (the user explicitly
  // asked to swap them into the new structure).
  const recategorizeStmt = db.prepare(
    `UPDATE search_queue SET category = ? WHERE term = ? COLLATE NOCASE`
  );
  // For new starters: keep user's existing category if they've already
  // moved a term, otherwise apply the starter's category.
  const upsertStmt = db.prepare(
    `INSERT INTO search_queue (term, notes, category)
     VALUES (?, ?, ?)
     ON CONFLICT(term) DO UPDATE SET
       notes    = COALESCE(excluded.notes,    search_queue.notes),
       category = COALESCE(search_queue.category, excluded.category)`
  );
  return db.transaction(() => {
    let removed = 0;
    for (const t of OBSOLETE_STARTERS) {
      removed += removeStmt.run(t).changes;
    }
    let recategorized = 0;
    for (const [term, newCategory] of Object.entries(RECATEGORIZE)) {
      recategorized += recategorizeStmt.run(newCategory, term).changes;
    }
    let upserted = 0;
    for (const s of STARTER_SEARCHES) {
      upserted += upsertStmt.run(s.term, s.notes ?? null, s.category).changes;
    }
    return { removed, recategorized, upserted };
  })();
}

/**
 * Bulk-add suggested terms. Skips ones that already exist (case-insensitive).
 * Returns count of newly inserted rows.
 */
export function addSuggestedTerms(suggestions: QueueSuggestion[]): number {
  const db = getDB();
  const insert = db.prepare(
    `INSERT INTO search_queue (term, notes, category)
     VALUES (?, ?, ?)
     ON CONFLICT(term) DO NOTHING`
  );
  return db.transaction(() => {
    let added = 0;
    for (const s of suggestions) {
      const t = s.term.trim();
      if (!t) continue;
      const r = insert.run(t, s.note?.trim() || null, s.category?.trim() || null);
      if (r.changes > 0) added++;
    }
    return added;
  })();
}
