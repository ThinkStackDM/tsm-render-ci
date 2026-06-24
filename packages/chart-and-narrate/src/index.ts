// Public surface for @thiaaaa/chart-and-narrate.
//
// Design: THIAAAAA-34 §3 (compound primitive). Render-stage gates: THIAAAAA-34
// comment 815d80cc §(c). YMYL integration point: THIAAAAA-34 §3.5, satisfied by
// @thiaaaa/ymyl-linter.
//
// Scope note (THIAAAAA-43): this package is the implementable half of the
// operational-verification ticket — the typed module, engine adapters, YMYL
// port, idempotency cache, and the six composer gates, all unit-tested. The
// render/TTS/WhisperX half of -43 (18-capture bake-off, OpenVoice v2 narration,
// WhisperX forced-alignment + confidence floor, 1080p/30fps render) requires
// the GHA self-hosted runner + GPU + ML model infra and is tracked separately.

export * from './types.js';
export {
  RechartsEngineAdapter,
  ChartJsEngineAdapter,
  selectEngine,
  buildDataCite,
} from './engines/index.js';
export {
  citationCoverageGate,
  disclosurePresenceGate,
  bannedTopicExtendedDisclaimerGate,
  ymylPauseKillSwitchGate,
  paletteConformanceGate,
  linterAttestationPullForwardGate,
  runAllGates,
} from './gates.js';
export {
  compose,
  clearSharedComposeCache,
  type ComposeOptions,
} from './composer.js';
export {
  InMemoryComposeCache,
  composeCacheKey,
  type ComposeCache,
} from './cache.js';
export { attestationFromReport, runScriptLint } from './ymyl.js';
