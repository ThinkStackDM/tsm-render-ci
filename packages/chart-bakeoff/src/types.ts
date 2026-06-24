// Chart bake-off contract (THIAAAAA-34 §2.2/§2.3/§2.4).
//
// The matrix is 3 archetypes × 2 engines × 3 runs = 18 captures. This package
// owns the *schema* + the §2.4 decision rule; the captures themselves are
// runner-gated (GPU + headless Chromium + Remotion) and run in the render child
// THIAAAAA-54, never here.

export const ENGINES = ['recharts', 'chartjs'] as const;
export type Engine = (typeof ENGINES)[number];

// The three §2.2 archetypes (datasets per §11): line-timeseries ← FRED DGS10,
// grouped-bar ← IRS Pub 560/590-A, area-band ← NYU Stern (Damodaran).
export const ARCHETYPES = ['line-timeseries', 'grouped-bar', 'area-band'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const RUNS_PER_CELL = 3;

// §2.2 quality metrics per capture. null = not yet instrumented — the render
// child fills these. The §2.4 winner chooser treats any null as "undecided".
export interface ChartQualityMetrics {
  renderFps: number | null; // target ≥ 30 (1080p/30fps)
  droppedFrames: number | null; // target 0 over the sequence
  p99FrameTimeMs: number | null; // target ≤ 33 (30fps frame budget)
  renderCostRatio: number | null; // target ≤ 2 (runner-CPU-sec per video-sec)
  narrationSyncDriftMs: number | null; // ≤ 100 per callout — informational here
}

export const EMPTY_QUALITY: ChartQualityMetrics = {
  renderFps: null,
  droppedFrames: null,
  p99FrameTimeMs: null,
  renderCostRatio: null,
  narrationSyncDriftMs: null,
};

export interface ChartRunMetrics {
  engine: Engine;
  archetype: Archetype;
  run: number;
  startedAt: string;
  finishedAt: string;
  wallMs: number;
  resolution: { width: number; height: number }; // 1920×1080
  captureBytes: number;
  captureFormat: 'mp4' | 'webm';
  engineVersion: string;
  quality: ChartQualityMetrics;
  ok: boolean;
  errors: string[];
}

// A single §2.2 target. `dir` says whether the metric must stay at-or-below
// (`max`) or at-or-above (`min`) the bound. `weight: 0` = informational (not a
// pass/fail gate).
export interface Target {
  bound: number;
  dir: 'max' | 'min';
  weight: number;
}

export type TargetKey = keyof ChartQualityMetrics;
