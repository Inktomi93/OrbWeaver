// domain/chat/memory/recall/recall — the {{memory}} recall policy. Memory owns the mode switch +
// scope/window/lens/assembly; the cosine scan is delegated to ctx.searchDigests (memory holds no cosine).
// Modes: off → ""; mixA → all tier-0 digests chronological (pure assembly); mixB/mixC → vector retrieve
// (+rerank) over the bridge; tiered → consolidation bridge, uncovered-digests-only (pure assembly).
//
// The pool is the mode-switch union: the shared bucket (synthetic group-as-character) ∪ the speaker's own
// bucket, then witnessing-filtered by the speaker's join/leave horizons — a character can't recall a scene
// it wasn't in. The recall window-filter additionally drops any digest still verbatim in this turn's live
// history window (token-driven, distinct from the fixed build-protect window).

import type { BlockKey } from "@orb/contracts/search";
import type { CharacterId } from "@orb/kit/ids";
import type { ChatContext } from "../../context.ts";
import { spanWitnessed } from "../build/substrate/witnessing.ts";
import { resolveCfg } from "../constants.ts";
import { loadDigestsForScope, loadSegmentSpans } from "../persistence/queries.ts";
import type { DigestRow, MemoryConfig, MemoryRecallTrace, MemoryScope, MsgRow, WitnessInterval } from "../types.ts";
import { computeBridge } from "./bridge.ts";
import { blockKeyStr, formatMemory } from "./format.ts";
import { buildRecallQuery } from "./query.ts";
import { inLiveWindow } from "./window.ts";

/** `scope.scopedCharacterId` is the speaker's own bucket; `groupCharacterId` is the shared bucket (equal for
 *  solo/merged, so the union dedupes to one read). `recent` (oldest→newest) is the mixB/mixC query window. */
interface RecallArgs {
  readonly scope: MemoryScope;
  readonly groupCharacterId: CharacterId;
  readonly witnessing?: readonly WitnessInterval[] | undefined;
  readonly liveWindowCutoffSeq?: number | undefined;
  readonly config?: MemoryConfig | null | undefined;
  readonly recent?: readonly MsgRow[] | undefined;
  readonly names?: ReadonlyMap<CharacterId, string> | undefined;
}

/** Resolve the `{{memory}}` string for a turn. Returns `""` when memory is off, the pool is empty, or no
 *  block survives — early-returns before any embed call on off/empty-pool. */
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

  // The shared (group-char) bucket ∪ the speaker's own bucket; one read when the speaker IS the group char.
  const own = await loadDigestsForScope(ctx.db, scope.chatId, scope.scopedCharacterId);
  const shared = args.groupCharacterId === scope.scopedCharacterId ? [] : await loadDigestsForScope(ctx.db, scope.chatId, args.groupCharacterId);
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

/** Apply the witnessing + recall-window guards to the pool, uniformly before any mode dispatch. A missing
 *  segment span fails OPEN (kept) — never hide a real digest because a segment is absent. */
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
    if (env.horizons !== undefined && !spanWitnessed(first.seqStart, last.seqEnd, env.horizons)) {
      return false;
    }
    // Keyed on the digest's start seq: seqStart == cutoff still counts as in-window (dropped).
    if (env.liveWindowCutoffSeq !== undefined && inLiveWindow(first.seqStart, env.liveWindowCutoffSeq)) {
      return false;
    }
    return true;
  });
}

/** Select the ordered block-keys per mode (+ whether the query embed fired). */
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
  const query = buildRecallQuery(cfg, scope, args.recent ?? [], args.names ?? new Map<CharacterId, string>());
  const keys = await ctx.searchDigests({
    ...query,
    candidates: computeBridge(scope, union, cfg.fanOut),
  });
  return { keys, queryEmbedded: true };
}

/** A digest row → its {@link BlockKey}, carrying the row's own bucket owner. */
function rowKey(scope: MemoryScope, d: DigestRow): BlockKey {
  return {
    chatId: scope.chatId,
    tier: d.tier,
    blockIdx: d.blockIdx,
    scopedCharacterId: d.scopedCharacterId,
  };
}

/** Emit the `memory.recall` structured trace. */
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
