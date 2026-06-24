#!/usr/bin/env bash
# Assemble the captured motion plate and generated narration into a single MP4.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/out}"
VIDEO_IN="${2:-$OUT/capture.mp4}"
AUDIO_IN="${3:-$OUT/openvoice_clip.wav}"
VIDEO_OUT="${4:-$OUT/render.mp4}"

test -s "$VIDEO_IN"
test -s "$AUDIO_IN"

ffmpeg -y -loglevel error \
  -stream_loop -1 -i "$VIDEO_IN" \
  -i "$AUDIO_IN" \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -r 30 -shortest -movflags +faststart \
  "$VIDEO_OUT"

test -s "$VIDEO_OUT"
echo "PASS assemble -> $VIDEO_OUT"
