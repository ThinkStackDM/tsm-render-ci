#!/usr/bin/env python3
"""Smoke 2/3: synthesize a >=6s clip through OpenVoice v2 (MIT).

MeloTTS produces the base narration; the OpenVoice v2 tone-color converter then runs it
through the pinned v2 checkpoints. Long scripts are chunked to avoid memory spikes from
single-pass inference on very long text. Proves the full OpenVoice v2 inference path on
the runner.

Output: <out>/openvoice_clip.wav. Exits non-zero if the final clip is shorter than 6s.
"""
import os
import re
import subprocess
import sys
import tempfile

import soundfile as sf
import torch
from melo.api import TTS
from openvoice.api import ToneColorConverter

CKPT = os.path.join(os.environ.get("OPENVOICE_HOME", "/opt/openvoice"), "checkpoints_v2")
DEVICE = "cpu"
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT_DIR, exist_ok=True)

DEFAULT_TEXT = (
    "Markets do not reward panic. In this clip we walk through the three numbers that "
    "actually move your portfolio, and the one quiet mistake that drains it over time."
)
TEXT = " ".join((os.environ.get("RUNNER_SCRIPT_TEXT") or DEFAULT_TEXT).split())
CHUNK_TEXT = " ".join((os.environ.get("RUNNER_SCRIPT_CHUNK_TEXT") or "").split())
CHUNK_INDEX = os.environ.get("RUNNER_SCRIPT_CHUNK_INDEX", "1")


def _split_text(text: str, max_chars: int = 300) -> list[str]:
    # Prefer sentence boundaries, then cap chunk length so one conversion call cannot grow
    # unbounded in memory for long scripts.
    fragments = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    if not fragments:
        return [text]

    chunks = []
    current = ""
    for frag in fragments:
        if not current:
            current = frag
            continue

        if len(current) + 1 + len(frag) <= max_chars:
            current = f"{current} {frag}"
            continue

        chunks.append(current)
        current = frag

    if current:
        chunks.append(current)
    return chunks


def _concat_wavs(inputs, output_path: str) -> None:
    if len(inputs) == 1:
        os.replace(inputs[0], output_path)
        return

    with tempfile.TemporaryDirectory() as tmpdir:
        list_path = os.path.join(tmpdir, "concat.txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in inputs:
                f.write(f"file '{p}'\n")

        subprocess.check_call(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "concat", "-safe", "0",
                "-i", list_path,
                "-c", "copy",
                output_path,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def _run_chunk_worker(chunk_text: str, chunk_index: int) -> str:
    env = os.environ.copy()
    env["RUNNER_SCRIPT_CHUNK_TEXT"] = chunk_text
    env["RUNNER_SCRIPT_CHUNK_INDEX"] = str(chunk_index)
    subprocess.check_call([sys.executable, __file__, OUT_DIR], env=env)
    return os.path.join(OUT_DIR, f"openvoice_clip_{chunk_index}.wav")


def _run_single_chunk(chunk_text: str, chunk_index: int) -> str:
    print(f"tts: MeloTTS chunk {chunk_index} ({len(chunk_text)} chars)")
    tts = TTS(language="EN", device=DEVICE)
    spk2id = tts.hps.data.spk2id
    speaker_key = "EN-US" if "EN-US" in spk2id else next(iter(spk2id))
    base_wav = os.path.join(OUT_DIR, f"tts_base_{chunk_index}.wav")
    openvoice_wav = os.path.join(OUT_DIR, f"openvoice_clip_{chunk_index}.wav")
    tts.tts_to_file(chunk_text, spk2id[speaker_key], base_wav, speed=1.0)

    converter = ToneColorConverter(os.path.join(CKPT, "converter", "config.json"), device=DEVICE)
    converter.load_ckpt(os.path.join(CKPT, "converter", "checkpoint.pth"))
    se_key = speaker_key.lower().replace("_", "-")
    se = torch.load(os.path.join(CKPT, "base_speakers", "ses", f"{se_key}.pth"), map_location=DEVICE)
    print(f"tts: OpenVoice chunk -> {os.path.basename(openvoice_wav)}")
    converter.convert(audio_src_path=base_wav, src_se=se, tgt_se=se, output_path=openvoice_wav)
    return openvoice_wav


if CHUNK_TEXT:
    _run_single_chunk(CHUNK_TEXT, int(CHUNK_INDEX))
    sys.exit(0)

chunks = _split_text(TEXT)
print(f"tts: prepared {len(chunks)} chunk(s) from {len(TEXT)} chars")

clip_parts = []
for i, chunk in enumerate(chunks, start=1):
    clip_parts.append(_run_chunk_worker(chunk, i))

clip = os.path.join(OUT_DIR, "openvoice_clip.wav")
_concat_wavs(clip_parts, clip)

info = sf.info(clip)
dur = info.frames / info.samplerate
print(f"openvoice: {dur:.2f}s @ {info.samplerate}Hz -> {clip}")
if dur < 6.0:
    print(f"FAIL: clip is {dur:.2f}s, expected >= 6s")
    sys.exit(1)
print("PASS tts")
