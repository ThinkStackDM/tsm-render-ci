import type { NumericOverlay } from '../types.js';

// Renders the `data-cite` attribute value for each numeric overlay as
// "Publisher — Date" (YMYL policy §1). Shared by both engine adapters so the
// citation string is identical regardless of which engine wins the bake-off.
export function buildDataCite(
  overlays: ReadonlyArray<NumericOverlay>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of overlays) {
    const pub = o.citation?.publisher?.trim() ?? '';
    const date = o.citation?.date?.trim() ?? '';
    // Emit only when both halves are present; the citation-coverage gate is
    // what fails the render on a missing half — the renderer never invents one.
    if (pub && date) out[o.id] = `${pub} — ${date}`;
  }
  return out;
}
