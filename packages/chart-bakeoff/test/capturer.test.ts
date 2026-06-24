import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARCHETYPE_FIXTURES } from '../src/fixtures.js';
import { ARCHETYPES } from '../src/types.js';
import { createBrowserChartCapturer } from '../src/capturer.js';

const here = dirname(fileURLToPath(import.meta.url));

// These guard the contract the real headless-Chromium capturer relies on:
// the capture page must render a known archetype, and every numeric overlay
// must carry a Publisher — Date citation (YMYL §1 / citation-coverage gate).

test('fixtures cover all three §2.2 archetypes', () => {
  for (const a of ARCHETYPES) {
    const spec = ARCHETYPE_FIXTURES[a];
    assert.equal(spec.archetype, a, `fixture for ${a} has matching archetype`);
    assert.ok(spec.series.length >= 1, `${a} has at least one series`);
    assert.ok(spec.title.length > 0, `${a} has a title`);
  }
});

test('every fixture overlay carries a Publisher — Date citation', () => {
  for (const a of ARCHETYPES) {
    for (const ov of ARCHETYPE_FIXTURES[a].overlays) {
      assert.ok(ov.citation.publisher.length > 0, `${ov.id} has a publisher`);
      assert.match(ov.citation.date, /^\d{4}-\d{2}-\d{2}$/, `${ov.id} has an ISO date`);
      assert.ok(ov.numeric.length > 0, `${ov.id} has a numeric token`);
    }
  }
});

test('bundled browser runtime is present (built artifact)', () => {
  assert.ok(
    existsSync(join(here, '..', 'src', 'browser', 'chart-runtime.js')),
    'chart-runtime.js must be built (npm run build:runtime) for the capture path'
  );
});

test('createBrowserChartCapturer exposes capture + close without launching', () => {
  const bc = createBrowserChartCapturer({ durationMs: 1000 });
  assert.equal(typeof bc.capture, 'function');
  assert.equal(typeof bc.close, 'function');
  // close() before any capture must be a no-op (no browser launched yet).
  return bc.close();
});
