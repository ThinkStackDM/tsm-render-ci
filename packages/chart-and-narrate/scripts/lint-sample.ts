// Lints the jargon-dense sample script (THIAAAAA-53 items 4 + 5) against the
// LIVE YMYL policy revision (THIAAAAA-10) via PaperclipPolicyRevisionResolver,
// then persists the report next to the script artifact.
//
//   PAPERCLIP_API_URL=… PAPERCLIP_API_KEY=… \
//     node --import tsx scripts/lint-sample.ts
//
// @thiaaaa/ymyl-linter is imported by relative path — these packages are not
// wired as an npm workspace, so a path import is how the slice runs in-repo.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  lintScript,
  parseScriptDocument,
  PaperclipPolicyRevisionResolver,
} from '../../ymyl-linter/src/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const apiUrl = process.env['PAPERCLIP_API_URL'];
const apiKey = process.env['PAPERCLIP_API_KEY'];
if (!apiUrl || !apiKey) {
  console.error('Missing PAPERCLIP_API_URL or PAPERCLIP_API_KEY in env.');
  process.exit(2);
}

const samplePath = resolve(__dirname, '..', 'samples', 'cc-jargon-stress.script.md');
const reportPath = resolve(__dirname, '..', 'samples', 'cc-jargon-stress.lint-report.json');

const script = parseScriptDocument(readFileSync(samplePath, 'utf-8'));
const resolver = new PaperclipPolicyRevisionResolver({ apiUrl, apiKey });

const report = await lintScript(script, { policyRevisionResolver: resolver });

writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

console.log(
  JSON.stringify(
    {
      status: report.status,
      policyVersion: report.policyVersion,
      policyRevisionId: report.policyRevisionId,
      violationCount: report.violations.length,
      violations: report.violations.map((v) => ({ rule: v.rule, severity: v.severity, message: v.message })),
      reportPath,
    },
    null,
    2
  )
);

if (report.status !== 'passed') {
  console.error(`LINT NOT GREEN: status=${report.status}`);
  process.exit(1);
}
console.error('LINT GREEN');
