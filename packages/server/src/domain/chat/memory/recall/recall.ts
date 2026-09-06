// domain/chat/memory/recall/recall — the {{memory}} recall policy. Memory owns the mode switch +
// scope/window/lens/assembly; the cosine scan is delegated to ctx.searchDigests (memory holds no cosine).
// Modes: off → ""; mixA → all tier-0 digests chronological (pure assembly); mixB/mixC → vector retrieve
// (+rerank) over the bridge; tiered → consolidation bridge, uncovered-digests-only (pure assembly).
//
// The pool is the mode-switch union: the shared bucket (synthetic group-as-character) ∪ the speaker's own
// bucket, then witnessing-filtered by the speaker's join/leave horizons — a character can't recall a scene
// it wasn't in. The recall window-filter additionally drops any digest still verbatim in this turn's live
// history window (token-driven, distinct from the fixed build-protect window).
//
// OBSERVABILITY IS A RETURN VALUE, NOT A SIDE CHANNEL (#250). Every path — including the two early returns —
// produces a `MemoryRecallSlice` beside the text: the query, the pool, the candidate set, the admitted blocks
// with the scores they were admitted on, and a bounded head of the rejects with the STAGE that eliminated
// them. The one slice feeds three readers (the assembly trace the Preview renders, the structured
// `memory.recall` log entry, and the `/api/_debug/memory/recalls` ring) so no reader can hold a narrower
// second version of what happened.

import type { MemoryRecallCandidate, MemoryRecallSlice, MemoryRecallVerdict } from "@orb/contracts/chat";
import { MEMORY_RECALL_REJECTS_SHOWN } from "@orb/contracts/chat";
import type { BlockKey, ScoredBlock } from "@orb/contracts/search";
import type { CharacterId } from "@orb/kit/ids";
import type { ChatContext } from "../../context.ts";
import { spanWitnessed } from "../build/substrate/witnessing.ts";
import { resolveCfg } from "../constants.ts";
import { loadDigestsForScope, loadSegmentSpans } from "../persistence/queries.ts";
import type { DigestRow, MemoryConfig, MemoryRecallResult, MemoryRecallWarningEpisode, MemoryScope, MsgRow, WitnessInterval } from "../types.ts";
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
  readonly warningEpisode?: MemoryRecallWarningEpisode | undefined;
}

/** The per-block verdict ledger: every RAW pool member starts here and its entry is overwritten by whichever
 *  stage eliminates it (witnessing → live window → mode/bridge → retrieval cut). Whatever a block's entry says
 *  when recall finishes IS why it did or didn't reach the prompt. */
type Verdicts = Map<string, { readonly key: BlockKey; verdict: MemoryRecallVerdict }>;

/** Resolve the `{{memory}}` string for a turn PLUS the trace explaining it. `text` is `""` when memory is off,
 *  the pool is empty, or no block survives — early-returning before any embed call on off/empty-pool; the
 *  slice then carries the reason in `note`. */
export async function recallMemory(ctx: ChatContext, args: RecallArgs): Promise<MemoryRecallResult> {
  const startedAt = ctx.now();
  const cfg = resolveCfg(args.config);
  const { scope } = args;
  const verdicts: Verdicts = new Map();
  if (cfg.mode === "off") {
    return finish(ctx, args, {
      startedAt,
      text: "",
      slice: { mode: cfg.mode, queryText: null, queryEmbedded: false, poolSize: 0, candidateCount: 0, note: "mode off", verdicts, rendered: [], scored: null },
    });
  }
  // The header brain-icon's live feed (#313): memory is ON, so the pre-provider recall WINDOW opens NOW —
  // stamped BEFORE the digest load + any embed/scan/rerank so the "recalling…" state covers the whole
  // latency the viewer perceives as a hang. `finish` stamps the matching "recalled" (count) at the one exit.
  // Placed after the `off` early-return so memory-off never emits (an absent event is the idle icon, not a lie).
  ctx.emitRecallPhase?.({ type: "memoryRecall", chatId: scope.chatId, phase: "recalling", count: null });

  // The shared (group-char) bucket ∪ the speaker's own bucket; one read when the speaker IS the group char.
  const own = await loadDigestsForScope(ctx.db, scope.chatId, scope.scopedCharacterId);
  const shared = args.groupCharacterId === scope.scopedCharacterId ? [] : await loadDigestsForScope(ctx.db, scope.chatId, args.groupCharacterId);
  const raw = [...shared, ...own].filter((digest) => digest.tier <= cfg.maxTier);
  for (const d of raw) {
    const key = rowKey(scope, d);
    verdicts.set(blockKeyStr(key), { key, verdict: "admitted" });
  }
  const union = await filterPool(ctx, {
    chatId: scope.chatId,
    union: raw,
    fanOut: cfg.fanOut,
    horizons: args.witnessing,
    liveWindowCutoffSeq: args.liveWindowCutoffSeq,
    scope,
    verdicts,
  });
  if (union.length === 0) {
    return finish(ctx, args, {
      startedAt,
      text: "",
      slice: {
        mode: cfg.mode,
        queryText: null,
        queryEmbedded: false,
        poolSize: 0,
        candidateCount: 0,
        note: "no digests",
        verdicts,
        rendered: [],
        scored: null,
      },
    });
  }

  const byKey = new Map<string, DigestRow>(union.map((d) => [blockKeyStr(rowKey(scope, d)), d]));
  const selected = await selectKeys(ctx, { args, cfg, union, verdicts });

  // `rendered` (the trace's admitted set) stays in RETRIEVAL-RANK order — best-scoring first, the order a
  // debugger reads "why did this block win". #330 P7: the {{memory}} TEXT, by contrast, renders in TIME order
  // for the embedding modes (mixB/mixC) — a rank-ordered "story so far" reads as scrambled chronology to the
  // model, and mixA/tiered already inject chronologically. `formatMemory` is pure, so a second call over the
  // chronologically-sorted rendered keys yields the time-ordered text without disturbing the rank-ordered
  // trace. For mixA/tiered `selected.keys` is already chronological, so the two orders coincide (byte-identical).
  const { text: rankedText, rendered } = formatMemory(selected.keys, byKey);
  const text =
    cfg.mode === "mixB" || cfg.mode === "mixC"
      ? formatMemory(
          [...rendered].sort((a, b) => chronoStart(a, cfg.fanOut) - chronoStart(b, cfg.fanOut)),
          byKey,
        ).text
      : rankedText;
  return finish(ctx, args, {
    startedAt,
    text,
    slice: {
      mode: cfg.mode,
      queryText: selected.queryText,
      queryEmbedded: selected.queryEmbedded,
      poolSize: union.length,
      candidateCount: selected.candidateCount,
      note: null,
      verdicts,
      rendered,
      scored: selected.scored,
    },
  });
}

/** The unrendered materials one finished recall assembles its {@link MemoryRecallSlice} from. */
interface SliceParts {
  readonly mode: MemoryRecallSlice["mode"];
  readonly queryText: string | null;
  readonly queryEmbedded: boolean;
  readonly poolSize: number;
  readonly candidateCount: number;
  readonly note: string | null;
  readonly verdicts: Verdicts;
  /** The blocks that actually reached the prompt, in RETRIEVAL-RANK order (the trace's admitted set — #330 P7:
   *  the `{{memory}}` TEXT is re-sorted chronologically for the embedding modes, but the trace keeps rank order). */
  readonly rendered: readonly BlockKey[];
  /** The retrieval numbers per block-key string; null for a mode that ran no scan. */
  readonly scored: ReadonlyMap<string, ScoredBlock> | null;
}

/** Build the slice, emit it to BOTH observability sinks (the structured log + the debug ring), and return it
 *  with the text. The single exit — so a future early return cannot skip the trace. */
function finish(
  ctx: ChatContext,
  args: RecallArgs,
  env: { readonly startedAt: number; readonly text: string; readonly slice: SliceParts },
): MemoryRecallResult {
  const p = env.slice;
  for (const [id, entry] of p.verdicts) {
    // Anything still marked admitted that did NOT render was scanned and lost the retrieval cut. (A stored
    // digest's `text` is never blank — the build skips-and-flags an empty summarizer result — so the
    // formatter's other drop reason is unreachable for a pool-derived key.)
    if (entry.verdict === "admitted" && !p.rendered.some((k) => blockKeyStr(k) === id)) {
      entry.verdict = "below-floor";
    }
  }
  const admitted: MemoryRecallCandidate[] = p.rendered.map((key, rank) => {
    const hit = p.scored?.get(blockKeyStr(key));
    return {
      tier: key.tier,
      blockIdx: key.blockIdx,
      scopedCharacterId: key.scopedCharacterId,
      verdict: "admitted",
      rank,
      ...(hit === undefined ? {} : { score: hit.score, relevance: hit.relevance }),
    };
  });
  const rejects: MemoryRecallCandidate[] = [];
  for (const entry of p.verdicts.values()) {
    if (entry.verdict === "admitted" || rejects.length >= MEMORY_RECALL_REJECTS_SHOWN) {
      continue;
    }
    rejects.push({ tier: entry.key.tier, blockIdx: entry.key.blockIdx, scopedCharacterId: entry.key.scopedCharacterId, verdict: entry.verdict });
  }
  const slice: MemoryRecallSlice = {
    mode: p.mode,
    queryText: p.queryText,
    queryEmbedded: p.queryEmbedded,
    poolSize: p.poolSize,
    candidateCount: p.candidateCount,
    surfaced: admitted.length,
    ms: ctx.now() - env.startedAt,
    note: p.note,
    candidates: [...admitted, ...rejects],
  };
  ctx.log({
    event: "memory.recall",
    chatId: args.scope.chatId,
    scopedCharacterId: args.scope.scopedCharacterId,
    trace: slice,
    ...(slice.note !== null ? { note: slice.note } : {}),
  });
  ctx.recordRecall?.({ chatId: args.scope.chatId, scopedCharacterId: args.scope.scopedCharacterId, trace: slice });
  // The header brain-icon's live feed (#313): close the "recalling" window opened in `recallMemory` with the
  // surfaced count. Gated on a non-off mode so it PAIRS the "recalling" that fired — the `off` path never
  // opened one, so it never closes one (an absent event is the idle icon, never a lying "recalled 0").
  if (p.mode !== "off") {
    ctx.emitRecallPhase?.({ type: "memoryRecall", chatId: args.scope.chatId, phase: "recalled", count: slice.surfaced });
  }
  return { text: env.text, trace: slice };
}

/** Apply the witnessing + recall-window guards to the pool, uniformly before any mode dispatch. Missing span
 *  evidence stays recoverable when no witnessing horizon applies, but fails CLOSED when a horizon must prove
 *  visibility — an absent covered endpoint cannot authorize a digest across that boundary. Records the
 *  eliminating stage on `verdicts` for every block it drops. */
async function filterPool(
  ctx: ChatContext,
  env: {
    readonly chatId: MemoryScope["chatId"];
    readonly union: readonly DigestRow[];
    readonly fanOut: number;
    readonly horizons: readonly WitnessInterval[] | undefined;
    readonly liveWindowCutoffSeq: number | undefined;
    readonly scope: MemoryScope;
    readonly verdicts: Verdicts;
  },
): Promise<DigestRow[]> {
  if (env.horizons === undefined && env.liveWindowCutoffSeq === undefined) {
    return [...env.union];
  }
  const spans = await loadSegmentSpans(ctx.db, env.chatId);
  const drop = (d: DigestRow, verdict: MemoryRecallVerdict): false => {
    const entry = env.verdicts.get(blockKeyStr(rowKey(env.scope, d)));
    if (entry !== undefined) {
      entry.verdict = verdict;
    }
    return false;
  };
  return env.union.filter((d) => {
    const blockSpan = env.fanOut ** d.tier;
    const first = spans.get(d.blockIdx * blockSpan);
    const last = spans.get((d.blockIdx + 1) * blockSpan - 1);
    if (first === undefined || last === undefined) {
      return env.horizons === undefined ? true : drop(d, "unwitnessed");
    }
    if (env.horizons !== undefined && !spanWitnessed(first.seqStart, last.seqEnd, env.horizons)) {
      return drop(d, "unwitnessed");
    }
    // THE LIVE-WINDOW TEST READS THE WHOLE SPAN, AND ITS ENDPOINT IS TIER-DEPENDENT (#1518). Both endpoints
    // are already resolved above and the witnessing check uses both; reading only `first.seqStart` here kept
    // any digest whose span STRADDLES the cutoff — the ordinary case at a tier boundary, since the cutoff is
    // token-driven and never aligns to the block grid.
    //   • tier > 0 ⇒ test the END (`last.seqEnd`): ANY overlap drops it. Nothing is lost by dropping — the
    //     consolidation never deletes its children, so the pool still holds the finer digests covering the
    //     aged-out half, and the bridge re-covers exactly that half at a lower tier. What the drop removes is
    //     only the part the prompt already carries verbatim.
    //   • tier 0 ⇒ test the START (`first.seqStart`), i.e. drop only when the block is WHOLLY inside the
    //     window. A tier-0 straddler has nothing finer behind it, so dropping it would delete its aged-out
    //     messages from BOTH planes — trading this filter's bounded redundancy for real memory loss, which
    //     inverts its job ("no redundancy", `window.ts`; it is never the last thing holding a scene).
    // Boundary unchanged (`inLiveWindow`): a seq EQUAL to the cutoff still counts as in-window.
    const overlapSeq = d.tier === 0 ? first.seqStart : last.seqEnd;
    if (env.liveWindowCutoffSeq !== undefined && inLiveWindow(overlapSeq, env.liveWindowCutoffSeq)) {
      return drop(d, "live-window");
    }
    return true;
  });
}

/** What one mode's selection produced: the ordered keys, the candidate set size it chose from, whether the
 *  query embed fired, the query text it fired with, and the retrieval numbers (null for a pure-assembly mode). */
interface Selection {
  readonly keys: readonly BlockKey[];
  readonly queryEmbedded: boolean;
  readonly queryText: string | null;
  readonly candidateCount: number;
  readonly scored: ReadonlyMap<string, ScoredBlock> | null;
}

/** Select the ordered block-keys per mode, marking every pool member the mode itself eliminated. */
async function selectKeys(
  ctx: ChatContext,
  env: { readonly args: RecallArgs; readonly cfg: ReturnType<typeof resolveCfg>; readonly union: readonly DigestRow[]; readonly verdicts: Verdicts },
): Promise<Selection> {
  const { args, cfg, union, verdicts } = env;
  const { scope } = args;
  if (cfg.mode === "mixA") {
    const rows = union.filter((d) => d.tier === 0).sort((a, b) => a.blockIdx - b.blockIdx);
    const keys = rows.map((d) => rowKey(scope, d));
    markOutside({ verdicts, union, scope }, keys, "mode-excluded");
    return { keys, queryEmbedded: false, queryText: null, candidateCount: keys.length, scored: null };
  }
  const bridge = computeBridge(scope, union, cfg.fanOut);
  markOutside({ verdicts, union, scope }, bridge, "bridge-covered");
  if (cfg.mode === "tiered") {
    return { keys: bridge, queryEmbedded: false, queryText: null, candidateCount: bridge.length, scored: null };
  }
  const query = buildRecallQuery(cfg, scope, args.recent ?? [], args.names ?? new Map<CharacterId, string>());
  const hits = await ctx.searchDigests({ ...query, candidates: bridge }, args.warningEpisode?.reportRerankUnavailable);
  const scored = new Map<string, ScoredBlock>(hits.map((h) => [blockKeyStr(h.blockKey), h]));
  return {
    keys: hits.map((h) => h.blockKey),
    queryEmbedded: true,
    queryText: query.queryText ?? null,
    candidateCount: bridge.length,
    scored,
  };
}

/** Mark every pool member NOT in `kept` with `verdict` (the mode/bridge elimination stage). */
function markOutside(
  env: { readonly verdicts: Verdicts; readonly union: readonly DigestRow[]; readonly scope: MemoryScope },
  kept: readonly BlockKey[],
  verdict: MemoryRecallVerdict,
): void {
  const { verdicts, union, scope } = env;
  const keptIds = new Set(kept.map(blockKeyStr));
  for (const d of union) {
    const id = blockKeyStr(rowKey(scope, d));
    const entry = verdicts.get(id);
    if (entry !== undefined && !keptIds.has(id)) {
      entry.verdict = verdict;
    }
  }
}

/** A block's coverage START position on the tier-0 grid (blockIdx times fanOut-to-the-tier) — the chronological
 *  sort key for the `{{memory}}` TEXT (#330 P7). A tier-k digest at blockIdx covers a tier-0 range starting at
 *  that position, i.e. the earliest scene it summarizes, so ordering by it reads the arc oldest to newest. */
function chronoStart(k: BlockKey, fanOut: number): number {
  return k.blockIdx * fanOut ** k.tier;
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
