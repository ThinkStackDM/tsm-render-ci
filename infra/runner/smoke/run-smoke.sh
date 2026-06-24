#!/usr/bin/env bash
# Full runner smoke: capture (1080p/30fps) -> OpenVoice v2 clip -> WhisperX manifest ->
# assembled render MP4. Run on the runner (locally or via GitHub Actions). The first
# argument may be a text file containing the locked script; otherwise RUNNER_SCRIPT_TEXT
# is used, falling back to the default smoke script.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${SMOKE_OUT:-$HERE/out}"; mkdir -p "$OUT"
PY="${VENV:-/opt/venv}/bin/python"
[ -x "$PY" ] || PY="$(command -v python3)"
[ -n "$PY" ] || { echo "FAIL: python not found"; exit 1; }

if [ "${1:-}" != "" ]; then
  export RUNNER_SCRIPT_TEXT="$(tr '\n' ' ' < "$1")"
fi

echo "== tool versions =="
ffmpeg -version | head -1
node -e "console.log('playwright', require('playwright/package.json').version)"
node -e "console.log('puppeteer', require('puppeteer/package.json').version)"
"$PY" -c "import whisperx; print('whisperx ok')"
echo

echo "== 1/3 capture =="; "$HERE/capture.sh" "$OUT"
echo "== 2/3 openvoice =="; PYTHONUNBUFFERED=1 "$PY" "$HERE/tts.py" "$OUT"
echo "== 3/3 whisperx =="; PYTHONUNBUFFERED=1 "$PY" "$HERE/whisperx_manifest.py" "$OUT/openvoice_clip.wav" "$OUT/whisperx_manifest.json"
echo "== 4/4 assemble =="; "$HERE/assemble-render.sh" "$OUT"

echo
echo "== artifacts =="; ls -la "$OUT"
test -s "$OUT/capture.mp4"
test -s "$OUT/openvoice_clip.wav"
test -s "$OUT/whisperx_manifest.json"
test -s "$OUT/render.mp4"
echo "ALL GREEN"
