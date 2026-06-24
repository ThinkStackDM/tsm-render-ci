import { join, resolve } from 'node:path';

import { writeMetrics } from './metrics.js';
import { writeWinnerYaml } from './winner.js';
import {
  ARCHETYPES,
  EMPTY_QUALITY,
  RUNS_PER_CELL,
  type Archetype,
  type ChartRunMetrics,
  type Engine,
} from './types.js';

export interface CaptureResult {
  captureBytes: number;
  captureFormat: 'mp4' | 'webm';
  engineVersion: string;
  resolution: { width: number; height: number };
  quality: ChartRunMetrics['quality'];
}

export interface CaptureArgs {
  engine: Engine;
  archetype: Archetype;
  run: number;
  outDir: string;
}

// A capturer renders one chart archetype with one engine and returns the §2.2
// quality metrics. The render child (THIAAAAA-54) injects the real one
// (headless Chromium + Remotion + ffmpeg on the GHA runner).
export type ChartCapturer = (args: CaptureArgs) => Promise<CaptureResult>;

export class RunnerGatedError extends Error {
  constructor() {
    super(
      'Chart capture is runner-gated — it needs the GHA self-hosted runner ' +
        '(headless Chromium + Remotion + ffmpeg) provisioned on THIAAAAA-52 and ' +
        'is executed by the render child THIAAAAA-54, not by @thiaaaa/chart-bakeoff. ' +
        'Inject a ChartCapturer to run the 18 captures.'
    );
    this.name = 'RunnerGatedError';
  }
}

// Default capturer: refuses, by design. This package ships the harness CODE
// only; running the captures is out of scope for the in-repo slice (THIAAAAA-53).
export const runnerGatedCapturer: ChartCapturer = async () => {
  throw new RunnerGatedError();
};

export interface BakeoffArgs {
  engines: ReadonlyArray<Engine>;
  archetypes: ReadonlyArray<Archetype>;
  runs: number;
  outRoot: string;
}

// Orchestrates the §2.3 matrix (archetypes × engines × runs). Each capture is
// delegated to the injected capturer; on failure the metrics row is written
// with ok=false so a partial run still yields a regenerable winner.yaml.
export async function runBakeoff(
  args: BakeoffArgs,
  capturer: ChartCapturer = runnerGatedCapturer
): Promise<ChartRunMetrics[]> {
  const results: ChartRunMetrics[] = [];
  for (const archetype of args.archetypes) {
    for (const engine of args.engines) {
      for (let run = 0; run < args.runs; run += 1) {
        const outDir = resolve(args.outRoot, engine, archetype, String(run));
        const startedAt = new Date();
        let ok = true;
        const errors: string[] = [];
        let capture: CaptureResult | null = null;
        console.log(`capture start: ${engine}/${archetype} run=${run}`);
        try {
          capture = await capturer({ engine, archetype, run, outDir });
          console.log(`capture ok:   ${engine}/${archetype} run=${run}`);
        } catch (err) {
          ok = false;
          errors.push(err instanceof Error ? err.message : String(err));
          console.log(`capture fail: ${engine}/${archetype} run=${run} -> ${errors.at(-1)}`);
        }
        const finishedAt = new Date();
        const metrics: ChartRunMetrics = {
          engine,
          archetype,
          run,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          wallMs: finishedAt.getTime() - startedAt.getTime(),
          resolution: capture?.resolution ?? { width: 1920, height: 1080 },
          captureBytes: capture?.captureBytes ?? 0,
          captureFormat: capture?.captureFormat ?? 'mp4',
          engineVersion: capture?.engineVersion ?? 'unknown',
          quality: capture?.quality ?? { ...EMPTY_QUALITY },
          ok,
          errors,
        };
        await writeMetrics(join(outDir, 'metrics.json'), metrics);
        results.push(metrics);
      }
    }
  }
  // Regenerate winner.yaml from everything under the out root (§2.4).
  await writeWinnerYaml(args.outRoot);
  return results;
}

export const FULL_MATRIX: Pick<BakeoffArgs, 'engines' | 'archetypes' | 'runs'> = {
  engines: ['recharts', 'chartjs'],
  archetypes: [...ARCHETYPES],
  runs: RUNS_PER_CELL,
};
