/**
 * Conservative Reddit fetcher for the public JSON endpoints.
 *
 *   - Descriptive User-Agent (Reddit asks for unique, non-generic UAs).
 *   - Single-flight rate limiter: at most one request in flight at a time,
 *     with a floor of MIN_INTERVAL_MS between requests. Well under Reddit's
 *     unauth limit so we don't get throttled.
 *   - Exponential backoff on 429 / 5xx (2s, 4s, 8s, 16s). Hard stop on 403.
 *   - SQLite response cache, default 30-min TTL, keyed by full URL.
 *   - Anonymous by default. If REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are
 *     set the client switches to OAuth app-only against oauth.reddit.com.
 *
 * No login scraping, no proxy abuse, no CAPTCHA bypass.
 */
import { createHash } from "node:crypto";
import { getDB } from "../db";

const PUBLIC_BASE = "https://www.reddit.com";
const OAUTH_BASE  = "https://oauth.reddit.com";

const USER_AGENT = process.env.REDDIT_USER_AGENT
  ?? "marketing-lab/0.1 (local research tool; https://github.com/pjadmin702/marketing-lab)";

const MIN_INTERVAL_MS  = Number(process.env.REDDIT_MIN_INTERVAL_MS ?? 1100);
const CACHE_TTL_SEC    = Number(process.env.REDDIT_CACHE_TTL_SEC   ?? 1800);
const MAX_RETRIES      = 4;

/* ------------------------------------------------------------------ types */

export interface RedditFetchResult {
  status: number;
  body: string;        // raw JSON text
  fromCache: boolean;
  url: string;
}

export class RedditBlockedError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`Reddit blocked the request (status ${status}) for ${url}`);
    this.name = "RedditBlockedError";
  }
}

/* ------------------------------------- module-level rate-limit serializer */

let chain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function gateRequest<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  chain = next.then(() => undefined, () => undefined);
  return next.then(fn);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* --------------------------------------------------------- cache helpers  */

function cacheKey(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

function readCache(url: string): RedditFetchResult | null {
  const row = getDB()
    .prepare(
      `SELECT status, body, expires_at FROM reddit_http_cache
       WHERE cache_key = ? AND expires_at > strftime('%s','now')`
    )
    .get(cacheKey(url)) as { status: number; body: string; expires_at: number } | undefined;
  if (!row) return null;
  return { status: row.status, body: row.body, fromCache: true, url };
}

function writeCache(url: string, status: number, body: string, ttlSec = CACHE_TTL_SEC): void {
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  getDB()
    .prepare(
      `INSERT INTO reddit_http_cache (cache_key, url, status, body, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         status = excluded.status,
         body   = excluded.body,
         fetched_at = strftime('%s','now'),
         expires_at = excluded.expires_at`
    )
    .run(cacheKey(url), url, status, body, expires);
}

export function purgeExpiredCache(): number {
  const r = getDB().prepare(`DELETE FROM reddit_http_cache WHERE expires_at <= strftime('%s','now')`).run();
  return r.changes;
}

/* ----------------------------------------------------- OAuth (optional)   */

interface OAuthToken { token: string; expiresAt: number; }
let oauthToken: OAuthToken | null = null;

function isOAuthConfigured(): boolean {
  return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

async function getOAuthToken(): Promise<string> {
  if (oauthToken && oauthToken.expiresAt > Date.now() + 60_000) return oauthToken.token;
  const id = process.env.REDDIT_CLIENT_ID!;
  const secret = process.env.REDDIT_CLIENT_SECRET!;
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit OAuth token fetch failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  oauthToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return oauthToken.token;
}

/* ---------------------------------------------------------- core fetch    */

/**
 * GET a Reddit public JSON path (no leading host). Examples:
 *   /r/ClaudeAI/top.json?t=week&limit=100
 *   /r/Etsy/search.json?q=printables&restrict_sr=1&sort=top&t=year
 */
export async function redditGet(
  pathAndQuery: string,
  opts: { useCache?: boolean; cacheTtlSec?: number } = {}
): Promise<RedditFetchResult> {
  const useOAuth = isOAuthConfigured();
  const base = useOAuth ? OAUTH_BASE : PUBLIC_BASE;
  // OAuth endpoints don't use the .json suffix; strip it if present.
  const cleanPath = useOAuth ? pathAndQuery.replace(/\.json(?=$|\?)/, "") : pathAndQuery;
  const url = `${base}${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;

  if (opts.useCache !== false) {
    const cached = readCache(url);
    if (cached) return cached;
  }

  return gateRequest(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT };
      if (useOAuth) headers["Authorization"] = `Bearer ${await getOAuthToken()}`;

      let res: Response;
      try {
        res = await fetch(url, { headers, redirect: "follow" });
      } catch (e) {
        lastError = e;
        await sleep(2_000 * 2 ** attempt);
        continue;
      }

      if (res.status === 403 || res.status === 401) {
        // Don't cache; surface so the caller can stop the run.
        throw new RedditBlockedError(url, res.status);
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Reddit ${res.status}`);
        await sleep(2_000 * 2 ** attempt);
        continue;
      }

      const body = await res.text();
      if (res.ok) writeCache(url, res.status, body, opts.cacheTtlSec);
      return { status: res.status, body, fromCache: false, url };
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Reddit fetch failed after ${MAX_RETRIES} attempts: ${url}`);
  });
}

/* --------------------------------------------------- typed listing parser */

export interface RedditPostRaw {
  id: string;             // base36 t3 id without prefix
  subreddit: string;
  author: string | null;
  title: string;
  selftext: string;
  url: string;
  permalink: string;      // path only, prepend reddit.com
  score: number;
  upvote_ratio: number | null;
  num_comments: number;
  created_utc: number;
  link_flair_text: string | null;
  is_video: boolean;
  is_self: boolean;
  over_18: boolean;
  domain: string | null;
  post_hint: string | null;
  is_gallery: boolean | null;
  crosspost_parent: string | null;
}

interface RawListing {
  data: { after: string | null; children: { kind: string; data: Record<string, unknown> }[] };
}

export interface ParsedListing {
  posts: RedditPostRaw[];
  after: string | null;
}

export function parseListing(body: string): ParsedListing {
  const json = JSON.parse(body) as RawListing;
  const after = json?.data?.after ?? null;
  const children = Array.isArray(json?.data?.children) ? json.data.children : [];
  const posts: RedditPostRaw[] = [];
  for (const c of children) {
    if (c?.kind !== "t3") continue;
    const d = c.data as Record<string, unknown>;
    posts.push({
      id:              String(d.id ?? ""),
      subreddit:       String(d.subreddit ?? ""),
      author:          typeof d.author === "string" ? d.author : null,
      title:           String(d.title ?? ""),
      selftext:        typeof d.selftext === "string" ? d.selftext : "",
      url:             typeof d.url === "string" ? d.url : "",
      permalink:       typeof d.permalink === "string" ? d.permalink : "",
      score:           Number(d.score ?? 0),
      upvote_ratio:    typeof d.upvote_ratio === "number" ? d.upvote_ratio : null,
      num_comments:    Number(d.num_comments ?? 0),
      created_utc:     Number(d.created_utc ?? 0),
      link_flair_text: typeof d.link_flair_text === "string" ? d.link_flair_text : null,
      is_video:        Boolean(d.is_video),
      is_self:         Boolean(d.is_self),
      over_18:         Boolean(d.over_18),
      domain:          typeof d.domain === "string" ? d.domain : null,
      post_hint:       typeof d.post_hint === "string" ? d.post_hint : null,
      is_gallery:      typeof d.is_gallery === "boolean" ? d.is_gallery : null,
      crosspost_parent:typeof d.crosspost_parent === "string" ? d.crosspost_parent : null,
    });
  }
  return { posts, after };
}

export function inferPostType(p: RedditPostRaw): "text" | "link" | "video" | "image" | "gallery" | "crosspost" | "unknown" {
  if (p.crosspost_parent) return "crosspost";
  if (p.is_video) return "video";
  if (p.is_gallery) return "gallery";
  if (p.is_self) return "text";
  if (p.post_hint === "image") return "image";
  if (p.post_hint === "link" || p.url) return "link";
  return "unknown";
}

/* -------------------------------------------------------- comments parser */

export interface RedditCommentRaw {
  id: string;
  parent_id: string | null;
  author: string | null;
  body: string;
  score: number;
  created_utc: number;
}

/**
 * Parse a comments listing. Reddit returns an array: [postListing, commentsListing].
 * We only walk the top level (no replies) and return the top N by score.
 */
export function parseComments(body: string, limit = 20): RedditCommentRaw[] {
  const arr = JSON.parse(body) as unknown;
  if (!Array.isArray(arr) || arr.length < 2) return [];
  const commentsTree = arr[1] as RawListing;
  const out: RedditCommentRaw[] = [];
  for (const c of commentsTree?.data?.children ?? []) {
    if (c.kind !== "t1") continue;
    const d = c.data as Record<string, unknown>;
    if (typeof d.body !== "string" || !d.body) continue;
    if (d.body === "[deleted]" || d.body === "[removed]") continue;
    out.push({
      id:          String(d.id ?? ""),
      parent_id:   typeof d.parent_id === "string" ? d.parent_id : null,
      author:      typeof d.author === "string" ? d.author : null,
      body:        d.body,
      score:       Number(d.score ?? 0),
      created_utc: Number(d.created_utc ?? 0),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
