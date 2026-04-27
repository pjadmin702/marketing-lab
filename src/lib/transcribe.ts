import { mkdirSync, readFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { runCmd } from "./run-cmd";
import {
  AUDIO_DIR, SUBS_DIR, YT_DLP, WHISPER_CLI, WHISPER_MODEL_FILE,
} from "./paths";

export interface Segment { start: number; end: number; text: string }

export interface TranscriptResult {
  source: "captions" | "whisper";
  language: string | null;
  text: string;
  segments: Segment[];
}

/* ---------- VTT parsing ---------- */

const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;

function parseVttTime(h: string, m: string, s: string, ms: string): number {
  return +h * 3600 + +m * 60 + +s + +ms / 1000;
}

export function parseVtt(vtt: string): Segment[] {
  const out: Segment[] = [];
  const lines = vtt.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const m = TIME_RE.exec(lines[i]);
    if (!m) { i++; continue; }
    const start = parseVttTime(m[1], m[2], m[3], m[4]);
    const end   = parseVttTime(m[5], m[6], m[7], m[8]);
    i++;
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      // strip inline tags + speaker labels
      const cleaned = lines[i]
        .replace(/<[^>]+>/g, "")
        .replace(/^\s*-\s*/, "")
        .trim();
      if (cleaned) buf.push(cleaned);
      i++;
    }
    const text = buf.join(" ").trim();
    if (text) out.push({ start, end, text });
    while (i < lines.length && lines[i].trim() === "") i++;
  }
  return dedupeAdjacent(out);
}

// TikTok auto-captions sometimes repeat the same text on adjacent cues.
function dedupeAdjacent(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.text === s.text) {
      prev.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/* ---------- captions via yt-dlp ---------- */

export async function tryCaptions(url: string): Promise<TranscriptResult | null> {
  mkdirSync(SUBS_DIR, { recursive: true });
  const before = new Set(safeReaddir(SUBS_DIR));
  const r = await runCmd(
    YT_DLP,
    [
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs", "en.*,en",
      "--skip-download",
      "--convert-subs", "vtt",
      "-o", "%(id)s.%(ext)s",
      "-P", SUBS_DIR,
      "--no-warnings",
      url,
    ],
    { timeoutMs: 60_000 }
  );
  if (r.code !== 0) return null;

  const after = safeReaddir(SUBS_DIR);
  const newFiles = after.filter((f) => !before.has(f) && f.endsWith(".vtt"));
  if (newFiles.length === 0) return null;

  // Prefer manually-uploaded subs over auto-generated when both exist.
  newFiles.sort((a, b) => Number(/auto/.test(a)) - Number(/auto/.test(b)));
  const file = path.join(SUBS_DIR, newFiles[0]);
  const segments = parseVtt(readFileSync(file, "utf8"));
  if (segments.length === 0) return null;
  const language = (newFiles[0].match(/\.([a-z]{2,3}(?:-[A-Z]{2,3})?)\.vtt$/) || [])[1] || null;
  return {
    source: "captions",
    language,
    text: segments.map((s) => s.text).join(" "),
    segments,
  };
}

/* ---------- whisper.cpp fallback ---------- */

export async function transcribeWithWhisper(url: string, tiktokId: string): Promise<TranscriptResult> {
  if (!existsSync(WHISPER_MODEL_FILE)) {
    throw new Error(`Whisper model missing at ${WHISPER_MODEL_FILE}. Run: npm run setup`);
  }
  mkdirSync(AUDIO_DIR, { recursive: true });

  const wavPath = path.join(AUDIO_DIR, `${tiktokId}.wav`);
  if (!existsSync(wavPath)) {
    const dl = await runCmd(
      YT_DLP,
      [
        "-x", "--audio-format", "wav",
        "--audio-quality", "0",
        "--postprocessor-args", "-ar 16000 -ac 1", // whisper.cpp wants 16kHz mono
        "-o", `${tiktokId}.%(ext)s`,
        "-P", AUDIO_DIR,
        "--no-warnings",
        url,
      ],
      { timeoutMs: 180_000 }
    );
    if (dl.code !== 0 || !existsSync(wavPath)) {
      throw new Error(`yt-dlp audio download failed: ${dl.stderr.slice(0, 500)}`);
    }
  }

  const outPrefix = path.join(AUDIO_DIR, tiktokId);
  const jsonOut = `${outPrefix}.json`;
  if (existsSync(jsonOut)) unlinkSync(jsonOut);

  const w = await runCmd(
    WHISPER_CLI,
    [
      "-m", WHISPER_MODEL_FILE,
      "-f", wavPath,
      "-oj",
      "-of", outPrefix,
      "-np",
      "-l", process.env.WHISPER_LANG || "auto",
    ],
    { timeoutMs: 600_000 }
  );
  if (w.code !== 0 || !existsSync(jsonOut)) {
    throw new Error(`whisper-cli failed: ${w.stderr.slice(0, 500)}`);
  }

  const data = JSON.parse(readFileSync(jsonOut, "utf8")) as {
    transcription: { offsets: { from: number; to: number }; text: string }[];
    result?: { language?: string };
  };
  const segments: Segment[] = (data.transcription || []).map((t) => ({
    start: t.offsets.from / 1000,
    end:   t.offsets.to   / 1000,
    text:  t.text.trim(),
  })).filter((s) => s.text.length > 0);

  return {
    source: "whisper",
    language: data.result?.language || null,
    text: segments.map((s) => s.text).join(" ").trim(),
    segments,
  };
}

/* ---------- top-level ---------- */

export async function transcribe(url: string, tiktokId: string): Promise<TranscriptResult> {
  const captions = await tryCaptions(url);
  if (captions) return captions;
  return transcribeWithWhisper(url, tiktokId);
}

function safeReaddir(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}
