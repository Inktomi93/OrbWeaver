// domain/chat/memory/recall/bridge — the TIERED bridge (§5 / §11 semantic #2). PURE coverage math: given a
// scope's digests across ALL tiers, surface COARSE high-tier digests for the distant past + FINE tier-0
// digests for the recent past, so the injected "story so far" stays roughly constant no matter how long the
// chat runs. UNCOVERED-DIGESTS-ONLY: a tier-0 digest inside a surfaced higher-tier span is never also
// surfaced (the greedy walk advances past a covered span). The protected TIP is never surfaced — digests only
// exist for aged-out blocks (the build cutoff), so the tip has no digest to bridge.
//
// Indexing (matches `build/digests.ts`): a tier-k digest at blockIdx j covers tier-0 range
// `[j·fanOutᵏ, (j+1)·fanOutᵏ − 1]`. No search call (mixA/tiered are pure assembly — §11 #1); the
// `MemoryQueryOptions.candidates` restriction is the seam for a FUTURE retrieval-restricted tiered mode.
// FLAG[tiered-vs-candidates]: chat.md §11 #1 ("tiered = pure assembly") vs #2 ("tiered passes bridge keys as a
// candidate-restriction param") read in tension — resolved as: base tiered is pure assembly (here), the
// `candidates` param exists for the retrieval-combined case (see return note in `recall.ts`).

import type { BlockKey } from "@orb/contracts/search";
import type { DigestRow, MemoryScope } from "../types";

/**
 * Compute the tiered bridge block-keys (chronological) from a scope's digests. The most-recent `fanOut`
 * tier-0 blocks stay FINE; everything older is covered by the highest available non-overlapping tier. Returns
 * `[]` when there are no tier-0 digests (nothing aged out yet).
 */
export function computeBridge(
  scope: MemoryScope,
  digests: readonly DigestRow[],
  fanOut: number,
): BlockKey[] {
  const present = new Set<string>();
  let maxTier = 0;
  let lastTier0 = -1;
  let firstTier0 = Number.POSITIVE_INFINITY;
  for (const d of digests) {
    present.add(`${d.tier}:${d.blockIdx}`);
    maxTier = Math.max(maxTier, d.tier);
    if (d.tier === 0) {
      lastTier0 = Math.max(lastTier0, d.blockIdx);
      firstTier0 = Math.min(firstTier0, d.blockIdx);
    }
  }
  if (lastTier0 < 0) {
    return []; // no aged-out tier-0 blocks → nothing to bridge
  }

  // The fine zone = the most-recent `fanOut` tier-0 blocks; the coarse zone is everything before it.
  const fineStart = Math.max(0, lastTier0 - fanOut + 1);
  const keys: BlockKey[] = [];

  // ── coarse past: greedily cover [firstTier0, fineStart) with the highest non-overlapping tier ──
  let p = firstTier0 === Number.POSITIVE_INFINITY ? 0 : firstTier0;
  while (p < fineStart) {
    const t = highestCoveringTier(present, p, { coarseEnd: fineStart, maxTier, fanOut });
    if (t === null) {
      p += 1; // a gap (no digest at any tier covers p) — skip it
      continue;
    }
    const span = fanOut ** t;
    keys.push(toKey(scope, t, Math.floor(p / span)));
    p += span;
  }

  // ── recent past: the fine tier-0 blocks [fineStart, lastTier0] ──
  for (let b = fineStart; b <= lastTier0; b += 1) {
    if (present.has(`0:${b}`)) {
      keys.push(toKey(scope, 0, b));
    }
  }
  return keys;
}

/** The highest tier `t` whose digest covers tier-0 position `p` without crossing the fine zone: `p` aligned to
 *  `fanOutᵗ`, the digest present, and the covered span fully inside `[…, coarseEnd)`. `null` ⇒ no digest at any
 *  tier covers `p` (a gap). */
function highestCoveringTier(
  present: ReadonlySet<string>,
  p: number,
  grid: { readonly coarseEnd: number; readonly maxTier: number; readonly fanOut: number },
): number | null {
  for (let t = grid.maxTier; t >= 0; t -= 1) {
    const span = grid.fanOut ** t;
    if (p % span !== 0) {
      continue; // not aligned to this tier's grid
    }
    if (p + span > grid.coarseEnd) {
      continue; // the span would spill into the fine zone — too coarse here
    }
    if (present.has(`${t}:${Math.floor(p / span)}`)) {
      return t;
    }
  }
  return null;
}

function toKey(scope: MemoryScope, tier: number, blockIdx: number): BlockKey {
  return { chatId: scope.chatId, tier, blockIdx, scopedCharacterId: scope.scopedCharacterId };
}
