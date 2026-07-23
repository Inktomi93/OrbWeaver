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

import type { AssembleContext, ChatBusEvent, MessageView, TurnAbortReason } from "@orb/contracts/chat";
import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";

import type { ContinuePostfix } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { CharacterId, ChatId, ChatTurnId, MessageId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context";
import type { DebitBudgetOp, ResolveTurnPolicyOp } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type { MemoryConfig, MemoryPassCounts, MemoryScope, MsgRow, WitnessInterval } from "../contract/memory";
import { TOOL_RECURSE_LIMIT_DEFAULT } from "../contract/metadata";
import type { HistoryMacroNames, TurnEconomics, TurnEngine, TurnIntent, TurnKind, TurnOutcome, TurnPersist, TurnPrep } from "../contract/results";
import {
  appendVariantStatements,
  buildCommittedMessageView,
  combineReasoning,
  continueVariantStatements,
  insertCanonMessageStatements,
} from "../persistence/canon-write";
import { refreshLock, releaseLock, tryAcquireLock } from "../persistence/lock";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import { loadCanonHistory, loadCanonStatRows, loadMaxMessageSeq, loadMessageView, loadSlotTarget, loadVariableDeltas } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { resolveGroupBucketCharacterId } from "../substrate/group-bucket";
import { foldChain, runtimeVariablesUpdateStatement } from "../substrate/runtime-variables";
import { assistantTurnDelta, canonMessageDelta, swipeVariantDelta } from "../substrate/stats-delta";
import { debitTurnBudget } from "./budget";
import { runTurnPipeline } from "./pipeline";
import { abortedOutcome, committedOutcome } from "./result";
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
  /** Injected witnessing-horizon reader (memory's `chat_participants` presence read) — the engine sources a
   *  cast character's join/leave horizons to gate its SCOPED digest build. Injected (not imported) because the
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
      readonly config?: MemoryConfig | null | undefined;
      readonly recent?: readonly MsgRow[] | undefined;
      readonly names?: ReadonlyMap<CharacterId, string> | undefined;
    },
  ) => Promise<string>;
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

/** The pre-start gate + connection resolve for a turn: identify the agent speaker (if any), run the
 *  `canAgent('speak')` capability gate, then resolve the EFFECTIVE connection. An agent speaker voices through
 *  its OWN host-funded brain (`resolveRole('agent')`, D60; agent-principal-design/04 §5); a null resolution
 *  (no coherent host-funded agent connection) falls back to the round connection, itself host-funded. A
 *  character/human/narrator keeps the round connection BYTE-IDENTICALLY (agentUserId null short-circuits both).
 *  Runs BEFORE the consent belt so the belt + the infra firewall gate on the source actually dispatched. */
function gateAndResolveConnection(_ctx: ChatContext, prep: TurnPrep, _persist: TurnPersist, _target: SlotTarget | null): ResolvedConnection {
  return prep.connection;
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
      // Turn origin (03 §4) — stamped on the reply slot. Absent on `prep` ⇒ the DB default ('human'/0), so a
      // human/character/agent turn is byte-identical; an automation `requestTurn` (A6) threads these through.
      ...(prep.initiator !== undefined ? { initiator: prep.initiator } : {}),
      ...(prep.automationDepth !== undefined ? { automationDepth: prep.automationDepth } : {}),
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

/** Fire-and-forget the injected expressions post-turn classify (expressions-design/02 §3): after the variant
 *  commits, classify the speaker's affect and emit an ephemeral sprite-swap. Null op = expressions not wired
 *  (byte-identical no-op — the memory-trigger posture). The op swallows its own errors; `.catch` covers a
 *  synchronous throw so nothing reaches the reply path. */
function fireExpressionClassify(ctx: ChatContext, view: MessageView): void {
  if (ctx.expressions !== null) {
    void ctx.expressions.onTurnCompleted(view.chatId, view.id, view.selectedVariantId).catch(() => undefined);
  }
}

/** Fire-and-forget the rpg post-turn FLUSH (rpg-design/10 §R4): after the variant commits, flush the turn's
 *  staged tool writes onto the committed variant, keyed by `turnId`. Null op = rpg not wired (byte-identical
 *  no-op). Fire-and-forget with `.catch` — a background staging flush must NEVER turn a committed reply into an
 *  abort; the reply already landed. Inert until the rpg tool registrants stage anything (R4 #2/#3). */
function fireRpgTurnCompleted(ctx: ChatContext, view: MessageView, turnId: ChatTurnId): void {
  if (ctx.rpg !== null) {
    void ctx.rpg.onTurnCompleted(view.chatId, view.id, view.selectedVariantId, turnId).catch(() => undefined);
  }
}

/** Fire-and-forget the rpg turn-abort CLEAR (rpg-design/10 §R4 hardening a): drop the turn's staged tool
 *  writes so a dead turn never flushes into the next turn on this chat. Null op = rpg not wired. Fire-and-
 *  forget — clearing staging must never mask the abort the caller is already surfacing. */
function fireRpgTurnAborted(ctx: ChatContext, chatId: ChatId, turnId: ChatTurnId, reason: TurnAbortReason): void {
  if (ctx.rpg !== null) {
    void ctx.rpg.onTurnAborted(chatId, turnId, reason).catch(() => undefined);
  }
}

/** Mark the turn eligible to feed the player's queued d20 into its first skill check (rpg-design/05 §6) — only
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
 *  fault (provider/DB) → "error". */
function abortReasonFor(err: unknown, signal: AbortSignal | undefined): TurnAbortReason {
  if (signal?.aborted === true) {
    return signal.reason instanceof StaleLockAbort ? "stale" : "user";
  }
  // Defensive belt for a provider that throws a name-based AbortError WITHOUT the signal reflecting it.
  return err instanceof Error && err.name === "AbortError" ? "user" : "error";
}

/** This turn's cascade depth (automation-design/03 §4): a human turn is 0; an automation/plugin-initiated turn
 *  carries `parent + 1` on `prep`. Extracted so the nullish default stays OUT of `executeTurn`'s cognitive
 *  budget — the value rides the `turnAborted` event (the abort commits no reply slot to read depth back from). */
function turnCascadeDepth(prep: TurnPrep): number {
  return prep.automationDepth ?? 0;
}

/** Per-speaker witnessed recall (D6): re-resolve `{{memory}}` for THIS speaker's own egocentric bucket,
 *  horizon-filtered by its join/leave presence, and return a fresh assembleContext with that `memory`.
 *
 *  GATED to a genuinely SCOPED per-speaker turn voiced by a real cast character:
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
    return prep.assembleContext;
  }
  const witnessing = await deps.loadWitnessHorizons(ctx.db, prep.chatId, speakerCharId);
  const memory = await deps.recallMemory(ctx, {
    scope: { chatId: prep.chatId, scopedCharacterId: speakerCharId, isGroup: true },
    groupCharacterId: recall.groupCharacterId,
    witnessing,
    config: recall.config,
    recent: recall.recent,
    names: recall.names,
  });
  return { ...prep.assembleContext, memory };
}

/** The turn body, parametrized by persist mode + lock-freedom: security belts → resolve persist target →
 *  turnStarted → assemble/generate → persist → turnCompleted. On a post-start error: emit turnAborted then
 *  rethrow. Pre-start refusals throw a coded error and emit nothing. */
async function executeTurn(ctx: ChatContext, deps: EngineDeps, prep: TurnPrep): Promise<TurnOutcome> {
  // Absent persist mode = a new assistant slot. append-variant/continue load the write target before
  // turnStarted — a missing target is a pre-start refusal (leak-free NOT_FOUND, emits nothing). Resolved
  // FIRST (before the consent/budget belts) so the agent-speaker id + its connection are known while the
  // belts still gate — a refused turn never debits budget, and the belt sees the ACTUAL connection.
  const persist: TurnPersist = prep.persist ?? { mode: "new-slot", role: "assistant" };
  const target = persist.mode === "new-slot" ? null : ((await loadSlotTarget(ctx.db, prep.chatId, persist.targetMessageId)) ?? null);
  if (persist.mode !== "new-slot" && target === null) {
    throw new ChatNotFoundError(prep.chatId);
  }

  // The agent-speaker capability gate + the per-agent connection swap (D60): a disabled/force-injected agent
  // is refused pre-start (emits nothing), and a valid agent speaker voices through its OWN host-funded brain.
  // A character/human keeps the round connection byte-identically.
  const connection = gateAndResolveConnection(ctx, prep, persist, target);

  // Security belts before any turnStarted: consent + budget debit attributed to triggeredBy, on the
  // EFFECTIVE connection (the agent's own, or the round connection).
  const policy = await deps.resolveTurnPolicy(prep.runAsUserId);
  const identity = { triggeredBy: prep.triggeredBy, runAsUserId: prep.runAsUserId };
  assertMaxProSubConsent({
    source: connection.credential.source,
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

  const intent = KIND_TO_INTENT[prep.kind];
  // This turn's OWN cascade depth (automation-design/03 §4), resolved once — a human turn is 0, an
  // automation/plugin-initiated turn carries its parent+1. Rides `turnAborted` (below) so the automation
  // fact-resolver can gate the cascade without a reply slot to read `getTurnOrigin` off (there is none on abort).
  const abortDepth = turnCascadeDepth(prep);
  // The turn's ephemeral identity (rpg-design/10 §R4) — minted once, threaded to the tool-exec frame + the rpg
  // turn-end hooks so a turn-scoped registrant correlates the turn's tool writes to its commit/abort flush.
  const turnId = ctx.newChatTurnId();
  markRpgDiceEligible(ctx, prep, turnId);
  await deps.emit({
    type: "turnStarted",
    chatId: prep.chatId,
    intent,
    api: connection.api,
    source: connection.credential.source,
    model: connection.model,
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
    // Per-speaker witnessed recall (D6): a scoped round's each speaker recalls its OWN egocentric memory,
    // horizon-filtered by ITS join/leave presence — so a late joiner never recalls scenes before it arrived.
    // Merged/narrator/solo/agent turns keep the round-level `memory` (byte-identical). A fresh shape, never a
    // mutation of the immutable ctx (§5, the speaker-card precedent).
    const speakerAssembleContext = await resolveSpeakerMemory(ctx, deps, prep);
    // The engine measures the wall-clock window around the role call and stamps it on the variant.
    const genStartedAt = ctx.now();
    const result = await runTurnPipeline({
      runChatTurn: ctx.runChatTurn,
      applyRegexReplace: ctx.applyRegexReplace,
      resolveImageUrl: (ref) => ctx.resolveImageUrl({ ownerId: prep.runAsUserId, chatId: prep.chatId, ref }),
      assembleContext: speakerAssembleContext,
      canon: scopeCanon(canonAll, persist, target),
      historyMacroNames,
      // The D50 `assembled_dynamic` PromptTransform op (04 §6); null ⇒ byte-identical dynamic half.
      applyPromptTransforms: ctx.promptTransforms,
      connection,
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
        turnId,
        signal: prep.signal,
      },
      onDelta: (delta) => {
        void deps.emit({ type: "delta", chatId: prep.chatId, delta });
      },
    });
    const genFinishedAt = ctx.now();
    await emitCapabilityDropWarnings(deps.emit, prep.chatId, result);
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
          // Each cast character's SCOPED bucket is gated by its own join/leave horizons — a member digests
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
                config: memoryConfig,
                macroNames,
                witnessing: await deps.loadWitnessHorizons(ctx.db, prep.chatId, charId),
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

    fireExpressionClassify(ctx, view);
    fireRpgTurnCompleted(ctx, view, turnId);

    return committedOutcome([view]);
  } catch (err) {
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
    // Carry the aborting turn's OWN cascade depth (automation-design/03 §4): an aborted turn commits no reply
    // slot, so the automation fact-resolver cannot read this back through `getTurnOrigin` — it must ride the
    // event. A depth ≥ 1 abort (this turn was itself automation-initiated) makes the `turnAborted` fact depth
    // ≥ 1, so the cascade guard suppresses non-opted `turnAborted` rules (closes the retry-on-failure self-loop).
    await deps.emit({ type: "turnAborted", chatId: prep.chatId, intent, reason, automationDepth: abortDepth });
    // CLEAR the turn's staged tool writes on every abort path (user/stale/error) so a dead turn never flushes
    // into the next turn on this chat (rpg-design/10 §R4 hardening a).
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
  let rejectLockLost!: (err: unknown) => void;
  const lockLostBarrier = new Promise<never>((_resolve, reject) => {
    rejectLockLost = reject;
  });
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
  try {
    return await Promise.race([executeTurn(ctx, deps, { ...prep, signal: composedSignal }), lockLostBarrier]);
  } finally {
    clearInterval(beat);
    await releaseLock(ctx.db, prep.chatId, deps.holder);
  }
}

/** Builds the per-turn engine. `runTurn` acquires the per-chat lock (refusing `locked` if a turn is in
 *  flight), runs the lifecycle in-lock under a TTL heartbeat, and always releases it. A `prep.lockFree`
 *  turn skips the lock (and the heartbeat) entirely so it runs concurrent with a locked send. */
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
    return await runInLockWithHeartbeat(ctx, deps, prep);
  };
  return { runTurn };
}

/** Emit the domain `warning` events for the capability drops the pipeline flagged this turn (image parts,
 *  tools, structured output). Extracted so the generation lifecycle stays under the cognitive-complexity cap.
 *  @internal exported for the drop-warning unit test — the structured-output flag has no engine INPUT path yet
 *  (no chat consumer sets `responseFormat`, 04 §3), so the emit branch is only reachable directly. */
async function emitCapabilityDropWarnings(
  emit: (event: ChatBusEvent) => Promise<void>,
  chatId: ChatId,
  result: { readonly imageDropped: boolean; readonly toolsUnsupported: boolean; readonly structuredOutputUnsupported: boolean },
): Promise<void> {
  if (result.imageDropped) {
    await emit({ type: "warning", chatId, code: "image_dropped" });
  }
  if (result.toolsUnsupported) {
    await emit({ type: "warning", chatId, code: "tools_unsupported" });
  }
  if (result.structuredOutputUnsupported) {
    await emit({ type: "warning", chatId, code: "structured_output_unsupported" });
  }
}
