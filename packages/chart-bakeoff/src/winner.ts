import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ARCHETYPES,
  ENGINES,
  RUNS_PER_CELL,
  type Archetype,
  type ChartQualityMetrics,
  type ChartRunMetrics,
  type Engine,
  type Target,
  type TargetKey,
} from './types.js';

// §2.2 targets. Latency-class metrics (fps + dropped frames) weigh 2× over the
// cost/frame-time fidelity metrics; narration-sync drift is informational at
// bake-off time (it's a render-child acceptance check against OpenVoice v2).
export const TARGETS: Record<TargetKey, Target> = {
  renderFps: { bound: 30, dir: 'min', weight: 2 },
  droppedFrames: { bound: 0, dir: 'max', weight: 2 },
  p99FrameTimeMs: { bound: 33, dir: 'max', weight: 1 },
  renderCostRatio: { bound: 2, dir: 'max', weight: 1 },
  narrationSyncDriftMs: { bound: 100, dir: 'max', weight: 0 },
};

const TARGET_KEYS = Object.keys(TARGETS) as TargetKey[];
const GATING_KEYS = TARGET_KEYS.filter((k) => TARGETS[k].weight > 0);

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

interface CellSummary {
  engine: Engine;
  archetype: Archetype;
  runsFound: number;
  okRuns: number;
  medianQuality: Record<TargetKey, number | null>;
  clearsTargets: boolean | null;
}

function meetsTarget(value: number, t: Target): boolean {
  return t.dir === 'min' ? value >= t.bound : value <= t.bound;
}

function summarizeCell(engine: Engine, archetype: Archetype, runs: ChartRunMetrics[]): CellSummary {
  const ok = runs.filter((r) => r.ok);
  const medianQuality = {} as Record<TargetKey, number | null>;
  for (const key of TARGET_KEYS) {
    const vals = ok
      .map((r) => r.quality?.[key])
      .filter((v): v is number => typeof v === 'number');
    medianQuality[key] = median(vals);
  }
  let clears: boolean | null = true;
  if (ok.length === 0) {
    clears = null;
  } else {
    for (const key of GATING_KEYS) {
      const v = medianQuality[key];
      if (v === null) {
        clears = null;
        break;
      }
      if (!meetsTarget(v, TARGETS[key])) {
        clears = false;
      }
    }
  }
  return { engine, archetype, runsFound: runs.length, okRuns: ok.length, medianQuality, clearsTargets: clears };
}

export type WinnerDecision = 'recharts' | 'chartjs' | 'escalate-ceo' | 'undecided';

export interface WinnerReport {
  rule: string;
  weighting: string;
  generatedAt: string;
  decision: WinnerDecision;
  decisionReason: string;
  capturesFound: number;
  capturesExpected: number;
  rechartsMissArchetypes: Archetype[];
  chartjsMissArchetypes: Archetype[];
  cells: Array<{
    engine: Engine;
    archetype: Archetype;
    runsFound: number;
    okRuns: number;
    clearsTargets: boolean | null;
    medianQuality: Record<string, number | null>;
  }>;
}

export function decideWinner(all: ChartRunMetrics[]): WinnerReport {
  const cells: CellSummary[] = [];
  for (const engine of ENGINES) {
    for (const archetype of ARCHETYPES) {
      cells.push(
        summarizeCell(engine, archetype, all.filter((r) => r.engine === engine && r.archetype === archetype))
      );
    }
  }
  const clears = (engine: Engine, a: Archetype): boolean | null =>
    cells.find((c) => c.engine === engine && c.archetype === a)!.clearsTargets;

  const anyIndeterminate = ENGINES.some((e) => ARCHETYPES.some((a) => clears(e, a) === null));
  const rechartsMiss = ARCHETYPES.filter((a) => clears('recharts', a) === false);
  const chartjsMiss = ARCHETYPES.filter((a) => clears('chartjs', a) === false);

  let decision: WinnerDecision;
  let decisionReason: string;

  if (anyIndeterminate) {
    decision = 'undecided';
    decisionReason =
      '§2.2 quality metrics (renderFps, droppedFrames, p99FrameTimeMs, renderCostRatio) are not yet populated for every engine×archetype cell. ' +
      'The 18 captures are runner-gated (THIAAAAA-54); winner cannot be declared here. The §2.4 logic below is plumbed and resolves automatically once the render child fills the quality block.';
  } else if (rechartsMiss.length <= 1) {
    // Recharts is the primary; a single-archetype miss is treated as a
    // flake/config gap to investigate, NOT grounds to switch engines (no
    // engine-per-archetype split).
    decision = 'recharts';
    decisionReason =
      rechartsMiss.length === 0
        ? 'Recharts clears the §2.2 targets on all three archetypes → Recharts is the single winner (§2.4 default).'
        : `Recharts clears 2/3 archetypes; misses [${rechartsMiss.join(', ')}]. A single-archetype miss stays with Recharts (investigate as flake/config) — no engine-per-archetype split (§2.4).`;
  } else if (chartjsMiss.length === 0) {
    // Recharts missed 2+; the fallback (Chart.js) clears all three.
    decision = 'chartjs';
    decisionReason =
      `Recharts misses the §2.2 targets on ${rechartsMiss.length} archetypes [${rechartsMiss.join(', ')}]; Chart.js clears all three → promote Chart.js as the single winner (§2.4 fallback).`;
  } else {
    decision = 'escalate-ceo';
    decisionReason =
      `Recharts misses [${rechartsMiss.join(', ')}] and Chart.js misses [${chartjsMiss.join(', ')}] — neither engine clears all three §2.2 archetypes on OSS/free-tier compute. Escalate to CEO before any paid alternative (§7 escalation gate + budget guardrail).`;
  }

  return {
    rule: 'THIAAAAA-34 §2.4 winner-decision rule (Recharts-default, single winner across all three archetypes)',
    weighting: 'renderFps + droppedFrames weighted 2× over p99FrameTime + renderCostRatio (§2.3); narrationSyncDrift informational',
    generatedAt: new Date().toISOString(),
    decision,
    decisionReason,
    capturesFound: all.length,
    capturesExpected: ENGINES.length * ARCHETYPES.length * RUNS_PER_CELL,
    rechartsMissArchetypes: rechartsMiss,
    chartjsMissArchetypes: chartjsMiss,
    cells: cells.map((c) => ({
      engine: c.engine,
      archetype: c.archetype,
      runsFound: c.runsFound,
      okRuns: c.okRuns,
      clearsTargets: c.clearsTargets,
      medianQuality: c.medianQuality,
    })),
  };
}

async function loadAllMetrics(outRoot: string): Promise<ChartRunMetrics[]> {
  const out: ChartRunMetrics[] = [];
  for (const engine of ENGINES) {
    for (const archetype of ARCHETYPES) {
      const dir = join(outRoot, engine, archetype);
      let runDirs: string[];
      try {
        runDirs = await readdir(dir);
      } catch {
        continue;
      }
      for (const rd of runDirs) {
        try {
          out.push(JSON.parse(await readFile(join(dir, rd, 'metrics.json'), 'utf8')) as ChartRunMetrics);
        } catch {
          /* not a metrics dir */
        }
      }
    }
  }
  return out;
}

export async function writeWinnerYaml(outRoot: string): Promise<WinnerReport> {
  const report = decideWinner(await loadAllMetrics(outRoot));
  await mkdir(outRoot, { recursive: true });
  const header =
    '# winner.yaml — auto-generated by @thiaaaa/chart-bakeoff.\n' +
    '# Picks the chart engine per THIAAAAA-34 §2.4. Regenerated after each run.\n';
  await writeFile(join(outRoot, 'winner.yaml'), header + toYaml(report) + '\n', 'utf8');
  return report;
}

// Minimal YAML serializer scoped to the WinnerReport shape (scalars, arrays,
// nested records). Kept dependency-free so the harness typechecks and tests
// without a workspace install. All string scalars are double-quoted to dodge
// YAML special-character pitfalls.
export function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        if (isScalar(item)) return `${pad}- ${scalar(item)}`;
        return `${pad}-\n${toYaml(item, indent + 1)}`;
      })
      .join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        if (isScalar(v)) return `${pad}${k}: ${scalar(v)}`;
        if (Array.isArray(v) && v.length === 0) return `${pad}${k}: []`;
        return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
      })
      .join('\n');
  }
  return `${pad}${scalar(value)}`;
}

function isScalar(v: unknown): boolean {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function scalar(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v)); // double-quoted, escapes embedded quotes
}
