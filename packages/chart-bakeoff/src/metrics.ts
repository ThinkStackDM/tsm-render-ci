import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ChartRunMetrics } from './types.js';

export async function writeMetrics(path: string, metrics: ChartRunMetrics): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
}
