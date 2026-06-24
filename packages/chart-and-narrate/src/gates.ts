// Six composer-side render-stage gates (THIAAAAA-34 comment 815d80cc §(c)).
//
// Each gate is a pure function over the RenderPlan + ComposerConfig returning
// zero or more GateViolation. They are intentionally a defense-in-depth
// duplicate of script-stage YMYL rules: the render must never proceed on a
// stale-green lint, a paused channel, an uncited numeric, a missing disclosure,
// a banned-topic beat without its extended disclaimer, or off-palette AI
// b-roll. Per CEO ratification this duplication is load-bearing, not redundant.

import type {
  ComposerConfig,
  GateViolation,
  RenderPlan,
} from './types.js';

const DEFAULT_DISCLOSURE_WINDOW_S = 30;
// Max RGB euclidean distance (0–441.67) an AI-broll dominant color may sit from
// the nearest channel-palette color and still count as conformant. ~36 ≈ a
// perceptually "same swatch, minor compression drift" tolerance.
const DEFAULT_PALETTE_DISTANCE = 36;

// Gate 1 — citation-coverage. Every numeric overlay must carry a non-empty
// `Publisher — Date` citation (YMYL §1). Mechanical render check is the
// `[data-cite]` DOM attribute; here we verify the source of that attribute.
export function citationCoverageGate(plan: RenderPlan): GateViolation[] {
  const out: GateViolation[] = [];
  for (const chart of plan.charts) {
    for (const overlay of chart.overlays) {
      const pub = overlay.citation?.publisher?.trim() ?? '';
      const date = overlay.citation?.date?.trim() ?? '';
      if (!pub || !date) {
        out.push({
          gate: 'citation-coverage',
          message: `Numeric overlay "${overlay.id}" (chart "${chart.id}", "${overlay.numeric}") is missing a Publisher — Date citation.`,
        });
      }
    }
  }
  return out;
}

// Gate 2 — disclosure-presence. AI-presenter + disclaimer cards must appear in
// the first N seconds (default 30, YMYL §2/§8a). If the video carries any
// monetization beat, an affiliate disclosure is also required in-window.
export function disclosurePresenceGate(
  plan: RenderPlan,
  config: ComposerConfig
): GateViolation[] {
  const windowS = config.disclosureWindowSeconds ?? DEFAULT_DISCLOSURE_WINDOW_S;
  const out: GateViolation[] = [];
  const inWindow = (kind: string): boolean =>
    plan.disclosures.some((d) => d.kind === kind && d.at_s < windowS);

  if (!inWindow('ai_presenter')) {
    out.push({
      gate: 'disclosure-presence',
      message: `No ai_presenter disclosure card in the first ${windowS}s.`,
    });
  }
  if (!inWindow('disclaimer')) {
    out.push({
      gate: 'disclosure-presence',
      message: `No disclaimer card in the first ${windowS}s.`,
    });
  }
  if (plan.hasMonetizationBeat && !inWindow('affiliate')) {
    out.push({
      gate: 'disclosure-presence',
      message: `Monetization beat present but no affiliate disclosure in the first ${windowS}s.`,
    });
  }
  return out;
}

// Gate 3 — banned-topic extended-disclaimer. If any chart's beat is a YMYL
// banned-topic explainer, an extended_disclaimer card must be present.
export function bannedTopicExtendedDisclaimerGate(
  plan: RenderPlan
): GateViolation[] {
  const hasBannedTopic = plan.charts.some((c) => c.bannedTopicEducation === true);
  if (!hasBannedTopic) return [];
  const hasExtended = plan.disclosures.some((d) => d.kind === 'extended_disclaimer');
  if (hasExtended) return [];
  return [
    {
      gate: 'banned-topic-extended-disclaimer',
      message:
        'A banned-topic-education chart is present but no extended_disclaimer card was found.',
    },
  ];
}

// Gate 4 — YMYL-pause kill-switch. An active channel pause blocks every render.
export function ymylPauseKillSwitchGate(plan: RenderPlan): GateViolation[] {
  if (!plan.ymylPauseActive) return [];
  return [
    {
      gate: 'ymyl-pause-kill-switch',
      message:
        'YMYL pause is active for this channel. Render hard-blocked until the pause is lifted.',
    },
  ];
}

// Gate 5 — palette-conformance (AI-broll only). Every dominant color of an
// AI-generated b-roll asset must sit within tolerance of a channel-palette
// color. chart-frame and stock assets are exempt.
export function paletteConformanceGate(
  plan: RenderPlan,
  config: ComposerConfig
): GateViolation[] {
  const out: GateViolation[] = [];
  const palette = config.allowedPalette
    .map(parseHex)
    .filter((c): c is Rgb => c !== null);

  for (const asset of plan.broll) {
    if (asset.source !== 'ai-generated') continue;
    if (palette.length === 0) {
      out.push({
        gate: 'palette-conformance',
        message: `AI b-roll asset "${asset.id}" present but the channel palette is empty — cannot verify conformance.`,
      });
      continue;
    }
    for (const hex of asset.dominantColors) {
      const rgb = parseHex(hex);
      if (rgb === null) {
        out.push({
          gate: 'palette-conformance',
          message: `AI b-roll asset "${asset.id}" has an unparseable color "${hex}".`,
        });
        continue;
      }
      const nearest = Math.min(...palette.map((p) => rgbDistance(rgb, p)));
      if (nearest > DEFAULT_PALETTE_DISTANCE) {
        out.push({
          gate: 'palette-conformance',
          message: `AI b-roll asset "${asset.id}" color "${hex}" is off-palette (nearest distance ${nearest.toFixed(1)} > ${DEFAULT_PALETTE_DISTANCE}).`,
        });
      }
    }
  }
  return out;
}

// Gate 6 — linter-attestation pull-forward. The render refuses unless the
// script-stage lint is `passed` AND its captured policyRevisionId matches the
// live policy head at render time (a mismatch means the policy moved → halt +
// re-lint per the §3.5b liveness rule).
export function linterAttestationPullForwardGate(
  plan: RenderPlan,
  config: ComposerConfig
): GateViolation[] {
  const att = plan.lintAttestation;
  const out: GateViolation[] = [];
  if (att.status !== 'passed') {
    out.push({
      gate: 'linter-attestation-pull-forward',
      message: `Pulled-forward lint attestation is "${att.status}", not "passed". Render blocked.`,
    });
    return out;
  }
  if (!att.policyRevisionId) {
    out.push({
      gate: 'linter-attestation-pull-forward',
      message: 'Lint attestation has no captured policyRevisionId.',
    });
    return out;
  }
  if (att.policyRevisionId !== config.livePolicyRevisionId) {
    out.push({
      gate: 'linter-attestation-pull-forward',
      message: `Lint attestation policyRevisionId "${att.policyRevisionId}" != live head "${config.livePolicyRevisionId}". Policy moved since script lint — halt and re-lint.`,
    });
  }
  return out;
}

// Runs all six gates and concatenates violations in stable gate order.
export function runAllGates(
  plan: RenderPlan,
  config: ComposerConfig
): GateViolation[] {
  return [
    ...citationCoverageGate(plan),
    ...disclosurePresenceGate(plan, config),
    ...bannedTopicExtendedDisclaimerGate(plan),
    ...ymylPauseKillSwitchGate(plan),
    ...paletteConformanceGate(plan, config),
    ...linterAttestationPullForwardGate(plan, config),
  ];
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const v = m[1];
  if (v === undefined) return null;
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function rgbDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
