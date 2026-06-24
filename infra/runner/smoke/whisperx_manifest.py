#!/usr/bin/env python3
"""Smoke 3/3: WhisperX word-level alignment of the OpenVoice clip.

The narration text is KNOWN (it's what tts.py synthesized), so this force-aligns the
approved words against the audio with WhisperX's wav2vec2 aligner and writes
<out>/whisperx_manifest.json with per-word start/end timings — the shape downstream
caption/sync stages consume. Exits non-zero if no aligned words are produced.

Why alignment-only (no transcribe): it's the path the render pipeline should use when the
script is locked — faster and caption-accurate (words match the approved script verbatim).
It also avoids whisperx 3.1.5's load_model() VAD step, whose hardcoded segmentation-model
download URL now 301s (dead S3 bucket) and is fetched with a urllib call that doesn't
follow redirects. Aligning a known transcript needs neither the VAD model nor ASR.
"""
import json
import os
import sys

import torch
import whisperx

# Use every core for the CPU forward pass (torch's wav2vec2 aligner defaults low otherwise).
_THREADS = int(os.environ.get("OMP_NUM_THREADS") or (os.cpu_count() or 4))
torch.set_num_threads(_THREADS)

AUDIO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "out", "openvoice_clip.wav")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(AUDIO), "whisperx_manifest.json")
DEVICE = "cpu"
LANGUAGE = "en"

# Must match the narration tts.py synthesizes (this is forced alignment of the known script).
DEFAULT_TEXT = (
    "Markets do not reward panic. In this clip we walk through the three numbers that "
    "actually move your portfolio, and the one quiet mistake that drains it over time."
)
TEXT = " ".join((os.environ.get("RUNNER_SCRIPT_TEXT") or DEFAULT_TEXT).split())

print(f"whisperx: loading audio {AUDIO}")
audio = whisperx.load_audio(AUDIO)  # 16 kHz mono float32
duration = len(audio) / 16000.0
print(f"whisperx: audio duration {duration:.1f}s")
segments = [{"start": 0.0, "end": round(duration, 3), "text": TEXT}]

print(f"whisperx: loading align model for language={LANGUAGE}")
align_model, metadata = whisperx.load_align_model(language_code=LANGUAGE, device=DEVICE)
print("whisperx: running forced alignment")
aligned = whisperx.align(segments, align_model, metadata, audio, DEVICE, return_char_alignments=False)
print(f"whisperx: alignment chunks={len(aligned['segments'])}")

words = []
for seg in aligned["segments"]:
    for w in seg.get("words", []):
        if "start" in w and "end" in w:
            words.append({"word": w["word"], "start": round(w["start"], 3), "end": round(w["end"], 3),
                          "score": round(w.get("score", 0.0), 3)})

manifest = {
    "audio": os.path.basename(AUDIO),
    "language": LANGUAGE,
    "method": "forced-alignment",
    "wordCount": len(words),
    "words": words,
}
with open(OUT, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"whisperx: {len(words)} aligned words ({LANGUAGE}, forced) -> {OUT}")
if not words:
    print("FAIL: no aligned words produced")
    sys.exit(1)
print("PASS whisperx")
