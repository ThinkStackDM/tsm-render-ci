// Public surface for @thiaaaa/chart-bakeoff (THIAAAAA-34 §2.3/§2.4).
// Harness CODE + the real headless-Chromium ChartCapturer (THIAAAAA-54
// execution surface): pass --real to the CLI or inject createBrowserChartCapturer.

export * from './types.js';
export { writeMetrics } from './metrics.js';
export {
  TARGETS,
  decideWinner,
  writeWinnerYaml,
  toYaml,
  type WinnerDecision,
  type WinnerReport,
} from './winner.js';
export {
  runBakeoff,
  runnerGatedCapturer,
  RunnerGatedError,
  FULL_MATRIX,
  type ChartCapturer,
  type CaptureArgs,
  type CaptureResult,
  type BakeoffArgs,
} from './run.js';
export {
  createBrowserChartCapturer,
  type BrowserCapturer,
  type CapturerOptions,
} from './capturer.js';
export {
  ARCHETYPE_FIXTURES,
  PALETTE,
  BACKGROUND,
  type ArchetypeSpec,
} from './fixtures.js';
