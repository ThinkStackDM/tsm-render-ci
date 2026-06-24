// YMYL linter integration point (THIAAAAA-34 §3.5). chart-and-narrate owns the
// `YmylLinterAdapter` port; @thiaaaa/ymyl-linter's `lintScript` satisfies it
// structurally (see its README "Integration with chart-and-narrate"). This
// module turns a lint report into the LintAttestation that the composer's
// gate 6 (linter-attestation pull-forward) consumes.

import type {
  LintAttestation,
  YmylLinterAdapter,
  YmylLintReportPort,
} from './types.js';

export function attestationFromReport(
  report: YmylLintReportPort
): LintAttestation {
  return {
    status: report.status,
    policyRevisionId: report.policyRevisionId,
    scriptId: report.meta.scriptId,
    generatedAt: report.meta.generatedAt,
  };
}

// Runs the script-stage lint through the injected adapter and returns the
// attestation to carry forward into the render plan. The script type is the
// adapter's own — chart-and-narrate stays decoupled from the linter's
// ScriptDocument shape.
export async function runScriptLint<Script>(
  adapter: YmylLinterAdapter<Script>,
  script: Script
): Promise<LintAttestation> {
  const report = await adapter.lintScript(script);
  return attestationFromReport(report);
}
