#!/usr/bin/env python3
"""Un-defer the audio narration-sync block in TSM-54's sync-evidence.json.

render-sample.ts (the chart render lane) writes sync-evidence.json with
`audioNarrationSync.status = "deferred-to-hosted-lane"` because the local chart
render does not produce the audio track. Once the hosted lane has actually run
OpenVoice v2 (clip) + WhisperX (forced-alignment manifest), this script reads
the WhisperX word-level manifest and rewrites that block with the real,
inspectable acceptance numbers (word-level confidence floor/mean, word count,
aligned duration, and pass/fail vs the 0.85 confidence target).

Usage:
  finalize-sync-evidence.py <sync-evidence.json> <whisperx_manifest.json> \
                            <openvoice_clip.wav>
Exits non-zero if the manifest has no scored words (nothing to assert).
"""
import json
import os
import sys

if len(sys.argv) < 3:
    print("usage: finalize-sync-evidence.py <sync-evidence.json> "
          "<whisperx_manifest.json> [openvoice_clip.wav]", file=sys.stderr)
    sys.exit(2)

evidence_path = sys.argv[1]
manifest_path = sys.argv[2]
clip_path = sys.argv[3] if len(sys.argv) > 3 else None

CONFIDENCE_TARGET = 0.85

with open(manifest_path) as f:
    manifest = json.load(f)

# whisperx_manifest.py writes words at the top level; tolerate a segments[] shape too.
words = manifest.get("words")
if not words:
    words = [w for seg in manifest.get("segments", []) for w in seg.get("words", [])]

scores = [w["score"] for w in words if isinstance(w.get("score"), (int, float))]
ends = [w["end"] for w in words if isinstance(w.get("end"), (int, float))]
if not scores:
    print("FAIL: no scored words in WhisperX manifest; cannot assert sync evidence",
          file=sys.stderr)
    sys.exit(1)

confidence_floor = round(min(scores), 3)
confidence_mean = round(sum(scores) / len(scores), 3)
aligned_duration_s = round(max(ends), 3) if ends else None

clip_bytes = None
if clip_path and os.path.exists(clip_path):
    clip_bytes = os.path.getsize(clip_path)

with open(evidence_path) as f:
    evidence = json.load(f)

evidence["audioNarrationSync"] = {
    "status": "verified-hosted",
    "engine": "OpenVoice v2 (MIT) + WhisperX forced-alignment",
    "method": manifest.get("method", "forced-alignment"),
    "language": manifest.get("language", "en"),
    "confidenceTarget": CONFIDENCE_TARGET,
    "confidenceFloor": confidence_floor,
    "confidenceMean": confidence_mean,
    "meetsConfidenceTarget": confidence_floor >= CONFIDENCE_TARGET,
    "wordCount": len(words),
    "alignedDurationS": aligned_duration_s,
    "openvoiceClip": os.path.basename(clip_path) if clip_path else None,
    "openvoiceClipBytes": clip_bytes,
    "whisperxManifest": os.path.basename(manifest_path),
    "note": (
        "Audio narration track (OpenVoice v2) + WhisperX word-level forced "
        "alignment produced by the hosted cc-chart-executor workflow lane "
        "(ghcr.io/thinkstackdm/thiaaaa-render). Numbers are word-level "
        "alignment confidence over the synthesized narration clip."
    ),
}

with open(evidence_path, "w") as f:
    json.dump(evidence, f, indent=2)
    f.write("\n")

print(f"sync-evidence finalized: confidenceFloor={confidence_floor} "
       f"mean={confidence_mean} words={len(words)} "
       f"duration={aligned_duration_s}s "
       f"meetsTarget={confidence_floor >= CONFIDENCE_TARGET} "
       f"(target >= {CONFIDENCE_TARGET})")
