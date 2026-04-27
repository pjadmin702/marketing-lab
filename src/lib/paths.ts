import path from "node:path";

export const ROOT       = process.cwd();
export const BIN_DIR    = path.join(ROOT, "bin");
export const DATA_DIR   = path.join(ROOT, "data");
export const AUDIO_DIR  = path.join(DATA_DIR, "audio");
export const SUBS_DIR   = path.join(DATA_DIR, "subs");
export const MODEL_DIR  = path.join(ROOT, "whisper-models");

export const YT_DLP      = path.join(BIN_DIR, "yt-dlp");
export const WHISPER_CLI = path.join(BIN_DIR, "whisper-cli");

export const WHISPER_MODEL = process.env.WHISPER_MODEL || "small.en";
export const WHISPER_MODEL_FILE = path.join(MODEL_DIR, `ggml-${WHISPER_MODEL}.bin`);
