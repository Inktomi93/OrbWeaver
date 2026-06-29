// domain/chat/memory/recall/recall — the `{{memory}}` recall POLICY (knowledge-cluster §3b / §4). Memory owns
// the MODE switch + the scope/window/lens/assembly + the mode-switch union; the cosine scan is DELEGATED to
// `ctx.searchDigests` (memory holds NO cosine). The 5 modes (§3b):
//   • off    → "" (D36 global disable).
//   • mixA   → all the pool's tier-0 digests, chronological. PURE ASSEMBLY (no search call).
//   • mixB   → vector retrieve over the bridge (search.digests, mode=mixB).
//   • mixC   → vector retrieve + rerank over the bridge (search.digests, mode=mixC).
//   • tiered → the consolidation bridge (uncovered-digests-only). PURE ASSEMBLY (no search call — `bridge.ts`).
//
// THE POOL = the MODE-SWITCH UNION (§4 / D55-10), the ONE path that covers always-merged, always-scoped, and
// any toggle: **the shared bucket (the synthetic group-as-character) ∪ the speaker's own per-character bucket**,
// then **witnessing-filtered** by the speaker's join/leave horizons. A merged/narrator-era block lives in the
// shared bucket (recalled by everyone present); a scoped-era block lives in the speaker's own bucket (only the
// witnessing speaker). narrator↔merged is a no-op (same shared bucket). An always-merged chat has an empty own
// bucket ⇒ pool = shared; an always-scoped chat has an empty shared bucket ⇒ pool = own (egocentric, inv 6).
// The candidate POOL for mixB/mixC is the §5 BRIDGE over this union (§3b: "the bridge is the pool for every
// mode"), passed as `MemoryQueryOptions.candidates`. The protected TIP is never surfaced (digests only exist
// for aged-out blocks). Host-only keying is the caller's (recall runs under `runAsUserId`). NO cosine here.
//
// THE TWO §3a GUARDS, both applied to the pool BEFORE the mode dispatch (uniform — never a per-mode branch):
//   • WITNESSING (the join/leave horizons, §4) — a character can't recall a scene it wasn't in.
//   • the RECALL WINDOW-FILTER (`liveWindowCutoffSeq`, §3a — `recall/window.ts`) — drop any digest STILL
//     verbatim in this turn's live history window (no redundant re-injection). TOKEN-DRIVEN + variable (the
//     engine supplies the cutoff from the §8 history-budget fit), DISTINCT from the FIXED build-protect window.

import type { BlockKey } from "@orb/contracts/search";
import type { CharacterId } from "@orb/kit/ids";
import type { ChatContext } from "../../contract/context";
import { spanWitnessed } from "../build/substrate/witnessing";
import { resolveCfg } from "../constants";
import { loadDigestsForScope, loadSegmentSpans } from "../persistence/queries";
import type {
  DigestRow,
  MemoryConfig,
  MemoryRecallTrace,
  MemoryScope,
  MsgRow,
  WitnessInterval,
} from "../types";
import { computeBridge } from "./bridge";
import { blockKeyStr, formatMemory } from "./format";
import { buildRecallQuery } from "./query";
import { inLiveWindow } from "./window";

/** What `recallMemory` needs (file-local, NON-exported — the `types-in-contract` gate; caller passes a
 *  structural literal). `scope.scopedCharacterId` is the SPEAKER's own bucket; `groupCharacterId` is the
 *  synthetic group-as-character (the shared bucket — equals the speaker for solo/merged, so the union dedupes
 *  to one read). `witnessing` is the speaker's join/leave horizons (§4): when present, the union is filtered to
 *  blocks the speaker was present for. `liveWindowCutoffSeq` is the §3a recall window-filter (the seq below
 *  which messages are NOT in this turn's prompt — engine-supplied from the §8 history-budget fit; absent ⇒ no
 *  live-window filtering): any digest still verbatim in the live window is dropped (no redundancy). `recent`
 *  (oldest→newest) is the mixB/mixC query window. */
interface RecallArgs {
  readonly scope: MemoryScope;
  readonly groupCharacterId: CharacterId;
  readonly witnessing?: readonly WitnessInterval[] | undefined;
  readonly liveWindowCutoffSeq?: number | undefined;
  readonly config?: MemoryConfig | null | undefined;
  readonly recent?: readonly MsgRow[] | undefined;
  readonly names?: ReadonlyMap<CharacterId, string> | undefined;
}

/**
 * Resolve the `{{memory}}` string for a turn (the GATHER input). Reads the mode-switch union (shared ∪ own,
 * witnessing-filtered), selects the blocks per mode, formats them from the stored digest `text` (§2b). Returns
 * `""` when memory is off, the pool is empty, or no block survives. EARLY-RETURNS before any embed on
 * off/empty-pool (inv 10 — a fresh chat does zero work). Emits the `memory.recall` structured trace (§3a).
 */
export async function recallMemory(ctx: ChatContext, args: RecallArgs): Promise<string> {
  const startedAt = ctx.now();
  const cfg = resolveCfg(args.config);
  const { scope } = args;
  if (cfg.mode === "off") {
    logRecall(ctx, {
      scope,
      startedAt,
      mode: cfg.mode,
      poolSize: 0,
      surfaced: 0,
      queryEmbedded: false,
      note: "mode off",
    });
    return "";
  }

  // The MODE-SWITCH UNION: the shared (group-char) bucket ∪ the speaker's own bucket (deduped — they share no
  // (tier, blockIdx), each block aged out under ONE scope). One read when the speaker IS the group char (merged).
  const own = await loadDigestsForScope(ctx.db, scope.chatId, scope.scopedCharacterId);
  const shared =
    args.groupCharacterId === scope.scopedCharacterId
      ? []
      : await loadDigestsForScope(ctx.db, scope.chatId, args.groupCharacterId);
  const union = await filterPool(ctx, {
    chatId: scope.chatId,
    union: [...shared, ...own],
    fanOut: cfg.fanOut,
    horizons: args.witnessing,
    liveWindowCutoffSeq: args.liveWindowCutoffSeq,
  });
  if (union.length === 0) {
    logRecall(ctx, {
      scope,
      startedAt,
      mode: cfg.mode,
      poolSize: 0,
      surfaced: 0,
      queryEmbedded: false,
      note: "no digests",
    });
    return "";
  }

  const byKey = new Map<string, DigestRow>(union.map((d) => [blockKeyStr(rowKey(scope, d)), d]));
  const { keys, queryEmbedded } = await selectKeys(ctx, args, cfg, union);

  const out = formatMemory(keys, byKey);
  const surfaced = keys.filter((k) => byKey.has(blockKeyStr(k))).length;
  logRecall(ctx, {
    scope,
    startedAt,
    mode: cfg.mode,
    poolSize: union.length,
    surfaced,
    queryEmbedded,
    note: undefined,
  });
  return out;
}

/** Apply the TWO §3a guards to the pool, uniformly (before any mode dispatch): WITNESSING (§4) + the
 *  token-driven RECALL WINDOW-FILTER (§3a). Neither set ⇒ no filter (the simple single-bucket path). Each
 *  digest's seq-span is resolved ONCE from `chat_segments` (its tier-0 block range); a missing span fails OPEN
 *  (kept) — never hide a real digest because a segment is absent. */
async function filterPool(
  ctx: ChatContext,
  env: {
    readonly chatId: MemoryScope["chatId"];
    readonly union: readonly DigestRow[];
    readonly fanOut: number;
    readonly horizons: readonly WitnessInterval[] | undefined;
    readonly liveWindowCutoffSeq: number | undefined;
  },
): Promise<DigestRow[]> {
  if (env.horizons === undefined && env.liveWindowCutoffSeq === undefined) {
    return [...env.union];
  }
  const spans = await loadSegmentSpans(ctx.db, env.chatId);
  return env.union.filter((d) => {
    const blockSpan = env.fanOut ** d.tier;
    const first = spans.get(d.blockIdx * blockSpan);
    const last = spans.get((d.blockIdx + 1) * blockSpan - 1);
    if (first === undefined || last === undefined) {
      return true; // fail-open — a missing segment span must not erase a real digest
    }
    // WITNESSING: drop a scene the speaker wasn't present for (when horizons are supplied).
    if (env.horizons !== undefined && !spanWitnessed(first.seqStart, last.seqEnd, env.horizons)) {
      return false;
    }
    // RECALL WINDOW-FILTER: drop a scene STILL verbatim in this turn's live window (when a cutoff is supplied)
    // — keyed on the digest's START seq (exact boundary: seqStart == cutoff ⇒ still in window ⇒ dropped).
    if (
      env.liveWindowCutoffSeq !== undefined &&
      inLiveWindow(first.seqStart, env.liveWindowCutoffSeq)
    ) {
      return false;
    }
    return true;
  });
}

/** Select the ordered block-keys per mode (+ whether the query embed fired). mixA/tiered are pure assembly;
 *  mixB/mixC delegate the cosine scan over the §5 bridge candidates (the bridge is the pool for every mode). */
async function selectKeys(
  ctx: ChatContext,
  args: RecallArgs,
  cfg: ReturnType<typeof resolveCfg>,
  union: readonly DigestRow[],
): Promise<{ keys: readonly BlockKey[]; queryEmbedded: boolean }> {
  const { scope } = args;
  if (cfg.mode === "mixA") {
    const keys = union
      .filter((d) => d.tier === 0)
      .sort((a, b) => a.blockIdx - b.blockIdx)
      .map((d) => rowKey(scope, d));
    return { keys, queryEmbedded: false };
  }
  if (cfg.mode === "tiered") {
    return { keys: computeBridge(scope, union, cfg.fanOut), queryEmbedded: false };
  }
  // mixB | mixC — the injected cosine scan over the bridge candidates (rerank implied by mode=mixC at search).
  const query = buildRecallQuery(
    cfg,
    scope,
    args.recent ?? [],
    args.names ?? new Map<CharacterId, string>(),
  );
  const keys = await ctx.searchDigests({
    ...query,
    candidates: computeBridge(scope, union, cfg.fanOut),
  });
  return { keys, queryEmbedded: true };
}

/** A digest row → its {@link BlockKey}, carrying the row's OWN bucket owner (a union spans two buckets). */
function rowKey(scope: MemoryScope, d: DigestRow): BlockKey {
  return {
    chatId: scope.chatId,
    tier: d.tier,
    blockIdx: d.blockIdx,
    scopedCharacterId: d.scopedCharacterId,
  };
}

/** Emit the `memory.recall` structured trace (knowledge-cluster §3a). */
function logRecall(
  ctx: ChatContext,
  env: {
    readonly scope: MemoryScope;
    readonly startedAt: number;
    readonly note: string | undefined;
  } & Omit<MemoryRecallTrace, "ms">,
): void {
  ctx.log({
    event: "memory.recall",
    chatId: env.scope.chatId,
    scopedCharacterId: env.scope.scopedCharacterId,
    trace: {
      mode: env.mode,
      poolSize: env.poolSize,
      surfaced: env.surfaced,
      queryEmbedded: env.queryEmbedded,
      ms: ctx.now() - env.startedAt,
    },
    ...(env.note !== undefined ? { note: env.note } : {}),
  });
}
