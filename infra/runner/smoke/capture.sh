#!/usr/bin/env bash
# Smoke 1/3: prove the Xvfb + Chromium + ffmpeg capture path at 1080p/30fps.
# Launches a live Chromium page on the virtual display, grabs 3s with ffmpeg x11grab,
# then asserts the output is exactly 1920x1080 @ ~30fps.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/out}"; mkdir -p "$OUT"
MP4="$OUT/capture.mp4"
DISPLAY="${DISPLAY:-:99}"; export DISPLAY
DUR="${CAPTURE_SECONDS:-3}"

xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 || { echo "FAIL: no Xvfb on $DISPLAY"; exit 1; }

node "$HERE/open-page.mjs" & PAGE_PID=$!
trap 'kill "$PAGE_PID" 2>/dev/null || true' EXIT
sleep 3  # let Chromium paint the framebuffer

ffmpeg -y -loglevel error \
  -f x11grab -video_size 1920x1080 -framerate 30 -i "${DISPLAY}.0+0,0" \
  -t "$DUR" -r 30 -pix_fmt yuv420p -c:v libx264 -preset ultrafast "$MP4"

# ffmpeg 4.4 (ubuntu 22.04) rejects the space-separator form `csv=...:s=' '`; use the
# default comma separator and split on it.
IFS=, read -r W H FR < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,avg_frame_rate -of csv=p=0 "$MP4")
FPS=$(awk -F/ '{printf "%.1f", ($2?$1/$2:$1)}' <<<"$FR")
echo "capture: ${W}x${H} @ ${FPS}fps -> $MP4"
[ "$W" = "1920" ] && [ "$H" = "1080" ] || { echo "FAIL: expected 1920x1080, got ${W}x${H}"; exit 1; }
awk "BEGIN{exit !($FPS>=29 && $FPS<=31)}" || { echo "FAIL: expected ~30fps, got ${FPS}"; exit 1; }
echo "PASS capture"
