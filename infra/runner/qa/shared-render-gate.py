#!/usr/bin/env python3
"""Shared render-gate for the hosted lane (TSM-6171).

WHY THIS EXISTS
---------------
`hosted-render.yml` produces a *script-render verification* master (a captured
web plate looped under OpenVoice v2 narration + a WhisperX forced-alignment
manifest). The portfolio invariant established by the TSM-6169 render-entrypoint
audit is: **no produced master may be treated as reviewable/publishable until it
has passed the shared rejection-QA baseline.** The canonical gate for that is the
internal `~/scripts/deck/run-rejection-qa-gates.sh` -> `rejection-qa-gates.py`.

That canonical gate CANNOT run here, for two hard reasons:

  1. This is the **public** `tsm-render-ci` repo (unlimited free Actions minutes).
     It is deliberately tooling-only -- "No Oracle / self-hosted material",
     "No unreleased content" (README, SECURITY.md). Vendoring the 7,800-line
     internal QA (brand policy, franchise law, gate thresholds) into a public
     repo would leak internal QA logic. Prohibited.
  2. The canonical gate hard-requires a full deck **source pack**
     (`--body-work-dir` with a storyboard, b-roll manifest, deck spec, package
     approval, per-beat vo scripts). The hosted lane produces none of those --
     it renders a single locked-script capture. The deck source-pack gates
     (source-pack contract S1-S5: fake screens / self-attested intent / repeated
     slide templates / insufficient b-roll; storyboardConformance; brollCoverage;
     chartTruth; packageApproval) are simply not satisfiable by this lane.

So this is the "equivalent shared-gate step" the issue allows: it enforces, in
repo and fail-closed, the subset of the shared baseline that IS checkable on this
lane's produced master, and it records -- machine-readably -- that the deck
source-pack gates are DEFERRED to the canonical gate. By construction it marks
the output NOT publishable: a hosted-lane render can be reviewed as a render
*verification*, but a publishable episode master must come from the canonical
build-deck/build-episode chain and pass `run-rejection-qa-gates.sh`.

Self-contained: depends only on `ffprobe` + the Python standard library, both
present in `ghcr.io/thinkstackdm/thiaaaa-render:latest`. No internal imports.

ENFORCED (master-level shared-baseline invariants):
  masterPresent            render.mp4 exists and is non-empty
  resolution1080p          video stream is 1920x1080
  frameRate30              average frame rate rounds to 30 fps
  audioTrackPresent        the narration is muxed (>=1 audio stream)
  masterCoversNarration    master duration >= aligned narration duration
  whisperxConfidenceFloor  WhisperX word-confidence floor >= 0.85 (shared TTS
                           floor; TSM-7). Override via SHARED_GATE_WHISPERX_FLOOR.

DEFERRED to the canonical gate (recorded, not run here):
  source-pack-contract (S1-S5), storyboardConformance, brollCoverage,
  chartTruth, packageApproval, description/CTA.

Exit 0 = all enforced checks pass (verification master sound). Exit 1 = a check
failed (fail-closed; workflow goes red). Exit 2 = usage/inputs error.

Usage: shared-render-gate.py <render_out_dir> [--master render.mp4]
       [--manifest whisperx_manifest.json] [--report shared-render-gate.json]
"""
import argparse
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path

WHISPERX_FLOOR = float(os.environ.get("SHARED_GATE_WHISPERX_FLOOR", "0.85"))
EXPECT_W, EXPECT_H = 1920, 1080
EXPECT_FPS = 30

DEFERRED_TO_CANONICAL = [
    "source-pack-contract (S1-S5: fake screens / self-attested intent / "
    "repeated slide templates / insufficient b-roll)",
    "storyboardConformance",
    "brollCoverage",
    "chartTruth",
    "packageApproval",
    "description/CTA-present",
]


def ffprobe_json(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed on {path}: {out.stderr.strip()}")
    return json.loads(out.stdout)


def parse_fps(rate):
    try:
        num, den = rate.split("/")
        den = float(den)
        return float(num) / den if den else 0.0
    except (ValueError, AttributeError):
        try:
            return float(rate)
        except (TypeError, ValueError):
            return 0.0


def check(gate, ok, **detail):
    return gate, {"pass": bool(ok), **detail}


def run(out_dir, master_name, manifest_name):
    out_dir = Path(out_dir)
    master = out_dir / master_name
    manifest = out_dir / manifest_name
    gates = {}

    # masterPresent
    present = master.is_file() and master.stat().st_size > 0
    g, r = check("masterPresent", present, path=str(master),
                 bytes=(master.stat().st_size if master.exists() else 0))
    gates[g] = r
    if not present:
        # Nothing else is checkable; return early, fail-closed.
        gates["resolution1080p"] = {"pass": False, "reason": "no master"}
        gates["frameRate30"] = {"pass": False, "reason": "no master"}
        gates["audioTrackPresent"] = {"pass": False, "reason": "no master"}
        gates["masterCoversNarration"] = {"pass": False, "reason": "no master"}
        gates["whisperxConfidenceFloor"] = {"pass": False, "reason": "no master"}
        return gates

    probe = ffprobe_json(master)
    streams = probe.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    audios = [s for s in streams if s.get("codec_type") == "audio"]
    master_dur = float(probe.get("format", {}).get("duration") or 0.0)

    # resolution1080p
    w = int(v.get("width", 0)) if v else 0
    h = int(v.get("height", 0)) if v else 0
    gates.update([check("resolution1080p", w == EXPECT_W and h == EXPECT_H,
                        width=w, height=h, expected=f"{EXPECT_W}x{EXPECT_H}")])

    # frameRate30
    fps = parse_fps(v.get("avg_frame_rate") or v.get("r_frame_rate") or "0/0") if v else 0.0
    gates.update([check("frameRate30", round(fps) == EXPECT_FPS,
                        fps=round(fps, 3), expected=EXPECT_FPS)])

    # audioTrackPresent
    gates.update([check("audioTrackPresent", len(audios) >= 1,
                        audioStreams=len(audios))])

    # whisperx manifest-derived checks
    narration_dur = 0.0
    floor = None
    word_count = 0
    if manifest.is_file():
        try:
            m = json.loads(manifest.read_text())
        except json.JSONDecodeError as exc:
            m = None
            manifest_err = f"invalid JSON: {exc}"
        else:
            manifest_err = None
    else:
        m = None
        manifest_err = "manifest not found"

    if m is not None:
        words = m.get("words") or [
            w for seg in m.get("segments", []) for w in seg.get("words", [])
        ]
        scores = [x["score"] for x in words
                  if isinstance(x.get("score"), (int, float))]
        word_count = len(words)
        if words:
            narration_dur = max((float(x.get("end", 0.0)) for x in words), default=0.0)
        if scores:
            floor = min(scores)
        gates.update([check(
            "whisperxConfidenceFloor",
            floor is not None and floor >= WHISPERX_FLOOR,
            floor=(round(floor, 3) if floor is not None else None),
            target=WHISPERX_FLOOR,
            meanScore=(round(sum(scores) / len(scores), 3) if scores else None),
            wordCount=word_count,
        )])
    else:
        gates["whisperxConfidenceFloor"] = {
            "pass": False, "reason": manifest_err, "target": WHISPERX_FLOOR,
        }

    # masterCoversNarration: master must not be truncated below the narration.
    covers = narration_dur > 0 and master_dur + 0.5 >= narration_dur
    gates.update([check("masterCoversNarration", covers,
                        masterDuration=round(master_dur, 3),
                        narrationDuration=round(narration_dur, 3))])
    return gates


def main():
    ap = argparse.ArgumentParser(description="Shared render-gate for the hosted lane (TSM-6171)")
    ap.add_argument("out_dir", help="the _render_out directory")
    ap.add_argument("--master", default="render.mp4")
    ap.add_argument("--manifest", default="whisperx_manifest.json")
    ap.add_argument("--report", default="shared-render-gate.json")
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    if not out_dir.is_dir():
        print(f"ERROR: render out dir not found: {out_dir}", file=sys.stderr)
        return 2

    try:
        gates = run(out_dir, args.master, args.manifest)
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    failed = [name for name, g in gates.items() if not g.get("pass")]
    report = {
        "gate": "shared-render-gate",
        "lane": "hosted-render.yml",
        "master": args.master,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sharedBaselineRef": "run-rejection-qa-gates.sh -> rejection-qa-gates.py (canonical, internal)",
        "whisperxFloorTarget": WHISPERX_FLOOR,
        "enforced": gates,
        "deferredToCanonicalGate": DEFERRED_TO_CANONICAL,
        "status": "failed" if failed else "passed",
        "failedGates": failed,
        # This lane produces no deck source pack, so the deck gates cannot run
        # here: its output is a render *verification*, never a publishable master.
        "reviewable": not failed,
        "publishable": False,
        "publishableReason": "hosted lane produces no deck source pack; a publishable "
        "episode master must pass the canonical run-rejection-qa-gates.sh on a "
        "full build-deck/build-episode source pack.",
    }
    report_path = out_dir / args.report
    report_path.write_text(json.dumps(report, indent=2))

    print(json.dumps({
        "report": str(report_path),
        "status": report["status"],
        "failedGates": failed,
        "reviewable": report["reviewable"],
        "publishable": report["publishable"],
    }, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
