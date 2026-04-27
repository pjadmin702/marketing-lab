import { getDB } from "./db";

export interface SearchRow {
  id: number;
  term: string;
  notes: string | null;
  created_at: number;
  video_count: number;
}

export interface VideoRow {
  id: number;
  search_id: number;
  url: string;
  tiktok_id: string | null;
  author: string | null;
  title: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  created_at: number;
  transcript_source: "captions" | "whisper" | null;
  transcript_chars: number | null;
  transcript_language: string | null;
}

export function listSearches(): SearchRow[] {
  return getDB()
    .prepare(
      `SELECT s.id, s.term, s.notes, s.created_at,
              (SELECT COUNT(*) FROM videos v WHERE v.search_id = s.id) AS video_count
         FROM searches s
        ORDER BY s.created_at DESC, s.id DESC`
    )
    .all() as SearchRow[];
}

export function getSearch(id: number): SearchRow | null {
  const row = getDB()
    .prepare(
      `SELECT s.id, s.term, s.notes, s.created_at,
              (SELECT COUNT(*) FROM videos v WHERE v.search_id = s.id) AS video_count
         FROM searches s WHERE s.id = ?`
    )
    .get(id) as SearchRow | undefined;
  return row ?? null;
}

export function getVideosForSearch(searchId: number): VideoRow[] {
  return getDB()
    .prepare(
      `SELECT v.id, v.search_id, v.url, v.tiktok_id, v.author, v.title,
              v.duration_sec, v.thumbnail_url, v.created_at,
              t.source                AS transcript_source,
              LENGTH(t.text)          AS transcript_chars,
              t.language              AS transcript_language
         FROM videos v
    LEFT JOIN transcripts t ON t.video_id = v.id
        WHERE v.search_id = ?
        ORDER BY v.created_at ASC, v.id ASC`
    )
    .all(searchId) as VideoRow[];
}

export interface SearchStats {
  total_videos: number;
  with_transcripts: number;
  via_captions: number;
  via_whisper: number;
}

export function getSearchStats(searchId: number): SearchStats {
  const r = getDB()
    .prepare(
      `SELECT
         COUNT(v.id) AS total_videos,
         SUM(CASE WHEN t.video_id IS NOT NULL THEN 1 ELSE 0 END) AS with_transcripts,
         SUM(CASE WHEN t.source = 'captions' THEN 1 ELSE 0 END) AS via_captions,
         SUM(CASE WHEN t.source = 'whisper'  THEN 1 ELSE 0 END) AS via_whisper
       FROM videos v
       LEFT JOIN transcripts t ON t.video_id = v.id
       WHERE v.search_id = ?`
    )
    .get(searchId) as Record<string, number | null>;
  return {
    total_videos: r.total_videos ?? 0,
    with_transcripts: r.with_transcripts ?? 0,
    via_captions: r.via_captions ?? 0,
    via_whisper: r.via_whisper ?? 0,
  };
}
