// Cross-verb rerank orchestration. The runner arrives as an argument, so the placement rules stay pure: unscorable
// candidates pass through after the ranked ones, hits map back by caller id, and a runner rejection propagates.

/** What a rerank run hands back: scored hits naming the caller's ids. */
export interface RerankOutcome {
  readonly hits: readonly { readonly id: string }[];
}

/** The rerank call, over `{ id, text }` documents. A role client's wider query type is assignable here. */
export type RerankRun = (query: string, documents: { readonly id: string; readonly text: string }[]) => Promise<RerankOutcome>;

/**
 * Reorder `candidates` by a cross-encoder over `query`, returning at most `topN`. Scorable candidates (non-blank
 * `sourceText`) take the runner's hit order; any scorable the runner omits keep their incoming order after the
 * ranked ones; unscorable candidates are appended last so recall is preserved. A rerank rejection propagates: there
 * is no silent fallback to the incoming order.
 */
export async function applyRerank<T extends { readonly id: string; readonly sourceText: string | null }>(
  query: string,
  candidates: readonly T[],
  rerank: RerankRun,
  topN: number,
): Promise<T[]> {
  const scorable: T[] = [];
  const unscorable: T[] = [];
  for (const c of candidates) {
    if (c.sourceText !== null && c.sourceText.trim().length > 0) {
      scorable.push(c);
    } else {
      unscorable.push(c);
    }
  }

  // Nothing to cross-encode: keep the incoming order, just cap.
  if (scorable.length === 0) {
    return candidates.slice(0, topN);
  }

  const byId = new Map<string, T>(scorable.map((c) => [c.id, c]));
  const result = await rerank(
    query,
    // `sourceText` is non-null for every scorable (the partition guarantees it).
    scorable.map((c) => ({ id: c.id, text: c.sourceText ?? "" })),
  );

  const ranked: T[] = [];
  const placed = new Set<string>();
  for (const hit of result.hits) {
    const c = byId.get(hit.id);
    if (c !== undefined && !placed.has(hit.id)) {
      ranked.push(c);
      placed.add(hit.id);
    }
  }
  const leftover = scorable.filter((c) => !placed.has(c.id));

  return [...ranked, ...leftover, ...unscorable].slice(0, topN);
}
