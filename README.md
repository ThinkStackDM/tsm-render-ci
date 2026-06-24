# tsm-render-ci

Free CI render lane for **ThinkStack Media**. This **public** repo exists for one reason:
public repositories get **unlimited free GitHub Actions minutes**, so video renders run here
on GitHub-hosted runners instead of competing for the shared Mac or the private repo's
exhausted minutes.

It is **tooling only**. The heavy toolchain (Playwright, OpenVoice v2, WhisperX, ffmpeg)
lives in the prebuilt container image `ghcr.io/thinkstackdm/thiaaaa-render:latest`; these
workflows just check out, pull the image, run the render scripts, and upload the result.

## What is here
- `.github/workflows/hosted-render.yml` — capture + TTS + alignment + MP4, on `ubuntu-latest`
- `.github/workflows/cc-chart-executor.yml`, `cfc-v3-audio.yml`, `runner-smoke.yml`
- `infra/runner/smoke/` — the render scripts the workflows call
- `packages/chart-and-narrate`, `packages/chart-bakeoff` — chart generation tooling

## What is deliberately NOT here (guardrails — see SECURITY.md)
- **No secrets / credentials** — the only Actions secret used is the auto-provided `GITHUB_TOKEN`.
- **No unreleased content** — scripts/assets come **in** as workflow inputs; finished media comes
  **out** as Actions artifacts. Nothing is committed.
- **No Oracle / self-hosted material** — the A1 hunter, tenancy IDs, and runner-registration
  scripts stay in the private `thinkstack-media-render` repo.

## Triggering a render
`hosted-render` runs on `workflow_dispatch` (Actions tab → Run workflow) or `workflow_call`:

| input | required | notes |
|---|---|---|
| `title` | yes | overlay title |
| `subtitle` | no | overlay subtitle |
| `script` | yes | locked narration script |
| `artifact_name` | no | output bundle name |

Output is uploaded as the artifact `<artifact_name>-<run_id>` (`_render_out/`), 7-day retention.

## One-time setup
The container image package `ghcr.io/thinkstackdm/thiaaaa-render` must be readable by this repo
— either make that GHCR package **public**, or grant this repo package read access. No other
secrets are required.
