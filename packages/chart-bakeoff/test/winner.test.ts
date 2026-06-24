// §2.4 winner-decision rule tests.
// Run with: node --import tsx --test test/winner.test.ts

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  decideWinner,
  runBakeoff,
  RunnerGatedError,
  toYaml,
  ARCHETYPES,
  ENGINES,
  EMPTY_QUALITY,
  type Archetype,
  type ChartQualityMetrics,
  type ChartRunMetrics,
  type Engine,
} from '../src/index.ts';

const PASS_QUALITY: ChartQualityMetrics = {
  renderFps: 30,
  droppedFrames: 0,
  p99FrameTimeMs: 31,
  renderCostRatio: 1.4,
  narrationSyncDriftMs: 60,
};

const FAIL_QUALITY: ChartQualityMetrics = {
  renderFps: 24, // below the 30fps floor
  droppedFrames: 5,
  p99FrameTimeMs: 48,
  renderCostRatio: 3.2,
  narrationSyncDriftMs: 140,
};

function row(engine: Engine, archetype: Archetype, run: number, quality: ChartQualityMetrics): ChartRunMetrics {
  return {
    engine,
    archetype,
    run,
    startedAt: '2026-05-28T00:00:00.000Z',
    finishedAt: '2026-05-28T00:00:10.000Z',
    wallMs: 10_000,
    resolution: { width: 1920, height: 1080 },
    captureBytes: 1024,
    captureFormat: 'mp4',
    engineVersion: 'test',
    quality,
    ok: true,
    errors: [],
  };
}

// Builds a full 18-row matrix; `fail` maps engine -> archetypes that should fail.
function matrix(fail: Partial<Record<Engine, Archetype[]>>): ChartRunMetrics[] {
  const out: ChartRunMetrics[] = [];
  for (const e of ENGINES) {
    for (const a of ARCHETYPES) {
      const q = (fail[e] ?? []).includes(a) ? FAIL_QUALITY : PASS_QUALITY;
      for (let r = 0; r < 3; r += 1) out.push(row(e, a, r, q));
    }
  }
  return out;
}

test('undecided when quality is not instrumented (the in-repo slice state)', () => {
  const rows = matrix({}).map((r) => ({ ...r, quality: { ...EMPTY_QUALITY } }));
  const report = decideWinner(rows);
  assert.equal(report.decision, 'undecided');
  assert.equal(report.capturesExpected, 18);
});

test('Recharts wins when it clears all three archetypes', () => {
  const report = decideWinner(matrix({}));
  assert.equal(report.decision, 'recharts');
  assert.deepEqual(report.rechartsMissArchetypes, []);
});

test('a single Recharts miss stays with Recharts (no per-archetype split)', () => {
  const report = decideWinner(matrix({ recharts: ['grouped-bar'] }));
  assert.equal(report.decision, 'recharts');
  assert.deepEqual(report.rechartsMissArchetypes, ['grouped-bar']);
});

test('2+ Recharts misses flip to Chart.js when it clears all three', () => {
  const report = decideWinner(matrix({ recharts: ['line-timeseries', 'area-band'] }));
  assert.equal(report.decision, 'chartjs');
  assert.equal(report.rechartsMissArchetypes.length, 2);
});

test('escalate to CEO when neither engine clears all three', () => {
  const report = decideWinner(
    matrix({ recharts: ['line-timeseries', 'area-band'], chartjs: ['grouped-bar'] })
  );
  assert.equal(report.decision, 'escalate-ceo');
});

test('runBakeoff with the default capturer is runner-gated (ok=false rows, undecided winner)', async () => {
  const tmp = `/tmp/chart-bakeoff-test-${process.pid}-${Date.now()}`;
  const results = await runBakeoff({ engines: ['recharts'], archetypes: ['line-timeseries'], runs: 1, outRoot: tmp });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.ok, false);
  assert.match(results[0]!.errors[0]!, /runner-gated/);
});

test('RunnerGatedError is exported and descriptive', () => {
  const e = new RunnerGatedError();
  assert.match(e.message, /THIAAAAA-54/);
});

test('toYaml emits quoted scalars, arrays, and nested records', () => {
  const y = toYaml({ decision: 'recharts', misses: ['a', 'b'], empty: [], nested: { n: 1, ok: true } });
  assert.match(y, /decision: "recharts"/);
  assert.match(y, /- "a"/);
  assert.match(y, /empty: \[\]/);
  assert.match(y, /n: 1/);
  assert.match(y, /ok: true/);
});
