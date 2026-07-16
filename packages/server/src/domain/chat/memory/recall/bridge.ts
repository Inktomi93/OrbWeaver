// domain/chat/memory/recall/bridge — the tiered bridge. Pure coverage math: given a scope's digests across
// all tiers, surface coarse high-tier digests for the distant past + fine tier-0 digests for the recent
// past, so the injected "story so far" stays roughly constant no matter how long the chat runs. A tier-0
// digest inside a surfaced higher-tier span is never also surfaced (the greedy walk advances past it). The
// protected tip is never surfaced — digests only exist for aged-out blocks.
//
// Indexing (matches build/digests.ts): a tier-k digest at blockIdx j covers tier-0 range
// [j·fanOutᵏ, (j+1)·fanOutᵏ − 1].

import type { BlockKey } from "@orb/contracts/search";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { resolveCfg } from "../constants";
import type { DigestRow, MemoryConfig, MemoryScope } from "../types";

/** How many tier-0 blocks one tier-`t` digest covers (`fanOutᵗ`) — the ONE home of the tier-grid span. */
function tierSpan(fanOut: number, tier: number): number {
  return fanOut ** tier;
}

/** The tier-0 blockIdx range a tier-`k` digest at `blockIdx` covers: `[blockIdx·fanOutᵏ, (blockIdx+1)·fanOutᵏ − 1]`
 *  (the file-header indexing, matching `build/digests.ts` consolidation). Tier 0 is the identity range. */
function tier0RangeOf(fanOut: number, tier: number, blockIdx: number): { readonly startIdx: number; readonly endIdx: number } {
  const span = tierSpan(fanOut, tier);
  return { startIdx: blockIdx * span, endIdx: (blockIdx + 1) * span - 1 };
}

/** The config-resolving front-door form of {@link tier0RangeOf} — memory's tier-indexing seam for OUTSIDE
 *  consumers (the discovery `msgMidAt` tier-k backfill injects this at the entry root, so the fanOut math
 *  keeps ONE home here). `config` is the raw `AppSettings.memoryDefaults` partial; absent knobs resolve to
 *  the grounded floor exactly as the digest build resolves them. */
export function resolveTier0Range(
  config: MemoryConfig | null | undefined,
  tier: number,
  blockIdx: number,
): { readonly startIdx: number; readonly endIdx: number } {
  return tier0RangeOf(resolveCfg(config).fanOut, tier, blockIdx);
}

/** Compute the tiered bridge block-keys (chronological) from a scope's digests. The most-recent `fanOut`
 *  tier-0 blocks stay fine; everything older is covered by the highest available non-overlapping tier. */
export function computeBridge(scope: MemoryScope, digests: readonly DigestRow[], fanOut: number): BlockKey[] {
  const present = new Set<string>();
  const scopeOf = new Map<string, CharacterId>();
  let maxTier = 0;
  let lastTier0 = -1;
  let firstTier0 = Number.POSITIVE_INFINITY;
  for (const d of digests) {
    present.add(`${d.tier}:${d.blockIdx}`);
    scopeOf.set(`${d.tier}:${d.blockIdx}`, d.scopedCharacterId);
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
    const span = tierSpan(fanOut, t);
    keys.push(toKey(scope.chatId, scopeOf, t, Math.floor(p / span)));
    p += span;
  }

  // ── recent past: the fine tier-0 blocks [fineStart, lastTier0] ──
  for (let b = fineStart; b <= lastTier0; b += 1) {
    if (present.has(`0:${b}`)) {
      keys.push(toKey(scope.chatId, scopeOf, 0, b));
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
    const span = tierSpan(grid.fanOut, t);
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

/** Emit a {@link BlockKey} carrying the block's OWN bucket owner (from `scopeOf`) — so a union of the shared
 *  (group-char) + the speaker's scoped bucket keys each block to the digest that actually produced it. A
 *  position with no recorded owner cannot reach here (only `present` positions are emitted). */
function toKey(chatId: ChatId, scopeOf: ReadonlyMap<string, CharacterId>, tier: number, blockIdx: number): BlockKey {
  const scopedCharacterId = scopeOf.get(`${tier}:${blockIdx}`);
  if (scopedCharacterId === undefined) {
    throw new Error(`computeBridge: no scope owner for ${tier}:${blockIdx}`);
  }
  return { chatId, tier, blockIdx, scopedCharacterId };
}
