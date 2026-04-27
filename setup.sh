#!/usr/bin/env bash
# marketing-lab setup: installs yt-dlp, builds whisper.cpp, downloads model.
# Requires ffmpeg (system dep), cmake, make, gcc/clang, git, curl on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$ROOT/bin"
VENDOR_DIR="$ROOT/vendor"
MODEL_DIR="$ROOT/whisper-models"
WHISPER_MODEL="${WHISPER_MODEL:-small.en}"
MODEL_FILE="$MODEL_DIR/ggml-${WHISPER_MODEL}.bin"

mkdir -p "$BIN_DIR" "$VENDOR_DIR" "$MODEL_DIR"

step() { printf "\n\033[1;36m==>\033[0m %s\n" "$1"; }
ok()   { printf "\033[1;32mok\033[0m %s\n" "$1"; }
fail() { printf "\033[1;31mERROR\033[0m %s\n" "$1" >&2; exit 1; }

step "Checking system dependencies"
for cmd in cmake make gcc git curl; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd not found on PATH"
done
ok "build toolchain present"

if ! command -v ffmpeg >/dev/null 2>&1; then
  fail "ffmpeg not installed. Install with:
   macOS:  brew install ffmpeg
   Debian/Ubuntu: sudo apt-get install -y ffmpeg
   Fedora: sudo dnf install -y ffmpeg"
fi
ok "ffmpeg: $(ffmpeg -version | head -1 | awk '{print $1, $2, $3}')"

step "Installing yt-dlp"
if [ ! -x "$BIN_DIR/yt-dlp" ]; then
  curl -fsSL --retry 3 \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
    -o "$BIN_DIR/yt-dlp"
  chmod +x "$BIN_DIR/yt-dlp"
fi
ok "yt-dlp: $("$BIN_DIR/yt-dlp" --version)"

step "Building whisper.cpp"
if [ ! -x "$BIN_DIR/whisper-cli" ]; then
  if [ ! -d "$VENDOR_DIR/whisper.cpp/.git" ]; then
    rm -rf "$VENDOR_DIR/whisper.cpp"
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp \
      "$VENDOR_DIR/whisper.cpp"
  fi
  (
    cd "$VENDOR_DIR/whisper.cpp"
    cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_EXAMPLES=ON >/dev/null
    cmake --build build --config Release -j "$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"
  )
  cp "$VENDOR_DIR/whisper.cpp/build/bin/whisper-cli" "$BIN_DIR/whisper-cli"
fi
ok "whisper-cli built"

step "Downloading whisper model (${WHISPER_MODEL})"
if [ ! -f "$MODEL_FILE" ]; then
  curl -fsSL --retry 3 \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin" \
    -o "$MODEL_FILE"
fi
ok "model: $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1))"

printf "\n\033[1;32mSetup complete.\033[0m\n"
printf "  yt-dlp:      %s\n" "$BIN_DIR/yt-dlp"
printf "  whisper-cli: %s\n" "$BIN_DIR/whisper-cli"
printf "  model:       %s\n" "$MODEL_FILE"
