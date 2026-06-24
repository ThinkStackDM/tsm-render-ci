// Recharts engine adapter (PRIMARY per THIAAAAA-34 §3 / §2.4 winner-decision).
//
// We do not rasterize here — the GPU render stage (Remotion) mounts the
// descriptor. The adapter's job is to produce a deterministic, serializable
// descriptor plus the overlay `data-cite` map the citation-coverage gate and
// the real renderer's `[data-cite]` DOM query both rely on.

import type {
  ChartArchetype,
  ChartEngineAdapter,
  ChartSpec,
  ChartStyle,
  RenderableChart,
} from '../types.js';
import { buildDataCite } from './data-cite.js';

const COMPONENT_KIND: Record<ChartArchetype, string> = {
  'line-timeseries': 'LineChart',
  'grouped-bar': 'BarChart',
  'area-band': 'AreaChart',
};

export class RechartsEngineAdapter implements ChartEngineAdapter {
  readonly engine = 'recharts' as const;

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
