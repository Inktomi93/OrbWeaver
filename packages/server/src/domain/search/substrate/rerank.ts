// Cross-verb rerank orchestration (pure — the runner arrives as an ARG). Pinned: unscorable
// candidates pass through AFTER ranked ones (never dropped); reorder maps by caller id, not index;
// rerank rejections PROPAGATE — no silent CSLS fallback.

import type { RoleClients } from "@orb/contracts/role-clients";

type RerankRunner = RoleClients["rerank"];

/**
 * Reorder `candidates` by a cross-encoder over `query`, returning at most `topN`. Scorable candidates
 * (non-blank `sourceText`) are reranked by the runner's descending scores; any scorable the runner omits
 * (it returned a capped subset) keep their incoming order AFTER the ranked ones; unscorable candidates are
 * appended last (recall-preserving). The result is capped to `topN`. Rerank rejections propagate.
 */
export async function applyRerank<
  T extends { readonly id: string; readonly sourceText: string | null },
>(query: string, candidates: readonly T[], rerank: RerankRunner, topN: number): Promise<T[]> {
  const scorable: T[] = [];
  const unscorable: T[] = [];
  for (const c of candidates) {
    if (c.sourceText !== null && c.sourceText.trim().length > 0) {
      scorable.push(c);
    } else {
      unscorable.push(c);
    }
  }

  // Nothing to cross-encode — keep CSLS order, just cap.
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
  // Scorable the runner didn't return (budget cap) keep their incoming CSLS order, after the ranked ones.
  const leftover = scorable.filter((c) => !placed.has(c.id));

  return [...ranked, ...leftover, ...unscorable].slice(0, topN);
}
