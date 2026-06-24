import type { ChartEngineAdapter, EngineName } from '../types.js';
import { RechartsEngineAdapter } from './recharts.js';
import { ChartJsEngineAdapter } from './chartjs.js';

export { RechartsEngineAdapter } from './recharts.js';
export { ChartJsEngineAdapter } from './chartjs.js';
export { buildDataCite } from './data-cite.js';

// Recharts is primary; Chart.js is the §2.4 fallback. The bake-off's
// winner.yaml selects a single engine across all three archetypes (no
// per-archetype split), and that selection is passed here.
export function selectEngine(winner: EngineName): ChartEngineAdapter {
  return winner === 'chartjs'
    ? new ChartJsEngineAdapter()
    : new RechartsEngineAdapter();
}
