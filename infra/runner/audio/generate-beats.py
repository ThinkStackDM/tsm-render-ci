#!/usr/bin/env python3
"""Generate per-beat TTS WAVs for Cashflow Compass v3.

Reads infra/runner/audio/beats.json. Outputs beat-1.wav .. beat-9.wav into OUT_DIR.
- engine=openvoice: MeloTTS base + OpenVoice v2 ToneColorConverter (same path as smoke/tts.py)
- engine=piper:     Piper en_US-ryan-high (CC-BY-4.0), runs as subprocess

Usage:
    python generate-beats.py <OUT_DIR>            # orchestrator: one subprocess per beat
    python generate-beats.py <OUT_DIR> --beat N   # synthesize a single beat in-process

The orchestrator spawns a FRESH python subprocess per beat so MeloTTS / OpenVoice /
torch memory is fully reclaimed between beats. Running all 7 long body beats in one
long-lived process OOM-killed the runner (exit 137); per-beat isolation fixes that.

Env:
    OPENVOICE_HOME  path containing checkpoints_v2/  (default /opt/openvoice)
    PIPER_BIN       piper binary path                (default /opt/piper-bin/piper)
    PIPER_MODEL     .onnx model path                 (default /opt/piper/en_US-ryan-high.onnx)
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import soundfile as sf

CKPT = os.path.join(os.environ.get("OPENVOICE_HOME", "/opt/openvoice"), "checkpoints_v2")
DEVICE = "cpu"
SCRIPT_DIR = Path(__file__).parent
# Resolve to absolute so the orchestrator and its per-beat subprocesses agree on
# the location regardless of cwd (relative paths are passed from CI by design).
OUT_DIR = (Path(sys.argv[1]) if len(sys.argv) > 1 else SCRIPT_DIR / "out").resolve()
OUT_DIR.mkdir(parents=True, exist_ok=True)

PIPER_BIN = os.environ.get("PIPER_BIN", "/opt/piper-bin/piper")
PIPER_MODEL = os.environ.get("PIPER_MODEL", "/opt/piper/en_US-ryan-high.onnx")

beats = json.loads((SCRIPT_DIR / "beats.json").read_text())

# ---------------------------------------------------------------------------
# shared helpers
# ---------------------------------------------------------------------------

def split_text(text, max_chars=300):
    fragments = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    if not fragments:
        return [text]
    chunks, current = [], ""
    for frag in fragments:
        if not current:
            current = frag
            continue
        if len(current) + 1 + len(frag) <= max_chars:
            current = f"{current} {frag}"
        else:
            chunks.append(current)
            current = frag
    if current:
        chunks.append(current)
    return chunks


def concat_wavs(inputs, output_path):
    if len(inputs) == 1:
        import shutil
        shutil.copy(inputs[0], str(output_path))
        return
    with tempfile.TemporaryDirectory() as tmpdir:
        list_path = os.path.join(tmpdir, "concat.txt")
        with open(list_path, "w") as f:
            for p in inputs:
                f.write(f"file '{p}'\n")
        subprocess.check_call(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", list_path, "-c", "copy", str(output_path)],
        )


# ---------------------------------------------------------------------------
# OpenVoice v2 (lazy init — model load is expensive; only once per process)
# ---------------------------------------------------------------------------

_ov_tts = None
_ov_converter = None
_ov_se = None
_ov_spk_key = None


def _init_openvoice():
    global _ov_tts, _ov_converter, _ov_se, _ov_spk_key
    if _ov_tts is not None:
        return
    import torch
    from melo.api import TTS
    from openvoice.api import ToneColorConverter

    print("openvoice: loading MeloTTS EN...")
    _ov_tts = TTS(language="EN", device=DEVICE)
    spk2id = _ov_tts.hps.data.spk2id
    _ov_spk_key = "EN-US" if "EN-US" in spk2id else next(iter(spk2id))

    print("openvoice: loading ToneColorConverter...")
    _ov_converter = ToneColorConverter(
        os.path.join(CKPT, "converter", "config.json"), device=DEVICE
    )
    _ov_converter.load_ckpt(os.path.join(CKPT, "converter", "checkpoint.pth"))

    se_key = _ov_spk_key.lower().replace("_", "-")
    _ov_se = torch.load(
        os.path.join(CKPT, "base_speakers", "ses", f"{se_key}.pth"), map_location=DEVICE
    )
    print(f"openvoice: ready (speaker={_ov_spk_key})")


def synth_openvoice(text, out_path):
    _init_openvoice()
    spk2id = _ov_tts.hps.data.spk2id
    chunks = split_text(text)
    print(f"  openvoice: {len(chunks)} chunk(s)")
    with tempfile.TemporaryDirectory() as tmpdir:
        parts = []
        for i, chunk in enumerate(chunks, 1):
            base_wav = os.path.join(tmpdir, f"base_{i}.wav")
            ov_wav = os.path.join(tmpdir, f"ov_{i}.wav")
            _ov_tts.tts_to_file(chunk, spk2id[_ov_spk_key], base_wav, speed=1.0)
            _ov_converter.convert(
                audio_src_path=base_wav, src_se=_ov_se, tgt_se=_ov_se, output_path=ov_wav
            )
            parts.append(ov_wav)
        concat_wavs(parts, out_path)


# ---------------------------------------------------------------------------
# Piper (subprocess; binary + model must be pre-installed)
# ---------------------------------------------------------------------------

def synth_piper(text, out_path):
    result = subprocess.run(
        [PIPER_BIN, "--model", PIPER_MODEL, "--output_file", str(out_path)],
        input=text.encode(),
        capture_output=True,
    )
    if result.returncode != 0:
        print(f"  piper stderr: {result.stderr.decode()[:500]}")
        result.check_returncode()


# ---------------------------------------------------------------------------
# single-beat synthesis (memory-isolated unit of work)
# ---------------------------------------------------------------------------

def synth_one(n):
    beat = next((b for b in beats if b["n"] == n), None)
    if beat is None:
        print(f"ERROR: no beat with n={n} in beats.json")
        sys.exit(1)
    engine, vo = beat["engine"], beat["vo"]
    out = OUT_DIR / f"beat-{n}.wav"

    print(f"--- beat-{n} ({engine}, {len(vo)} chars) ---")
    if engine == "piper":
        synth_piper(vo, out)
    elif engine == "openvoice":
        synth_openvoice(vo, out)
    else:
        print(f"ERROR: unknown engine '{engine}' for beat {n}")
        sys.exit(1)

    info = sf.info(str(out))
    dur = info.frames / info.samplerate
    print(f"  -> {out.name}: {dur:.2f}s @ {info.samplerate}Hz")
    if dur < 1.0:
        print(f"ERROR: beat-{n} is only {dur:.2f}s — suspiciously short")
        sys.exit(1)


# ---------------------------------------------------------------------------
# entrypoint
# ---------------------------------------------------------------------------

if "--beat" in sys.argv:
    # single-beat mode (runs in its own process; memory reclaimed on exit)
    idx = sys.argv.index("--beat")
    synth_one(int(sys.argv[idx + 1]))
else:
    # orchestrator: spawn one fresh subprocess per beat to bound peak memory
    for beat in beats:
        n = beat["n"]
        print(f"\n=== spawning subprocess for beat-{n} ===")
        subprocess.check_call(
            [sys.executable, os.path.abspath(__file__), str(OUT_DIR), "--beat", str(n)]
        )
    print(f"\nDONE: {len(beats)} beat WAVs written to {OUT_DIR}")
