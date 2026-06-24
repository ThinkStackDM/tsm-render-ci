// Composer (THIAAAAA-34 §3). Orchestrates the render stage:
//   1. Run the six render-stage gates (defense-in-depth over the script linter).
//   2. If ANY gate fails, hard-block: return the gate report with NO charts.
//   3. Otherwise build the renderable charts via the winning engine adapter.
//
// The composer never produces partial output on a gate failure — a blocked
// render yields zero charts so a downstream renderer cannot accidentally
// proceed on a half-validated plan.

import { runAllGates } from './gates.js';
import { selectEngine } from './engines/index.js';
import {
  composeCacheKey,
  InMemoryComposeCache,
  type ComposeCache,
} from './cache.js';
import type {
  ChartEngineAdapter,
  ComposeResult,
  ComposerConfig,
  EngineName,
  GateReport,
  RenderableChart,
  RenderPlan,
} from './types.js';

export interface ComposeOptions {
  // Winning engine from the bake-off's winner.yaml. Defaults to Recharts
  // (the §2.4 primary) when not supplied.
  engine?: EngineName;
  cache?: ComposeCache;
}

const sharedCache = new InMemoryComposeCache();

export function clearSharedComposeCache(): void {
  sharedCache.clear();
}

export function compose(
  plan: RenderPlan,
  config: ComposerConfig,
  opts: ComposeOptions = {}
): ComposeResult {
  const engineName: EngineName = opts.engine ?? 'recharts';
  const cache = opts.cache ?? sharedCache;
  const now = config.now?.() ?? new Date();

  const cacheKey = `${composeCacheKey(plan, config.livePolicyRevisionId)}:${engineName}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const violations = runAllGates(plan, config);
  const gateReport: GateReport = {
    ok: violations.length === 0,
    violations,
    ranAt: now.toISOString(),
  };

  let result: ComposeResult;
  if (!gateReport.ok) {
    result = { videoId: plan.videoId, gateReport, engine: engineName };
  } else {
    const engine: ChartEngineAdapter = selectEngine(engineName);
    const charts: RenderableChart[] = plan.charts.map((spec) =>
      engine.build(spec, styleFor(spec, config))
    );
    result = { videoId: plan.videoId, charts, gateReport, engine: engineName };
  }

  cache.set(cacheKey, result);
  return result;
}

// Builds the ChartStyle for a spec from the channel §8 palette. Typography and
// pacing default here until @thiaaaa/channel-config grows its §8 styling block
// (see README "Known gaps").
function styleFor(
  _spec: RenderPlan['charts'][number],
  config: ComposerConfig
) {
  // Defaults reflect Cashflow Compass §8 (cream backdrop, Inter for charts);
  // the pipeline driver maps channel-config's chartStyle into ComposerConfig at
  // wire time, which is the single source of truth.
  return {
    palette: config.allowedPalette,
    background: '#F4EFE6',
    fontFamily: 'Inter',
    axisFontPx: 28,
    titleFontPx: 44,
  };
}
