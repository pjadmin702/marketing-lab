import { runCmd } from "./run-cmd";
import { YT_DLP } from "./paths";
import { getDB } from "./db";
import { transcribe } from "./transcribe";

export interface IngestResult {
  url: string;
  status: "ok" | "error";
  videoId?: number;
  transcriptSource?: "captions" | "whisper";
  error?: string;
}

export interface VideoMetadata {
  id: string;
  title?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
}

/** Extract a TikTok numeric ID from a URL when possible (best-effort). */
export function extractTikTokId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

async function fetchMetadata(url: string): Promise<VideoMetadata> {
  const r = await runCmd(
    YT_DLP,
    ["--dump-json", "--skip-download", "--no-warnings", url],
    { timeoutMs: 45_000 }
  );
  if (r.code !== 0) throw new Error(`yt-dlp metadata failed: ${r.stderr.slice(0, 400)}`);
  return JSON.parse(r.stdout) as VideoMetadata;
}

export function findOrCreateSearch(term: string, notes?: string): number {
  const db = getDB();
  const existing = db
    .prepare("SELECT id FROM searches WHERE term = ? ORDER BY id DESC LIMIT 1")
    .get(term) as { id: number } | undefined;
  if (existing) return existing.id;
  const r = db.prepare("INSERT INTO searches (term, notes) VALUES (?, ?)").run(term, notes ?? null);
  return Number(r.lastInsertRowid);
}

export async function ingestUrl(url: string, searchId: number): Promise<IngestResult> {
  const db = getDB();
  try {
    const meta = await fetchMetadata(url);
    const tiktokId = meta.id || extractTikTokId(url) || url;

    const upsert = db.prepare(`
      INSERT INTO videos (search_id, url, tiktok_id, author, title, duration_sec, thumbnail_url, metadata_json)
      VALUES (@search_id, @url, @tiktok_id, @author, @title, @duration_sec, @thumbnail_url, @metadata_json)
      ON CONFLICT(search_id, url) DO UPDATE SET
        tiktok_id     = excluded.tiktok_id,
        author        = excluded.author,
        title         = excluded.title,
        duration_sec  = excluded.duration_sec,
        thumbnail_url = excluded.thumbnail_url,
        metadata_json = excluded.metadata_json
      RETURNING id
    `);
    const row = upsert.get({
      search_id: searchId,
      url: meta.webpage_url || url,
      tiktok_id: tiktokId,
      author: meta.uploader ?? null,
      title: meta.title ?? null,
      duration_sec: meta.duration ?? null,
      thumbnail_url: meta.thumbnail ?? null,
      metadata_json: JSON.stringify(meta),
    }) as { id: number };
    const videoId = row.id;

    const t = await transcribe(meta.webpage_url || url, tiktokId);
    db.prepare(`
      INSERT INTO transcripts (video_id, source, language, text, segments_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET
        source        = excluded.source,
        language      = excluded.language,
        text          = excluded.text,
        segments_json = excluded.segments_json
    `).run(videoId, t.source, t.language, t.text, JSON.stringify(t.segments));

    return { url, status: "ok", videoId, transcriptSource: t.source };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { url, status: "error", error: msg };
  }
}

export async function ingestUrls(searchId: number, urls: string[]): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const url of urls) {
    results.push(await ingestUrl(url, searchId));
  }
  return results;
}
