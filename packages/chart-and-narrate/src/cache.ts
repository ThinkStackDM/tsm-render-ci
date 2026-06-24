// Idempotency cache (THIAAAAA-34 §3 — "idempotency cache"). A repeat compose
// of the same RenderPlan under the same live policy revision returns the cached
// ComposeResult. Mirrors @thiaaaa/ymyl-linter's InMemoryReportCache contract.

import { createHash } from 'node:crypto';

import type { ComposeResult, RenderPlan } from './types.js';

export interface ComposeCache {
  get(key: string): ComposeResult | undefined;
  set(key: string, value: ComposeResult): void;
}

export class InMemoryComposeCache implements ComposeCache {
  private readonly store = new Map<string, ComposeResult>();
  get(key: string): ComposeResult | undefined {
    return this.store.get(key);
  }
  set(key: string, value: ComposeResult): void {
    this.store.set(key, value);
  }
  clear(): void {
    this.store.clear();
  }
}

// Deterministic key: the render plan content + the live policy revision. The
// policy revision is part of the key so a policy bump invalidates prior
// compositions (the same reason the linter folds policyRevisionId into its key).
export function composeCacheKey(
  plan: RenderPlan,
  livePolicyRevisionId: string
): string {
  const planHash = createHash('sha256')
    .update(stableStringify(plan))
    .digest('hex');
  return `${planHash}:${livePolicyRevisionId}`;
}

// Order-independent JSON: object keys are sorted recursively so a byte-different
// but semantically-identical plan hashes the same.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(',')}}`;
}
