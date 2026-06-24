#!/usr/bin/env node
// §2.3 invocation contract for the chart bake-off.
//
//   chart-bakeoff --out ./bakeoff/charts [--engine recharts|chartjs|all]
//                 [--archetype line-timeseries|grouped-bar|area-band|all]
//                 [--runs 3] [--winner-only] [--real] [--duration-ms 4000]
//
// Default (no engine/archetype filters) runs the full §2.3 matrix:
//   3 archetypes × 2 engines × 3 runs = 18 captures.
// Without --real, capture is runner-gated (THIAAAAA-54): the CLI writes ok=false
// metric rows and an `undecided` winner.yaml — the correct state for the harness
// slice. With --real it injects the headless-Chromium ChartCapturer (real
// Recharts/Chart.js render + ffmpeg mux) and produces ok=true rows with measured
// §2.2 quality. `--winner-only` regenerates winner.yaml from existing metrics.

import { writeWinnerYaml } from './winner.js';
import { runBakeoff, FULL_MATRIX } from './run.js';
import { createBrowserChartCapturer } from './capturer.js';
import { ARCHETYPES, ENGINES, type Archetype, type Engine } from './types.js';

interface Parsed {
  out: string;
  engines: ReadonlyArray<Engine>;
  archetypes: ReadonlyArray<Archetype>;
  runs: number;
  winnerOnly: boolean;
  real: boolean;
  durationMs: number;
}

function parseArgs(argv: string[]): Parsed {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const out = get('--out') ?? './bakeoff/charts';
  const engineArg = get('--engine') ?? 'all';
  const archetypeArg = get('--archetype') ?? 'all';
  const runs = Number(get('--runs') ?? FULL_MATRIX.runs);

  const engines: ReadonlyArray<Engine> =
    engineArg === 'all' ? ENGINES : [assertOneOf(engineArg, ENGINES, '--engine')];
  const archetypes: ReadonlyArray<Archetype> =
    archetypeArg === 'all' ? ARCHETYPES : [assertOneOf(archetypeArg, ARCHETYPES, '--archetype')];

  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`--runs must be a positive integer, got "${get('--runs')}"`);
  }
  const durationMs = Number(get('--duration-ms') ?? 4000);
  return {
    out,
    engines,
    archetypes,
    runs,
    winnerOnly: argv.includes('--winner-only'),
    real: argv.includes('--real'),
    durationMs,
  };
}

function assertOneOf<T extends string>(value: string, allowed: ReadonlyArray<T>, flag: string): T {
  if ((allowed as ReadonlyArray<string>).includes(value)) return value as T;
  throw new Error(`${flag} must be one of ${allowed.join(', ')} (or "all"), got "${value}"`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.winnerOnly) {
    const report = await writeWinnerYaml(args.out);
    console.log(`winner.yaml regenerated: decision=${report.decision} (${report.capturesFound}/${report.capturesExpected} captures)`);
    return;
  }
  const bc = args.real ? createBrowserChartCapturer({ durationMs: args.durationMs }) : null;
  try {
    console.log(`Starting chart bake-off with engines=${args.engines.join(',')} archetypes=${args.archetypes.join(',')} runs=${args.runs}`);
    const results = await runBakeoff(
      {
        engines: args.engines,
        archetypes: args.archetypes,
        runs: args.runs,
        outRoot: args.out,
      },
      bc?.capture
    );
    const okCount = results.filter((r) => r.ok).length;
    console.log(`Ran ${results.length} captures (${okCount} ok). winner.yaml written to ${args.out}.`);
    if (okCount === 0 && !args.real) {
      console.error(
        'No capture succeeded — chart capture is runner-gated (THIAAAAA-54). ' +
          'Pass --real to inject the headless-Chromium ChartCapturer and populate metrics.'
      );
    }
  } finally {
    if (bc) {
      console.log('Closing browser capturer...');
      await bc.close();
      console.log('Browser capturer closed.');
    }
  }
}

function finalize(exitCode: number): void {
  const waitMs = Number(process.env.CC_BAKEOFF_EXIT_GRACE_MS ?? 250);
  const timer = setTimeout(() => process.exit(exitCode), Number.isFinite(waitMs) ? waitMs : 250);
  timer.unref();
}

main().then(() => {
  finalize(Number(process.exitCode ?? 0));
}).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
  finalize(1);
});
