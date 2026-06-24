// Bundles the browser-side chart runtime (real Recharts + Chart.js) into a
// single IIFE that ../capturer.ts injects into the headless-Chromium page.
// Run via `npm run build:runtime`. The output is committed so the capture path
// works without a build step on the runner.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');

await build({
  entryPoints: [resolve(pkg, 'src/browser/entry.tsx')],
  bundle: true,
  format: 'iife',
  minify: true,
  jsx: 'automatic',
  target: ['chrome120'],
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: resolve(pkg, 'src/browser/chart-runtime.js'),
  logLevel: 'info',
});
console.log('chart-runtime.js bundled');
