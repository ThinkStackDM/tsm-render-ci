// Render-stage gate unit tests (THIAAAAA-34 comment 815d80cc §(c)).
// Run with: node --import tsx --test test/gates.test.ts

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  bannedTopicExtendedDisclaimerGate,
  citationCoverageGate,
  disclosurePresenceGate,
  linterAttestationPullForwardGate,
  paletteConformanceGate,
  runAllGates,
  ymylPauseKillSwitchGate,
  type ComposerConfig,
  type RenderPlan,
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
    broll: [{ id: 'b1', source: 'ai-generated', dominantColors: ['#0E1A2B', '#1FB6FF'] }],
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

test('all gates pass on a clean plan', () => {
  assert.deepEqual(runAllGates(cleanPlan(), cleanConfig()), []);
});

test('citation-coverage fails when an overlay lacks a citation half', () => {
  const plan = cleanPlan();
  plan.charts[0]!.overlays[0]!.citation = { publisher: 'FRED', date: '' };
  const v = citationCoverageGate(plan);
  assert.equal(v.length, 1);
  assert.equal(v[0]!.gate, 'citation-coverage');
});

test('disclosure-presence fails without ai_presenter in window', () => {
  const plan = cleanPlan();
  plan.disclosures = [{ kind: 'disclaimer', at_s: 9, duration_s: 6 }];
  const v = disclosurePresenceGate(plan, cleanConfig());
  assert.equal(v.length, 1);
  assert.match(v[0]!.message, /ai_presenter/);
});

test('disclosure-presence requires affiliate disclosure when monetized', () => {
  const plan = cleanPlan();
  plan.hasMonetizationBeat = true;
  const v = disclosurePresenceGate(plan, cleanConfig());
  assert.equal(v.length, 1);
  assert.match(v[0]!.message, /affiliate/);
});

test('disclosure outside the window does not count', () => {
  const plan = cleanPlan();
  plan.disclosures = [
    { kind: 'ai_presenter', at_s: 31, duration_s: 5 },
    { kind: 'disclaimer', at_s: 9, duration_s: 6 },
  ];
  const v = disclosurePresenceGate(plan, cleanConfig());
  assert.equal(v.length, 1);
  assert.match(v[0]!.message, /ai_presenter/);
});

test('banned-topic gate requires an extended_disclaimer', () => {
  const plan = cleanPlan();
  plan.charts[0]!.bannedTopicEducation = true;
  assert.equal(bannedTopicExtendedDisclaimerGate(plan).length, 1);

  plan.disclosures = [
    ...plan.disclosures,
    { kind: 'extended_disclaimer', at_s: 20, duration_s: 8 },
  ];
  assert.equal(bannedTopicExtendedDisclaimerGate(plan).length, 0);
});

test('ymyl-pause kill-switch blocks when active', () => {
  const plan = cleanPlan();
  plan.ymylPauseActive = true;
  assert.equal(ymylPauseKillSwitchGate(plan).length, 1);
});

test('palette-conformance flags off-palette AI b-roll, exempts chart-frame/stock', () => {
  const plan = cleanPlan();
  plan.broll = [
    { id: 'ai-off', source: 'ai-generated', dominantColors: ['#FF0000'] },
    { id: 'frame', source: 'chart-frame', dominantColors: ['#FF0000'] },
    { id: 'stock', source: 'stock', dominantColors: ['#FF0000'] },
  ];
  const v = paletteConformanceGate(plan, cleanConfig());
  assert.equal(v.length, 1);
  assert.match(v[0]!.message, /ai-off/);
});

test('palette-conformance allows near-palette colors within tolerance', () => {
  const plan = cleanPlan();
  plan.broll = [{ id: 'ai-near', source: 'ai-generated', dominantColors: ['#0E1A2C'] }];
  assert.equal(paletteConformanceGate(plan, cleanConfig()).length, 0);
});

test('linter-attestation fails on non-passed status', () => {
  const plan = cleanPlan();
  plan.lintAttestation.status = 'failed';
  assert.equal(linterAttestationPullForwardGate(plan, cleanConfig()).length, 1);
});

test('linter-attestation fails on stale policy revision', () => {
  const plan = cleanPlan();
  plan.lintAttestation.policyRevisionId = 'rev-0';
  const v = linterAttestationPullForwardGate(plan, cleanConfig());
  assert.equal(v.length, 1);
  assert.match(v[0]!.message, /halt and re-lint/);
});
