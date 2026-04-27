/**
 * Catalog management for the user's saved subreddits and groups.
 * No network — all queries hit the local SQLite catalog.
 */
import { getDB } from "../db";

export interface SubredditRow {
  id: number;
  name: string;
  group_name: string | null;
  notes: string | null;
  added_at: number;
}

export interface GroupRow {
  group_name: string;
  count: number;
}

const SUBREDDIT_NAME_RE = /^[A-Za-z0-9_]{2,50}$/;

/** Strip leading "r/" or "/r/", trim whitespace. */
export function normalizeSubredditName(raw: string): string {
  return raw.trim().replace(/^\/?r\//i, "").replace(/\/+$/, "");
}

export function isValidSubredditName(name: string): boolean {
  return SUBREDDIT_NAME_RE.test(name);
}

export function listSubreddits(): SubredditRow[] {
  return getDB()
    .prepare(`SELECT id, name, group_name, notes, added_at FROM reddit_subreddits ORDER BY name COLLATE NOCASE`)
    .all() as SubredditRow[];
}

export function listGroups(): GroupRow[] {
  return getDB()
    .prepare(
      `SELECT COALESCE(group_name, '(ungrouped)') AS group_name, COUNT(*) AS count
         FROM reddit_subreddits
        GROUP BY group_name
        ORDER BY group_name COLLATE NOCASE`
    )
    .all() as GroupRow[];
}

export function listSubredditsInGroup(group: string): SubredditRow[] {
  return getDB()
    .prepare(
      `SELECT id, name, group_name, notes, added_at FROM reddit_subreddits
        WHERE group_name = ? ORDER BY name COLLATE NOCASE`
    )
    .all(group) as SubredditRow[];
}

export function searchSubredditCatalog(q: string): SubredditRow[] {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  return getDB()
    .prepare(
      `SELECT id, name, group_name, notes, added_at FROM reddit_subreddits
        WHERE name LIKE ? COLLATE NOCASE OR group_name LIKE ? COLLATE NOCASE
        ORDER BY name COLLATE NOCASE LIMIT 100`
    )
    .all(like, like) as SubredditRow[];
}

export function addSubreddit(rawName: string, group?: string, notes?: string): SubredditRow {
  const name = normalizeSubredditName(rawName);
  if (!name) throw new Error("subreddit name cannot be empty");
  if (!isValidSubredditName(name)) throw new Error(`invalid subreddit name: ${name}`);
  const db = getDB();
  db.prepare(
    `INSERT INTO reddit_subreddits (name, group_name, notes) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       group_name = COALESCE(excluded.group_name, reddit_subreddits.group_name),
       notes      = COALESCE(excluded.notes,      reddit_subreddits.notes)`
  ).run(name, group ?? null, notes ?? null);
  return db.prepare(
    `SELECT id, name, group_name, notes, added_at FROM reddit_subreddits WHERE name = ? COLLATE NOCASE`
  ).get(name) as SubredditRow;
}

export function removeSubreddit(name: string): void {
  getDB().prepare(`DELETE FROM reddit_subreddits WHERE name = ? COLLATE NOCASE`).run(normalizeSubredditName(name));
}

/** Resolve a mixed input list (group names + raw subreddit names) into a flat list.
 *  Subreddit names are normalized and silently dropped if they don't match
 *  the strict name regex — same rule addSubreddit enforces. */
export function expandSelection(selectors: string[]): string[] {
  const groups = new Set(listGroups().map((g) => g.group_name));
  const out = new Set<string>();
  for (const sel of selectors) {
    const trimmed = sel.trim();
    if (!trimmed) continue;
    if (groups.has(trimmed)) {
      for (const r of listSubredditsInGroup(trimmed)) out.add(r.name);
    } else {
      const name = normalizeSubredditName(trimmed);
      if (isValidSubredditName(name)) out.add(name);
    }
  }
  return [...out];
}
