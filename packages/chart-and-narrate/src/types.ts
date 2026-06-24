// Public contract for @thiaaaa/chart-and-narrate.
//
// Design source of truth: THIAAAAA-34 §3 (compound-primitive public interface).
// Render-stage gates: THIAAAAA-34 comment 815d80cc §(c) — six defense-in-depth
// gates that re-verify, at composer time, properties the script-stage YMYL
// linter already checked. The duplication is intentional and load-bearing on a
// tier-1 YMYL channel (a render must never escape a green script-stage lint
// that has since gone stale, nor a banned-topic beat missing its extended
// disclaimer, nor an active channel pause).
//
// Ports vs adapters: this module owns the *ports* (ChartEngineAdapter,
// YmylLinterAdapter). The Recharts / Chart.js engines and @thiaaaa/ymyl-linter
// are adapters that satisfy them structurally. That keeps this package
// standalone-typecheckable without a workspace install.

export type EngineName = 'recharts' | 'chartjs';

// The three §2.2 bake-off archetypes for Cashflow Compass. Concrete dataset
// bindings (§11): line-timeseries ← FRED DGS10; grouped-bar ← IRS Pub 560 /
// 590-A contribution limits; area-band ← NYU Stern (Damodaran) sector series.
export type ChartArchetype = 'line-timeseries' | 'grouped-bar' | 'area-band';

export interface DataPoint {
  x: number | string;
  y: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  points: ReadonlyArray<DataPoint>;
}

// A numeric callout overlaid on the chart. Per YMYL policy §1 every numeric
// overlay MUST carry a `Publisher — Date` citation; the citation-coverage gate
// hard-fails the render if any overlay is missing one.
export interface Citation {
  publisher: string;
  date: string; // display date; the rendered `data-cite` is "publisher — date"
  url?: string;
}

export interface NumericOverlay {
  id: string;
  at_s: number; // narration-timeline position of the callout
  numeric: string; // the on-screen numeric token, e.g. "4.31%"
  label: string;
  citation: Citation;
}

export type DisclosureKind =
  | 'ai_presenter'
  | 'disclaimer'
  | 'affiliate'
  | 'extended_disclaimer';

export interface DisclosureCard {
  kind: DisclosureKind;
  at_s: number;
  duration_s: number;
}

export interface BrollAsset {
  id: string;
  // Only `ai-generated` assets are subject to the palette-conformance gate;
  // `chart-frame` assets use the chart engine palette and `stock` is exempt.
  source: 'ai-generated' | 'stock' | 'chart-frame';
  dominantColors: ReadonlyArray<string>; // hex, e.g. "#0E1A2B"
}

export interface ChartSpec {
  id: string;
  archetype: ChartArchetype;
  title: string;
  series: ReadonlyArray<ChartSeries>;
  overlays: ReadonlyArray<NumericOverlay>;
  // Set when this chart's narration beat covers a YMYL banned topic as an
  // explainer (not a recommendation). Triggers the extended-disclaimer gate.
  bannedTopicEducation?: boolean;
}

// Channel §8 styling surface (palette + typography + pacing). Canonically this
// should be sourced from @thiaaaa/channel-config's per-channel §8 block; see
// README "Known gaps" — that styling block is not yet present on
// cashflow-compass.ts, so the composer accepts it as explicit input for now.
export interface ChartStyle {
  palette: ReadonlyArray<string>; // ordered series colors (hex)
  background: string;
  fontFamily: string;
  axisFontPx: number;
  titleFontPx: number;
}

// Serializable chart descriptor the renderer (Remotion) mounts. We do not
// rasterize here — that happens in the GPU render stage — but the descriptor
// and the data-cite map are produced deterministically so the gates can run.
export interface ChartDescriptor {
  engine: EngineName;
  archetype: ChartArchetype;
  componentKind: string; // engine-specific component identifier
  series: ReadonlyArray<ChartSeries>;
  style: ChartStyle;
}

export interface RenderableChart {
  engine: EngineName;
  archetype: ChartArchetype;
  descriptor: ChartDescriptor;
  // overlay id -> rendered `data-cite` attribute value ("Publisher — Date").
  // The citation-coverage gate queries this map (the mechanical DOM check in
  // the real renderer is `[data-cite]` attribute presence on every overlay).
  dataCite: Readonly<Record<string, string>>;
}

// Port: a chart rendering engine. Recharts is primary, Chart.js is fallback.
export interface ChartEngineAdapter {
  readonly engine: EngineName;
  build(spec: ChartSpec, style: ChartStyle): RenderableChart;
}

// Port: the YMYL linter integration point (THIAAAAA-34 §3.5). Structurally
// satisfied by @thiaaaa/ymyl-linter's `lintScript`. The composer only reads
// the fields below, so we type the report as a structural subset.
export interface YmylLintReportPort {
  status: 'passed' | 'failed' | 'not-run';
  policyRevisionId: string;
  violations: ReadonlyArray<{ rule: string; severity: string; message: string }>;
  meta: { scriptId: string; generatedAt: string };
}

export interface YmylLinterAdapter<Script = unknown> {
  lintScript(script: Script): Promise<YmylLintReportPort>;
}

// The lint result pulled forward from the script stage into the render stage.
// Gate 6 (linter-attestation pull-forward) refuses to render unless this is
// `passed` AND its policyRevisionId matches the live head at render time.
export interface LintAttestation {
  status: 'passed' | 'failed' | 'not-run';
  policyRevisionId: string;
  scriptId: string;
  generatedAt: string;
}

export interface RenderPlan {
  videoId: string;
  channel: string;
  charts: ReadonlyArray<ChartSpec>;
  disclosures: ReadonlyArray<DisclosureCard>;
  broll: ReadonlyArray<BrollAsset>;
  // Whether any monetization beat (affiliate/sponsor) is present — drives the
  // affiliate-disclosure requirement in the disclosure-presence gate.
  hasMonetizationBeat: boolean;
  // Channel-level YMYL pause flag. When true, gate 4 hard-blocks all output.
  ymylPauseActive: boolean;
  lintAttestation: LintAttestation;
}

export type GateName =
  | 'citation-coverage'
  | 'disclosure-presence'
  | 'banned-topic-extended-disclaimer'
  | 'ymyl-pause-kill-switch'
  | 'palette-conformance'
  | 'linter-attestation-pull-forward';

export interface GateViolation {
  gate: GateName;
  message: string;
}

export interface GateReport {
  ok: boolean;
  violations: ReadonlyArray<GateViolation>;
  ranAt: string;
}

export interface ComposerConfig {
  // Head revision of the YMYL policy doc at render time (THIAAAAA-10). Gate 6
  // compares the pulled-forward attestation against this; a mismatch means the
  // policy moved since the script lint and the render must halt + re-lint.
  livePolicyRevisionId: string;
  // Channel §8 palette (hex) AI b-roll must conform to. Gate 5 only.
  allowedPalette: ReadonlyArray<string>;
  // First N seconds within which the AI-presenter + disclaimer cards must
  // appear (disclosure-presence gate). Defaults to 30 per YMYL §2/§8a.
  disclosureWindowSeconds?: number;
  now?: () => Date;
}

export interface ComposeResult {
  videoId: string;
  // Present only when every gate passed. A blocked render returns no charts.
  charts?: ReadonlyArray<RenderableChart>;
  gateReport: GateReport;
  engine: EngineName;
}
