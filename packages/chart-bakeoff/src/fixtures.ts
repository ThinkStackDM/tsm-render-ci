// Bake-off datasets for the three §2.2 archetypes (THIAAAAA-34 §11 bindings):
//   line-timeseries ← FRED DGS10 (10Y Treasury yield)
//   grouped-bar     ← IRS Pub 560 / 590-A contribution limits
//   area-band       ← NYU Stern (Damodaran) ROIC spread
// Every numeric overlay carries a `Publisher — Date` citation (YMYL §1) so the
// rasterized capture exercises the same `[data-cite]` contract the composer's
// citation-coverage gate enforces.

import type { Archetype } from './types.js';

export interface RenderSeriesPoint {
  x: number | string;
  y: number;
}
export interface RenderSeries {
  id: string;
  label: string;
  points: RenderSeriesPoint[];
}
export interface RenderOverlay {
  id: string;
  at_s: number;
  numeric: string;
  label: string;
  citation: { publisher: string; date: string };
}
export interface ArchetypeSpec {
  id: string;
  archetype: Archetype;
  title: string;
  series: RenderSeries[];
  overlays: RenderOverlay[];
}

export const PALETTE = ['#2EC4B6', '#FF9F1C', '#E71D36', '#5B8DEF'];
export const BACKGROUND = '#0E1A2B';

export const ARCHETYPE_FIXTURES: Record<Archetype, ArchetypeSpec> = {
  'line-timeseries': {
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
  'grouped-bar': {
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
  'area-band': {
    id: 'damodaran-area',
    archetype: 'area-band',
    title: 'ROIC Spread Compression',
    series: [
      {
        id: 'high-spread',
        label: 'Top quartile',
        points: [
          { x: '2022', y: 8.6 },
          { x: '2023', y: 7.9 },
          { x: '2024', y: 7.1 },
          { x: '2025', y: 6.4 },
        ],
      },
      {
        id: 'low-spread',
        label: 'Bottom quartile',
        points: [
          { x: '2022', y: 1.2 },
          { x: '2023', y: 1.4 },
          { x: '2024', y: 1.6 },
          { x: '2025', y: 1.9 },
        ],
      },
    ],
    overlays: [
      {
        id: 'ov-damo-64',
        at_s: 268,
        numeric: '6.4%',
        label: 'Top-quartile ROIC spread (2025)',
        citation: { publisher: 'NYU Stern (Damodaran)', date: '2026-01-05' },
      },
    ],
  },
};
