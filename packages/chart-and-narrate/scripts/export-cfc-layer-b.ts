import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compose, type ComposerConfig, type RenderPlan } from '../src/index.ts';
import { cashflowCompassConfig } from '../../channel-config/src/cashflow-compass.ts';

interface SampleLintReport {
  status: 'passed' | 'failed' | 'not-run';
  policyRevisionId: string;
  meta: {
    scriptId: string;
    generatedAt: string;
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', '..', '..', 'work-products', 'TSM-54-layer-b');
const lintReportPath = resolve(__dirname, '..', 'samples', 'cc-jargon-stress.lint-report.json');

async function readLintReport(): Promise<SampleLintReport> {
  return JSON.parse(await readFile(lintReportPath, 'utf8')) as SampleLintReport;
}

function buildPlan(lint: SampleLintReport): RenderPlan {
  return {
    videoId: 'tsm-54-layer-b-sample',
    channel: 'cashflow-compass',
    charts: [
      {
        id: 'fred-dgs10-line',
        archetype: 'line-timeseries',
        title: '10-Year Treasury Yield Drift',
        series: [
          {
            id: 'dgs10',
            label: 'DGS10',
            points: [
              { x: '2026-01', y: 4.12 },
              { x: '2026-02', y: 4.18 },
              { x: '2026-03', y: 4.26 },
              { x: '2026-04', y: 4.28 },
              { x: '2026-05', y: 4.31 },
            ],
          },
        ],
        overlays: [
          {
            id: 'ov-fred-431',
            at_s: 12,
            numeric: '4.31%',
            label: 'Latest 10Y',
            citation: { publisher: 'FRED', date: '2026-05-20' },
          },
        ],
      },
      {
        id: 'irs-limits-bar',
        archetype: 'grouped-bar',
        title: 'Retirement Account Limits',
        series: [
          {
            id: 'employee-deferral',
            label: '401(k) deferral',
            points: [
              { x: '2024', y: 23000 },
              { x: '2025', y: 23500 },
              { x: '2026', y: 24500 },
            ],
          },
          {
            id: 'ira-limit',
            label: 'IRA',
            points: [
              { x: '2024', y: 7000 },
              { x: '2025', y: 7000 },
              { x: '2026', y: 7000 },
            ],
          },
        ],
        overlays: [
          {
            id: 'ov-irs-24500',
            at_s: 145,
            numeric: '$24,500',
            label: '2026 employee deferral',
            citation: { publisher: 'IRS Pub 560 / 590-A', date: '2026-01-15' },
          },
        ],
      },
      {
        id: 'damodaran-area',
        archetype: 'area-band',
        title: 'ROIC Spread Compression',
        series: [
          {
            id: 'high-spread',
            label: 'Top quartile',
            points: [
              { x: '2022', y: 8.6 },
              { x: '2023', y: 8.1 },
              { x: '2024', y: 7.8 },
              { x: '2025', y: 7.5 },
            ],
          },
          {
            id: 'median-spread',
            label: 'Median',
            points: [
              { x: '2022', y: 4.8 },
              { x: '2023', y: 4.5 },
              { x: '2024', y: 4.2 },
              { x: '2025', y: 4.0 },
            ],
          },
        ],
        overlays: [
          {
            id: 'ov-damodaran-40',
            at_s: 228,
            numeric: '4.0 pts',
            label: 'Median spread',
            citation: { publisher: 'NYU Stern', date: '2026-01-05' },
          },
        ],
      },
    ],
    disclosures: [
      { kind: 'ai_presenter', at_s: 4, duration_s: 5 },
      { kind: 'disclaimer', at_s: 9, duration_s: 6 },
    ],
    broll: [
      {
        id: 'cfc-palette-check',
        source: 'ai-generated',
        dominantColors: [
          cashflowCompassConfig.chartStyle.allowedColors[0],
          cashflowCompassConfig.chartStyle.allowedColors[1],
          cashflowCompassConfig.chartStyle.allowedColors[2],
        ],
      },
    ],
    hasMonetizationBeat: false,
    ymylPauseActive: false,
    lintAttestation: {
      status: lint.status,
      policyRevisionId: lint.policyRevisionId,
      scriptId: lint.meta.scriptId,
      generatedAt: lint.meta.generatedAt,
    },
  };
}

function buildConfig(lint: SampleLintReport): ComposerConfig {
  return {
    livePolicyRevisionId: lint.policyRevisionId,
    allowedPalette: cashflowCompassConfig.chartStyle.allowedColors,
    now: () => new Date('2026-06-21T00:00:00.000Z'),
  };
}

async function main(): Promise<void> {
  const lint = await readLintReport();
  const plan = buildPlan(lint);
  const config = buildConfig(lint);

  await mkdir(outDir, { recursive: true });

  const recharts = compose(plan, config, { engine: 'recharts' });
  const chartjs = compose(plan, config, { engine: 'chartjs' });

  await writeFile(resolve(outDir, 'render-plan.json'), JSON.stringify(plan, null, 2) + '\n', 'utf8');
  await writeFile(resolve(outDir, 'compose-result.recharts.json'), JSON.stringify(recharts, null, 2) + '\n', 'utf8');
  await writeFile(resolve(outDir, 'compose-result.chartjs.json'), JSON.stringify(chartjs, null, 2) + '\n', 'utf8');
  await writeFile(
    resolve(outDir, 'README.md'),
    [
      '# TSM-54 Layer-B sample',
      '',
      '- `render-plan.json`: three-archetype Cashflow Compass sample RenderPlan for review.',
      '- `compose-result.recharts.json`: Recharts descriptor output and gate report.',
      '- `compose-result.chartjs.json`: Chart.js descriptor output and gate report.',
      '',
      'This is a static review artifact set only. It does not satisfy the runner-side 18-capture or MP4 render acceptance path.',
    ].join('\n') + '\n',
    'utf8'
  );

  console.log(JSON.stringify({ outDir, charts: plan.charts.length, gateOk: recharts.gateReport.ok && chartjs.gateReport.ok }, null, 2));
}

await main();
