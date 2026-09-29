// The turn lifecycle shell. Single-speaker core: one resolved speaker per turn, no multi-speaker
// arbitration/auto-mode (the "who/how-many speaks" chunk wraps this). The tool-recurse loop is built in
// pipeline.ts (recurses on finishReason:"tool" up to toolRecurseLimit).
//
// Lifecycle (read top to bottom in executeTurn): acquire lock →
// emit turnStarted → load canon + next-seq → runTurnPipeline (assemble→shape→run→reduce→fit) → persist the
// canon + stats delta in one atomic batch → emit messageCommitted + turnCompleted → release lock. On any
// error after turnStarted: emit turnAborted then rethrow, never swallow. Pre-start refusals throw a coded
// ChatOperationError and emit nothing — UNLESS the caller already opened the client's turn slot
// (`TurnPrep.slotAccepted`, set by every verb that emits `turnAccepted`), in which case the refusal ALSO emits
// `turnAborted` to close it (`closePreStartRefusal`): the engine is the only party that knows `turnStarted`
// never fired, and an accepted-but-unresolved slot is a stuck Stop button. A turn nobody accepted (the
// founding `opening` turn — every other turn-starting verb accepts) keeps the historical bus-silent refusal,
// byte-identically.
//
// The chat bus emit, the per-member budget debit, and the per-turn host policy are not ChatContext ops —
// they're injected as engine deps wired at the entry composition root.

import type {
  AssembleContext,
  ChatDeltaEvent,
  ChatReasoningPart,
  ChatWarning,
  DurableChatBusEvent,
  MessageView,
  TokenProvenance,
  TurnAbortReason,
  VariantMetadata,
} from "@orb/contracts/chat";
import { buildIdentityNameContext, DEFAULT_MESSAGE_KIND, INLINE_REPLY_ORIGIN, VARIANT_METADATA_REASONING_MS_KEY } from "@orb/contracts/chat";
import type { NormalizedFinishReason, ProviderId } from "@orb/contracts/inference";

import type { ContinuePostfix, UserIntent } from "@orb/contracts/preset";
import {
  DEFAULT_COMPACT_INSTRUCTIONS,
  DEFAULT_COMPACTION_MODE,
  DEFAULT_CONTINUE_POSTFIX,
  MANAGED_COMPACT_DEFAULT_PCT,
  MANAGED_VERBATIM_TAIL,
} from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
// A VALUE import from infra, unlike this file's other `#infra/providers` type-only imports: the fault-outcome
// arm needs `instanceof` against the real class to read a thrown turn's OWN classification (see
// `providerTerminalReason`). Legal in the tier order (domain sits ABOVE infra); the reverse edge is what
// `infra-below-domain` bans.
import type { Resolved, ResolvedWarning } from "@orb/inference";
import { generationOf, ProviderError } from "@orb/inference";
import type { AssetId, CharacterId, ChatId, ChatTurnId, MessageId, ModelId, UserConnectionId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { estimateTokens } from "@orb/kit/tokens";
import { getLog, recordTurnOutcome, withRequestSpan } from "#foundation/observability";
import type { ChatContext } from "../context.ts";
import type { RpgTurnContext, RpgTurnTranscriptMessage } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type {
  MemoryConfig,
  MemoryEmbedSpace,
  MemoryPassCounts,
  MemoryRecallResult,
  MemoryScope,
  MsgRow,
  TurnRetrievalWarningEpisode,
  WitnessInterval,
} from "../contract/memory.ts";
import { resolveToolRecurseLimit } from "../contract/metadata.ts";
import type {
  DeliveredCue,
  GeneratedText,
  HistoryMacroNames,
  PlacedInlineImage,
  ResolvedMediaRef,
  TurnEconomics,
  TurnEngine,
  TurnOutcome,
  TurnPersist,
  TurnPrep,
} from "../contract/results.ts";
import { KIND_TO_INTENT } from "../contract/results.ts";
import {
  appendVariantStatements,
  buildCommittedMessageView,
  combineReasoning,
  continueVariantStatements,
  insertCanonMessageStatements,
  insertMessageAssetStatements,
} from "../persistence/canon-write.ts";
import { loadChatIdentityProducer } from "../persistence/identity.ts";
import { holdsLock, refreshLock, releaseLock, tryAcquireLock } from "../persistence/lock.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import {
  loadCanonCues,
  loadCanonHistory,
  loadCanonReasoningParts,
  loadCanonStatRows,
  loadChatRow,
  loadInlineReplyAssetIds,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
  loadVariableDeltas,
} from "../persistence/queries.ts";
import { insertChatStreamEventStatements } from "../persistence/stream-events.ts";
import { digestsDerivable } from "../substrate/digests-derivable.ts";
import { resolveGroupBucketCharacterId } from "../substrate/group-bucket.ts";
import { spliceInlineReplyImages } from "../substrate/inline-reply-images.ts";
import { projectRpgTranscript } from "../substrate/rpg-transcript.ts";
import { foldChain, runtimeVariablesUpdateStatement } from "../substrate/runtime-variables.ts";
import { assistantTurnDelta, canonMessageDelta, swipeVariantDelta } from "../substrate/stats-delta.ts";
import { runTurnPipeline } from "./pipeline.ts";
import { resolveTurnNarrative } from "./recover-narrative.ts";
import { abortedOutcome, committedOutcome } from "./result.ts";

/** The non-ctx engine deps wired at the composition root. */
interface EngineDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
  readonly holder: string;
  readonly lockTtlMs: number;
  /** Injected memory segment builder, typed to the real signature — no `any` at this seam. */
  readonly generateSegments: (
    ctx: ChatContext,
    args: {
      readonly chatId: ChatId;
      readonly funderUserId: UserId;
      readonly config?: MemoryConfig | null | undefined;
      readonly macroNames?: RowMacroNameContext | undefined;
      readonly signal?: AbortSignal | undefined;
      readonly embedSpace?: MemoryEmbedSpace | undefined;
      readonly embedOwnerId?: UserId | undefined;
    },
  ) => Promise<MemoryPassCounts>;
  /** Injected memory digest builder, typed to the real signature. */
  readonly generateDigests: (
    ctx: ChatContext,
    args: {
      readonly scope: MemoryScope;
      readonly funderUserId: UserId;
      readonly config?: MemoryConfig | null | undefined;
      readonly macroNames?: RowMacroNameContext | undefined;
      readonly witnessing?: readonly WitnessInterval[] | undefined;
      readonly signal?: AbortSignal | undefined;
      readonly embedSpace?: MemoryEmbedSpace | undefined;
      readonly embedOwnerId?: UserId | undefined;
    },
  ) => Promise<MemoryPassCounts>;
  /** Injected witnessing-horizon reader (memory's `chat_participants` presence read) — the engine sources a
   *  seated character's join/leave horizons to gate its SCOPED digest build. Injected (not imported) because the
   *  engine may not reach `memory/` across the subsystem boundary; the domain root wires the real reader. */
  readonly loadWitnessHorizons: (db: ChatContext["db"], chatId: ChatId, characterId: CharacterId) => Promise<WitnessInterval[]>;
  /** Injected `{{memory}}` recall — the engine re-runs it PER SCOPED SPEAKER (its own bucket + horizons) so a
   *  scoped round's each speaker recalls its OWN egocentric, witnessed memory. Injected across the subsystem
   *  boundary like the builders above; the domain root wires the real `recallMemory`. */
  readonly recallMemory: (
    ctx: ChatContext,
    args: {
      readonly scope: MemoryScope;
      readonly groupCharacterId: CharacterId;
      readonly witnessing?: readonly WitnessInterval[] | undefined;
      readonly liveWindowCutoffSeq?: number | undefined;
      readonly config?: MemoryConfig | null | undefined;
      readonly recent?: readonly MsgRow[] | undefined;
      readonly names?: ReadonlyMap<CharacterId, string> | undefined;
      readonly warningEpisode?: TurnRetrievalWarningEpisode | undefined;
    },
  ) => Promise<MemoryRecallResult>;
  /** Injected lock-free compaction core (`makeRunCompaction`) — the managed-compaction post-turn hook rebuilds
   *  the LINEAR-tier `compactSummary` marker over the span above the fit boundary via the chat's OWN model.
   *  Injected (not imported from the verb) so the engine never reaches into a verb; the domain root wires the same
   *  core the manual `compact` verb uses. Idempotent via `chats.compactedAtSeq` — an unchanged coverage point
   *  rewrites nothing (`updated:false`). Takes the chat's resolved `connection` (the marker rides the chat's model,
   *  source-agnostic). */
  readonly runCompaction: (args: {
    readonly chatId: ChatId;
    readonly connection: Resolved<"chat">;
    readonly ownerId: UserId;
    readonly coveragePoint?: number | undefined;
    readonly instructions?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  }) => Promise<{ readonly summary: string; readonly compactedAtSeq: number; readonly updated: boolean }>;
}

/** The string spliced between a continue turn's existing variant tip and the newly-generated chunk. */
const CONTINUE_POSTFIX_DELIMITER: Record<ContinuePostfix, string> = {
  none: "",
  space: " ",
  newline: "\n",
  "double-newline": "\n\n",
};

/** The continuation delimiter this turn's resolved preset configures. Read off the immutable assemble ctx
 *  so the commit write and the mirror stats delta join through one home. */
function continuePostfixDelimiter(prep: TurnPrep): string {
  return CONTINUE_POSTFIX_DELIMITER[prep.assembleContext.promptConfig.continuePostfix ?? DEFAULT_CONTINUE_POSTFIX];
}

/** The shared economics subset (variant columns ∩ stats input). */
interface EconomicsCommon {
  readonly model: ModelId | null;
  readonly provider: ProviderId | null;
  readonly connectionId: UserConnectionId | null;
  readonly costProvenance: TokenProvenance;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly costUsd: number | null;
}

function economicsCommon(e: TurnEconomics | null): EconomicsCommon {
  return {
    model: e?.model ?? null,
    provider: e?.provider ?? null,
    connectionId: e?.connectionId ?? null,
    costProvenance: e?.costProvenance ?? "unrecorded",
    tokensIn: e?.tokensIn ?? null,
    tokensOut: e?.tokensOut ?? null,
    cacheReadTokens: e?.cacheReadTokens ?? null,
    cacheWriteTokens: e?.cacheWriteTokens ?? null,
    costUsd: e?.costUsd ?? null,
  };
}

/** The loaded write target for an append-variant/continue turn, read pre-start. */
type SlotTarget = NonNullable<Awaited<ReturnType<typeof loadSlotTarget>>>;

/** Re-reads a just-committed message's authoritative MessageView (append-variant/continue produce fields
 *  the in-memory insert params don't know, unlike a fresh slot). */
async function readCommittedView(ctx: ChatContext, messageId: MessageId): Promise<MessageView> {
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    throw new Error(`message ${messageId} vanished mid-commit`);
  }
  return view;
}

/**
 * The variant's `metadata` sidecar for a LIVE generation (#184). The column is a CLOSED shape
 * (`VariantMetadata`, §5.3c class 3) whose SQL rollup readers still address it BY PATH, so the live turn
 * builds the same ONE key the ST import writes and the three stats readers extract —
 * `VARIANT_METADATA_REASONING_MS_KEY`. Until this existed the key had a single producer
 * (the import), which is why `owner_stats.reasoning_ms` was pure archaeology: every turn this app generated
 * itself counted 0ms.
 *
 * THE SECOND KEY is the per-provider sidecar the runtime narrowed (`TurnEconomics.providerMetadata`). Its
 * two halves had both been built and neither was connected: the backends accumulated the vendor bag and the
 * closed union sat in contracts with no importer, so the ephemeral cache-creation split, the warm-spare
 * receipt and OpenRouter's upstream charge were collected once per turn and dropped. This is the join.
 *
 * Null (not `{}`) when the turn recorded NEITHER: an empty blob would make the column's "has a sidecar"
 * question a lie and costs a row of JSON for nothing. Takes the whole pipeline result rather than its parts
 * because the variant row and the live stats-mirror row MUST persist the IDENTICAL blob — they are
 * reconciled against each other, and two call sites assembling it separately is how they drift.
 */
function liveVariantMetadata(result: Awaited<ReturnType<typeof runTurnPipeline>>): VariantMetadata | null {
  const providerMetadata = result.economics?.providerMetadata;
  const sidecar: VariantMetadata = {
    ...(result.reasoningMs === null ? {} : { [VARIANT_METADATA_REASONING_MS_KEY]: result.reasoningMs }),
    ...(providerMetadata === null || providerMetadata === undefined ? {} : { providerMetadata }),
  };
  return Object.keys(sidecar).length === 0 ? null : sidecar;
}

/** Builds the variant payload (content + reasoning + economics + per-swipe snapshot) — every persist mode
 *  writes the same generation record. */
function variantPayloadOf(
  prep: TurnPrep,
  result: Awaited<ReturnType<typeof runTurnPipeline>>,
  genStartedAt: number,
  genFinishedAt: number,
): Parameters<typeof appendVariantStatements>[1]["variant"] {
  const e = result.economics;
  return {
    content: result.content,
    reasoning: result.reasoning,
    // The measured reasoning window (#184 — the live producer the three stats readers were missing) and the
    // runtime's per-provider sidecar (§5.3c), in ONE parsed blob.
    metadata: liveVariantMetadata(result),
    ...economicsCommon(e),
    contextWindow: e?.contextWindow ?? null,
    maxOutputTokens: e?.maxOutputTokens ?? null,
    // The APPLIED effort off the runner (compose reads `ChatResult.appliedEffort`), never the requested intent —
    // that is `params` (inference audit B1). The two economics sidecars every wire normalizes ride beside it (B5/B8).
    reasoningEffort: e?.reasoningEffort ?? null,
    reasoningTokens: e?.reasoningTokens ?? null,
    costDetails: e?.costDetails ?? null,
    // The replayable reasoning blocks (A1) — stored beside `reasoning` (the rendered text), read by the assembly.
    reasoningParts: e?.reasoningParts ?? null,
    // The cue SHAPE sent ahead of this reply, replayed verbatim before it on a prefix-bound carry.
    cue: result.cue,
    contextBoundaryMessageId: result.contextBoundaryMessageId,
    // The pipeline window the engine measured; the reconcile + live stats mirror both read gf-gs for gen-time.
    genStartedAt,
    genFinishedAt,
    ttftMs: e?.ttftMs ?? null,
    finishReason: e?.finishReason ?? null,
    stopReason: e?.stopReason ?? null,
    terminalReason: e?.terminalReason ?? null,
    generationId: e?.generationId ?? null,
    params: prep.intent,
    promptSnapshot: result.request.prompt,
    // The turn's macro op-log is copied (never aliased) since the shared per-round array is cleared after
    // each speaker's commit.
    variableDelta: [...(prep.assembleContext.opLog ?? [])],
    // WAVE MU delivery — the turn's user-macro draw record (frozen ∪ fresh), resolved ONCE at registry build
    // (verbs/turn.ts) and immutable for the round: every speaker's variant persists the same record, and a
    // swipe of any of them replays it. Unlike the op-log there is nothing to splice per speaker.
    macroDraws: prep.userMacroDraws ?? null,
    toolCalls: result.toolRecords.length > 0 ? result.toolRecords : null,
  };
}

/** The economics + gen-window a mirror-builder canon row reads for the freshly-generated variant. Shared by
 *  the append-variant/continue signed-delta rows so they mirror `reconcileStats`'s fold column-for-column. */
function generatedRowEconomics(
  result: Awaited<ReturnType<typeof runTurnPipeline>>,
  genStartedAt: number,
  genFinishedAt: number,
): {
  tokensIn: number | null;
  tokensOut: number | null;
  tokenProvenance: "measured" | "unrecorded";
  costUsd: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  contextWindow: number | null;
  genStartedAt: number;
  genFinishedAt: number;
  model: string | null;
  provider: string | null;
  metadata: VariantMetadata | null;
} {
  const e = result.economics;
  const tokensIn = e?.tokensIn ?? null;
  const tokensOut = e?.tokensOut ?? null;
  return {
    tokensIn,
    tokensOut,
    // Economics on this path came from the live provider result. A reported zero is still a measured
    // sample; absence on both axes is the only unrecorded state.
    tokenProvenance: tokensIn !== null || tokensOut !== null ? "measured" : "unrecorded",
    costUsd: e?.costUsd ?? null,
    cacheReadTokens: e?.cacheReadTokens ?? null,
    cacheWriteTokens: e?.cacheWriteTokens ?? null,
    contextWindow: e?.contextWindow ?? null,
    genStartedAt,
    genFinishedAt,
    model: e?.model ?? null,
    provider: e?.provider ?? null,
    // The SAME blob the variant row persists (#184 + §5.3c): the live stats mirror folds `reasoning_duration`
    // exactly as `reconcileStats` re-derives it from the written row, so the two can never disagree.
    metadata: liveVariantMetadata(result),
  };
}

/** The pre-mutation selected-variant stat row of the target slot — the old state an append-variant/continue
 *  delta subtracts. Loaded before the batch. */
type CanonStatRow = Awaited<ReturnType<typeof loadCanonStatRows>>[number];

/**
 * The per-turn stats delta(s) the commit applies, matching what `reconcileStats` folds for the same canon
 * change. One builder per persist mode:
 *   • new-slot assistant — {@link assistantTurnDelta}, a fresh assistant slot's fold.
 *   • new-slot user (impersonate) — {@link canonMessageDelta} on a role:"user" row (userTurns + economics,
 *     never an assistant turn/model bucket).
 *   • append-variant (swipe) — the selected-swap: remove the old variant as the selected message (-1), add
 *     it back as a swipe (+1), add the new variant as the selected message (+1).
 *   • continue — (new - old) on the slot.
 */
async function buildTurnStatsDeltas(args: {
  readonly ctx: ChatContext;
  readonly prep: TurnPrep;
  readonly persist: TurnPersist;
  readonly target: SlotTarget | null;
  readonly result: Awaited<ReturnType<typeof runTurnPipeline>>;
  readonly speakerCharacterId: CharacterId | null;
  readonly genStartedAt: number;
  readonly genFinishedAt: number;
  readonly now: number;
}): Promise<StatsDelta[]> {
  const { ctx, prep, persist, target, result, genStartedAt, genFinishedAt, now } = args;
  const ownerId = prep.runAsUserId;
  const econ = generatedRowEconomics(result, genStartedAt, genFinishedAt);

  if (persist.mode === "new-slot") {
    if (persist.role === "assistant") {
      return [
        assistantTurnDelta({
          ownerId,
          characterId: args.speakerCharacterId,
          economics: {
            content: result.content,
            reasoning: result.reasoning,
            // The SAME sidecar the row persists (#184) — the new-slot builder folds `reasoning_duration` out
            // of it exactly as the swipe/continue builders (which read the committed row) already do.
            metadata: econ.metadata,
            ...economicsCommon(result.economics),
            contextWindow: result.economics?.contextWindow ?? null,
            genTimeMs: genFinishedAt - genStartedAt,
          },
          now,
        }),
      ];
    }
    // impersonate: the rebuild folds a user row (userTurns + economics, no assistantTurns/character/model grain).
    return [
      canonMessageDelta({
        ownerId,
        sign: 1,
        now,
        row: {
          characterId: null,
          role: persist.role,
          createdAt: now,
          content: result.content,
          reasoning: result.reasoning,
          selectedIdx: null,
          variantCount: 1,
          ...econ,
        },
      }),
    ];
  }

  // append-variant/continue mutate an existing slot — load its pre-mutation selected-variant row so the
  // signed deltas subtract exactly what the rebuild folded before the write.
  const old = target === null ? undefined : await loadOldStatRow(ctx, prep, target);
  if (old === undefined || target === null) {
    throw new ChatNotFoundError(prep.chatId);
  }

  if (persist.mode === "append-variant") {
    return [
      canonMessageDelta({ ownerId, sign: -1, now, row: old }),
      swipeVariantDelta({
        ownerId,
        sign: 1,
        now,
        row: {
          characterId: old.characterId,
          msgCreatedAt: old.createdAt,
          content: old.content,
          tokensIn: old.tokensIn,
          tokensOut: old.tokensOut,
          tokenProvenance: old.tokenProvenance,
          genStartedAt: old.genStartedAt,
          genFinishedAt: old.genFinishedAt,
          model: old.model,
          provider: old.provider,
          reasoning: old.reasoning,
          metadata: old.metadata,
        },
      }),
      canonMessageDelta({
        ownerId,
        sign: 1,
        now,
        row: {
          characterId: target.characterId,
          role: target.role,
          createdAt: old.createdAt,
          content: result.content,
          reasoning: result.reasoning,
          selectedIdx: target.variantCount,
          variantCount: target.variantCount + 1,
          ...econ,
        },
      }),
    ];
  }

  // continue: (new - old) on the slot — the extended variant replaces the pre-continue one (same idx/count).
  return [
    canonMessageDelta({
      ownerId,
      sign: 1,
      now,
      row: {
        characterId: old.characterId,
        role: old.role,
        createdAt: old.createdAt,
        // Mirrors the commit's postfix-delimited join so both sides join identically.
        content: old.content + continuePostfixDelimiter(prep) + result.content,
        reasoning: combineReasoning(old.reasoning, result.reasoning),
        selectedIdx: old.selectedIdx,
        variantCount: old.variantCount,
        ...econ,
      },
    }),
    canonMessageDelta({ ownerId, sign: -1, now, row: old }),
  ];
}

/** Loads the target slot's pre-mutation selected-variant stat row. */
async function loadOldStatRow(ctx: ChatContext, prep: TurnPrep, target: SlotTarget): Promise<CanonStatRow | undefined> {
  const rows = await loadCanonStatRows(ctx.db, prep.chatId, [target.messageId]);
  return rows.at(0);
}

/** Builds one persist-mode's canon statements + the committed-view reader, for a given tail seq. Re-mints
 *  the new-slot ids on every call (the retry needs fresh ids). */
function buildCommitPlan(args: {
  readonly ctx: ChatContext;
  readonly prep: TurnPrep;
  readonly persist: TurnPersist;
  readonly target: SlotTarget | null;
  readonly result: Awaited<ReturnType<typeof runTurnPipeline>>;
  readonly variant: ReturnType<typeof variantPayloadOf>;
  readonly now: number;
  readonly seq: number;
}): {
  statements: BatchStmt[];
  speakerCharacterId: CharacterId | null;
  /** THE SLOT this generation lands in — freshly minted for `new-slot`, the target's for a swipe/continue.
   *  §6.7's `message_assets` links are keyed on it, and on the seq-RETRY path the new-slot id is re-minted,
   *  so the links must be built from THIS value and never from a cached one. */
  messageId: MessageId;
  loadView: () => Promise<MessageView>;
} {
  const { ctx, prep, persist, target, result, variant, now, seq } = args;
  if (persist.mode === "new-slot") {
    const characterId = persist.role === "assistant" ? prep.speakerCharacterId : null;
    const insertParams = {
      messageId: ctx.newMessageId(),
      variantId: ctx.newMessageVariantId(),
      chatId: prep.chatId,
      seq,
      role: persist.role,
      // DECLARED purpose: a narrator round's one synthetic turn is born `kind:'narrator'` (the other narrator
      // writer is `postNarratorMessage`). Everything else is born `standard`. This is what makes narrator-ness
      // survive the two things that used to erase it — deleting the synthetic group character (its attribution
      // FK SET-NULLs) and flipping the room's `output` dial, which retroactively re-classified history. The
      // canon `role` is untouched (`assistant`): the wire mapping is a SHAPE-time dispatch, never storage.
      kind: prep.shape?.output === "narrator" && persist.role === "assistant" ? ("narrator" as const) : DEFAULT_MESSAGE_KIND,
      characterId,
      authorUserId: persist.authorUserId ?? null,
      personaId: persist.personaId ?? null,
      // Turn origin — stamped on the reply slot. Absent on `prep` ⇒ the DB default ('human'/0), so a
      // human/character/agent turn is byte-identical; an automation `requestTurn` threads these through.
      ...(prep.initiator !== undefined ? { initiator: prep.initiator } : {}),
      ...(prep.automationDepth !== undefined ? { automationDepth: prep.automationDepth } : {}),
      now,
      variant,
    };
    const view = buildCommittedMessageView(insertParams);
    return {
      statements: insertCanonMessageStatements(ctx.db, insertParams),
      speakerCharacterId: characterId,
      messageId: insertParams.messageId,
      loadView: (): Promise<MessageView> => Promise.resolve(view),
    };
  }
  if (target === null) {
    throw new ChatNotFoundError(prep.chatId);
  }
  if (persist.mode === "append-variant") {
    return {
      statements: appendVariantStatements(ctx.db, {
        messageId: target.messageId,
        variantId: ctx.newMessageVariantId(),
        idx: target.variantCount,
        now,
        variant,
      }),
      speakerCharacterId: target.characterId,
      messageId: target.messageId,
      loadView: (): Promise<MessageView> => readCommittedView(ctx, target.messageId),
    };
  }
  // continue: extend the selected variant in place; snapshot the pre-continue state so undo/revert round-trip.
  const continuationContent = continuePostfixDelimiter(prep) + result.content;
  return {
    statements: continueVariantStatements(ctx.db, {
      variantId: target.selectedVariantId,
      variant: {
        ...variant,
        content: target.content + continuationContent,
        reasoning: combineReasoning(target.reasoning, result.reasoning),
      },
      preContinueContent: target.content,
      preContinueReasoning: target.reasoning,
      lastContinuationContent: continuationContent,
      lastContinuationReasoning: result.reasoning,
    }),
    speakerCharacterId: target.characterId,
    messageId: target.messageId,
    loadView: (): Promise<MessageView> => readCommittedView(ctx, target.messageId),
  };
}

/** Commits a turn's generation per the persist mode + the stats delta in one atomic batch, then emits
 *  `messageCommitted`. The stats delta is attributed to the host and the voiced slot's character. */
async function commitGeneration(args: {
  readonly ctx: ChatContext;
  readonly deps: EngineDeps;
  readonly prep: TurnPrep;
  readonly persist: TurnPersist;
  readonly target: SlotTarget | null;
  readonly result: Awaited<ReturnType<typeof runTurnPipeline>>;
  readonly nextSeq: number;
  readonly genStartedAt: number;
  readonly genFinishedAt: number;
  /** The provider deltas already published live, in callback order. They join the destination message in
   *  the canon batch so only committed turns become resumable token history. */
  readonly streamDeltas: readonly ChatDeltaEvent[];
  /** §6.7 — the CAS ids of the pictures this generation emitted and the engine already stored, in the order
   *  their spans were spliced into `result.content`. Each gets a `message_assets` link stamped
   *  `inline-reply`, in THIS batch: the body's `asset:` spans are invisible to `asset-refs.ts`
   *  (`db/schema/chat.ts` header), so the link is the ONLY reference GC can see and a missing one gets the
   *  blob reaped out from under a live transcript. It is also what the wire-history fence reads to let the
   *  model see its own picture next turn — one row, two jobs, both load-bearing. */
  readonly inlineReplyAssetIds: readonly AssetId[];
}): Promise<MessageView> {
  const { ctx, deps, prep, persist, target, result, nextSeq, genStartedAt, genFinishedAt } = args;
  const now = ctx.now();
  const variant = variantPayloadOf(prep, result, genStartedAt, genFinishedAt);

  const attempt = async (seq: number): Promise<MessageView> => {
    const { statements, speakerCharacterId, messageId, loadView } = buildCommitPlan({
      ctx,
      prep,
      persist,
      target,
      result,
      variant,
      now,
      seq,
    });
    // The retaining links ride the SAME atomic batch as the slot/variant, keyed on THIS attempt's slot id so
    // a seq-retry re-links against the re-minted row. A swipe links onto the SLOT (the table's grain), so a
    // swiped-away variant's blob is retained with no rendered reference — wasteful and correct; §6.7 rules a
    // variant-scoped GC pass a later fork.
    statements.push(
      ...insertMessageAssetStatements(ctx.db, {
        rows: args.inlineReplyAssetIds.map((assetId) => ({ id: ctx.newMessageAssetId(), messageId, assetId })),
        origin: INLINE_REPLY_ORIGIN,
        now,
      }),
    );
    statements.push(
      ...insertChatStreamEventStatements(ctx.db, {
        message: { id: messageId, chatId: prep.chatId },
        deltas: args.streamDeltas,
        newEventId: ctx.newStreamEventId,
        newGenerationId: ctx.newStreamGenerationId,
        createdAt: now,
      }),
    );

    const deltas = await buildTurnStatsDeltas({
      ctx,
      prep,
      persist,
      target,
      result,
      speakerCharacterId,
      genStartedAt,
      genFinishedAt,
      now,
    });
    for (const delta of deltas) {
      ctx.applyStatsDelta(statements, ctx.db, delta);
    }

    // Recomputes chats.runtime_variables reflecting this commit's delta, in the same atomic batch: new-slot
    // appends at the tail seq; append-variant/continue override the target slot's delta.
    const turnDelta = variant.variableDelta ?? [];
    const currentDeltas = await loadVariableDeltas(ctx.db, prep.chatId);
    const postEntries =
      persist.mode === "new-slot" || target === null
        ? [...currentDeltas, { seq, delta: turnDelta }]
        : currentDeltas.map((e) => (e.messageId === target.messageId ? { seq: e.seq, delta: turnDelta } : e));
    statements.push(runtimeVariablesUpdateStatement(ctx.db, prep.chatId, foldChain(postEntries)));

    // THE WRITE FENCE (#1393) — the LAST thing before the batch, and re-run on the seq-retry. Everything
    // above is in-memory statement building; this is where the turn stops being reversible.
    await assertTurnMayCommit(ctx, deps, prep);
    await ctx.db.batch(batchMany(statements));
    return loadView();
  };

  // A lock-free generate runs concurrent with a locked send, and both allocate maxSeq+1 before the
  // pipeline, so the slower committer's new-slot insert can lose the seq-unique race after the generation
  // was already paid + streamed. Retry once with a re-derived head (the generation is in hand, no re-pay).
  const view = await attempt(nextSeq).catch(async (err: unknown) => {
    if (persist.mode === "new-slot" && isConstraintViolation(err)?.kind === "unique") {
      return attempt((await loadMaxMessageSeq(ctx.db, prep.chatId)) + 1);
    }
    throw err;
  });
  // A group round reuses ONE assembleContext across its speakers, so the by-reference op-log accumulates;
  // clear it now that this turn's ops are COMMITTED, so the next speaker's delta starts empty.
  //
  // AFTER THE WRITE, NEVER BEFORE (#1437). Clearing it up front — while `variant` already held the
  // spread-copy — mutated a context the CALLER owns before anything durable existed: any throw out of
  // `attempt` (the fence above, a DB fault, a stats read) left the round's shared log emptied with nothing
  // committed, and a retry on that same context wrote an empty `variableDelta`. The snapshot is taken at
  // `variantPayloadOf`; only the producer-state reset belongs here, and only on success.
  prep.assembleContext.opLog?.splice(0);
  await deps.emit({ type: "messageCommitted", chatId: prep.chatId, messageId: view.id, view });
  return view;
}

/**
 * THE PRE-WRITE FENCE (#1393): may this turn still commit canon?
 *
 * Cancellation is not a write barrier. The heartbeat ({@link runInLockWithHeartbeat}) aborts the turn's
 * composed signal the moment it finds the lock stolen or gone, but the ONLY thing that honors an abort
 * mid-turn is the provider stream — a generation that had already finished streaming was past its last
 * cancellation point and went on to write, under a lock a different holder now owned. Both halves are
 * checked here, immediately before the batch:
 *
 *  • the SIGNAL — covers the caller's Stop and the heartbeat's stale-lock abort. `throwIfAborted` carries
 *    the signal's own reason, so `abortReasonFor` still classifies it "user" vs "stale" downstream.
 *  • the LOCK HOLDER — the fact the abort is a proxy for. A `lockFree` turn has no lock to hold (it runs
 *    concurrent with a locked send BY DESIGN — its seq-unique retry is what makes that safe), so it is
 *    fenced by the signal alone.
 *
 * NOT A TRANSACTION-LEVEL FENCE, deliberately. `db.transaction()` is banned in product code and
 * `@orb/db/kit::batchMany`'s header bans batching a SELECT ahead of writes (a DEFERRED batch that reads
 * first must upgrade its snapshot → an unretryable SQLITE_BUSY_SNAPSHOT), so the ownership predicate
 * cannot ride inside the commit batch. What remains is the batch's own latency instead of a whole
 * generation's — and {@link runInLockWithHeartbeat} no longer releases the lock while this body is still
 * live, so the same-process half of the race is closed outright.
 */
async function assertTurnMayCommit(ctx: ChatContext, deps: EngineDeps, prep: TurnPrep): Promise<void> {
  prep.signal?.throwIfAborted();
  if (prep.lockFree === true) {
    return;
  }
  if (await holdsLock(ctx.db, prep.chatId, deps.holder)) {
    return;
  }
  getLog().error(
    { chatId: prep.chatId, holder: deps.holder },
    "chat: turn-lock NOT held at the commit fence — refusing the canon write (stolen or gone mid-turn)",
  );
  throw new ChatOperationError(CHAT_OP_CODES.aborted, "turn-lock lost before the canon write (stolen or gone)");
}

/** The expressions classify's own trace root (I-7: it ran under NO live span — same outlives-the-request class
 *  as the rpg round below). One name so the debug surface and any future filter agree. */
const EXPRESSIONS_SPAN = "expressions.turnCompleted";

/** The trace-ring request id the expressions classify is bucketed under — its OWN id, never the HTTP request's
 *  (see `rpgRoundRequestId` for why: the classify's dispatch instant still has the `trpc.*` span active, but its
 *  actual work runs after that root has sealed, so a parented span would be silently dropped as a late orphan). */
function expressionsRequestId(turnId: ChatTurnId): string {
  return `expr-turn:${turnId}`;
}

/** Fire-and-forget the injected expressions post-turn classify (docs/plans/expressions/design.md): after the variant
 *  commits, classify the speaker's affect and emit an ephemeral sprite-swap. Null op = expressions not wired
 *  (byte-identical no-op — the memory-trigger posture). The op swallows its own errors; `.catch` covers a
 *  synchronous throw so nothing reaches the reply path. Wrapped in its own DETACHED root (`withRequestSpan`,
 *  `root: true`) for the same reason the rpg round is: it outlives the request.
 *
 *  #1461 — the catch LOGS (it was `.catch(() => undefined)`): a rejecting classify left stale affect state
 *  with no repair signal and no trace, on every committed turn. Warn, not error, and the ids come with it —
 *  the file's own sibling convention (`fireRpgTurnCompleted` below). The SPAN is already marked ERROR without
 *  extra work here: this `.catch` sits OUTSIDE `withRequestSpan`, so the rejection passes through the root's
 *  own catch first (unlike the memory build, which owns an INNER try and must rethrow to reach it). */
function fireExpressionClassify(ctx: ChatContext, view: MessageView, turnId: ChatTurnId): void {
  if (ctx.expressions !== null) {
    const expressions = ctx.expressions;
    void withRequestSpan(expressionsRequestId(turnId), EXPRESSIONS_SPAN, { chatId: view.chatId, messageId: view.id, turnId }, () =>
      expressions.onTurnCompleted(view.chatId, view.id, view.selectedVariantId),
    ).catch((err: unknown) =>
      getLog().warn({ err, chatId: view.chatId, messageId: view.id, turnId }, "expressions: post-turn classify failed (reply already committed)"),
    );
  }
}

/** Project the turn's loaded canon (`canonAll`) PLUS the just-committed reply (`view`) into the name-stamped,
 *  token-measured transcript the rpg state round reasons from (crunchy-cluster redesign §1.3). `canonAll` was
 *  loaded pre-turn so it does NOT carry this reply; append `view` (the latest beat) and drop any stale row with
 *  the same id (a regenerate replaces the slot). Oldest→newest, hidden spans INTACT (model-plane, D110 §3.6);
 *  system rows kept (the consumer decides — the knob is rpg's). Zero extra reads — the canon is already in
 *  scope (§1.4). Rides the SHARED substrate projection (`projectRpgTranscript`) so this in-turn feed and the
 *  `resolveCanonWindow` resync deep-read can never drift. */
function projectTurnRpgTranscript(canonAll: readonly MessageView[], view: MessageView, names: HistoryMacroNames): RpgTurnTranscriptMessage[] {
  const rows = [...canonAll.filter((m) => m.id !== view.id), view];
  return projectRpgTranscript(rows, names);
}

/** The post-turn rpg round's own trace root — one name so the debug surface and any future filter agree. */
const RPG_ROUND_SPAN = "rpg.turnCompleted";

/** The trace-ring request id that round is bucketed under. Its OWN id, never the HTTP request's: the round
 *  outlives the request, and a span arriving after that root sealed is dropped as a late orphan. */
function rpgRoundRequestId(turnId: ChatTurnId): string {
  return `rpg-turn:${turnId}`;
}

/** The post-turn memory-build pass's own trace root (I-7: it ran under NO live span — same outlives-the-request
 *  class as the rpg round). Covers the whole build: segments, the group-as-character digest, and every seated
 *  character's scoped digest — one trace shows the round's full cost, not just its first hop. */
const MEMORY_SPAN = "memory.turnCompleted";

/** The trace-ring request id the memory build is bucketed under — its OWN id, for the same reason
 *  `rpgRoundRequestId` gives one to the rpg round. */
function memoryRequestId(turnId: ChatTurnId): string {
  return `memory-turn:${turnId}`;
}

/** Fire-and-forget the rpg post-turn FLUSH (docs/plans/rpg/design.md): after the variant commits, flush the turn's
 *  staged tool writes onto the committed variant, keyed by `turnId`. Null op = rpg not wired (byte-identical
 *  no-op). Fire-and-forget with `.catch` — a background staging flush must NEVER turn a committed reply into an
 *  abort; the reply already landed. Inert until the rpg tool registrants stage anything (R4 #2/#3).
 *
 *  IT GETS ITS OWN TRACE (the round was invisible to observability): this is the most expensive thing the
 *  turn does after the reply lands — a whole state round with its own provider call and its own writes — and
 *  it ran under NO live span. Not because nothing is active at the dispatch instant (the `trpc.*` span is),
 *  but because the round OUTLIVES the request: by the time its work runs the request root has sealed, and the
 *  ring DROPS every span arriving for a sealed bucket. So it opens a DETACHED root of its own
 *  (`withRequestSpan`, whose `root: true` is what makes that detach real), keyed by the turn —
 *  `/api/_debug/traces` shows the round as its own trace with its provider + db children under it, instead of
 *  nothing. The span marks itself error on the same throw the warn below records. */
/** THIS turn's already-composed prose view (PROSE-1 S4) — captured, never re-resolved (see
 *  `RpgTurnContext.prose`). The SAME record the assembler read for the prompt the post-commit state round is
 *  about to extract from, and the same one the gather handed the fold mount, so the narrator and the
 *  extractor are taught one vocabulary. Absent (a hand-built context) ⇒ `{}` ⇒ the shipped defaults.
 *
 *  Its own function purely so the `??` stays out of the turn body's cognitive-complexity budget, which is at
 *  its ceiling — the alternative was raising the ceiling for one coalesce. */
function turnProse(prep: TurnPrep): ProseOverrides {
  return prep.assembleContext.prose ?? {};
}

function fireRpgTurnCompleted(ctx: ChatContext, view: MessageView, turnId: ChatTurnId, turn: RpgTurnContext): void {
  if (ctx.rpg !== null) {
    const rpg = ctx.rpg;
    // Fire-and-forget still (a background flush must NEVER turn a committed reply into an abort), but LOG the
    // failure — a silent `.catch(() => undefined)` made a broken rpg flush/extraction invisible in prod (the
    // diagnosis that surfaced the routing bug). The reply already landed; this only records that the state
    // write behind it failed. `turn` carries THIS turn's ALREADY-RESOLVED connection + enforced owner-consent
    // verdict so the rpg state round runs on the exact same route/consent the engine gated — never a second
    // hand-rolled resolve/consent path (stickler F1).
    void withRequestSpan(rpgRoundRequestId(turnId), RPG_ROUND_SPAN, { chatId: view.chatId, messageId: view.id, turnId }, () =>
      rpg.onTurnCompleted(view.chatId, view.id, view.selectedVariantId, turnId, turn),
    ).catch((err: unknown) => getLog().warn({ err, chatId: view.chatId, turnId }, "rpg: post-turn flush failed (reply already committed)"));
  }
}

/** The rpg turn-abort clear's own trace root (I-7: same outlives-the-request class as `fireRpgTurnCompleted`
 *  above — the abort path returns to the caller before this staging clear finishes). */
const RPG_ABORT_SPAN = "rpg.turnAborted";

/** A DISTINCT prefix from `rpgRoundRequestId` (never the same bucket as a completed round — the two are
 *  mutually exclusive per turn, but a shared key would blur "completed" and "aborted" traces together). */
function rpgAbortRequestId(turnId: ChatTurnId): string {
  return `rpg-turn-abort:${turnId}`;
}

/** Fire-and-forget the rpg turn-abort CLEAR (docs/plans/rpg/design.md hardening a): drop the turn's staged tool
 *  writes so a dead turn never flushes into the next turn on this chat. Null op = rpg not wired. Fire-and-
 *  forget — clearing staging must never mask the abort the caller is already surfacing. Wrapped in its own
 *  DETACHED root for the same reason `fireRpgTurnCompleted` is: it outlives the request.
 *
 *  #1461 — the catch LOGS (it was `.catch(() => undefined)`). This is the hook whose silence costs the most:
 *  a failed clear leaves the dead turn's staged writes in place, so the NEXT turn on this chat flushes them
 *  — the exact cross-turn contamination the clear exists to prevent, previously invisible. Warn + ids (the
 *  sibling convention); the span is already ERROR for the same reason stated on `fireExpressionClassify`. */
function fireRpgTurnAborted(ctx: ChatContext, chatId: ChatId, turnId: ChatTurnId, reason: TurnAbortReason): void {
  if (ctx.rpg !== null) {
    const rpg = ctx.rpg;
    void withRequestSpan(rpgAbortRequestId(turnId), RPG_ABORT_SPAN, { chatId, turnId, reason }, () => rpg.onTurnAborted(chatId, turnId, reason)).catch(
      (err: unknown) => getLog().warn({ err, chatId, turnId, reason }, "rpg: turn-abort staging clear failed (the turn is still aborted)"),
    );
  }
}

/** SINGLE-FLIGHT set for managed compaction, keyed by chatId — at most one in-flight marker build per chat (a
 *  trip while one is running is a no-op). The UNCHANGED-coverage-point skip is NOT tracked here (that would leak
 *  a per-chat entry forever): it is enforced DURABLY by the core's `chats.compactedAtSeq` idempotence — a re-fire
 *  on an already-covered point loads an empty window and rewrites nothing (`updated:false`, no generation). The
 *  marker generation is NOT a chat turn — un-trippable: it contributes nothing to the pct usage accounting and
 *  cannot recursively re-arm this hook. The set holds only IN-FLIGHT chats, so it self-empties (delete on finally).
 *
 *  ASSUMES(single-replica): this is per-process de-dup only — a best-effort spend/concurrency guard, NOT a
 *  correctness boundary. The DB-backed replacement seam is `chats.compactedAtSeq` (the durable idempotence that
 *  ALREADY makes a cross-replica double-fire a harmless no-op: the second replica loads an empty window and writes
 *  nothing). Under multi-replica the worst case is a redundant summarizer call, never a corrupt/racing marker —
 *  so a shared cache is not required for correctness. */
const compactionInFlight = new Set<ChatId>();

/** Fire-and-forget the MANAGED-COMPACTION post-turn refresh — the LINEAR memory tier (a running `compactSummary`
 *  marker that stands in for compacted-away history), the sibling of the retrieval-tier digest build and keyed
 *  off the SAME fit boundary.
 *
 *  API-AXIS GATED (owner ruling): compaction GENERATION fires for any `connection.api === "agent-sdk"` chat —
 *  the runner axis, NOT a backend/source name (zero backend-name branches). It rebuilds the marker via the chat's
 *  OWN model through the injected `runCompaction` → `quietGenerate`. Stateless apis (chat-completions/
 *  anthropic-messages) NEVER generate a marker — the history-budget fit hard-cap is their only trim. The STORED marker is durable chat
 *  state that CARRIES FORWARD on an api swap (the read side is api-moded but source-agnostic; only WRITE is gated).
 *
 *  TRIGGER (either): (1) total context usage ≥ the managed pct of the effective ceiling (PROVIDER-truth usage
 *  preferred, fit estimate fallback) — PROACTIVE; or (2) this turn's fit dropped rows — REACTIVE. The COVERAGE
 *  POINT is the seq just before the earliest-KEPT message (everything above the boundary). A null boundary leaves
 *  no coverage point → no compaction.
 *
 *  SINGLE-FLIGHT + IDEMPOTENT: at most one in-flight compaction per chat; an unchanged coverage point never
 *  re-fires (map guard + the core's `compactedAtSeq` no-op). FAILURE-HONEST: an empty/thrown marker generation
 *  leaves the EXISTING marker untouched and emits a `compaction_failed` warning (never a half-written marker).
 *  Instructions are preset-overridable (`compaction.instructions`), falling back to `DEFAULT_COMPACT_INSTRUCTIONS`.
 *  Fire-and-forget — a background marker build must NEVER fault the committed reply. */
/** The EFFECTIVE compaction config + context cap this turn runs under — the PRESET params (`promptConfig.params`)
 *  folded with the per-send `intent` (per-send wins, mirroring `foldGenerationParams`). CRITICAL: the trigger must
 *  read THIS, not `prep.intent` alone — a preset that sets `compaction.mode:"managed"` + `maxContextTokens` (the
 *  normal UX path) carries them on `promptConfig.params`, never on the per-send intent. Reading `prep.intent`
 *  alone silently never fired the pct arm on a preset-configured chat (the reviewer's 56.9%-no-fire receipt). */
function resolveEffectiveCompaction(prep: TurnPrep): {
  readonly compaction: NonNullable<UserIntent["compaction"]>;
  readonly maxContextTokens: number | undefined;
} {
  const presetParams = prep.assembleContext.promptConfig.params;
  // The whole `compaction` object folds atomically (per-send replaces preset when present), matching the
  // `...base, ...override` spread `foldGenerationParams` applies. This is the item-3 fix — the trigger reads the
  // EFFECTIVE (preset ⊕ intent) config, not `prep.intent` alone, so a preset-configured managed mode + cap fires.
  // OWNER RULING: compaction is a SAFETY property (no chat may error from context growth) — turning it OFF is not
  // an option. Absent on BOTH ⇒ the RESOLVED default `DEFAULT_COMPACTION_MODE` (managed) + the default pct, so an
  // unconfigured agent-sdk chat gets OUR durable marker, never nothing. `auto` can't be the safe floor while its
  // functioning on non-Anthropic backends is unverified (probe-1 gap). ONE home for the default; the UI reads it too.
  const configured = prep.intent.compaction ?? presetParams.compaction;
  return {
    compaction: configured ?? { mode: DEFAULT_COMPACTION_MODE, thresholdPct: MANAGED_COMPACT_DEFAULT_PCT },
    maxContextTokens: prep.intent.maxContextTokens ?? presetParams.maxContextTokens,
  };
}

/** The managed-compaction trigger decision: `true` when this turn's CUMULATIVE context usage crossed the managed
 *  pct OR the fit dropped rows (the reactive arm).
 *
 *  PROACTIVE (pct) SIGNAL — the FIT ESTIMATE is authoritative (`fitUsedTokens`/`fitCeilingTokens`), because it is
 *  cumulative over the FULL canon on EVERY api. Provider `tokensIn` is NOT a reliable cumulative signal on the
 *  agent-sdk stateful path: a RESUMING SDK session reports only the per-turn DELTA (hosted-verified: tokensIn
 *  ≈ 2 after the first turn), so `tokensIn/window` never crosses the pct there. Provider usage is used ONLY as a
 *  corroborating BUMP — if the backend reports a bigger cumulative usage than we estimated (a full-prompt stateless
 *  send), that wins. So the pct arm bites correctly on both paths; the reactive fit-drop arm is the backstop the
 *  hosted stateful path relies on (its fit ceiling = min(window, maxContextTokens) still trims the full canon). */
function compactionTriggered(compaction: NonNullable<UserIntent["compaction"]>, result: Awaited<ReturnType<typeof runTurnPipeline>>): boolean {
  const pct = compaction.thresholdPct ?? MANAGED_COMPACT_DEFAULT_PCT;
  const ceiling = result.fitCeilingTokens;
  const e = result.economics;
  const providerUsed = (e?.tokensIn ?? 0) + (e?.tokensOut ?? 0);
  // The cumulative usage = the greater of our fit estimate and the provider's report (the provider only wins on a
  // stateless full-prompt send; on a resuming SDK session its delta is smaller and the fit estimate governs).
  const cumulativeUsed = Math.max(result.fitUsedTokens, providerUsed);
  const overThreshold = ceiling !== null && ceiling > 0 && cumulativeUsed >= pct * ceiling;
  return overThreshold || result.droppedCount > 0;
}

/** The managed-compaction coverage point (the seq through which the new marker covers). TWO derivations:
 *   • a real FIT boundary exists (the stateless-style trim path, or a future agent-sdk that surfaces one) → the
 *     seq just before the earliest-KEPT row (everything above the boundary);
 *   • no fit boundary (the agent-sdk norm — the SDK owns context, nothing trims) → keep the newest
 *     `MANAGED_VERBATIM_TAIL` rows verbatim and cover everything older (`maxSeq - tail`).
 *  `undefined` when there is nothing old enough to compact (a short chat under the tail) — no coverage this turn. */
function resolveCoveragePoint(
  result: Awaited<ReturnType<typeof runTurnPipeline>>,
  canonAll: readonly MessageView[],
  compaction: NonNullable<UserIntent["compaction"]>,
): number | undefined {
  if (result.contextBoundaryMessageId !== null) {
    const boundarySeq = canonAll.find((m) => m.id === result.contextBoundaryMessageId)?.seq;
    return boundarySeq === undefined ? undefined : boundarySeq - 1;
  }
  const maxSeq = canonAll.at(-1)?.seq ?? 0;
  const coverage = maxSeq - (compaction.verbatimTail ?? MANAGED_VERBATIM_TAIL);
  return coverage > 0 ? coverage : undefined;
}

/** The PRE-TURN managed-compaction decision (the wedge-state fix): estimate the CUMULATIVE prompt-eligible token
 *  cost the NEXT dispatch would carry (above the current coverage point), and if it is already ≥ the managed pct
 *  of the effective ceiling, return the coverage point to compact THROUGH before dispatch. This closes the
 *  wedge where a chat's context already makes the model FAIL (a resumed session overflowing the window): the
 *  post-turn arm never runs on a failing turn, so without this a doomed chat can never compact its way out.
 *  `undefined` ⇒ under threshold / nothing old enough → no pre-turn compaction. */
function preTurnCoveragePoint(args: {
  readonly compaction: NonNullable<UserIntent["compaction"]>;
  readonly connection: Resolved<"chat">;
  readonly maxContextTokens: number | undefined;
  readonly canonAll: readonly MessageView[];
  readonly currentCoverage: number;
}): number | undefined {
  const pct = args.compaction.thresholdPct ?? MANAGED_COMPACT_DEFAULT_PCT;
  const window = generationOf(args.connection).context.window;
  const ceiling = Math.min(window, args.maxContextTokens ?? Number.POSITIVE_INFINITY);
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    return; // no trustworthy ceiling → the pre-check can't threshold (the reactive arm still fires).
  }
  // Cumulative estimate = the prompt-eligible rows ABOVE the current coverage (what the next seed/prompt carries).
  const eligible = args.canonAll.filter((m) => !m.excludedFromPrompt && m.role !== "system" && m.seq > args.currentCoverage);
  const cumulative = eligible.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (cumulative < pct * ceiling) {
    return;
  }
  // Over threshold → compact through everything older than the recent verbatim tail (same rule as the post-turn
  // no-fit-boundary path). Undefined when there is nothing old enough to compact yet.
  const maxSeq = args.canonAll.at(-1)?.seq ?? 0;
  const coverage = maxSeq - (args.compaction.verbatimTail ?? MANAGED_VERBATIM_TAIL);
  return coverage > args.currentCoverage && coverage > 0 ? coverage : undefined;
}

/** Emit a bus event, swallowing any failure — a background warning/update must never re-throw out of the
 *  fire-and-forget compaction body (and a nested `.catch` trips noNestedPromises). */
async function emitQuiet(deps: EngineDeps, event: DurableChatBusEvent): Promise<void> {
  // @orb-waive caught-failure-ownership(catch): `deps.emit` is the chat bus, which already
  // classifies + reports a dropped append (FLAG[emit-is-total], bus.ts) and never rejects in practice — this
  // is the fire-and-forget background-hook's own belt. Ends if `emit` grows a path that can actually reject.
  try {
    await deps.emit(event);
  } catch {
    // A failed emit must never surface from the background hook.
  }
}

/** The fresh marker + coverage stamp a pre-turn compaction produced, overlaid onto THIS turn's assemble ctx so
 *  its assembly already excludes the covered rows. `null` ⇒ no pre-turn compaction ran (ctx unchanged). */
interface CompactionOverlay {
  readonly compactSummary: string;
  readonly compactedThroughSeq: number;
}

/** Overlay a pre-turn compaction's fresh marker/coverage onto the assemble ctx (a fresh shape, never a mutation —
 *  the speaker-card precedent). Null overlay ⇒ the ctx is returned unchanged (byte-identical no-compaction turn). */
function applyCompactionOverlay(ctx: AssembleContext, overlay: CompactionOverlay | null): AssembleContext {
  if (overlay === null) {
    return ctx;
  }
  return { ...ctx, compactSummary: overlay.compactSummary, compactedThroughSeq: overlay.compactedThroughSeq };
}

/** The pre-turn arm's ELIGIBILITY read, lifted out of the orchestration below so its failure arm can stay
 *  inline (where the caught-failure-ownership grammar can see who owns the throw). The EFFECTIVE compaction
 *  config = preset params folded with the per-send intent, per-send wins — reading `prep.intent` alone missed
 *  a preset-configured managed mode + cap (the reviewer's no-fire receipt). A `coveragePoint` of `undefined`
 *  is "not eligible this turn": not managed, not the agent-sdk api, or nothing above the verbatim tail. */
async function preTurnCompactionPlan(
  ctx: ChatContext,
  prep: TurnPrep,
  canonAll: readonly MessageView[],
): Promise<{ readonly coveragePoint: number | undefined; readonly currentCoverage: number; readonly instructions: string }> {
  const { compaction, maxContextTokens } = resolveEffectiveCompaction(prep);
  const chat = await loadChatRow(ctx.db, prep.chatId);
  const currentCoverage = chat?.compactedAtSeq ?? 0;
  const coveragePoint =
    compaction.mode === "managed" && prep.connection.api === "agent-sdk"
      ? preTurnCoveragePoint({ compaction, connection: prep.connection, maxContextTokens, canonAll, currentCoverage })
      : undefined;
  return { coveragePoint, currentCoverage, instructions: compaction.instructions ?? DEFAULT_COMPACT_INSTRUCTIONS };
}

/** The PRE-TURN managed-compaction orchestration (the wedge-state fix): load canon, and when the cumulative
 *  estimate already crosses the managed pct, compact BEFORE dispatch so a chat whose context already overflows
 *  the window can escape (the post-turn arm never runs on a failing turn). Awaited, single-flight, failure-honest
 *  (a failed pre-turn compaction logs + proceeds with the pre-compaction canon — never blocks the turn) but
 *  CANCELLABLE (#1436): the turn's signal rides into the generation, and a cancelled one propagates instead of
 *  being absorbed as a failure. Returns the (possibly reloaded) canon + maxSeq + a marker overlay (null when
 *  nothing compacted). */
async function runPreTurnCompaction(
  ctx: ChatContext,
  deps: EngineDeps,
  prep: TurnPrep,
): Promise<{ readonly canonAll: readonly MessageView[]; readonly maxSeq: number; readonly compactionOverlay: CompactionOverlay | null }> {
  const canonAll = await loadCanonHistory(ctx.db, prep.chatId);
  const { coveragePoint, currentCoverage, instructions } = await preTurnCompactionPlan(ctx, prep, canonAll);
  // No pre-turn compaction: return the loaded canon untouched (still avoids a second DB read for maxSeq).
  if (coveragePoint === undefined || compactionInFlight.has(prep.chatId)) {
    return { canonAll, maxSeq: canonAll.at(-1)?.seq ?? 0, compactionOverlay: null };
  }
  const { chatId } = prep;
  compactionInFlight.add(chatId);
  let overlay: CompactionOverlay | null = null;
  try {
    const res = await deps.runCompaction({
      chatId,
      connection: prep.connection,
      ownerId: prep.runAsUserId,
      coveragePoint,
      instructions,
      // CANCELLABLE (#1436). This arm is AWAITED before dispatch, so it is on the caller's Stop path: without
      // the signal the turn kept paying for — and blocking on — a whole summary generation nobody was waiting
      // for, and only noticed the cancellation afterwards. The post-turn hook is deliberately NOT threaded
      // (it is fire-and-forget under its own detached span, outliving the request by design).
      signal: prep.signal,
    });
    if (res.updated) {
      overlay = { compactSummary: res.summary, compactedThroughSeq: res.compactedAtSeq };
    }
  } catch (compactErr) {
    // A CANCELLED compaction is not a FAILED one (#1436). The failure-honest arm below exists so a BROKEN
    // summarizer cannot wedge a turn that could still succeed; a cancelled turn has no such turn to protect,
    // and absorbing its abort here would log a summariser fault that never happened, strike out the user's
    // credential for it, and then dispatch the very generation the caller just cancelled. Re-thrown so
    // `executeTurn`'s catch classifies it exactly like a cancelled generation (user/stale → `abortedOutcome`,
    // no dispatch). The classification is `abortReasonFor`'s — one home, so this seam can never disagree with
    // the turn's own about what a cancellation is.
    if (abortReasonFor(compactErr, prep.signal) !== "error") {
      throw compactErr;
    }
    // FAILURE-HONEST: a failed pre-turn compaction NEVER blocks the turn — log + proceed with the current canon.
    getLog().warn({ err: compactErr, chatId }, "chat: pre-turn managed compaction failed (proceeding)");
    // …but a swallowed failure is exactly where a dead key hides: this arm exists to rescue a chat already
    // over its window, so without the strike-out that chat re-dials the rejected key on every attempt and
    // the operator sees only a warn line.
    await strikeOutCredential(ctx, prep, compactErr);
  } finally {
    compactionInFlight.delete(chatId);
  }
  if (overlay !== null) {
    const reloaded = await loadCanonHistory(ctx.db, chatId);
    await emitQuiet(deps, { type: "chatUpdated", chatId });
    return { canonAll: reloaded, maxSeq: reloaded.at(-1)?.seq ?? 0, compactionOverlay: overlay };
  }
  // THE NO-WALL BELT (owner ruling — compaction is a safety property): the pre-turn arm wanted to compact but NO
  // usable marker materialized (the generation kept failing/empty). If the context is already AT/OVER the effective
  // WINDOW, the turn would march into the wall — so we DEGRADE loudly: the DOMAIN fit-pass drop-oldest trims the
  // shaped history at the window (→ a shorter agent-sdk seed → a reseed; the turn SURVIVES, no summary), and we
  // emit a VISIBLE warning. Degraded-and-loud, never error-and-dead.
  if (contextAtOrOverWindow(prep.connection, canonAll, currentCoverage)) {
    await emitQuiet(deps, { type: "warning", chatId, code: "context_trimmed_no_summary" });
  }
  return { canonAll, maxSeq: canonAll.at(-1)?.seq ?? 0, compactionOverlay: null };
}

/** Whether the prompt-eligible context above the current coverage is AT/OVER the model's effective context WINDOW
 *  — the no-wall belt's trip condition (a turn dispatched now would overflow). Estimator-based (the same
 *  `estimateTokens` the fit uses); the fit-pass then does the actual drop-oldest trim at the window. */
function contextAtOrOverWindow(connection: Resolved<"chat">, canonAll: readonly MessageView[], currentCoverage: number): boolean {
  const window = generationOf(connection).context.window;
  if (!Number.isFinite(window) || window <= 0) {
    return false;
  }
  const eligible = canonAll.filter((m) => !m.excludedFromPrompt && m.role !== "system" && m.seq > currentCoverage);
  const cumulative = eligible.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  return cumulative >= window;
}

/** The managed-compaction marker build's own trace root (I-7 finding: found alongside the three named holes —
 *  same outlives-the-request class, same file, same fire-and-forget shape, so fixed in this lane too). */
const COMPACTION_SPAN = "chat.managedCompaction";

/** The trace-ring request id the compaction build is bucketed under — its OWN id, for the same reason
 *  `rpgRoundRequestId` gives one to the rpg round. Keyed by the TRIGGERING turn (not just `chatId`): the
 *  single-flight Set below is chat-scoped, but the trace should still tie back to which turn fired it. */
function compactionRequestId(turnId: ChatTurnId): string {
  return `compaction-turn:${turnId}`;
}

function fireManagedCompaction(
  ctx: ChatContext,
  deps: EngineDeps,
  prep: TurnPrep,
  turn: { readonly turnId: ChatTurnId; readonly result: Awaited<ReturnType<typeof runTurnPipeline>>; readonly canonAll: readonly MessageView[] },
): void {
  const { turnId } = turn;
  // The EFFECTIVE compaction config (preset params folded with the per-send intent) — NOT `prep.intent` alone.
  const { compaction } = resolveEffectiveCompaction(prep);
  // WRITE is agent-sdk-API-only (the runner axis) — a stateless api never generates a marker.
  if (compaction.mode !== "managed" || prep.connection.api !== "agent-sdk" || !compactionTriggered(compaction, turn.result)) {
    return;
  }
  const coveragePoint = resolveCoveragePoint(turn.result, turn.canonAll, compaction);
  if (coveragePoint === undefined) {
    return;
  }
  const { chatId } = prep;
  // SINGLE-FLIGHT: one marker build per chat at a time. The unchanged-coverage-point skip is DURABLE (the core's
  // `compactedAtSeq` no-ops an already-covered point → `updated:false`, no generation), so no per-chat map leaks.
  if (compactionInFlight.has(chatId)) {
    return;
  }
  compactionInFlight.add(chatId);
  const instructions = compaction.instructions ?? DEFAULT_COMPACT_INSTRUCTIONS;
  const connection = prep.connection;
  const ownerId = prep.runAsUserId;
  void withRequestSpan(compactionRequestId(turnId), COMPACTION_SPAN, { chatId, turnId, coveragePoint }, async () => {
    try {
      const res = await deps.runCompaction({ chatId, connection, ownerId, coveragePoint, instructions });
      // `updated:false` is a benign no-op (already covered / all-hidden span) — nothing changed, nothing to
      // surface. An EMPTY generation over a real span THROWS (handled below), never a silent `updated:false`.
      if (res.updated) {
        // The divider re-reads previewContextFit and picks up the memory fact.
        await emitQuiet(deps, { type: "chatUpdated", chatId });
      }
    } catch (compactErr) {
      // FAILURE-HONEST: a thrown marker build (provider error OR empty generation) leaves the existing marker
      // untouched and surfaces the `compaction_failed` warning (the memory_build_failed mirror).
      getLog().warn({ err: compactErr, chatId }, "chat: managed compaction failed");
      await strikeOutCredential(ctx, prep, compactErr);
      await emitQuiet(deps, { type: "warning", chatId, code: "compaction_failed" });
      // Rethrow so the span marks itself ERROR (I-7: previously swallowed here too). Still fire-and-forget —
      // the outer `.catch` below absorbs it.
      throw compactErr;
    } finally {
      compactionInFlight.delete(chatId);
    }
  }).catch(() => undefined);
}

/** Mark the turn eligible to feed the player's queued d20 into its first skill check (docs/plans/rpg/design.md) — only
 *  when its reply directly responds to the die-bearing latest user message (chat's slot-adjacency verdict). Sync
 *  in-memory flag keyed by `turnId`; null op / non-game ⇒ no-op. A later GM/auto round is never marked, so a
 *  stale die can't re-feed. */
function markRpgDiceEligible(ctx: ChatContext, prep: TurnPrep, turnId: ChatTurnId): void {
  if (prep.respondsToLatestUserTurn === true) {
    ctx.rpg?.markDicePreRollEligible(turnId);
  }
}

/** Scopes the loaded canon to the turn's context window: new-slot sees the full canon; append-variant
 *  regenerates from before the target slot; continue sees up to and including it. */
function scopeCanon(canon: readonly MessageView[], persist: TurnPersist, target: SlotTarget | null): readonly MessageView[] {
  if (persist.mode === "new-slot" || target === null) {
    return canon;
  }
  return persist.mode === "append-variant" ? canon.filter((m) => m.seq < target.seq) : canon.filter((m) => m.seq <= target.seq);
}

/**
 * The `messages.seq` of the slot this turn's tokens stream INTO — the D16 classification anchor stamped on
 * every `delta` bus event (`ChatBusEvent`'s delta arm → `slotSeq`), so `substrate/auth::isBelowHistoryFloor`
 * can decide raw transcript text the same way it decides a `MessageView`. Same target resolution
 * `scopeCanon`/`commitGeneration` already use, no extra read:
 *
 *  • append-variant / continue ⇒ the LOADED target slot's own `seq` — so a host swiping or continuing a
 *    PRE-join slot streams below a clamped member's floor and is withheld (the leak this closes).
 *  • new-slot ⇒ the allocated tail `maxSeq + 1` (the same number `commitGeneration` gets as `nextSeq`) — at
 *    or above every present member's join floor, so a post-join turn streams to everyone entitled to it.
 *
 * Truthful, never fabricated. The one skew is the new-slot seq-unique retry (`commitGeneration` re-derives a
 * HIGHER head when a concurrent turn takes the seq): the row then lands ABOVE the announced anchor, so the
 * announcement errs toward withholding, never toward leaking.
 */
function resolveSlotSeq(persist: TurnPersist, target: SlotTarget | null, maxSeq: number): number {
  return persist.mode === "new-slot" || target === null ? maxSeq + 1 : target.seq;
}

/** The abort reason the heartbeat stamps onto its internal AbortController when the turn-lock is lost mid-turn.
 *  `signal.reason` carries it through `AbortSignal.any` to the provider stream, so the engine's catch can tell
 *  a lock-fault abort ("stale") from a caller cancel ("user") — the provider itself only ever surfaces a bare
 *  name-based AbortError, which erases the distinction. */
class StaleLockAbort extends Error {
  constructor() {
    super("turn-lock lost mid-turn (stolen or gone)");
    this.name = "StaleLockAbort";
  }
}

/** Classify a post-turnStarted throw into its {@link TurnAbortReason}, consulting the turn's abort signal so a
 *  lock-fault abort is distinguishable from a caller cancel. A settled (aborted) signal means the throw is an
 *  abort, not a fault: `StaleLockAbort` reason → "stale" (the heartbeat killed it); any other aborted-signal
 *  cause → "user" (the caller cancelled via `activeTurns`). A throw with an UN-aborted signal is a genuine
 *  fault (provider/DB) → "error".
 *
 *  …EXCEPT the commit fence's own refusal (#1537). {@link assertTurnMayCommit} can find the lock gone up to a
 *  whole heartbeat interval (TTL/3) BEFORE the heartbeat next ticks, so at that instant nothing has aborted
 *  the signal — and the signal-only classification labelled a lost-lock refusal `"error"`, which is what the
 *  `turnAborted` bus event and the wire-fault outcome row then told the operator. `CHAT_OP_CODES.aborted` is
 *  minted at exactly two sites and both are lock-loss, so the code IS the fact: it is "stale" whether the
 *  heartbeat had got there yet or not. Same reason, same `abortedOutcome` return, same loud surfaces — the
 *  fence logs at ERROR and the bus carries `turnAborted{reason:"stale"}`.
 *
 *  AN ERROR'S NAME IS NEVER PROOF OF A CANCELLATION (#1435). The rule is one sentence: an abort is proven by
 *  a cancellation this engine OWNS — an aborted signal (whose `reason` then says which arm) or chat's own
 *  typed `aborted` refusal — and nothing else. The removed belt classified any error merely NAMED
 *  `AbortError` as `"user"` with the signal NOT aborted; `AbortError` is the name provider timeouts,
 *  SDK-internal cancellations and unrelated libraries all throw under, so a real provider fault was swallowed
 *  into `abortedOutcome` and the operator was told a user pressed Stop. The belt cannot be sound in either
 *  direction: an abort we own always settles the signal SYNCHRONOUSLY at `abort()` — before any provider can
 *  observe it and throw — so there is no window in which a genuine cancel arrives with an un-aborted signal,
 *  and a fault mislabelled `"user"` is invisible twice over (it returns clean AND never reaches the fault
 *  surfaces). A future provider-side cancellation that is NOT ours becomes classifiable by adding a TYPED
 *  cause (the {@link StaleLockAbort} shape), never by re-reading a name. */
function abortReasonFor(err: unknown, signal: AbortSignal | undefined): TurnAbortReason {
  if (err instanceof ChatOperationError && err.code === CHAT_OP_CODES.aborted) {
    return "stale";
  }
  if (signal?.aborted === true) {
    return signal.reason instanceof StaleLockAbort ? "stale" : "user";
  }
  return "error";
}

/**
 * The EMPTY-GENERATION guard (VER-1b). A completion that produced no prose is NOT a reply, and committing one
 * is the observed defect: the variant lands invisible AND — on a swipe — the slot's `selectedVariantId` flips
 * to it, hiding the real prose siblings behind a blank bubble (evidence: a tool-only completion on a wire that
 * silences prose when `tools[]` ride). So the turn FAILS loudly and writes NOTHING: no variant, no stats delta,
 * no pointer flip. The pointer is only ever moved by the commit batch (`appendVariantStatements` inserts the
 * variant and flips in ONE `db.batch`), so refusing before the commit is what leaves the PRIOR variant selected
 * — there is no optimistic flip to undo.
 *
 * ZERO-content ONLY. A PARTIAL generation is real content the user may want and commits normally; an ABORT
 * (caller cancel / stale lock) never reaches here at all — the pipeline throws and `executeTurn`'s catch
 * commits nothing, whether or not tokens streamed.
 *
 * There is no longer any exempt empty-slot path to carve out: rpg's deliberate content-less "state anchor"
 * slots are gone (D124 — hand state is a message-less `rpg_snapshots` row), and `postNarratorMessage` itself
 * now refuses a blank post. Empty canon content is uniformly a defect, wherever it is written.
 */
/** The RESPONSE half of wire capture (`/api/_debug/wire/outcomes`). Called BEFORE the empty-generation guard
 *  so a REFUSED turn still leaves the record that explains it — the case the request-only ring could never
 *  answer. Self-gated inside the recorder (no-op with capture off); metadata + tool-call args, never prose.
 *  Its FAULT twin is {@link captureTurnFault} — this arm can only ever run on a pipeline that RESOLVED. */
function captureTurnOutcome(prep: TurnPrep, result: Awaited<ReturnType<typeof runTurnPipeline>>, at: number): void {
  const economics = result.economics;
  recordTurnOutcome({
    chatId: prep.chatId,
    at,
    model: economics?.model ?? null,
    disposition: "completed",
    finishReason: economics?.finishReason ?? null,
    stopReason: economics?.stopReason ?? null,
    terminalReason: economics?.terminalReason ?? null,
    contentChars: result.content.length,
    reasoningChars: result.reasoning?.length ?? 0,
    tokensOut: economics?.tokensOut ?? null,
    maxOutputTokens: economics?.maxOutputTokens ?? null,
    modelCalls: economics?.modelCalls ?? null,
    reasoningEffort: economics?.reasoningEffort ?? null,
    toolCalls: result.toolRecords.map((record) => ({ name: record.name, args: record.arguments })),
    // The RAW provider degradations, operator prose and all — the half the user's re-voiced chat warning
    // deliberately does not carry (#1440). This ring is where "which knob did the provider refuse, and what
    // did it clamp to" is answered after the fact.
    warnings: result.runnerWarnings.map((warning) => ({ code: warning.code, message: warning.message })),
  });
}

/**
 * The `ProviderError` behind a thrown generation, or `null` when the throw did not come from the provider
 * layer at all (a DB fault, a bug, a `ChatOperationError`). The ONE classifier both provider-fact readers
 * below share — the outcome ring's terminal reason and the credential strike-out — so they can never
 * disagree about whether a failure was the provider's.
 *
 * Walks the `.cause` chain rather than dereferencing once — the `classifyDomainError` precedent: a re-wrap
 * layer anywhere between the runner and this catch would otherwise erase the whole classification. The
 * `seen` set makes a cyclic cause chain terminate.
 */
function providerErrorOf(err: unknown): ProviderError | null {
  let cause: unknown = err;
  const seen = new Set<unknown>();
  while (cause instanceof Error && !(cause instanceof ProviderError) && cause.cause !== undefined && !seen.has(cause)) {
    seen.add(cause);
    cause = cause.cause;
  }
  return cause instanceof ProviderError ? cause : null;
}

/**
 * The provider's OWN classification of a thrown turn, or `null`. NEVER re-derived: the fact is minted
 * inside infra (`ProviderError.terminalReason` is the raw backend terminal/subtype string, `kind` the
 * normalized collapse) and only threaded out here.
 */
function providerTerminalReason(err: unknown): string | null {
  const provider = providerErrorOf(err);
  return provider === null ? null : (provider.terminalReason ?? provider.kind);
}

/**
 * THE POST-GENERATION CREDENTIAL STRIKE-OUT (#1373) — reached from the three seams that own a failed
 * provider generation on THIS turn's connection: the main turn, the pre-turn compaction and the post-turn
 * compaction hook (both compaction arms run `quietGenerate` over `prep.connection`, so their catch owns
 * that generation by construction). Without it a provider that has rejected the user's key is re-dialled
 * with that same dead key on every subsequent turn, forever, and `user_credentials.revoked_at` never
 * records the one cause its own schema comment advertises.
 *
 * "Owns the generation" is a claim the MAIN-TURN arm has to EARN rather than assume — its catch wraps the
 * whole turn body, side roles included. {@link strikeOutOnTurnFault} is where that is enforced, by error
 * identity; read it before adding a fourth call site.
 *
 * Three threading rules, each load-bearing:
 *   • THE CLASSIFICATION IS THE PROVIDER'S. Only a `ProviderError` reaches the op at all — a DB fault or a
 *     bug of ours must never cost a user their key — and its normalized `kind` travels verbatim. WHICH kind
 *     revokes is not decided here: `domain/credentials/verbs/maybe-revoke-on-auth-failed.ts` is the one home
 *     of that policy, so all three seams follow it without re-spelling the conditional.
 *   • THE CREDENTIAL IS THE ONE THIS GENERATION RAN UNDER — `connection.credential.credentialId`, minted for
 *     the run-as principal at dispatch — never a fresh resolve afterwards, which under a rotate/set-active
 *     race would revoke the replacement key the user just fixed. Keyless sources carry `null` and no-op.
 *   • IT IS A PASSENGER. It runs INSIDE a catch that is about to surface the generation's own error, so a
 *     throw here would replace that error with an unrelated one (emits-are-total). Caught and logged.
 *
 * `ProviderError.message` is contractually secret-free (infra/providers/contract/errors.ts's SECURITY note:
 * messages are built from the source/role/backend vocabulary, never the credential), which is what makes it
 * safe to carry into the credential audit + security-event trail.
 */
async function strikeOutCredential(ctx: ChatContext, prep: TurnPrep, err: unknown): Promise<void> {
  const provider = providerErrorOf(err);
  if (provider === null) {
    return;
  }
  try {
    await ctx.maybeRevokeOnAuthFailed({
      ownerId: prep.funderUserId,
      credentialId: prep.connection.credential.credentialId,
      errorKind: provider.kind,
      errorMessage: provider.message,
    });
  } catch (revokeErr) {
    getLog().warn({ err: revokeErr, chatId: prep.chatId }, "chat: the post-generation credential strike-out failed (the generation's own error is unaffected)");
  }
}

/** The sentinel {@link TurnFault.generationFault} carries when the generation region never threw. A private
 *  Symbol, deliberately NOT `undefined`/`null`: `throw undefined` is legal JS, and the identity test below
 *  must not accidentally match one. */
const NO_GENERATION_FAULT = Symbol("no-generation-fault");

/** Run the generation region, RECORD the identity of what it threw, and rethrow untouched. That recorded
 *  identity is what licenses the credential strike-out — see {@link strikeOutOnTurnFault}. */
async function capturingGenerationFault<T>(record: (err: unknown) => void, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    record(err);
    throw err;
  }
}

/** What {@link executeTurn}'s catch knows about the throw it is holding. */
interface TurnFault {
  readonly err: unknown;
  readonly reason: TurnAbortReason;
  /** The error the GENERATION region threw, or {@link NO_GENERATION_FAULT} when it did not. */
  readonly generationFault: unknown;
}

/**
 * The MAIN TURN's arm of {@link strikeOutCredential}. Two conditions, and the second is the load-bearing one.
 *
 * `reason === "error"` — an ABORT (caller cancel or a lost turn-lock) is not evidence about the key even when
 * a backend had already classified an auth failure as the cancel landed: the turn was killed from OUR side,
 * so the fail-safe answer on an ambiguous outcome is to leave the credential alone.
 *
 * `err === generationFault` — A POSITIVE ORIGIN TEST, not "the turn body failed" (#1373 chunk J). This catch
 * wraps the WHOLE body, and the body also runs the per-speaker memory recall: `resolveSpeakerMemory` →
 * `deps.recallMemory` → `ctx.searchDigests` → `ctx.roleClients.embed`, awaited with no catch of its own
 * (`domain/search/verbs/digests.ts`). A ROLE CLIENT resolves its OWN credential per call, so an `embed` role
 * pinned to a different provider can 401 on ITS key and land here — and striking on that revokes the CHAT's
 * credential, a key that provider never saw, then tells the user through `revoked_reason: auth_failed` that
 * it was rejected. A self-inflicted lockout plus a false statement, from a body that merely failed somewhere.
 * Identity, not shape: only the error the generation ITSELF threw may strike the credential the generation
 * ran under. Everything else in the body — the durable-delta drain, the empty-generation refusal, a persist
 * fault, any side role — is a turn failure that says nothing about this key.
 */
async function strikeOutOnTurnFault(ctx: ChatContext, prep: TurnPrep, fault: TurnFault): Promise<void> {
  if (fault.reason !== "error" || fault.err !== fault.generationFault) {
    return;
  }
  await strikeOutCredential(ctx, prep, fault.err);
}

/**
 * The FAULT half of the outcome ring — the row an operator actually goes looking for.
 *
 * WHY IT EXISTS (reproduced 3/3): `captureTurnOutcome` runs only
 * after `runTurnPipeline` RESOLVES, so a turn that THREW could not leave a `/api/_debug/wire/outcomes` row
 * by construction. A live 110-second agent-sdk turn ended `terminalReason:"api_error"`, logged loudly to
 * pino — and left the outcome ring at `count:0` while the client got a bare 500. Every field the reader
 * needs already existed one layer down; nothing recorded it.
 *
 * WHAT IT CAN HONESTLY SAY: the turn's identity + route + the error's own classification. It deliberately
 * does NOT fabricate the generation numbers (`tokensOut`/`maxOutputTokens`/`modelCalls`/finish reasons) —
 * a faulted turn produced no `final` chunk, so the engine holds none of them, and a zero here would read as
 * a measurement rather than an absence (the "absent data renders absent, never floor-synthesized" rule).
 * `model` + `reasoningEffort` come off `prep` (the REQUESTED route): a faulted turn applied nothing, so the
 * requested effort is the only honest fact this RING can carry. The success arm differs on purpose — its
 * `economics.reasoningEffort` is the APPLIED effort compose reads off `ChatResult.appliedEffort` (inference
 * audit B1), and the variant ROW records that; the ring is diagnostics, not the record.
 *
 * THROW-SAFE BY CONSTRUCTION (emits-are-total): an observability write must never mask or replace the
 * original error, so the whole body is wrapped. A recorder failure degrades to a warn line and the caller's
 * rethrow proceeds untouched.
 */
function captureTurnFault(prep: TurnPrep, err: unknown, reason: TurnAbortReason, at: number): void {
  try {
    recordTurnOutcome({
      chatId: prep.chatId,
      at,
      model: prep.connection.model,
      disposition: reason,
      finishReason: null,
      stopReason: null,
      terminalReason: providerTerminalReason(err) ?? reason,
      contentChars: 0,
      reasoningChars: 0,
      tokensOut: null,
      maxOutputTokens: null,
      modelCalls: null,
      reasoningEffort: prep.intent.effort ?? null,
      toolCalls: [],
      // A fault threw out of the pipeline, so no warning it may have carried survived to this arm.
      warnings: [],
    });
  } catch (recordErr) {
    getLog().warn({ err: recordErr, chatId: prep.chatId }, "chat: the turn-fault outcome record failed (the original turn error is unaffected)");
  }
}

/** §6.7 — ABSORB the pictures the model emitted inside its own reply: store each under the ROOM HOST, then
 *  splice its `![alt](asset:<id>)` span into the body where it arrived. Returns the turn result the commit
 *  persists plus the ids that commit must link.
 *
 *  IT RUNS BEFORE {@link assertGeneratedContent}, and that ordering is the feature: a picture-only reply
 *  (bytes, no prose) is a real answer from an image-output model, and the spans ARE its body — the same rule
 *  `verbs/post-narrator-message.ts` states for a media-only illustration post (D124: media-only counts). Run
 *  after the assert, the turn would be refused as prose-less with the pictures already paid for.
 *
 *  SEQUENTIAL, not `Promise.all`: each store is a CAS write, the count is small (a picture or two per reply),
 *  and arrival order is what the splice depends on.
 *
 *  A STORE THAT REFUSES LOSES THAT PICTURE ONLY. No span is emitted for it, so canon never names an asset
 *  that does not exist, and the prose — which is the product — commits untouched. The user is told ONCE per
 *  turn (`reply_image_failed`), never once per picture: one turn's author is owed one notice.
 *
 *  STORE-THEN-LINK, and a crash between them leaves an UNREFERENCED blob rather than a link pointing at
 *  nothing — the deliberate direction, and the same one `imagery/substrate/generate-core.ts` states for its
 *  own pair. The orphan is swept by the weekly `assets-gc` past its put→link grace; the inverse would be a
 *  message whose body names an asset that was never written. */
async function absorbInlineReplyImages(
  ctx: ChatContext,
  deps: EngineDeps,
  prep: TurnPrep,
  result: Awaited<ReturnType<typeof runTurnPipeline>>,
): Promise<{ result: Awaited<ReturnType<typeof runTurnPipeline>>; assetIds: readonly AssetId[] }> {
  if (result.replyImages.length === 0) {
    return { result, assetIds: [] };
  }
  const placed: PlacedInlineImage[] = [];
  let refused = 0;
  for (const image of result.replyImages) {
    // The HOST owns the bytes (§6.7): `GET /api/blob/:hash` is owner-gated (D21), so a picture stored under a
    // member funder would render for that member alone in a shared room.
    const stored = await ctx.storeInlineReplyImage(prep.runAsUserId, image);
    if (stored === null) {
      refused += 1;
      continue;
    }
    placed.push({ assetId: stored.assetId, atChars: image.atChars ?? result.content.length });
  }
  if (refused > 0) {
    await deps.emit({ type: "warning", chatId: prep.chatId, code: "reply_image_failed" });
  }
  return { result: { ...result, content: spliceInlineReplyImages(result.content, placed) }, assetIds: placed.map((p) => p.assetId) };
}

function assertGeneratedContent(result: Awaited<ReturnType<typeof runTurnPipeline>>, chatId: ChatId): void {
  if (result.content.trim().length > 0) {
    return;
  }
  // OBSERVABILITY, before the throw. `ChatOperationError` surfaces to the client through tRPC and lands in NO
  // server log, so a refusal used to leave zero trace: no finish reason, no tool count, nothing to tell a
  // tool-only completion apart from a provider that returned nothing at all. Diagnosing one meant asking the
  // operator what they saw in the browser. These are exactly the fields that discriminate the causes.
  //
  // `toolRecords` is 0 on a FOLDED rpg turn by construction (its terminal tools deliberately land no
  // `ToolCallRecord` — the character turn is tool-less on the variant), so read `finishReason` as the tell
  // there: a tool-terminated turn with empty prose is the VER-1b tool-only completion.
  const economics = result.economics;
  getLog().warn(
    {
      event: "chat.generation.empty",
      chatId,
      finishReason: economics?.finishReason ?? null,
      stopReason: economics?.stopReason ?? null,
      toolRecords: result.toolRecords.length,
      reasoningChars: result.reasoning?.length ?? 0,
      tokensOut: economics?.tokensOut ?? null,
      maxOutputTokens: economics?.maxOutputTokens ?? null,
      reasoningEffort: economics?.reasoningEffort ?? null,
    },
    "chat: the model produced no prose — turn REFUSED, nothing written (VER-1b empty-generation guard)",
  );
  throw new ChatOperationError(CHAT_OP_CODES.emptyGeneration, emptyGenerationMessage(result));
}

/** `finishReason` is the NORMALIZED tuple (every wire folds its raw `stop_reason` onto it in the runtime), so
 *  "the output budget ran out" and "the model stopped to call tools" are ONE member each — the raw word is
 *  opaque provenance and is never consulted here (§5.3c class 4). */
const BUDGET_FINISH_REASON: NormalizedFinishReason = "length";
const TOOL_FINISH_REASON: NormalizedFinishReason = "tool";

/**
 * WHAT HAPPENED, not "no text" (dogfood EMPTYGEN-REASONING). The single generic string cost this project a
 * multi-day misdiagnosis: three distinct failures — a model that discharged the turn into tool calls, a model
 * that spent its whole budget thinking, and a provider that returned nothing at all — presented to the operator
 * as one indistinguishable sentence, and the server logged none of them. The observability half shipped first
 * (the warn above); this is the half the person in the browser reads.
 *
 * Each arm names the cause AND the lever, because an error a user can act on is worth more than an accurate
 * one they cannot. The turn-is-unchanged clause is kept on every arm — it is the reassurance that matters most
 * at the moment of failure, and it was the one genuinely good thing about the old string.
 */
function emptyGenerationMessage(result: Awaited<ReturnType<typeof runTurnPipeline>>): string {
  const unchanged = "nothing was written (the previous reply is unchanged)";
  const finish = result.economics?.finishReason ?? null;
  if (finish === BUDGET_FINISH_REASON) {
    // On a reasoning wire `maxOutputTokens` caps THINKING AND RESPONSE TOGETHER, so a model at medium effort
    // can spend the entire budget deliberating and emit no prose at all. Naming the number is the point: the
    // fix is the preset's, and a user told "no text" has no way to find it.
    const cap = result.economics?.maxOutputTokens;
    const capText = cap === null || cap === undefined ? "its output limit" : `its output limit of ${String(cap)} tokens`;
    return `the model used ${capText} before writing any of the reply — raise the preset's max output tokens (with reasoning on, that limit covers the model's thinking too), ${unchanged}`;
  }
  if (finish === TOOL_FINISH_REASON) {
    // Reached only when RECOVERY did not apply or did not rescue it: the folded path re-runs this turn for its
    // narrative (`recover-narrative.ts`), so this arm now means the model called tools and then declined to
    // narrate TWICE, or that tools rode on a path with no recovery channel.
    return `the model answered with tool calls and no story text, ${unchanged}`;
  }
  return `the model returned no text — ${unchanged}`;
}

/** This turn's cascade depth: a human turn is 0; an automation/plugin-initiated turn
 *  carries `parent + 1` on `prep`. Extracted so the nullish default stays OUT of `executeTurn`'s cognitive
 *  budget — the value rides the `turnAborted` event (the abort commits no reply slot to read depth back from). */
function turnCascadeDepth(prep: TurnPrep): number {
  return prep.automationDepth ?? 0;
}

/** Per-speaker witnessed recall (D6): re-resolve `{{memory}}` for THIS speaker's own egocentric bucket,
 *  horizon-filtered by its join/leave presence, and return a fresh assembleContext with that `memory`.
 *
 *  GATED to a genuinely SCOPED per-speaker turn voiced by a real seated character:
 *    • `shape.cardScope === "scoped"` — merged/narrator/solo keep the round-level shared recall (the synthetic
 *      group char has no participant seat → no horizons; scoping it would erase the bucket). Narrator resolves
 *      to `cardScope: "merged"` (round.ts maps any non-per-speaker output → "merged"), so it never reaches the
 *      scoped branch — the merged view is correct there.
 *    • the speaker is a real character (`speakerCharacterId !== null`) — an agent seat has no memory bucket.
 *    • `memoryRecall` was staged (memory on + a character to key on).
 *  Any gate off ⇒ the round-level ctx passes through UNCHANGED (byte-identical). A speaker present since the
 *  chat opened resolves the SAME pool as the round-level recall (its horizon covers everything) — no
 *  regression; only a late-joiner / kicked-rejoined speaker sees a filtered, egocentric memory. */
async function resolveSpeakerMemory(ctx: ChatContext, deps: EngineDeps, prep: TurnPrep): Promise<AssembleContext> {
  const speakerCharId = prep.speakerCharacterId;
  const recall = prep.memoryRecall;
  if (prep.shape?.cardScope !== "scoped" || speakerCharId === null || recall === undefined || recall === null) {
    if (recall !== undefined && recall !== null) {
      await emitRetrievalWarningsOnce(deps, prep.chatId, recall.warningEpisode);
    }
    return prep.assembleContext;
  }
  const witnessing = await deps.loadWitnessHorizons(ctx.db, prep.chatId, speakerCharId);
  const recalled = await deps.recallMemory(ctx, {
    scope: { chatId: prep.chatId, scopedCharacterId: speakerCharId, isGroup: true },
    groupCharacterId: recall.groupCharacterId,
    witnessing,
    config: recall.config,
    recent: recall.recent,
    names: recall.names,
    warningEpisode: recall.warningEpisode,
    ...(recall.liveWindowCutoffSeq !== undefined ? { liveWindowCutoffSeq: recall.liveWindowCutoffSeq } : {}),
  });
  await emitRetrievalWarningsOnce(deps, prep.chatId, recall.warningEpisode);
  // The per-speaker recall REPLACES the round-level one, so its trace replaces the round-level trace too —
  // the ctx a speaker's BUILD reads must explain the memory that speaker actually got (#250).
  return { ...prep.assembleContext, memory: recalled.text, memoryTrace: recalled.trace };
}

/** The engine owns the typed bus literals and emits only after `turnStarted`; the shared episode owns
 * round-level/per-speaker/databank dedupe for this turn.
 *
 * TWO CLASSES, DRAINED INDEPENDENTLY (#2510). `retrieval_index_unavailable` says the owner's vector space
 * could not be queried at all, so `{{memory}}` and/or `{{databank}}` came back empty;
 * `memory_rerank_unavailable` says recall DID retrieve and only lost the cross-encoder order. A turn can hit
 * both, and collapsing them would tell a user their reranker failed when they have no queryable index. */
async function emitRetrievalWarningsOnce(deps: EngineDeps, chatId: ChatId, episode: TurnRetrievalWarningEpisode): Promise<void> {
  if (episode.takeIndexUnavailable()) {
    await deps.emit({ type: "warning", chatId, code: "retrieval_index_unavailable" });
  }
  if (episode.takeRerankUnavailable()) {
    await deps.emit({ type: "warning", chatId, code: "memory_rerank_unavailable" });
  }
}

/** What the PRE-START half resolved: the loaded write target (null for a new slot). */
interface PreStartResolution {
  readonly target: NonNullable<Awaited<ReturnType<typeof loadSlotTarget>>> | null;
}

/** The PRE-START half of the lifecycle: resolve the persist target, then run the security belts. Every throw
 *  here happens BEFORE `turnStarted` — a refusal, not an aborted turn. Extracted so {@link executeTurn} can
 *  wrap exactly this region in the accepted-slot close (and to keep its complexity budget). */
async function runPreStart(ctx: ChatContext, prep: TurnPrep, persist: TurnPersist): Promise<PreStartResolution> {
  // append-variant/continue load the write target before turnStarted — a missing target is a pre-start
  // refusal (leak-free NOT_FOUND). Resolved FIRST (before the consent/budget belts) so the agent-speaker id +
  // its connection are known while the belts still gate — a refused turn never debits budget, and the belt
  // sees the ACTUAL connection.
  const target = persist.mode === "new-slot" ? null : ((await loadSlotTarget(ctx.db, prep.chatId, persist.targetMessageId)) ?? null);
  if (persist.mode !== "new-slot" && target === null) {
    throw new ChatNotFoundError(prep.chatId);
  }
  // No separate spend belt runs here: accepting the host seat accepts liability for turns in the room, and
  // the already-resolved host connection is frozen on the prep.
  return { target };
}

/** Closes the client turn slot a PRE-START refusal would otherwise strand OPEN (a stuck Stop button). Fires
 *  ONLY for a turn whose caller announced its acceptance (`prep.slotAccepted` — the verb emitted
 *  `turnAccepted`); a turn nobody accepted keeps the historical bus-silent refusal.
 *
 *  `reason:"error"` — a refusal is a fault, not a cancel: it is never the caller's Stop (that arrives through
 *  `prep.signal`, post-start), and it is not the heartbeat's lock-loss "stale". The client's bus notice is
 *  deliberately silent for "error" because the coded throw ALSO rides the caller's tRPC error boundary
 *  (`turn-abort-notice.ts` — notifying on both paths double-toasts); the slot still closes.
 *  Depth rides `TurnPrep.automationDepth` so an automation-initiated refusal is a depth ≥ 1 `turnAborted`
 *  fact and the cascade guard suppresses non-opted retry rules exactly as it does for a real abort. */
async function closePreStartRefusal(deps: EngineDeps, prep: TurnPrep): Promise<void> {
  if (prep.slotAccepted !== true) {
    return;
  }
  await deps.emit({
    type: "turnAborted",
    chatId: prep.chatId,
    intent: KIND_TO_INTENT[prep.kind],
    reason: "error",
    automationDepth: turnCascadeDepth(prep),
  });
}

/** The turn body, parametrized by persist mode + lock-freedom: security belts → resolve persist target →
 *  turnStarted → assemble/generate → persist → turnCompleted. On a post-start error: emit turnAborted then
 *  rethrow. Pre-start refusals throw a coded error and emit nothing — except the accepted-slot close
 *  ({@link closePreStartRefusal}). */
async function executeTurn(ctx: ChatContext, deps: EngineDeps, prep: TurnPrep): Promise<TurnOutcome> {
  // Absent persist mode = a new assistant slot.
  const persist: TurnPersist = prep.persist ?? { mode: "new-slot", role: "assistant" };
  const { target } = await runPreStart(ctx, prep, persist).catch(async (err: unknown) => {
    // PRE-START refusal: nothing started, so the engine's post-start catch below never runs — close the
    // caller's accepted slot here or it strands open.
    await closePreStartRefusal(deps, prep);
    throw err;
  });
  const connection = prep.connection;

  const intent = KIND_TO_INTENT[prep.kind];
  // This turn's OWN cascade depth, resolved once — a human turn is 0, an
  // automation/plugin-initiated turn carries its parent+1. Rides `turnAborted` (below) so the automation
  // fact-resolver can gate the cascade without a reply slot to read `getTurnOrigin` off (there is none on abort).
  const abortDepth = turnCascadeDepth(prep);
  // The turn's ephemeral identity (docs/plans/rpg/design.md) — minted once, threaded to the tool-exec frame + the rpg
  // turn-end hooks so a turn-scoped registrant correlates the turn's tool writes to its commit/abort flush.
  const turnId = ctx.newChatTurnId();
  markRpgDiceEligible(ctx, prep, turnId);
  await deps.emit({
    type: "turnStarted",
    chatId: prep.chatId,
    intent,
    api: connection.api,
    provider: connection.providerId,
    model: connection.model,
    speakerCharacterId: prep.speakerCharacterId,
    targetMessageId: persist.mode === "new-slot" ? null : persist.targetMessageId,
  });

  // `runTurnPipeline` invokes onDelta synchronously while durable chat emission is asynchronous. Keep the
  // tail outside the try so BOTH success and failure terminals must drain it; otherwise a partial stream that
  // throws can publish turnAborted before its already-observed delta reaches the durable bus.
  let deltaTail: Promise<void> = Promise.resolve();
  const streamDeltas: ChatDeltaEvent[] = [];
  // THE GENERATION'S ERROR IDENTITY (#1373 chunk J). The catch below wraps the WHOLE body, so "the turn
  // failed" is NOT evidence that the CHAT's credential was rejected — a side role (memory recall's embed)
  // resolves its own credential and can 401 in here. Only the error the generation region itself threw may
  // license the credential strike-out, so the region records its identity and the arm tests for it.
  let generationFault: unknown = NO_GENERATION_FAULT;
  const recordGenerationFault = (err: unknown): void => {
    generationFault = err;
  };
  try {
    // PRE-TURN managed-compaction arm (the wedge-state fix): a chat whose context ALREADY overflows the window
    // makes the model fail, and the post-turn arm never runs on a failed turn — so compact BEFORE dispatch when
    // the cumulative estimate already crossed the threshold. Awaited + failure-honest (a failed pre-turn
    // compaction logs and proceeds, never blocks the turn). Returns the reloaded canon + a marker overlay (null
    // when no pre-turn compaction ran) so this turn's assembly already reflects the advanced coverage.
    const pre = await runPreTurnCompaction(ctx, deps, prep);
    const { canonAll, maxSeq, compactionOverlay } = pre;
    // The D16 classification anchor stamped on every `delta` this turn publishes (see `resolveSlotSeq`).
    const slotSeq = resolveSlotSeq(persist, target, maxSeq);
    // Builds the per-chat identity producer from the full loaded canon's distinct characterId/personaId
    // stamps, engine-side (the ids aren't knowable in turn prep) — projected through the names-only arm.
    const historyMacroNames: HistoryMacroNames = buildIdentityNameContext(await loadChatIdentityProducer(ctx.db, { messages: canonAll }));
    // Per-speaker witnessed recall (D6): a scoped round's each speaker recalls its OWN egocentric memory,
    // horizon-filtered by ITS join/leave presence — so a late joiner never recalls scenes before it arrived.
    // Merged/narrator/solo/agent turns keep the round-level `memory` (byte-identical). A fresh shape, never a
    // mutation of the immutable ctx (§5, the speaker-card precedent). A pre-turn compaction overlays its fresh
    // marker + coverage stamp onto the ctx so THIS turn's assembly already excludes the covered rows.
    const speakerAssembleContext = applyCompactionOverlay(await resolveSpeakerMemory(ctx, deps, prep), compactionOverlay);
    // The engine measures the wall-clock window around the role call and stamps it on the variant.
    const genStartedAt = ctx.now();
    // `runTurnPipeline`'s delta callback is synchronous, but chat emission is a durable-first Promise. Own an
    // ordered tail for this turn: every delta waits for the previous append, and the drain is awaited below
    // before any commit/terminal event. A rejection remains on the tail and fails the turn — a missing durable
    // delta followed by terminal success would be a corrupt replay history, not a recoverable background fault.
    // Held as a named value, not inlined into the call: the prose-less RECOVERY pass re-runs THIS turn from
    // exactly these arguments with two overrides (`recover-narrative.ts`), and a second hand-built literal
    // would be a second definition of the turn, free to drift.
    const pipelineArgs = {
      runChatTurn: ctx.runChatTurn,
      now: ctx.now,
      applyRegexReplace: ctx.applyRegexReplace,
      resolveImageUrl: (ref): Promise<ResolvedMediaRef | null> => ctx.resolveImageUrl({ ownerId: prep.runAsUserId, chatId: prep.chatId, ref }),
      // §8.8: the `conversation` carry source, LAZY — the pipeline calls it only on that rung.
      loadReasoningParts: (): Promise<ReadonlyMap<MessageId, readonly ChatReasoningPart[]>> => loadCanonReasoningParts(ctx.db, prep.chatId),
      loadCues: (): Promise<ReadonlyMap<MessageId, DeliveredCue>> => loadCanonCues(ctx.db, prep.chatId),
      // §6.7: the inline-reply origin set the CONVERT seam's media fence reads, LAZY and chat-scoped — the
      // pipeline asks only when an assistant row actually carries an `asset:` span.
      loadInlineReplyAssetIds: (): Promise<ReadonlyMap<MessageId, ReadonlySet<AssetId>>> => loadInlineReplyAssetIds(ctx.db, prep.chatId),
      assembleContext: speakerAssembleContext,
      canon: scopeCanon(canonAll, persist, target),
      historyMacroNames,
      // The per-turn user-macro RENDER registry (WAVE MU) — drives the BUILD section walk + the RECEIVE
      // AI_OUTPUT/REASONING macro pass. Absent ⇒ the pipeline's `globalMacroRegistry` default (byte-identical).
      macroRegistry: prep.macroRegistry,
      // The D50 `assembled_dynamic` PromptTransform op; null ⇒ byte-identical dynamic half.
      applyPromptTransforms: ctx.promptTransforms,
      connection,
      intent: prep.intent,
      extraStopSequences: prep.extraStopSequences,
      kind: prep.kind,
      chatId: prep.chatId,
      appendUserTurn: prep.appendUserTurn,
      appendUserTurnIsContinuationFallback: prep.appendUserTurnIsContinuationFallback,
      groupNudge: prep.groupNudge,
      // Set by the group round driver; absent falls back to the single-speaker pinned/merged default.
      shape: prep.shape,
      signal: prep.signal,
      tools: ctx.tools,
      attachedToolNames: prep.attachedToolNames ?? [],
      // R1 — the FOLDED state extraction: the gather's terminal tools ride the persisting turn ONLY (a
      // non-persisting draft has no committed slot to fold onto). Attached `auto`, never executed, never
      // recursed on; the calls come back on `result.terminalToolCalls` and go straight to the rpg flush.
      terminalTools: prep.terminalTools,
      // The M2 card wire knob (parity-plus §3.5) — a game turn's gather threads it; absent = every card stubs
      // (the pipeline owns the 0 default).
      cardKeepLastX: prep.cardKeepLastX,
      toolRecurseLimit: resolveToolRecurseLimit(prep.toolRecurseLimit),
      toolExecFrame: {
        runAsUserId: prep.runAsUserId,
        triggeredBy: prep.triggeredBy,
        chatId: prep.chatId,
        membership: prep.toolMembership ?? null,
        turnId,
        signal: prep.signal,
      },
      onDelta: (delta): void => {
        streamDeltas.push(delta);
        deltaTail = deltaTail.then(() => deps.emit({ type: "delta", chatId: prep.chatId, slotSeq, delta }));
      },
    } satisfies Parameters<typeof runTurnPipeline>[0];
    const firstPass = await capturingGenerationFault(recordGenerationFault, () => runTurnPipeline(pipelineArgs));
    captureTurnOutcome(prep, firstPass, ctx.now());
    // RECOVER, do not discard. A reasoning turn whose
    // tool calls landed but whose prose did not is not a failed turn — it is a turn missing its second half,
    // and the half it HAS is the expensive one. `resolveTurnNarrative` re-runs it once for the narrative and
    // carries the state writes forward; on every other turn it returns `firstPass` untouched, having made no
    // wire call. TOTAL on purpose (no branch here): the recovery decision belongs to that module, and this
    // function is at its complexity ceiling.
    const result = await capturingGenerationFault(recordGenerationFault, () =>
      resolveTurnNarrative({
        chatId: prep.chatId,
        pipelineArgs,
        first: firstPass,
        onRecoveryOutcome: (recovered): void => captureTurnOutcome(prep, recovered, ctx.now()),
      }),
    );
    await deltaTail;
    const genFinishedAt = ctx.now();
    await emitCapabilityDropWarnings(deps.emit, prep.chatId, result);
    // §6.7 — the model's own pictures become canon HERE: stored under the host, spliced into the body as
    // `![alt](asset:<id>)` spans, and handed to the commit as the ids it must link `inline-reply`. It runs
    // AHEAD of the prose-less refusal below because those spans ARE the body of a picture-only reply.
    const absorbed = await absorbInlineReplyImages(ctx, deps, prep, result);
    // VER-1b — refuse a prose-less generation BEFORE any canon write (see `assertGeneratedContent`). Placed
    // after the drop warnings on purpose: those name WHY the prose is missing (tools dropped, image dropped),
    // and everything below this line is about a reply that does not exist.
    assertGeneratedContent(absorbed.result, prep.chatId);
    // A display affordance only, distinct from turnCompleted (fires after persist below).
    if (result.reasoning !== null) {
      await deps.emit({ type: "reasoningStreamDone", chatId: prep.chatId });
    }
    // Which WI entries fired this turn; empty pool means no emit (no lore fired is not an activation event).
    // Threads THIS turn's own cascade depth so a `worldInfoActivated`-triggered rule whose reaction turn
    // re-activates the same lore escalates toward the hard cap instead of self-chaining at a hardcoded 0
    // (the fact-resolver reads it off the event — there is no committed reply slot yet to read depth back from).
    if (result.worldInfoEntryIds.length > 0) {
      await deps.emit({
        type: "worldInfoActivated",
        chatId: prep.chatId,
        entryIds: [...result.worldInfoEntryIds],
        automationDepth: turnCascadeDepth(prep),
      });
    }
    const view = await commitGeneration({
      ctx,
      deps,
      prep,
      persist,
      target,
      result: absorbed.result,
      inlineReplyAssetIds: absorbed.assetIds,
      nextSeq: maxSeq + 1,
      genStartedAt,
      genFinishedAt,
      streamDeltas,
    });
    // BEFORE the client-visible `turnCompleted` emit (w4-my-lane S1, option 1): the rpg register is
    // SYNCHRONOUS (`onTurnCompleted` enters the flush barrier before its first await), so firing it
    // first-thing-after-commit leaves no awaited work between the commit and the barrier entry — a scripted
    // re-send riding the bus can no longer gather in a window where the barrier is still empty.
    // §1.3 — thread the turn's OWN canon transcript (the story the state round reasons from) alongside the
    // resolved route + consent verdict. Projected from the canon already in scope (`canonAll` + this reply):
    // zero extra reads. The rpg consumer slices it to its configured window.
    // R1 — `terminalToolCalls` is the FOLD's channel: `null` = the folded tools never rode this turn (so the
    // consumer runs its own post-commit round), `[]` = they rode and the model recorded nothing (a quiet beat).
    // They are handed ONLY here — never persisted on the variant, never streamed, never member-visible.
    fireRpgTurnCompleted(ctx, view, turnId, {
      kind: prep.kind,
      connection,
      transcript: projectTurnRpgTranscript(canonAll, view, historyMacroNames),
      terminalToolCalls: result.terminalToolCalls,
      terminalToolsCollided: result.terminalToolsCollided,
      prose: turnProse(prep),
      // The round's cancellation inputs. `triggeredBy` is the OWNER it is scoped to (`cancelStateRounds` mirrors
      // `activeTurns.abort`'s owner-only rule); `signal` is this turn's own registration signal, which covers
      // ONLY the multi-speaker overlap window — the registration is released the moment this function returns,
      // so rpg composes its own controller on top (see `ChatRpgOps.cancelStateRounds` for the full timeline).
      triggeredBy: prep.triggeredBy,
      signal: prep.signal,
    });
    await deps.emit({ type: "turnCompleted", chatId: prep.chatId, intent, messageId: view.id });
    // Fans chatsChanged to every present human member's live channel (chat-list recency); fired once here for
    // the whole turn, not also on messageCommitted above (would triple-invalidate list keys).
    await ctx.emitChatChanged(prep.chatId);

    // Fire-and-forget memory trigger, must not block the reply; skipped entirely when the host disabled
    // memory. Reads the same resolved host config recall does, so its tuning is honored too.
    const memoryConfig = prep.memoryConfig;
    if (memoryConfig?.mode !== "off") {
      // Reuses the per-chat producer the SHAPE path already built (character + persona name maps), so build
      // and assemble agree.
      const macroNames = historyMacroNames;
      void withRequestSpan(memoryRequestId(turnId), MEMORY_SPAN, { chatId: prep.chatId, turnId }, async () => {
        try {
          await deps.generateSegments(ctx, {
            chatId: prep.chatId,
            funderUserId: prep.funderUserId,
            config: memoryConfig,
            macroNames,
            embedOwnerId: prep.runAsUserId,
          });
          // No summarize connection: digests pause (the Utility-model row says so) rather than fail every turn.
          if (!(await digestsDerivable(ctx, prep.funderUserId))) {
            return;
          }
          const participants = await loadParticipants(ctx.db, prep.chatId);
          const chars = participants.flatMap((r) => {
            const actor = classifyParticipant(r);
            return actor?.kind === "character" ? [actor.characterId] : [];
          });

          // Group-as-character scope (only for groups): the single synthetic bucket, keyed by the real
          // minted synthetic-character row id, never the fabricated `__group__` handle string.
          if (chars.length > 1) {
            const groupCharacterId = await resolveGroupBucketCharacterId(ctx, {
              ownerId: prep.runAsUserId,
              chatId: prep.chatId,
            });
            await deps.generateDigests(ctx, {
              scope: { chatId: prep.chatId, scopedCharacterId: groupCharacterId, isGroup: true },
              funderUserId: prep.funderUserId,
              config: memoryConfig,
              macroNames,
              embedOwnerId: prep.runAsUserId,
            });
          }
          // Each seated character's SCOPED bucket is gated by its own join/leave horizons — a member digests
          // only the blocks it was present for (correct across kick→re-add). The shared group bucket above
          // stays horizon-free (the merged/narrator build; digests.ts §22-23). The synthetic group char has
          // no participant seat, so it would (correctly) never appear in `chars` here.
          await Promise.all(
            chars.map(async (charId) =>
              deps.generateDigests(ctx, {
                scope: {
                  chatId: prep.chatId,
                  scopedCharacterId: charId,
                  isGroup: chars.length > 1,
                },
                funderUserId: prep.funderUserId,
                config: memoryConfig,
                macroNames,
                embedOwnerId: prep.runAsUserId,
                witnessing: await deps.loadWitnessHorizons(ctx.db, prep.chatId, charId),
              }),
            ),
          );
        } catch (memErr) {
          // Must never surface to the caller, but must not be invisible — log + emit a machine-dispatchable
          // warning code.
          getLog().warn({ err: memErr, chatId: prep.chatId }, "memory: post-turn build failed");
          // @orb-waive caught-failure-ownership(catch): a failed WARNING emit must not mask `memErr` — the build failure the outer catch rethrows below is what the span must record, and it already reached the log. Ends if the emit ever becomes retryable (then it owns its own reporting).
          // @orb-waive detached-work-traced(catch): a failed WARNING emit must not mask `memErr` — the build failure the outer catch rethrows below is what the span must record, and it already reached the log. Ends if the emit ever becomes retryable (then it owns its own reporting).
          try {
            await deps.emit({ type: "warning", chatId: prep.chatId, code: "memory_build_failed" });
          } catch {
            // A failed warning emit must never re-throw out of the fire-and-forget.
          }
          // Rethrow so the span marks itself ERROR (I-7: previously swallowed here, so a failed build always
          // looked "ok" on the trace ring even though the warning above fired). Still fire-and-forget to the
          // caller — the outer `.catch` below absorbs it.
          throw memErr;
        }
      }).catch(() => undefined);
    }

    // Fire-and-forget MANAGED-COMPACTION trigger (the LINEAR memory tier), a sibling of the digest build above
    // and keyed off the SAME fit boundary. Runs only in `compaction.mode:"managed"`, off the hot path, and
    // never blocks/faults the reply.
    fireManagedCompaction(ctx, deps, prep, { turnId, result, canonAll });

    fireExpressionClassify(ctx, view, turnId);

    return committedOutcome([view]);
  } catch (err) {
    // @orb-waive caught-failure-ownership(deltaErr): explicitly classified below — a `deltaErr` equal
    // to `err` is already owned by the outer catch; a distinct secondary failure is logged via
    // getLog().warn so it stays visible while the primary error still wins. Ends if this needs to fail the
    // turn outcome instead of only warning.
    try {
      await deltaTail;
    } catch (deltaErr) {
      // If the delta append itself caused this catch, `err` already owns the failure. If generation failed
      // independently, preserve that primary error but keep the secondary durable-bus failure visible.
      //
      // A TYPE-SEAM BELT WITH NO REACHABLE PRODUCER TODAY, and that is recorded rather than tested (#1521):
      // `EngineDeps.emit` is typed `Promise<void>`, so a rejection is expressible — but the composed
      // production emitter cannot produce one. `entry/compose/services::emitChatEvent` awaits
      // `emitChatEventChecked`, whose `chatBus.emit` is TOTAL by construction (bus.ts FLAG[emit-is-total])
      // and whose fan is a synchronous `EventEmitter.emit` into `on()`-buffered subscribers
      // (`transport/trpc/chat-events-bus::publishChatEvent` → `bus-channel::publish`); the one callback-style
      // listener isolates its own throw. A dropped durable append therefore RESOLVES here — the engine is
      // structurally blind to the loss, which is #1454's still-open propagation fork, not this belt's job.
      // The belt stays because the SEAM's type permits what bus.ts's invariant currently forbids; a test that
      // injected a rejecting emitter was deleted for pinning a shape no caller can reach.
      if (deltaErr !== err) {
        getLog().warn({ err: deltaErr, chatId: prep.chatId }, "chat: delta drain also failed while aborting turn");
      }
    }
    // An abort is a lifecycle OUTCOME, not an exception (owner ruling, lock-the-extensible-shape): the
    // return-based `abortedOutcome` shape was designed (result.ts) and the plumbing above (round → verb
    // `TurnOutcome.aborted/abortReason`) already propagates it. The `turnAborted` bus emission STAYS on
    // every abort path (it is how the UI learns — the client is bus-driven, never reads this return).
    //
    // CLASSIFICATION BOUNDARY — which reasons RETURN vs THROW:
    //   • "user"  (caller cancel via `prep.signal`)      → RETURN abortedOutcome — a clean, expected outcome.
    //   • "stale" (the heartbeat's lock-loss abort)      → RETURN abortedOutcome — from THIS body's view it is
    //       an abort; the LOUD surface is preserved OUTSIDE this catch: `runInLockWithHeartbeat` rejects the
    //       Promise.race with `ChatOperationError(aborted)` and that rejection wins (settles first), so callers
    //       still see a hard throw. This branch only settles the abandoned body cleanly (no unhandled reject).
    //   • "error" (provider/DB fault — signal NOT aborted) → THROW: a real failure must stay a failure.
    const reason = abortReasonFor(err, prep.signal);
    // The FAULT row in the wire-outcome ring. FIRST in the catch, before the bus emit and the rpg flush:
    // those are awaited/injected and can themselves fail, and the row explaining WHY the turn died must not
    // be hostage to them. Itself throw-safe (see `captureTurnFault`).
    captureTurnFault(prep, err, reason, ctx.now());
    await strikeOutOnTurnFault(ctx, prep, { err, reason, generationFault });
    // Carry the aborting turn's OWN cascade depth: an aborted turn commits no reply
    // slot, so the automation fact-resolver cannot read this back through `getTurnOrigin` — it must ride the
    // event. A depth ≥ 1 abort (this turn was itself automation-initiated) makes the `turnAborted` fact depth
    // ≥ 1, so the cascade guard suppresses non-opted `turnAborted` rules (closes the retry-on-failure self-loop).
    await deps.emit({ type: "turnAborted", chatId: prep.chatId, intent, reason, automationDepth: abortDepth });
    // CLEAR the turn's staged tool writes on every abort path (user/stale/error) so a dead turn never flushes
    // into the next turn on this chat (docs/plans/rpg/design.md hardening a).
    fireRpgTurnAborted(ctx, prep.chatId, turnId, reason);
    if (reason === "error") {
      throw err;
    }
    return abortedOutcome(reason);
  }
}

/** The heartbeat fires at TTL/3, not TTL/2: TTL/3 survives ONE dropped/slow refresh (a missed tick still
 *  leaves ~TTL/3 of slack before `expiresAt`, so the lock stays un-stealable), where TTL/2 leaves zero
 *  margin if a single refresh runs late. */
const LOCK_HEARTBEAT_DIVISOR = 3;

/** Runs the turn body in-lock while a heartbeat extends the lock's TTL, so a turn that outruns the TTL is
 *  NOT stealable mid-stream (the exact double-canon-write race the lock exists to prevent).
 *
 *  Fail-closed on a lost lock: {@link refreshLock} returns `false` when this holder no longer owns the row
 *  (stolen via the stale-steal in {@link tryAcquireLock}, or the row went), and a thrown refresh is a DB
 *  fault — either way the turn's canon claim is void. The engine's ONLY stop mechanism is the AbortSignal
 *  the provider stream already honors, so the heartbeat aborts an internal controller (composed onto
 *  `prep.signal`) to HALT the in-flight generation before it can `commitGeneration`, then rejects the run
 *  with `aborted` (the "stale" arm the code documents). `aborted` — NOT `locked` — so it propagates loudly
 *  (`driveRound` only yields gracefully on the pre-acquire `locked`); a lost lock mid-turn is a hard fault. */
async function runInLockWithHeartbeat(ctx: ChatContext, deps: EngineDeps, prep: TurnPrep): Promise<TurnOutcome> {
  const heartbeatController = new AbortController();
  const composedSignal = prep.signal !== undefined ? AbortSignal.any([prep.signal, heartbeatController.signal]) : heartbeatController.signal;
  let lockLost = false;
  const { promise: lockLostBarrier, reject: rejectLockLost } = Promise.withResolvers<never>();
  const tick = async (): Promise<void> => {
    try {
      if (await refreshLock(ctx.db, prep.chatId, deps.holder, ctx.now() + deps.lockTtlMs)) {
        return;
      }
    } catch (err) {
      getLog().error({ err, chatId: prep.chatId, holder: deps.holder }, "chat: turn-lock refresh FAILED (db fault) — aborting the turn");
    }
    if (lockLost) {
      return;
    }
    lockLost = true;
    getLog().error(
      { chatId: prep.chatId, holder: deps.holder },
      "chat: turn-lock LOST mid-turn (stolen/gone) — aborting the turn to stop the canon-write race",
    );
    // Abort with the sentinel so the abandoned turn body labels its `turnAborted` bus event "stale" (not the
    // caller-cancel "user"); the race rejection below is the loud, caller-facing surface.
    heartbeatController.abort(new StaleLockAbort());
    rejectLockLost(new ChatOperationError(CHAT_OP_CODES.aborted, "turn-lock lost mid-turn (stolen or gone)"));
  };
  const beat = setInterval((): void => void tick(), Math.floor(deps.lockTtlMs / LOCK_HEARTBEAT_DIVISOR));
  // THE RELEASE IS BOUND TO THE BODY, NOT TO THE CALLER (#1393). Releasing the lock while the turn body is
  // still live hands the next holder a room a zombie can still write to — the exact canon race the lock
  // exists to prevent — so the release rides the body's settlement on EVERY path. It is deliberately NOT in
  // a `finally` around the race: when the barrier wins, the caller must still get its loud `aborted` at once
  // rather than waiting behind a body that may be ignoring its abort (a wedged provider stream would
  // otherwise hold the request open for as long as it wedges).
  const releasedBody = executeTurn(ctx, deps, { ...prep, signal: composedSignal }).then(
    async (outcome): Promise<TurnOutcome> => {
      await releaseLock(ctx.db, prep.chatId, deps.holder);
      return outcome;
    },
    async (err: unknown): Promise<never> => {
      await releaseLock(ctx.db, prep.chatId, deps.holder);
      throw err;
    },
  );
  try {
    return await Promise.race([releasedBody, lockLostBarrier]);
  } finally {
    clearInterval(beat);
    // @orb-waive detached-work-traced(releasedBody): this is not a second dispatch — it is the SAME promise the race above returns, and whichever arm won already delivered its outcome (the body's own value, or the barrier's `aborted` throw). Nothing here is invisible: the turn body traces itself, and the only work still pending is the holder-scoped `releaseLock`. Ends if the release moves off this promise.
    // @orb-waive caught-failure-ownership(releasedBody): this is not a second dispatch — it is the SAME promise the race above returns, and whichever arm won already delivered its outcome (the body's own value, or the barrier's `aborted` throw). Nothing here is invisible: the turn body traces itself, and the only work still pending is the holder-scoped `releaseLock`. Ends if the release moves off this promise.
    void releasedBody.catch((): undefined => undefined);
  }
}

/** The delta sink for a non-persisting generation with no streaming consumer — chunks are dropped (the
 *  reduced text is the whole product). Callers that stream (impersonateStream → the composer) pass their own. */
function dropDelta(): void {
  // intentionally empty — no consumer for this generation's text deltas.
}

/** The NON-PERSISTING generation ({@link TurnEngine.generateText}): assemble → shape → generate, then RETURN
 *  the reduced text. It pays the SAME consent + budget belts a real turn does (a generation spends the host's
 *  box, persisted or not) but takes NO lock, writes NO canon, and emits NO bus event. `onText`, when supplied,
 *  receives each TEXT delta AS IT ARRIVES off `runTurnPipeline`'s stream (reasoning deltas are not surfaced) —
 *  so a caller can stream the generation into the composer progressively; absent ⇒ deltas dropped. Backs the
 *  composer-fill flows (guided impersonate drafts the user's next line INTO the composer for review). Reads the
 *  FULL canon as context (a `new-slot` at the tail — impersonate's shape). An abort mid-generation is a clean
 *  outcome: `{ text: <whatever streamed>, aborted: true }`; a provider/DB fault still throws. */
async function generateTextUnpersisted(ctx: ChatContext, prep: TurnPrep, onText: (text: string) => void = dropDelta): Promise<GeneratedText> {
  const connection = prep.connection;

  const canonAll = await loadCanonHistory(ctx.db, prep.chatId);
  const historyMacroNames: HistoryMacroNames = buildIdentityNameContext(await loadChatIdentityProducer(ctx.db, { messages: canonAll }));
  try {
    const result = await runTurnPipeline({
      runChatTurn: ctx.runChatTurn,
      now: ctx.now,
      applyRegexReplace: ctx.applyRegexReplace,
      resolveImageUrl: (ref) => ctx.resolveImageUrl({ ownerId: prep.runAsUserId, chatId: prep.chatId, ref }),
      // §8.8: the `conversation` carry source, LAZY — the pipeline calls it only on that rung.
      loadReasoningParts: (): Promise<ReadonlyMap<MessageId, readonly ChatReasoningPart[]>> => loadCanonReasoningParts(ctx.db, prep.chatId),
      loadCues: (): Promise<ReadonlyMap<MessageId, DeliveredCue>> => loadCanonCues(ctx.db, prep.chatId),
      // §6.7: the inline-reply origin set the CONVERT seam's media fence reads, LAZY and chat-scoped — the
      // pipeline asks only when an assistant row actually carries an `asset:` span.
      loadInlineReplyAssetIds: (): Promise<ReadonlyMap<MessageId, ReadonlySet<AssetId>>> => loadInlineReplyAssetIds(ctx.db, prep.chatId),
      assembleContext: prep.assembleContext,
      canon: canonAll,
      historyMacroNames,
      macroRegistry: prep.macroRegistry,
      applyPromptTransforms: ctx.promptTransforms,
      connection,
      intent: prep.intent,
      extraStopSequences: prep.extraStopSequences,
      kind: prep.kind,
      chatId: prep.chatId,
      appendUserTurn: prep.appendUserTurn,
      appendUserTurnIsContinuationFallback: prep.appendUserTurnIsContinuationFallback,
      groupNudge: prep.groupNudge,
      shape: prep.shape,
      signal: prep.signal,
      tools: ctx.tools,
      attachedToolNames: prep.attachedToolNames ?? [],
      cardKeepLastX: prep.cardKeepLastX,
      toolRecurseLimit: resolveToolRecurseLimit(prep.toolRecurseLimit),
      toolExecFrame: {
        runAsUserId: prep.runAsUserId,
        triggeredBy: prep.triggeredBy,
        chatId: prep.chatId,
        membership: prep.toolMembership ?? null,
        turnId: ctx.newChatTurnId(),
        signal: prep.signal,
      },
      // Surface each TEXT delta to the caller AS IT ARRIVES (reasoning deltas aren't composer-bound); a caller
      // with no stream consumer passed `dropDelta`, so this is a no-op there.
      onDelta: (delta) => {
        if (delta.kind === "text") {
          onText(delta.text);
        }
      },
    });
    return { text: result.content, aborted: false };
  } catch (err) {
    // An abort (caller-cancel) is a clean outcome — return what streamed. A real provider/DB fault throws.
    // No lock/canon/bus to unwind (this path took none), so nothing to emit on the way out.
    if (abortReasonFor(err, prep.signal) === "error") {
      throw err;
    }
    return { text: "", aborted: true };
  }
}

/** Builds the per-turn engine. `runTurn` acquires the per-chat lock (refusing `locked` if a turn is in
 *  flight), runs the lifecycle in-lock under a TTL heartbeat, and always releases it. A `prep.lockFree`
 *  turn skips the lock (and the heartbeat) entirely so it runs concurrent with a locked send.
 *  `generateText` is the non-persisting, lock-free, bus-silent sibling (composer-fill). */
export function createTurnEngine(ctx: ChatContext, deps: EngineDeps): TurnEngine {
  const runTurn = async (prep: TurnPrep): Promise<TurnOutcome> => {
    if (prep.lockFree === true) {
      return await executeTurn(ctx, deps, prep);
    }
    const now = ctx.now();
    const acquired = await tryAcquireLock(ctx.db, {
      chatId: prep.chatId,
      holder: deps.holder,
      now,
      expiresAt: now + deps.lockTtlMs,
    });
    if (!acquired) {
      // The loudest pre-start refusal there is: a swipe/continue/send refused here NEVER reaches `executeTurn`,
      // so the caller's accepted slot has no other closer (the measured amplifier in the ghost-slot diagnosis —
      // the old variant held for the whole of the OTHER turn).
      await closePreStartRefusal(deps, prep);
      throw new ChatOperationError(CHAT_OP_CODES.locked, "a turn is already in flight for this chat");
    }
    return await runInLockWithHeartbeat(ctx, deps, prep);
  };
  return { runTurn, generateText: (prep, onText) => generateTextUnpersisted(ctx, prep, onText) };
}

/** Emit the domain `warning` events for the capability drops the pipeline flagged this turn (image parts,
 *  tools, structured output) PLUS the INFRA-originated runner warnings it carried up (resolve/wire drops the
 *  runners raised, narrowed to chat's vocabulary at the compose bridge — D41's read end). Extracted so the
 *  generation lifecycle stays under the cognitive-complexity cap.
 *  @internal exported for the drop-warning unit test (`tests/server/domain/chat/engine/engine.test.ts`) — the
 *  structured-output flag has no engine INPUT path yet (no chat consumer sets `responseFormat`, 04 §3), so that
 *  emit branch is only reachable directly, and the infra→chat translation below is total over a tuple a turn
 *  cannot produce all of. The export was CLAIMED by this doc line long before it existed (#1440 restored it). */
export async function emitCapabilityDropWarnings(
  emit: (event: DurableChatBusEvent) => Promise<void>,
  chatId: ChatId,
  result: {
    readonly imageDropped: boolean;
    readonly videoDropped: boolean;
    readonly toolsUnsupported: boolean;
    readonly structuredOutputUnsupported: boolean;
    readonly guidedPlacedAsInjection: boolean;
    readonly runnerWarnings: readonly ResolvedWarning[];
    readonly providerRefused: boolean;
  },
): Promise<void> {
  if (result.imageDropped) {
    await emit({ type: "warning", chatId, code: "image_dropped" });
  }
  if (result.videoDropped) {
    await emit({ type: "warning", chatId, code: "video_dropped" });
  }
  if (result.toolsUnsupported) {
    await emit({ type: "warning", chatId, code: "tools_unsupported" });
  }
  if (result.structuredOutputUnsupported) {
    await emit({ type: "warning", chatId, code: "structured_output_unsupported" });
  }
  // §10 addendum / F8: the system-placement steer fell back to a depth-0 injection (no marker) — landed,
  // not lost, and said so loudly (D41).
  if (result.guidedPlacedAsInjection) {
    await emit({ type: "warning", chatId, code: "guided_placed_as_injection" });
  }
  // The provider DECLINED (a content-filter finish on the wire). Not a capability drop like the five above —
  // nothing of ours was dropped — but the same obligation: a refusal that surfaces as a blank or truncated
  // reply with no reason is exactly the silent degrade D41 exists to forbid.
  if (result.providerRefused) {
    await emit({ type: "warning", chatId, code: "provider_refused" });
  }
  // The infra runners' own drops (D41 read end). Deduped upstream; independent of each other, so they fan
  // concurrently — all awaited here, which is what keeps them BEFORE the turn's terminal bus event. TOTAL
  // since #1440: the translation answers for every infra code, so nothing is filtered out here any more.
  // `declared_overrides_measured` is NOT a turn-stream notice by ruling (inference program §5.3a): it renders
  // as a badge on the connection row, and the user asked for the override — filtered BEFORE the fold.
  await Promise.all(
    result.runnerWarnings
      .filter((warning) => warning.code !== "declared_overrides_measured")
      .map((warning) => emit({ type: "warning", chatId, ...toChatWarning(warning) })),
  );
}

/** The infra→chat warning translation (D41 no-silent-degrade, the READ end). Chat OWNS its bus vocabulary, so
 *  a foreign `WARNING_CODES` member is translated HERE, in the domain — the mirror of the IMAGE role's hop
 *  (`entry/compose/imagery.ts` narrows infra→`ImageryWarning`; `verbs/generate-image.ts` re-maps
 *  →`ChatWarningCode`). A code spelled identically in both tuples is a MATCH, never a re-spell.
 *
 *  TOTAL over the infra union by construction: the `assertNever` tail means a NEW `WARNING_CODES` member fails
 *  `tsc` here until someone rules on it, so a runner drop can never go silently un-surfaced again — the exact
 *  failure this seam was built to end (the runners produced these for months and nothing read them).
 *
 *  TOTAL IN ITS RETURN TOO, since #1440 (owner ruling 2026-09-05). Ten of those codes used to return `null` —
 *  a "declared not-yet-surfaced" arm that `emitCapabilityDropWarnings` then filtered out, so a user believed a
 *  requested knob / reasoning budget / tool result had applied when the provider had ignored or clamped it.
 *  The owner ruled SURFACE: they ride ONE `settings_adjusted` code carrying the drop's structured detail, which
 *  the client re-voices per class. No `null` arm survives, and no `default: return null` may replace this list
 *  — listing every code one by one is what keeps the `assertNever` honest. */
function toChatWarning(warning: ResolvedWarning): ChatWarning {
  const code = warning.code;
  switch (code) {
    case "custom_parameters_ignored":
      return { code: "custom_parameters_ignored" };
    // Not producible on the chat-turn path (it is the IMAGE runner's belt, which reaches the bus through
    // `verbs/generate-image.ts`) — mapped rather than carried because the two vocabularies agree on it.
    case "image_edit_dropped":
      return { code: "image_edit_dropped" };
    // The SDK refused a TOOL (an unknown provider-defined tool, or `strict` on a provider with no strict
    // mode): the turn ran tool-less, which is exactly what the existing chat code already means.
    case "sdk_unsupported_tool":
      return { code: "tools_unsupported" };
    case "background_task_degraded":
      return { code: "background_task_degraded" };
    // Filtered upstream (§5.3a — a connection-row badge, never the turn stream); listed so the tail stays total.
    case "declared_overrides_measured":
      return { code: "background_task_degraded" };
    case "sampling_knob_dropped":
    case "sampling_knob_conflict":
    case "effort_dropped":
    case "adaptive_budget_dropped":
    case "display_dropped":
    case "verbosity_dropped":
    case "dynamic_context_demoted":
    case "reasoning_mandatory_clamp":
    case "reasoning_budget_clamped":
    case "tool_result_error_dropped":
    case "reasoning_dropped_for_prefill":
    case "tool_choice_downgraded":
    case "carry_reasoning_downgraded":
      // `adjustment: code` IS the MATCH: the infra spellings above and `PROVIDER_ADJUSTMENT_KINDS` are separate
      // tuples (contracts sits below server and cannot import infra), so a rename on either side fails `tsc`
      // right here. The three detail fields ride straight through — the resolver is the only layer that knows
      // them, and re-deriving them in the domain would be inventing a fact. `undefined` is the honest absent
      // (optional on both sides; JSON drops it on the durable log).
      return { adjustment: code, appliedEffort: warning.appliedEffort, appliedBudget: warning.appliedBudget, code: "settings_adjusted", knob: warning.knob };
    // The SDK's own second gate (#A3), setting half: the provider refused a knob AFTER our funnel resolved
    // it. The ONE pair of arms where the two spellings deliberately differ — the infra code records WHO
    // dropped it (the SDK's gate, not our capability fold), while the user sentence is identical to the
    // funnel's own drop, so it carries the chat vocabulary's existing class with `knob` riding through.
    case "sdk_unsupported_setting":
      return { adjustment: "sampling_knob_dropped", code: "settings_adjusted", knob: warning.knob };
    // The compatibility half: the provider SUBSTITUTED a value rather than dropping one, which is a
    // different sentence ("it ran, but not as asked") and therefore its own chat kind.
    case "sdk_compatibility":
      return { adjustment: "provider_compatibility_mode", code: "settings_adjusted", knob: warning.knob };
    default:
      return assertNeverWarningCode(code);
  }
}

function assertNeverWarningCode(code: never): never {
  throw new Error(`toChatWarning: unhandled infra WarningCode ${JSON.stringify(code)}`);
}
