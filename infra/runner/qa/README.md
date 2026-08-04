# infra/runner/qa — shared render-gate (TSM-6171)

`shared-render-gate.py` gates the hosted render lane (`hosted-render.yml`) onto
the ThinkStack shared rejection-QA baseline established by the **TSM-6169**
render-entrypoint audit. It runs fail-closed after the render and before the
artifact is treated as reviewable/publishable.

## Why an "equivalent" gate and not the canonical one

The canonical gate is the internal `~/scripts/deck/run-rejection-qa-gates.sh` →
`rejection-qa-gates.py`. It is **not** copied here on purpose:

1. **This repo is public and tooling-only** (see `README.md`, `SECURITY.md`).
   The canonical gate is ~7,800 lines of internal QA (brand policy, franchise
   law, gate thresholds). Vendoring it would leak internal QA logic publicly.
2. **The canonical gate hard-requires a full deck source pack**
   (`--body-work-dir` with storyboard, b-roll manifest, deck spec, package
   approval, per-beat vo scripts). The hosted lane renders a single locked-script
   capture and produces none of those, so the deck source-pack gates are not
   satisfiable here.

The TSM-6171 acceptance explicitly allows "`run-rejection-qa-gates.sh` **or an
equivalent shared-gate step**". This is that equivalent step.

## What it enforces (fail-closed) vs. defers

| enforced here (master-level) | deferred to the canonical gate |
|---|---|
| master present + non-empty | source-pack contract S1–S5 (fake screens / self-attested intent / repeated slide templates / insufficient b-roll) |
| 1920×1080 resolution | storyboardConformance |
| ~30 fps | brollCoverage |
| muxed narration (≥1 audio stream) | chartTruth |
| WhisperX word-confidence floor ≥ 0.85 (shared TTS floor, TSM-7) | packageApproval |
| master duration ≥ narration duration | description / CTA-present |

`shared-render-gate.json` (written into `_render_out/` and uploaded with the
artifact) records the verdict. By construction the report sets
`publishable: false`: a hosted-lane render is a render **verification**, never a
publishable episode master. A publishable master must come from the canonical
`build-deck`/`build-episode` chain and pass `run-rejection-qa-gates.sh` on a real
source pack.

Threshold override: `SHARED_GATE_WHISPERX_FLOOR` (default `0.85`).

## Dependencies

`ffprobe` + Python standard library only — both present in
`ghcr.io/thinkstackdm/thiaaaa-render:latest`. No internal imports.

## Test

`bash infra/runner/qa/test-shared-render-gate.sh` — builds synthetic masters with
ffmpeg and asserts the compliant verification master passes and every defect
(missing master, wrong resolution/fps, no audio, sub-0.85 confidence, truncated
master, missing manifest) fail-closes.
