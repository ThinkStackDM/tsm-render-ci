#!/usr/bin/env bash
# Focused test for shared-render-gate.py (TSM-6171). Builds synthetic masters
# with ffmpeg + real manifests, asserts the gate passes a compliant verification
# master and fail-closes on each defect. Requires ffmpeg/ffprobe/python3.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/shared-render-gate.py"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok(){ echo "  ok: $1"; PASS=$((PASS+1)); }
bad(){ echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

# --- helpers -----------------------------------------------------------------
# make_master <dir> <WxH> <fps> <withAudio 0|1> <durationSec>
make_master(){
  local dir="$1" size="$2" fps="$3" audio="$4" dur="$5"
  mkdir -p "$dir"
  if [ "$audio" = 1 ]; then
    ffmpeg -y -loglevel error \
      -f lavfi -i "color=c=black:s=${size}:r=${fps}:d=${dur}" \
      -f lavfi -i "sine=frequency=220:duration=${dur}" \
      -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$dir/render.mp4"
  else
    ffmpeg -y -loglevel error \
      -f lavfi -i "color=c=black:s=${size}:r=${fps}:d=${dur}" \
      -c:v libx264 -pix_fmt yuv420p "$dir/render.mp4"
  fi
}
# make_manifest <dir> <floorScore> <endSec>
make_manifest(){
  local dir="$1" floor="$2" end="$3"
  python3 - "$dir/whisperx_manifest.json" "$floor" "$end" <<'PY'
import json, sys
out, floor, end = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
words = [
    {"word": "Markets", "start": 0.0, "end": end*0.5, "score": 0.97},
    {"word": "matter",  "start": end*0.5, "end": end, "score": floor},
]
json.dump({"wordCount": len(words), "words": words}, open(out, "w"))
PY
}
expect(){  # expect <label> <expectedRC> <dir>
  local label="$1" want="$2" dir="$3" rc=0
  python3 "$GATE" "$dir" >/dev/null 2>&1 || rc=$?
  if [ "$rc" = "$want" ]; then ok "$label (rc=$rc)"; else bad "$label (rc=$rc want=$want)"; fi
}

echo "== compliant verification master passes =="
D="$TMP/good"; make_master "$D" 1920x1080 30 1 2; make_manifest "$D" 0.90 1.8
expect "compliant -> pass" 0 "$D"
python3 "$GATE" "$D" >/dev/null 2>&1 || true
python3 - "$D/shared-render-gate.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
assert r["status"] == "passed", r
assert r["publishable"] is False, "hosted lane must never self-certify publishable"
assert r["reviewable"] is True, r
assert r["deferredToCanonicalGate"], "must record deck gates deferred to canonical"
print("  ok: report shape (passed, publishable=false, reviewable=true, defers deck gates)")
PY

echo "== fail-closed: missing master =="
D="$TMP/nomaster"; mkdir -p "$D"; make_manifest "$D" 0.90 1.8
expect "no master -> fail" 1 "$D"

echo "== fail-closed: wrong resolution =="
D="$TMP/res"; make_master "$D" 1280x720 30 1 2; make_manifest "$D" 0.90 1.8
expect "720p -> fail" 1 "$D"

echo "== fail-closed: wrong frame rate =="
D="$TMP/fps"; make_master "$D" 1920x1080 24 1 2; make_manifest "$D" 0.90 1.8
expect "24fps -> fail" 1 "$D"

echo "== fail-closed: no audio track =="
D="$TMP/noaudio"; make_master "$D" 1920x1080 30 0 2; make_manifest "$D" 0.90 1.8
expect "no audio -> fail" 1 "$D"

echo "== fail-closed: whisperx confidence below 0.85 floor =="
D="$TMP/lowconf"; make_master "$D" 1920x1080 30 1 2; make_manifest "$D" 0.70 1.8
expect "floor 0.70 -> fail" 1 "$D"

echo "== fail-closed: master truncated below narration =="
D="$TMP/trunc"; make_master "$D" 1920x1080 30 1 1; make_manifest "$D" 0.90 5.0
expect "master shorter than narration -> fail" 1 "$D"

echo "== fail-closed: missing manifest =="
D="$TMP/nomanifest"; make_master "$D" 1920x1080 30 1 2
expect "no manifest -> fail" 1 "$D"

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ] && echo "ALL GREEN" || { echo "TEST FAILURES"; exit 1; }
