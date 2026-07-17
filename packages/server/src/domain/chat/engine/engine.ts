// The turn lifecycle shell. Single-speaker core: one resolved speaker per turn, no multi-speaker
// arbitration/auto-mode (the "who/how-many speaks" chunk wraps this). The tool-recurse loop is built in
// pipeline.ts (recurses on finishReason:"tool" up to toolRecurseLimit).
//
// Lifecycle (read top to bottom in executeTurn): acquire lock → security belts (consent + budget debit) →
// emit turnStarted → load canon + next-seq → runTurnPipeline (assemble→shape→run→reduce→fit) → persist the
// canon + stats delta in one atomic batch → emit messageCommitted + turnCompleted → release lock. On any
// error after turnStarted: emit turnAborted then rethrow, never swallow. Pre-start refusals throw a coded
// ChatOperationError and emit nothing.
//
// The chat bus emit, the per-member budget debit, and the per-turn host policy are not ChatContext ops —
// they're injected as engine deps wired at the entry composition root.

import type { ChatBusEvent, MessageView, TurnAbortReason } from "@orb/contracts/chat";
import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import type { ChatRoster } from "@orb/contracts/identity";
import type { ContinuePostfix } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { CharacterId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context";
import type { DebitBudgetOp, ResolveTurnPolicyOp } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type { MemoryConfig, MemoryPassCounts, MemoryScope, WitnessInterval } from "../contract/memory";
import { TOOL_RECURSE_LIMIT_DEFAULT } from "../contract/metadata";
import type { HistoryMacroNames, TurnEconomics, TurnEngine, TurnIntent, TurnKind, TurnOutcome, TurnPersist, TurnPrep } from "../contract/results";
import {
  appendVariantStatements,
  buildCommittedMessageView,
  combineReasoning,
  continueVariantStatements,
  insertCanonMessageStatements,
} from "../persistence/canon-write";
import { releaseLock, tryAcquireLock } from "../persistence/lock";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import { loadCanonHistory, loadCanonStatRows, loadMaxMessageSeq, loadMessageView, loadSlotTarget, loadVariableDeltas } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { resolveGroupBucketCharacterId } from "../substrate/group-bucket";
import { foldChain, runtimeVariablesUpdateStatement } from "../substrate/runtime-variables";
import { assistantTurnDelta, canonMessageDelta, swipeVariantDelta } from "../substrate/stats-delta";
import { debitTurnBudget } from "./budget";
import { runTurnPipeline } from "./pipeline";
import { committedOutcome } from "./result";
import { assertMaxProSubConsent, resolveOwnerConsented } from "./turn-identity";

/** The non-ctx engine deps wired at the composition root. */
interface EngineDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly debitBudget: DebitBudgetOp;
  readonly resolveTurnPolicy: ResolveTurnPolicyOp;
  readonly holder: string;
  readonly lockTtlMs: number;
  /** Injected memory segment builder, typed to the real signature — no `any` at this seam. */
  readonly generateSegments: (
    ctx: ChatContext,
    args: {
      readonly chatId: ChatId;
      readonly config?: MemoryConfig | null | undefined;
      readonly macroNames?: RowMacroNameContext | undefined;
      readonly signal?: AbortSignal | undefined;
    },
  ) => Promise<MemoryPassCounts>;
  /** Injected memory digest builder, typed to the real signature. */
  readonly generateDigests: (
    ctx: ChatContext,
    args: {
      readonly scope: MemoryScope;
      readonly config?: MemoryConfig | null | undefined;
      readonly macroNames?: RowMacroNameContext | undefined;
      readonly witnessing?: readonly WitnessInterval[] | undefined;
      readonly signal?: AbortSignal | undefined;
    },
  ) => Promise<MemoryPassCounts>;
}

/** Maps the engine's turn-kind axis to the public bus `TurnIntent`. `opening`/`auto`/`force` surface as
 *  their nearest public lifecycle intent. */
const KIND_TO_INTENT: Record<TurnKind, TurnIntent> = {
  send: "send",
  swipe: "swipe",
  continue: "continue",
  generate: "generate",
  impersonate: "impersonate",
  opening: "generate",
  auto: "generate",
  force: "generate",
};

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
  return CONTINUE_POSTFIX_DELIMITER[prep.assembleContext.promptConfig.continuePostfix ?? "none"];
}

/** The shared economics subset (variant columns ∩ stats input). */
interface EconomicsCommon {
  readonly model: string | null;
  readonly provider: string | null;
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
    tokensIn: e?.tokensIn ?? null,
    tokensOut: e?.tokensOut ?? null,
    cacheReadTokens: e?.cacheReadTokens ?? null,
    cacheWriteTokens: e?.cacheWriteTokens ?? null,
    costUsd: e?.costUsd ?? null,
  };
}

/** The loaded write target for an append-variant/continue turn, read pre-start. */
type SlotTarget = NonNullable<Awaited<ReturnType<typeof loadSlotTarget>>>;

/** The seat a `canAgent` verdict is made against. An agent participant is ALWAYS `role:'member'` (a character
 *  can never be host, and an agent even less so); `canAgent` ignores the room today (present-membership is the
 *  roster load's job — the present-predicate already dropped disabled/kicked agents), so this is the fixed seat. */
const AGENT_SEAT_ROSTER: ChatRoster = { role: "member" };

/** The agent principal whose voice THIS turn produces, or null for a character/human/narrator/impersonate turn.
 *  A new-slot ASSISTANT carrying an `authorUserId` is a self-attributed agent speaker (the round driver stamps
 *  it — agent-principal-design/02 §2); an append-variant/continue that re-voices an existing agent-authored
 *  assistant row (authorUserId set, characterId null) is also an agent voice. */
function agentSpeakerUserId(persist: TurnPersist, target: SlotTarget | null): UserId | null {
  if (persist.mode === "new-slot") {
    return persist.role === "assistant" ? (persist.authorUserId ?? null) : null;
  }
  return target !== null && target.role === "assistant" && target.characterId === null ? target.authorUserId : null;
}

/** The agent-speaker capability gate (D60; agent-principal-design/03 §2, inv 4). Before ANY agent-authored
 *  generation the engine re-reads the principal FRESH and runs it through the ONE `canAgent('speak')` seam —
 *  the belt on top of the present-predicate that (a) refuses a force-injected speaker the selection never
 *  vetted and (b) kills an in-flight turn the instant `users.enabled` flips. A vanished/non-agent id (an
 *  owner-delete cascade race) fails CLOSED. Pure pre-start refusal: emits nothing, no side effects. */
async function gateAgentSpeaker(ctx: ChatContext, chatId: ChatId, persist: TurnPersist, target: SlotTarget | null): Promise<void> {
  const agentUserId = agentSpeakerUserId(persist, target);
  if (agentUserId === null) {
    return;
  }
  const actor = await ctx.resolveAgentActor(agentUserId);
  if (actor === null) {
    throw new ChatOperationError(CHAT_OP_CODES.agentDisabled, `chat ${chatId}: agent speaker ${agentUserId} is not a live principal`);
  }
  // Throws DomainForbiddenError("agent principal disabled") when the kill switch is off — the containment flip.
  ctx.canAgent(actor, "speak", AGENT_SEAT_ROSTER);
}

/** Re-reads a just-committed message's authoritative MessageView (append-variant/continue produce fields
 *  the in-memory insert params don't know, unlike a fresh slot). */
async function readCommittedView(ctx: ChatContext, messageId: MessageId): Promise<MessageView> {
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    throw new Error(`message ${messageId} vanished mid-commit`);
  }
  return view;
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
    ...economicsCommon(e),
    contextWindow: e?.contextWindow ?? null,
    maxOutputTokens: e?.maxOutputTokens ?? null,
    reasoningEffort: e?.reasoningEffort ?? null,
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
  costUsd: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  contextWindow: number | null;
  genStartedAt: number;
  genFinishedAt: number;
  model: string | null;
  provider: string | null;
  metadata: Record<string, unknown> | null;
} {
  const e = result.economics;
  return {
    tokensIn: e?.tokensIn ?? null,
    tokensOut: e?.tokensOut ?? null,
    costUsd: e?.costUsd ?? null,
    cacheReadTokens: e?.cacheReadTokens ?? null,
    cacheWriteTokens: e?.cacheWriteTokens ?? null,
    contextWindow: e?.contextWindow ?? null,
    genStartedAt,
    genFinishedAt,
    model: e?.model ?? null,
    provider: e?.provider ?? null,
    metadata: null,
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
      characterId,
      authorUserId: persist.authorUserId ?? null,
      personaId: persist.personaId ?? null,
      now,
      variant,
    };
    const view = buildCommittedMessageView(insertParams);
    return {
      statements: insertCanonMessageStatements(ctx.db, insertParams),
      speakerCharacterId: characterId,
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
}): Promise<MessageView> {
  const { ctx, deps, prep, persist, target, result, nextSeq, genStartedAt, genFinishedAt } = args;
  const now = ctx.now();
  const variant = variantPayloadOf(prep, result, genStartedAt, genFinishedAt);
  // A group round reuses one assembleContext across its speakers, so the by-reference op-log accumulates;
  // clear it now that this turn's ops are snapshotted, so the next speaker's delta starts empty.
  prep.assembleContext.opLog?.splice(0);

  const attempt = async (seq: number): Promise<MessageView> => {
    const { statements, speakerCharacterId, loadView } = buildCommitPlan({
      ctx,
      prep,
      persist,
      target,
      result,
      variant,
      now,
      seq,
    });

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
  await deps.emit({ type: "messageCommitted", chatId: prep.chatId, messageId: view.id, view });
  return view;
}

/** Scopes the loaded canon to the turn's context window: new-slot sees the full canon; append-variant
 *  regenerates from before the target slot; continue sees up to and including it. */
function scopeCanon(canon: readonly MessageView[], persist: TurnPersist, target: SlotTarget | null): readonly MessageView[] {
  if (persist.mode === "new-slot" || target === null) {
    return canon;
  }
  return persist.mode === "append-variant" ? canon.filter((m) => m.seq < target.seq) : canon.filter((m) => m.seq <= target.seq);
}

/** Which abort reason a thrown error maps to (a caller-cancel AbortError → user; else error). */
function abortReasonFor(err: unknown): TurnAbortReason {
  return err instanceof Error && err.name === "AbortError" ? "user" : "error";
}

/** The turn body, parametrized by persist mode + lock-freedom: security belts → resolve persist target →
 *  turnStarted → assemble/generate → persist → turnCompleted. On a post-start error: emit turnAborted then
 *  rethrow. Pre-start refusals throw a coded error and emit nothing. */
async function executeTurn(ctx: ChatContext, deps: EngineDeps, prep: TurnPrep): Promise<TurnOutcome> {
  // Security belts before any turnStarted: consent + budget debit attributed to triggeredBy.
  const policy = await deps.resolveTurnPolicy(prep.runAsUserId);
  const identity = { triggeredBy: prep.triggeredBy, runAsUserId: prep.runAsUserId };
  assertMaxProSubConsent({
    source: prep.connection.credential.source,
    identity,
    ownerConsent: policy.allowNonOwnerMaxProSub,
  });
  // The enforced consent verdict, threaded onto the built TurnRequest so the infra credential firewall
  // re-verifies it (domain derives, infra verifies).
  const ownerConsented = resolveOwnerConsented({
    identity,
    ownerConsent: policy.allowNonOwnerMaxProSub,
  });
  await debitTurnBudget(deps.debitBudget, prep.triggeredBy, policy.budget);

  // Absent persist mode = a new assistant slot. append-variant/continue load the write target before
  // turnStarted — a missing target is a pre-start refusal (leak-free NOT_FOUND, emits nothing).
  const persist: TurnPersist = prep.persist ?? { mode: "new-slot", role: "assistant" };
  const target = persist.mode === "new-slot" ? null : ((await loadSlotTarget(ctx.db, prep.chatId, persist.targetMessageId)) ?? null);
  if (persist.mode !== "new-slot" && target === null) {
    throw new ChatNotFoundError(prep.chatId);
  }

  // The agent-speaker capability gate — a pre-start refusal (emits nothing) BEFORE turnStarted, so a disabled
  // or force-injected agent principal is never voiced (D60; the belt on top of the present-predicate).
  await gateAgentSpeaker(ctx, prep.chatId, persist, target);

  const intent = KIND_TO_INTENT[prep.kind];
  await deps.emit({
    type: "turnStarted",
    chatId: prep.chatId,
    intent,
    api: prep.connection.api,
    source: prep.connection.credential.source,
    model: prep.connection.model,
    speakerCharacterId: prep.speakerCharacterId,
    targetMessageId: persist.mode === "new-slot" ? null : persist.targetMessageId,
  });

  try {
    const [canonAll, maxSeq] = await Promise.all([loadCanonHistory(ctx.db, prep.chatId), loadMaxMessageSeq(ctx.db, prep.chatId)]);
    // Builds the per-chat macro name producer from the full loaded canon's distinct characterId/personaId
    // stamps, engine-side (the ids aren't knowable in turn prep).
    const macroProducer = await loadChatMacroNameProducer(ctx.db, { messages: canonAll });
    const historyMacroNames: HistoryMacroNames = {
      characterNamesById: buildCharacterNameMap(macroProducer.characterNames),
      personaNamesById: buildPersonaNameMap(macroProducer.personaNames),
    };
    // The engine measures the wall-clock window around the role call and stamps it on the variant.
    const genStartedAt = ctx.now();
    const result = await runTurnPipeline({
      runChatTurn: ctx.runChatTurn,
      applyRegexReplace: ctx.applyRegexReplace,
      resolveImageUrl: (ref) => ctx.resolveImageUrl({ ownerId: prep.runAsUserId, chatId: prep.chatId, ref }),
      assembleContext: prep.assembleContext,
      canon: scopeCanon(canonAll, persist, target),
      historyMacroNames,
      connection: prep.connection,
      intent: prep.intent,
      extraStopSequences: prep.extraStopSequences,
      kind: prep.kind,
      ownerConsented,
      chatId: prep.chatId,
      appendUserTurn: prep.appendUserTurn,
      groupNudge: prep.groupNudge,
      // Set by the group round driver; absent falls back to the single-speaker pinned/merged default.
      shape: prep.shape,
      signal: prep.signal,
      tools: ctx.tools,
      attachedToolNames: prep.attachedToolNames ?? [],
      toolRecurseLimit: prep.toolRecurseLimit ?? TOOL_RECURSE_LIMIT_DEFAULT,
      toolExecFrame: {
        runAsUserId: prep.runAsUserId,
        triggeredBy: prep.triggeredBy,
        chatId: prep.chatId,
        roster: prep.toolRoster ?? null,
        signal: prep.signal,
      },
      onDelta: (delta) => {
        void deps.emit({ type: "delta", chatId: prep.chatId, delta });
      },
    });
    const genFinishedAt = ctx.now();
    if (result.imageDropped) {
      await deps.emit({ type: "warning", chatId: prep.chatId, code: "image_dropped" });
    }
    if (result.toolsUnsupported) {
      await deps.emit({ type: "warning", chatId: prep.chatId, code: "tools_unsupported" });
    }
    // A display affordance only, distinct from turnCompleted (fires after persist below).
    if (result.reasoning !== null) {
      await deps.emit({ type: "reasoningStreamDone", chatId: prep.chatId });
    }
    // Which WI entries fired this turn; empty pool means no emit (no lore fired is not an activation event).
    if (result.worldInfoEntryIds.length > 0) {
      await deps.emit({
        type: "worldInfoActivated",
        chatId: prep.chatId,
        entryIds: [...result.worldInfoEntryIds],
      });
    }
    const view = await commitGeneration({
      ctx,
      deps,
      prep,
      persist,
      target,
      result,
      nextSeq: maxSeq + 1,
      genStartedAt,
      genFinishedAt,
    });
    await deps.emit({ type: "turnCompleted", chatId: prep.chatId, intent, messageId: view.id });
    // Fans chatsChanged to every present human member's live channel (chat-list recency); fired once here for
    // the whole turn, not also on messageCommitted above (would triple-invalidate list keys).
    void ctx.emitChatChanged(prep.chatId);

    // Fire-and-forget memory trigger, must not block the reply; skipped entirely when the host disabled
    // memory. Reads the same resolved host config recall does, so its tuning is honored too.
    const memoryConfig = prep.memoryConfig;
    if (memoryConfig?.mode !== "off") {
      // Reuses the per-chat producer the SHAPE path already built (character + persona name maps), so build
      // and assemble agree.
      const macroNames = historyMacroNames;
      void Promise.resolve().then(async () => {
        try {
          await deps.generateSegments(ctx, {
            chatId: prep.chatId,
            config: memoryConfig,
            macroNames,
          });
          const roster = await loadRoster(ctx.db, prep.chatId);
          const chars = roster.flatMap((r) => (r.kind === "character" && r.characterId !== null ? [r.characterId] : []));

          // Group-as-character scope (only for groups): the single synthetic bucket, keyed by the real
          // minted synthetic-character row id, never the fabricated `__group__` handle string.
          if (chars.length > 1) {
            const groupCharacterId = await resolveGroupBucketCharacterId(ctx, {
              ownerId: prep.runAsUserId,
              chatId: prep.chatId,
            });
            await deps.generateDigests(ctx, {
              scope: { chatId: prep.chatId, scopedCharacterId: groupCharacterId, isGroup: true },
              config: memoryConfig,
              macroNames,
            });
          }
          await Promise.all(
            chars.map((charId) =>
              deps.generateDigests(ctx, {
                scope: {
                  chatId: prep.chatId,
                  scopedCharacterId: charId,
                  isGroup: chars.length > 1,
                },
                config: memoryConfig,
                macroNames,
              }),
            ),
          );
        } catch (memErr) {
          // Must never surface to the caller, but must not be invisible — log + emit a machine-dispatchable
          // warning code.
          getLog().warn({ err: memErr, chatId: prep.chatId }, "memory: post-turn build failed");
          try {
            await deps.emit({ type: "warning", chatId: prep.chatId, code: "memory_build_failed" });
          } catch {
            // A failed warning emit must never re-throw out of the fire-and-forget.
          }
        }
      });
    }

    return committedOutcome([view]);
  } catch (err) {
    await deps.emit({
      type: "turnAborted",
      chatId: prep.chatId,
      intent,
      reason: abortReasonFor(err),
    });
    throw err;
  }
}

/** Builds the per-turn engine. `runTurn` acquires the per-chat lock (refusing `locked` if a turn is in
 *  flight), runs the lifecycle in-lock, and always releases it. A `prep.lockFree` turn skips the lock
 *  entirely so it runs concurrent with a locked send. */
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
      throw new ChatOperationError(CHAT_OP_CODES.locked, "a turn is already in flight for this chat");
    }
    try {
      return await executeTurn(ctx, deps, prep);
    } finally {
      await releaseLock(ctx.db, prep.chatId, deps.holder);
    }
  };
  return { runTurn };
}
