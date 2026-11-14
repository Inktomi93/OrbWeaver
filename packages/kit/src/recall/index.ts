// Pure rules of memory recall: the tiered bridge over a pool of digest positions, the query shape, the `{{memory}}` block format,
// the block identity string, the live-window boundary and which digests a player's strikes leave out. Rows arrive as structural shapes so the rules name no
// domain type.

import type { CharacterId, ChatId, MessageId } from "#ids";

/** The block-level identity of one digest/segment block. `search.corpus` dedupes ranked blocks by this
 *  key, and `memory`'s tiered bridge passes the surviving keys as `MemoryQueryOptions.candidates`.
 *  `scopedCharacterId` carries the egocentric POV: two scoped-group characters can produce digests for
 *  the SAME `(chatId, tier, blockIdx)` from different POVs, so it's part of the key — always a real
 *  branded `CharacterId`, never `''` or null. */
export interface BlockKey {
  readonly chatId: ChatId;
  readonly tier: number;
  readonly blockIdx: number;
  readonly scopedCharacterId: CharacterId;
}

/** What the bridge reads of a stored digest: its grid position and the bucket that produced it. */
export interface BridgeRow {
  readonly tier: number;
  readonly blockIdx: number;
  readonly scopedCharacterId: CharacterId;
}

/** The stable string identity of a block key (the `byKey` map key). */
export function blockKeyStr(k: BlockKey): string {
  return `${k.chatId}|${k.tier}|${k.blockIdx}|${k.scopedCharacterId}`;
}

/** How many tier-0 blocks one tier-`t` digest covers (`fanOutᵗ`) — the one home of the tier-grid span. */
function tierSpan(fanOut: number, tier: number): number {
  return fanOut ** tier;
}

/** The tier-0 blockIdx range a tier-`k` digest at `blockIdx` covers: `[blockIdx·fanOutᵏ, (blockIdx+1)·fanOutᵏ − 1]`.
 *  Tier 0 is the identity range. */
export function tier0RangeOf(fanOut: number, tier: number, blockIdx: number): { readonly startIdx: number; readonly endIdx: number } {
  const span = tierSpan(fanOut, tier);
  return { startIdx: blockIdx * span, endIdx: (blockIdx + 1) * span - 1 };
}

/** Compute the tiered bridge block keys from a recall pool's digests: coarse high-tier digests for the distant
 *  past and fine tier-0 digests for the most recent `fanOut` blocks, so the injected story stays roughly constant
 *  as the chat grows. A tier-0 digest inside a surfaced higher-tier span is never also surfaced.
 *
 *  The pool is a union of buckets and the grid is per bucket: two independently built histories both start at
 *  tier 0 block 0, so `(tier, blockIdx)` names one block per bucket. The walk runs once per bucket and the results
 *  concatenate in first-seen bucket order, each bucket's keys chronological within itself. */
export function computeBridge(scope: { readonly chatId: ChatId }, digests: readonly BridgeRow[], fanOut: number): BlockKey[] {
  const buckets = new Map<CharacterId, BridgeRow[]>();
  for (const d of digests) {
    const rows = buckets.get(d.scopedCharacterId) ?? [];
    rows.push(d);
    buckets.set(d.scopedCharacterId, rows);
  }
  return [...buckets.values()].flatMap((rows) => bucketBridge(scope.chatId, rows, fanOut));
}

/** The coverage walk for one bucket: every row here shares a `scopedCharacterId`. */
function bucketBridge(chatId: ChatId, digests: readonly BridgeRow[], fanOut: number): BlockKey[] {
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

  // Coarse past: greedily cover [firstTier0, fineStart) with the highest non-overlapping tier.
  let p = firstTier0 === Number.POSITIVE_INFINITY ? 0 : firstTier0;
  while (p < fineStart) {
    const t = highestCoveringTier(present, p, { coarseEnd: fineStart, maxTier, fanOut });
    if (t === null) {
      p += 1; // a gap (no digest at any tier covers p) — skip it
      continue;
    }
    const span = tierSpan(fanOut, t);
    keys.push(toKey(chatId, scopeOf, t, Math.floor(p / span)));
    p += span;
  }

  // Recent past: the fine tier-0 blocks [fineStart, lastTier0].
  for (let b = fineStart; b <= lastTier0; b += 1) {
    if (present.has(`0:${b}`)) {
      keys.push(toKey(chatId, scopeOf, 0, b));
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

/** A key carrying the block's own bucket owner, so a union of buckets keys each block to the digest that produced
 *  it. Only `present` positions reach here, so a missing owner is a defect of the walk. */
function toKey(chatId: ChatId, scopeOf: ReadonlyMap<string, CharacterId>, tier: number, blockIdx: number): BlockKey {
  const scopedCharacterId = scopeOf.get(`${tier}:${blockIdx}`);
  if (scopedCharacterId === undefined) {
    throw new Error(`computeBridge: no scope owner for ${tier}:${blockIdx}`);
  }
  return { chatId, tier, blockIdx, scopedCharacterId };
}

/** Format the ordered recalled keys into the `{{memory}}` string: each block's stored distilled `text`, blank-line
 *  separated, in the given order. A key with no row in `byKey` is dropped (a search hit outside the loaded scope),
 *  and so is a blank body. `rendered` is the ordered subset that contributed, which is the recall trace's admitted
 *  set. */
export function formatMemory<K extends BlockKey>(
  orderedKeys: readonly K[],
  byKey: ReadonlyMap<string, { readonly text: string }>,
): { text: string; rendered: readonly K[] } {
  const parts: string[] = [];
  const rendered: K[] = [];
  for (const key of orderedKeys) {
    const row = byKey.get(blockKeyStr(key));
    if (row === undefined) {
      continue;
    }
    const body = row.text.trim();
    if (body.length > 0) {
      parts.push(body);
      rendered.push(key);
    }
  }
  return { text: parts.join("\n\n"), rendered };
}

/** A player's strike as recall matches it. `scopedCharacterId` null names the room's shared bucket, whichever
 *  character holds it this turn. The endpoints are the covered span's first and last message ids. */
export interface RecallStrike {
  readonly scopedCharacterId: CharacterId | null;
  readonly tier: number;
  readonly messageStartId: MessageId;
  readonly messageEndId: MessageId;
  readonly contentHash: string;
}

/** A pooled digest as strike matching reads it: its grid position, bucket, staleness hash and resolved span
 *  endpoints. `span` is null when the span cannot be resolved from stored segments. */
export interface StrikeCandidate extends BridgeRow {
  readonly contentHash: string;
  readonly span: { readonly startId: MessageId; readonly endId: MessageId } | null;
}

/** Which pooled digests a room's strikes leave out: each struck digest with the strike that names it, and each
 *  same-bucket consolidation whose tier-0 range covers a struck digest, because it retells the struck scene. */
export interface StrikeMatch<R, S> {
  readonly struck: ReadonlyMap<R, S>;
  readonly coversStruck: ReadonlySet<R>;
}

/** Match strikes to pooled digests. A strike names a digest when bucket and tier agree and either its span
 *  endpoints are the digest's or its stored hash is the digest's current hash. Grid position alone never matches:
 *  a re-sliced block at the same position covers different messages. */
export function matchStrikes<R extends StrikeCandidate, S extends RecallStrike>(
  rows: readonly R[],
  strikes: readonly S[],
  // A room with no shared bucket yet (no character seated) matches no shared-bucket strike.
  grid: { readonly sharedBucket: CharacterId | null; readonly fanOut: number },
): StrikeMatch<R, S> {
  const struck = new Map<R, S>();
  if (strikes.length === 0) {
    return { struck, coversStruck: new Set() };
  }
  for (const row of rows) {
    const strike = strikes.find(
      (s) =>
        (s.scopedCharacterId ?? grid.sharedBucket) === row.scopedCharacterId &&
        s.tier === row.tier &&
        (s.contentHash === row.contentHash || (row.span !== null && row.span.startId === s.messageStartId && row.span.endId === s.messageEndId)),
    );
    if (strike !== undefined) {
      struck.set(row, strike);
    }
  }
  const coversStruck = new Set<R>();
  for (const row of rows) {
    if (struck.has(row)) {
      continue;
    }
    const range = tier0RangeOf(grid.fanOut, row.tier, row.blockIdx);
    for (const hit of struck.keys()) {
      const inner = tier0RangeOf(grid.fanOut, hit.tier, hit.blockIdx);
      if (hit.scopedCharacterId === row.scopedCharacterId && row.tier > hit.tier && range.startIdx <= inner.startIdx && inner.endIdx <= range.endIdx) {
        coversStruck.add(row);
        break;
      }
    }
  }
  return { struck, coversStruck };
}

/**
 * The cutoff meaning the last turn sent the whole history: the seq below which messages are not in the prompt is
 * −∞ when nothing is excluded, so every digest's scene is still in the live window and is dropped.
 */
export const LIVE_WINDOW_FULL_HISTORY_CUTOFF = Number.NEGATIVE_INFINITY;

/**
 * Whether the digest-span endpoint `seq` is still inside this turn's live history window, so the digest drops out
 * of `{{memory}}`. `cutoff` is the seq below which messages are not in the prompt. A seq at the cutoff is still in
 * the window; strictly below has aged out. Which endpoint to test is the caller's rule: a tier above zero is tested
 * on its span end, a tier-0 digest on its span start.
 */
export function inLiveWindow(seq: number, cutoff: number): boolean {
  return seq >= cutoff;
}

/** The resolved recall knobs the query reads. `mode` stays the caller's own literal union. */
export interface RecallKnobs<Mode extends string> {
  readonly mode: Mode;
  readonly keywordMatch: boolean;
  readonly minScore: number;
  readonly retrieveK: number;
  readonly rerankTo: number;
}

/** The recent turns the query is made of: the last `queryWindow` of `recent`, which runs oldest to newest. */
export function recallQueryWindow<T>(recent: readonly T[], queryWindow: number): readonly T[] {
  return recent.slice(Math.max(0, recent.length - queryWindow));
}

/** The recall query options the memory domain hands to digest search. */
export interface RecallQuery<Mode extends string> {
  readonly scope: { readonly chat: ChatId };
  readonly queryText: string;
  readonly scopedCharacterId: CharacterId;
  readonly mode: Mode;
  readonly keywordMatch: boolean;
  readonly minScore: number;
  readonly retrieveK: number;
  readonly rerankTo: number;
}

/** Build the recall query from the already rendered window text: the chat scope, the egocentric bucket and the
 *  resolved knobs. `candidates` is left absent; the bridge restriction is layered on by the caller. */
export function buildRecallQuery<Mode extends string>(
  cfg: RecallKnobs<Mode>,
  scope: { readonly chatId: ChatId; readonly scopedCharacterId: CharacterId },
  queryText: string,
): RecallQuery<Mode> {
  return {
    scope: { chat: scope.chatId },
    queryText,
    scopedCharacterId: scope.scopedCharacterId,
    mode: cfg.mode,
    keywordMatch: cfg.keywordMatch,
    minScore: cfg.minScore,
    retrieveK: cfg.retrieveK,
    rerankTo: cfg.rerankTo,
  };
}
