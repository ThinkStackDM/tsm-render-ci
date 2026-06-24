// Chart.js engine adapter (FALLBACK per THIAAAAA-34 §3 / §2.4). Promoted only
// when Recharts misses the §2.2 targets on 2+ archetypes; the winner is single
// across all three archetypes (no engine-per-archetype split).

import type {
  ChartArchetype,
  ChartEngineAdapter,
  ChartSpec,
  ChartStyle,
  RenderableChart,
} from '../types.js';
import { buildDataCite } from './data-cite.js';

// Chart.js has no dedicated area type — an area band is a line dataset with
// fill enabled, hence the shared 'line' component kind.
const COMPONENT_KIND: Record<ChartArchetype, string> = {
  'line-timeseries': 'line',
  'grouped-bar': 'bar',
  'area-band': 'line',
};

export class ChartJsEngineAdapter implements ChartEngineAdapter {
  readonly engine = 'chartjs' as const;

  build(spec: ChartSpec, style: ChartStyle): RenderableChart {
    return {
      engine: this.engine,
      archetype: spec.archetype,
      descriptor: {
        engine: this.engine,
        archetype: spec.archetype,
        componentKind: COMPONENT_KIND[spec.archetype],
        series: spec.series,
        style,
      },
      dataCite: buildDataCite(spec.overlays),
    };
  }
}
