#!/usr/bin/env bash
# REDUCED macOS-native runner smoke for the thinkstack-mac self-hosted runner.
#
# The original smoke (run-smoke.sh) is Linux-only: it needs Xvfb + x11grab,
# /opt/venv with WhisperX, and OpenVoice v2 under /opt/openvoice. None of those
# exist on this macOS ARM64 host and Docker Desktop is not running, so this
# script proves the parts of the render gate the Mac can prove natively:
#
#   1/3 render  — a real ffmpeg encode (testsrc2 -> 1920x1080 @ 30fps, 2s,
#                 libx264 + yuv420p) asserted with ffprobe exactly the way
#                 capture.sh asserts the x11grab output. Same resolution and
#                 fps gate, different video source (synthetic instead of a
#                 live Chromium page on a virtual display).
#   2/3 audio   — a 2s sine-tone WAV stands in for the OpenVoice v2 clip
#                 (placeholder: NO voice clone is exercised here).
#   3/3 manifest— an ffprobe-derived JSON manifest stands in for the WhisperX
#                 word-alignment manifest (placeholder: NO ASR is exercised).
#
# Artifact names/shape match run-smoke.sh (capture.mp4, openvoice_clip.wav,
# whisperx_manifest.json) so render-gate consumers see the same contract.
# To restore the FULL smoke on this host: start Docker Desktop, build
# infra/runner/Dockerfile, and run run-smoke.sh inside the container.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${SMOKE_OUT:-$HERE/out}"; mkdir -p "$OUT"
DUR="${CAPTURE_SECONDS:-2}"

echo "== tool versions (macOS native) =="
ffmpeg -version | head -1
node --version
python3 --version
echo

echo "== 1/3 render (ffmpeg synthetic 1080p/30fps, ${DUR}s) =="
MP4="$OUT/capture.mp4"
ffmpeg -y -loglevel error \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30" \
  -t "$DUR" -r 30 -pix_fmt yuv420p -c:v libx264 -preset ultrafast "$MP4"
# (csv=p=0:s=' ' as used in capture.sh is rejected by ffprobe 8.x; use commas)
IFS=, read -r W H FR < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,avg_frame_rate -of csv=p=0 "$MP4")
FPS=$(awk -F/ '{printf "%.1f", ($2?$1/$2:$1)}' <<<"$FR")
echo "render: ${W}x${H} @ ${FPS}fps -> $MP4"
[ "$W" = "1920" ] && [ "$H" = "1080" ] || { echo "FAIL: expected 1920x1080, got ${W}x${H}"; exit 1; }
awk "BEGIN{exit !($FPS>=29 && $FPS<=31)}" || { echo "FAIL: expected ~30fps, got ${FPS}"; exit 1; }
echo "PASS render"

echo "== 2/3 audio (sine placeholder for OpenVoice clip) =="
WAV="$OUT/openvoice_clip.wav"
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=440:duration=${DUR}" \
  -ar 24000 -ac 1 "$WAV"
test -s "$WAV" && echo "PASS audio (placeholder)"

echo "== 3/3 manifest (ffprobe placeholder for WhisperX manifest) =="
MANIFEST="$OUT/whisperx_manifest.json"
ffprobe -v error -show_entries format=filename,duration:stream=codec_name,sample_rate,channels \
  -of json "$WAV" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); d["placeholder"]="macos-reduced-smoke: no whisperx on this host"; print(json.dumps(d, indent=2))' \
  > "$MANIFEST"
test -s "$MANIFEST" && echo "PASS manifest (placeholder)"

echo
echo "== artifacts =="; ls -la "$OUT"
test -s "$OUT/capture.mp4"
test -s "$OUT/openvoice_clip.wav"
test -s "$OUT/whisperx_manifest.json"
echo "ALL GREEN (reduced macOS smoke)"
