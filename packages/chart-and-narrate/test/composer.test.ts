// Composer + engine + cache + YMYL-adapter tests.
// Run with: node --import tsx --test test/composer.test.ts

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  ChartJsEngineAdapter,
  InMemoryComposeCache,
  RechartsEngineAdapter,
  attestationFromReport,
  buildDataCite,
  compose,
  runScriptLint,
  selectEngine,
  type ComposerConfig,
  type RenderPlan,
  type YmylLinterAdapter,
  type YmylLintReportPort,
} from '../src/index.ts';

const PALETTE = ['#0E1A2B', '#1FB6FF', '#E6F1FF'];

function cleanPlan(): RenderPlan {
  return {
    videoId: 'cc-sample-001',
    channel: 'cashflow-compass',
    charts: [
      {
        id: 'chart-a',
        archetype: 'line-timeseries',
        title: '10-Year Treasury Yield',
        series: [{ id: 's1', label: 'DGS10', points: [{ x: '2026-05', y: 4.31 }] }],
        overlays: [
          {
            id: 'ov1',
            at_s: 12,
            numeric: '4.31%',
            label: 'Latest 10Y',
            citation: { publisher: 'FRED', date: '2026-05-20' },
          },
        ],
      },
    ],
    disclosures: [
      { kind: 'ai_presenter', at_s: 4, duration_s: 5 },
      { kind: 'disclaimer', at_s: 9, duration_s: 6 },
    ],
    broll: [],
    hasMonetizationBeat: false,
    ymylPauseActive: false,
    lintAttestation: {
      status: 'passed',
      policyRevisionId: 'rev-1',
      scriptId: 'cc-sample-001',
      generatedAt: '2026-05-28T00:00:00.000Z',
    },
  };
}

function cleanConfig(): ComposerConfig {
  return {
    livePolicyRevisionId: 'rev-1',
    allowedPalette: PALETTE,
    now: () => new Date('2026-05-28T00:00:00.000Z'),
  };
}

test('compose builds charts on a clean plan via the default (Recharts) engine', () => {
  const res = compose(cleanPlan(), cleanConfig(), { cache: new InMemoryComposeCache() });
  assert.equal(res.gateReport.ok, true);
  assert.equal(res.engine, 'recharts');
  assert.equal(res.charts?.length, 1);
  assert.equal(res.charts?.[0]?.descriptor.componentKind, 'LineChart');
  assert.equal(res.charts?.[0]?.dataCite['ov1'], 'FRED — 2026-05-20');
});

test('compose hard-blocks (no charts) when any gate fails', () => {
  const plan = cleanPlan();
  plan.ymylPauseActive = true;
  const res = compose(plan, cleanConfig(), { cache: new InMemoryComposeCache() });
  assert.equal(res.gateReport.ok, false);
  assert.equal(res.charts, undefined);
  assert.ok(res.gateReport.violations.some((v) => v.gate === 'ymyl-pause-kill-switch'));
});

test('compose is idempotent — repeat returns the cached result', () => {
  const cache = new InMemoryComposeCache();
  const a = compose(cleanPlan(), cleanConfig(), { cache });
  const b = compose(cleanPlan(), cleanConfig(), { cache });
  assert.equal(a, b);
});

test('compose with chartjs engine uses the fallback component kinds', () => {
  const res = compose(cleanPlan(), cleanConfig(), {
    engine: 'chartjs',
    cache: new InMemoryComposeCache(),
  });
  assert.equal(res.engine, 'chartjs');
  assert.equal(res.charts?.[0]?.descriptor.componentKind, 'line');
});

test('selectEngine returns the requested adapter', () => {
  assert.ok(selectEngine('recharts') instanceof RechartsEngineAdapter);
  assert.ok(selectEngine('chartjs') instanceof ChartJsEngineAdapter);
});

test('buildDataCite emits Publisher — Date and omits incomplete citations', () => {
  const map = buildDataCite([
    { id: 'a', at_s: 1, numeric: '1', label: 'a', citation: { publisher: 'IRS', date: '2026' } },
    { id: 'b', at_s: 2, numeric: '2', label: 'b', citation: { publisher: 'IRS', date: '' } },
  ]);
  assert.equal(map['a'], 'IRS — 2026');
  assert.equal('b' in map, false);
});

test('runScriptLint converts a linter adapter report into an attestation', async () => {
  const fakeReport: YmylLintReportPort = {
    status: 'passed',
    policyRevisionId: 'rev-1',
    violations: [],
    meta: { scriptId: 'cc-sample-001', generatedAt: '2026-05-28T00:00:00.000Z' },
  };
  const adapter: YmylLinterAdapter<string> = {
    lintScript: async () => fakeReport,
  };
  const att = await runScriptLint(adapter, 'script-markdown');
  assert.deepEqual(att, {
    status: 'passed',
    policyRevisionId: 'rev-1',
    scriptId: 'cc-sample-001',
    generatedAt: '2026-05-28T00:00:00.000Z',
  });
  assert.deepEqual(attestationFromReport(fakeReport), att);
});
