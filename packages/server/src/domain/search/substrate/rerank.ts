// domain/search/substrate/rerank — `applyRerank`, the cross-verb rerank orchestration. PURE
// orchestration: the actual
// `RoleClients.rerank` call is passed in as a function ARG (no I/O of its own), so it is substrate, not an
// injected dep — each verb imports it DOWN directly.
//
// Three pinned behaviours:
//   1. UNSCORABLE PASSTHROUGH — a candidate with no `sourceText` (a card with no searchable text) can't be
//      cross-encoded; it is kept and placed AFTER the ranked ones (preserving recall, never dropped).
//   2. STABLE IDS — documents carry the caller's id (not an array index), so the reorder maps back by id
//      and is robust to the runner returning a budget-capped / reordered subset.
//   3. NO SILENT FALLBACK — a rerank rejection (incl. the PD-11 hosted not-supported throw) PROPAGATES;
//      search owns no catch-and-fall-back-to-CSLS policy (flag-don't-fake). The caller decides.

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
