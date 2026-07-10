// domain/chat/engine/engine — the turn LIFECYCLE shell. SINGLE-SPEAKER CORE: one resolved speaker per turn — NO multi-speaker arbitration /
// auto-mode (the engine TAKES the resolved speaker on `TurnPrep`; the "who/how-many speaks" chunk wraps this)
// (that "who/how-many speaks" seam is left clean). The D48 tool-recurse loop IS built (PD-54 — `pipeline.ts`
// `runRecurseLoop`): the pipeline recurses on `finishReason:"tool"` up to `toolRecurseLimit`.
//
// THE LIFECYCLE (read top to bottom in `executeTurn`):
//   acquire lock (per-chat; stale-steal — persistence/lock) → IN-LOCK: the §9 security belts (max-pro-sub
//   by-proxy consent + the per-member COUNT budget DEBIT, attributed to `triggeredBy`) → emit `turnStarted`
//   → load canon + next-seq → `runTurnPipeline` (assemble→shape→run→reduce→fit) → persist the canon (the D26
//   slot+variant 3-step dance + the stats delta, ONE atomic `db.batch`) → emit `messageCommitted` +
//   `turnCompleted` → release lock. On any error AFTER `turnStarted`: emit `turnAborted` (reason `error` /
//   `user`) THEN RETHROW — never swallow (error-paths-flag-don't-swallow). The pre-start belt
//   refusals (locked / consent_required / budget_exceeded) throw a coded `ChatOperationError` and emit
//   nothing (the turn never started).
//
// BUS-NOT-ON-CTX / BUDGET-NOT-ON-CTX (FLAG): the chat bus `emit`, the per-member budget DEBIT, and the
// per-turn host POLICY (consent flag + budget cap, which need host settings under the frozen `runAsUserId`)
// are NOT `ChatContext` ops — the bus is chat's own collaborator (bus.ts FLAG[bus-not-on-ctx]); the budget
// primitive lives in `transport/` ABOVE the cake (budget.ts FLAG[budget-op-not-on-ctx]); there is no
// settings-read op on `ChatContext`. All three are injected as ENGINE deps wired at the entry composition
// root (`service.ts`, exempt). FLAGGED for that chunk.

import type { ChatBusEvent, MessageView, TurnAbortReason } from "@orb/contracts/chat";
import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import type { ContinuePostfix } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, isConstraintViolation } from "@orb/db/kit";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { getLog } from "#foundation/observability";
import type { ChatContext, DebitBudgetOp, ResolveTurnPolicyOp } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type {
  MemoryConfig,
  MemoryPassCounts,
  MemoryScope,
  WitnessInterval,
} from "../contract/memory";
import { TOOL_RECURSE_LIMIT_DEFAULT } from "../contract/metadata";
import type {
  HistoryMacroNames,
  TurnEconomics,
  TurnEngine,
  TurnIntent,
  TurnKind,
  TurnOutcome,
  TurnPersist,
  TurnPrep,
} from "../contract/results";
import {
  appendVariantStatements,
  buildCommittedMessageView,
  combineReasoning,
  continueVariantStatements,
  insertCanonMessageStatements,
} from "../persistence/canon-write";
import { releaseLock, tryAcquireLock } from "../persistence/lock";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import {
  loadCanonHistory,
  loadCanonStatRows,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
  loadVariableDeltas,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { resolveGroupBucketCharacterId } from "../substrate/group-bucket";
import { foldChain, runtimeVariablesUpdateStatement } from "../substrate/runtime-variables";
import { assistantTurnDelta, canonMessageDelta, swipeVariantDelta } from "../substrate/stats-delta";
import { debitTurnBudget } from "./budget";
import { runTurnPipeline } from "./pipeline";
import { committedOutcome } from "./result";
import { assertMaxProSubConsent, resolveOwnerConsented } from "./turn-identity";

/** The non-ctx engine deps wired at the composition root (FLAG[bus/budget-not-on-ctx] — see header). */
interface EngineDeps {
  /** The chat bus emit (durable-first; chat's own collaborator). */
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  /** The per-member COUNT budget debit (transport `MemberBudget.debit`). */
  readonly debitBudget: DebitBudgetOp;
  /** The per-turn host policy (budget cap + consent flag) under the frozen `runAsUserId`. */
  readonly resolveTurnPolicy: ResolveTurnPolicyOp;
  /** The lock holder tag (this replica/turn id) for stale-takeover + holder-scoped release. */
  readonly holder: string;
  /** The per-chat lock TTL (ms) — sized for one turn. */
  readonly lockTtlMs: number;
  /** Injected memory segment builder (domain-no-cross-subsystem rule). Typed to the real
   *  `memory/build/segments.generateSegments` signature — NO `any` (an `any`-typed injected dep is exactly
   *  what disabled compile defense at the seam that broke group memory; stickler slice-1 F1/F1c). */
  readonly generateSegments: (
    ctx: ChatContext,
    args: {
      readonly chatId: ChatId;
      readonly config?: MemoryConfig | null | undefined;
      readonly macroNames?: RowMacroNameContext | undefined;
      readonly signal?: AbortSignal | undefined;
    },
  ) => Promise<MemoryPassCounts>;
  /** Injected memory digest builder (domain-no-cross-subsystem rule). Typed to the real
   *  `memory/build/digests.generateDigests` signature — the `scope` is a real {@link MemoryScope}
   *  (`scopedCharacterId` is a real `CharacterId`, inv 8), never a fabricated handle. */
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

/** Map the engine's 8-kind turn axis → the public 5-member bus `TurnIntent` (one home; no inline re-spell).
 *  `opening`/`auto`/`force` all surface as their nearest public lifecycle intent. */
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

/** The resolved continuation delimiter for each `ContinuePostfix` axis member (F4) — the string spliced
 *  BETWEEN a continue turn's existing variant tip and the newly-generated chunk. A mapped Record so a new
 *  axis member fails `tsc` (string-union dispatch). Absent/`none` ⇒ byte-adjacent (the pre-F4 behavior). */
const CONTINUE_POSTFIX_DELIMITER: Record<ContinuePostfix, string> = {
  none: "",
  space: " ",
  newline: "\n",
  "double-newline": "\n\n",
};

/** The continuation delimiter this turn's resolved preset configures (F4 — `PromptConfig.continuePostfix`
 *  was a dead knob: continue raw-concatenated the tip + chunk). Read off the immutable assemble ctx so the
 *  commit write AND the mirror stats delta join through ONE home — the drift gate breaks if they diverge. */
function continuePostfixDelimiter(prep: TurnPrep): string {
  return CONTINUE_POSTFIX_DELIMITER[prep.assembleContext.promptConfig.continuePostfix ?? "none"];
}

/** The shared economics subset (variant columns ∩ stats input). Null-coalesced — an unreported field
 *  contributes nothing downstream. */
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

/** The loaded write target for an `append-variant`/`continue` turn (the engine reads it pre-start). The
 *  `loadSlotTarget` row — file-local alias (the inferred persistence shape). */
type SlotTarget = NonNullable<Awaited<ReturnType<typeof loadSlotTarget>>>;

/** Re-read a just-committed message's authoritative `MessageView` (append-variant/continue produce a
 *  `variantCount`/`selectedVariantIdx`/content the in-memory insert params don't know — unlike a fresh slot). */
async function readCommittedView(ctx: ChatContext, messageId: MessageId): Promise<MessageView> {
  const view = await loadMessageView(ctx.db, messageId);
  if (view === undefined) {
    // A committed message that vanished mid-batch is a real invariant breach, never a routine miss.
    throw new Error(`message ${messageId} vanished mid-commit`);
  }
  return view;
}

/** Build the variant payload (content + reasoning + economics + per-swipe snapshot) one home — every persist
 *  mode writes the SAME generation record (D26). */
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
    // D26 provenance columns (F10) — the runner-echoed output cap + the requested reasoning effort.
    maxOutputTokens: e?.maxOutputTokens ?? null,
    reasoningEffort: e?.reasoningEffort ?? null,
    contextBoundaryMessageId: result.contextBoundaryMessageId,
    // The pipeline window the engine measured (D26 gen bounds) — the reconcile + the live stats mirror both
    // read `gf − gs` for gen-time/throughput (F2).
    genStartedAt,
    genFinishedAt,
    ttftMs: e?.ttftMs ?? null,
    finishReason: e?.finishReason ?? null,
    stopReason: e?.stopReason ?? null,
    terminalReason: e?.terminalReason ?? null,
    params: prep.intent,
    promptSnapshot: result.request.prompt,
    // D46 runtime plane: the turn's macro op-log (setvars recorded across every section render + regex/guided
    // context, by-reference) IS this variant's delta — COPIED (the shared per-round array is cleared after each
    // speaker's commit, so a snapshot must not alias it). Empty ⇒ persisted as null (the "no mutations" contract).
    variableDelta: [...(prep.assembleContext.opLog ?? [])],
    // D48 — the turn's cumulative tool exchange; [] ⇒ null (a tool-less turn persists no column value).
    toolCalls: result.toolRecords.length > 0 ? result.toolRecords : null,
  };
}

/** The economics + gen-window a mirror-builder canon row reads for the FRESHLY-generated variant (the reduced
 *  `final` chunk + the measured pipeline window). Null-coalesced to the sparse-patch contract; `metadata` is
 *  always null on the live path (the engine writes no `reasoning_duration`). Shared by the append-variant /
 *  continue signed-delta rows so they mirror `reconcileStats`'s fold column-for-column (F1/F2/F6). */
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

/** The pre-mutation SELECTED-variant stat row of the target slot — the OLD state an append-variant / continue
 *  delta subtracts. Loaded BEFORE the batch (the mirror builders' signed `(new − old)` needs the row exactly
 *  as the rebuild would fold it pre-write). File-local alias for the inferred query shape. */
type CanonStatRow = Awaited<ReturnType<typeof loadCanonStatRows>>[number];

/**
 * The per-turn stats delta(s) the commit applies, matching what `reconcileStats` folds for the SAME canon
 * change (the drift-gate contract, stats inv #3). ONE builder per persist mode (F1 — the engine used to emit
 * a full `assistantTurnDelta` for ALL modes, so every swipe/continue inflated `assistantTurns` and no swipe
 * ever counted):
 *   • new-slot assistant — the existing {@link assistantTurnDelta} (now carrying the measured gen-time F2 +
 *     the context window F6). A fresh assistant slot's fold.
 *   • new-slot user (impersonate) — {@link canonMessageDelta} on a `role:"user"` row (userTurns + economics,
 *     never an assistant turn / model bucket — the rebuild folds a user row that way).
 *   • append-variant (swipe) — the selected-swap: remove the OLD variant as the selected message (−1), add it
 *     back as a swipe (+1, foldSwipe drops swipe cost), add the NEW variant as the selected message (+1).
 *   • continue — `(new − old)` on the slot: the extended variant as a message (+1) minus its pre-continue
 *     state (−1).
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
    // impersonate (`role:"user"`): the rebuild folds a user row (userTurns + the generation's economics, NO
    // assistantTurns / character / model grain) — the full assistantTurnDelta miscounted it as an assistant.
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

  // append-variant / continue mutate an EXISTING slot — load its pre-mutation selected-variant row so the
  // signed deltas subtract exactly what the rebuild folded before the write.
  const old = target === null ? undefined : await loadOldStatRow(ctx, prep, target);
  if (old === undefined || target === null) {
    // Unreachable: executeTurn refuses a missing target pre-start (a null here is a wiring bug).
    throw new ChatNotFoundError(prep.chatId);
  }

  if (persist.mode === "append-variant") {
    return [
      // Remove the old selected variant AS THE SELECTED MESSAGE.
      canonMessageDelta({ ownerId, sign: -1, now, row: old }),
      // Add it back AS A SWIPE (the non-selected variant — foldSwipe: re-roll counters, no daily/cost).
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
      // Add the NEW variant AS THE SELECTED MESSAGE (now settled: variantCount+1, selected at the appended idx).
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

  // continue: `(new − old)` on the slot — the extended variant replaces the pre-continue one (same idx/count).
  return [
    canonMessageDelta({
      ownerId,
      sign: 1,
      now,
      row: {
        characterId: old.characterId,
        role: old.role,
        createdAt: old.createdAt,
        // F4: mirror the commit's postfix-delimited join so the drift gate holds (both sides join identically).
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

/** Load the target slot's pre-mutation selected-variant stat row (the append-variant / continue OLD state). */
async function loadOldStatRow(
  ctx: ChatContext,
  prep: TurnPrep,
  target: SlotTarget,
): Promise<CanonStatRow | undefined> {
  const rows = await loadCanonStatRows(ctx.db, prep.chatId, [target.messageId]);
  return rows.at(0);
}

/** Build ONE persist-mode's canon statements (D26 new-slot / append-variant / continue) + the committed-view
 *  reader, for a given tail `seq`. Extracted from {@link commitGeneration} so its F3 seq-collision retry loop
 *  stays under the cognitive-complexity ceiling. Re-mints the new-slot ids on every call (the retry needs
 *  fresh ids). */
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
    // A fresh slot at the canon tail. `role:"assistant"` voices the speaker; `role:"user"` (impersonate) is
    // human-voiced (authorUserId/personaId, no character). The view reconstructs without a re-read (D26).
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
    // append-variant / continue need a target; the pre-start load guarantees it. A null here is a wiring bug.
    throw new ChatNotFoundError(prep.chatId);
  }
  if (persist.mode === "append-variant") {
    // A swipe/regenerate: append a sibling variant at the next idx + select it (slot attribution unchanged).
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
  // continue: extend the selected variant in place; snapshot the pre-continue state + record the appended
  // continuation so undo/revert round-trip (D26). F4: the preset's configured continuePostfix delimiter is
  // spliced between the tip and the chunk, folded INTO the continuation piece so `revertContinue`'s
  // `preContinue + lastContinuation` re-join reproduces the committed content byte-for-byte.
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

/** Commit a turn's generation per the persist MODE (D26 — new-slot / append-variant / continue) + the stats
 *  delta in ONE atomic batch, then emit `messageCommitted`. The stats delta is attributed to the host
 *  (`runAsUserId`) and the VOICED slot's character (the new-slot speaker / the target slot's character). The
 *  spine (belts → turnStarted → pipeline → emit) is identical across modes; ONLY this step varies. */
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
  // D46: a group round REUSES one assembleContext across its speakers (round.ts `buildSpeakerPrep`), so the
  // by-reference op-log accumulates. `variant.variableDelta` snapshotted THIS turn's ops above; clear the shared
  // log now so the next speaker's delta starts empty (each variant records only the mutations ITS assembly ran).
  prep.assembleContext.opLog?.splice(0);

  // ONE commit attempt at a given tail `seq`: build the persist mode's canon statements (re-minting the
  // new-slot ids each call), ride the stats delta(s) + the D46 runtime-vars fold on the SAME atomic batch, and
  // reconstruct/re-read the view. A new-slot insert is the ONLY mode that writes a fresh `(chatId, seq)` row,
  // so it is the only one that can raise `messages_chat_seq_unique` — see the F3 retry below.
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

    // The canon statements + the stats delta(s) → ONE atomic batch (the rollups commit WITH the canon write).
    // ONE builder per persist mode (D26) so the live delta mirrors what `reconcileStats` folds for this same
    // canon change — a swipe emits the selected-swap, a continue emits `(new − old)`, never a full new-turn
    // delta for all three (F1). Loaded pre-batch (the OLD selected-variant row the signed delta subtracts).
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

    // D46 runtime plane: recompute `chats.runtime_variables` reflecting THIS commit's delta, in the SAME atomic
    // batch as the canon write. The fold source is the CURRENT selected-variant chain (loaded pre-batch) with
    // this turn's variant folded in: new-slot APPENDS at the tail seq; append-variant/continue OVERRIDE the
    // target slot's delta (its selected variant is now this turn's). Derive-don't-stamp — a later swipe re-folds.
    const turnDelta = variant.variableDelta ?? [];
    const currentDeltas = await loadVariableDeltas(ctx.db, prep.chatId);
    const postEntries =
      persist.mode === "new-slot" || target === null
        ? [...currentDeltas, { seq, delta: turnDelta }]
        : currentDeltas.map((e) =>
            e.messageId === target.messageId ? { seq: e.seq, delta: turnDelta } : e,
          );
    statements.push(runtimeVariablesUpdateStatement(ctx.db, prep.chatId, foldChain(postEntries)));

    await ctx.db.batch(batchMany(statements));
    return loadView();
  };

  // F3: a lock-free `generate` runs CONCURRENT with a locked `send` (active-turns never refuses), and both
  // allocate `maxSeq + 1` before the pipeline — so the slower committer's new-slot insert can LOSE the
  // `messages_chat_seq_unique` race AFTER the generation was already paid + streamed. Re-derive the now-higher
  // head, re-mint fresh ids, and retry the commit ONCE (the generation is in hand — no re-pay), mirroring
  // persistUserMessage's U1. Only a new-slot insert raises this UNIQUE; the first (failed) batch rolled back
  // atomically BEFORE any emit, so the retry double-commits nothing. A second collision (a third writer)
  // surfaces raw — astronomically unlikely, never silently swallowed.
  const view = await attempt(nextSeq).catch(async (err: unknown) => {
    if (persist.mode === "new-slot" && isConstraintViolation(err)?.kind === "unique") {
      return attempt((await loadMaxMessageSeq(ctx.db, prep.chatId)) + 1);
    }
    throw err;
  });
  await deps.emit({ type: "messageCommitted", chatId: prep.chatId, messageId: view.id, view });
  return view;
}

/** Scope the loaded canon to the turn's context window per persist mode: a new-slot turn sees the FULL canon;
 *  a swipe/regenerate (`append-variant`) regenerates from the context BEFORE the target slot; a `continue`
 *  sees the canon UP TO AND INCLUDING the slot (the partial it extends). */
function scopeCanon(
  canon: readonly MessageView[],
  persist: TurnPersist,
  target: SlotTarget | null,
): readonly MessageView[] {
  if (persist.mode === "new-slot" || target === null) {
    return canon;
  }
  return persist.mode === "append-variant"
    ? canon.filter((m) => m.seq < target.seq)
    : canon.filter((m) => m.seq <= target.seq);
}

/** Which abort reason a thrown error maps to (a caller-cancel `AbortError` → `user`; else `error`). */
function abortReasonFor(err: unknown): TurnAbortReason {
  return err instanceof Error && err.name === "AbortError" ? "user" : "error";
}

/** The turn body, parametrized by the persist MODE (D26) + lock-freedom: the §9 belts
 *  → resolve the persist target → `turnStarted` → assemble/generate (scoped canon) → persist → `turnCompleted`.
 *  On a post-start error: emit `turnAborted` (reason `user` for an abort-signalled cancel, else `error`) then
 *  RETHROW (never swallow). The pre-start belt refusals + a missing write-target throw a coded error and emit
 *  nothing (the turn never started). */
async function executeTurn(
  ctx: ChatContext,
  deps: EngineDeps,
  prep: TurnPrep,
): Promise<TurnOutcome> {
  // §9 security belts (BEFORE any turnStarted): consent + budget debit attributed to triggeredBy.
  const policy = await deps.resolveTurnPolicy(prep.runAsUserId);
  const identity = { triggeredBy: prep.triggeredBy, runAsUserId: prep.runAsUserId };
  assertMaxProSubConsent({
    source: prep.connection.credential.source,
    identity,
    ownerConsent: policy.allowNonOwnerMaxProSub,
  });
  // D17: the ENFORCED consent verdict as a VALUE (this line runs only AFTER the assert above did NOT throw),
  // threaded onto the built `TurnRequest` so the infra credential firewall re-verifies it (belt-and-suspenders,
  // one direction: domain derives, infra verifies). Owner-initiated (non-proxy) ⇒ true; the max-pro-sub mint
  // gate makes `runAsUserId` the owner, so non-proxy on a hosted turn is the owner speaking on their own box.
  const ownerConsented = resolveOwnerConsented({
    identity,
    ownerConsent: policy.allowNonOwnerMaxProSub,
  });
  await debitTurnBudget(deps.debitBudget, prep.triggeredBy, policy.budget);

  // The persist MODE (D26). ABSENT ⇒ a new assistant slot. append-variant/continue load the write target
  // BEFORE turnStarted — a missing target is a pre-start refusal (leak-free NOT_FOUND, emits nothing).
  const persist: TurnPersist = prep.persist ?? { mode: "new-slot", role: "assistant" };
  const target =
    persist.mode === "new-slot"
      ? null
      : ((await loadSlotTarget(ctx.db, prep.chatId, persist.targetMessageId)) ?? null);
  if (persist.mode !== "new-slot" && target === null) {
    throw new ChatNotFoundError(prep.chatId);
  }

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
    const [canonAll, maxSeq] = await Promise.all([
      loadCanonHistory(ctx.db, prep.chatId),
      loadMaxMessageSeq(ctx.db, prep.chatId),
    ]);
    // Chat-Macro-Resolution.md §1: build the per-chat macro name PRODUCER from the FULL loaded canon's
    // distinct `characterId`/`personaId` stamps — engine-side, AFTER `loadCanonHistory` (the ids aren't
    // knowable in turn PREP). `toShapeCanon` (pipeline.ts) resolves each row's OWN `{{char}}`/`{{user}}`/
    // `{{persona}}` against these maps via `resolveRowMacros` (the shared server/client atom).
    const macroProducer = await loadChatMacroNameProducer(ctx.db, { messages: canonAll });
    const historyMacroNames: HistoryMacroNames = {
      characterNamesById: buildCharacterNameMap(macroProducer.characterNames),
      personaNamesById: buildPersonaNameMap(macroProducer.personaNames),
    };
    // The generation window bounds (D26 gen_started_at/gen_finished_at): the engine owns the pipeline, so it
    // measures the wall-clock window around the role call and stamps it on the variant. `gf − gs` is the ONE
    // gen-time source the reconcile + the live stats mirror both read (F2 — nothing else populated it).
    const genStartedAt = ctx.now();
    const result = await runTurnPipeline({
      runChatTurn: ctx.runChatTurn,
      // The injected node:vm ReDoS watchdog (D53) — the RECEIVE AI_OUTPUT/REASONING regex passes run under it.
      applyRegexReplace: ctx.applyRegexReplace,
      // Resolve image refs under the host's CAS (runAsUserId — the funded owner, like getCard's host scope).
      resolveImageUrl: (ref) =>
        ctx.resolveImageUrl({ ownerId: prep.runAsUserId, chatId: prep.chatId, ref }),
      assembleContext: prep.assembleContext,
      // The canon scoped to the turn's context per persist mode (full / before-target / through-target).
      canon: scopeCanon(canonAll, persist, target),
      historyMacroNames,
      connection: prep.connection,
      intent: prep.intent,
      kind: prep.kind,
      // D17: the enforced owner-consent verdict → the built TurnRequest → the infra firewall re-verify.
      ownerConsented,
      chatId: prep.chatId,
      appendUserTurn: prep.appendUserTurn,
      groupNudge: prep.groupNudge,
      // The per-speaker two-axis SHAPE — set by the group round driver; ABSENT ⇒ the
      // single-speaker core's pinned per-speaker/merged default (solo byte-identical, D16).
      shape: prep.shape,
      // Thread the caller's abort signal → the role; the runner aborts its
      // in-flight request when signalled (a single engine turn is now interruptible mid-generation).
      signal: prep.signal,
      // The D48 recurse-loop axis (tool-use-design/03): ops off ctx; names/roster/limit off prep (the
      // GATHER union — empty today, so the loop degenerates and the request stays byte-identical); the
      // exec frame stays Principal-BLIND (runAsUserId — the entry adapter resolves the host Principal).
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
    // D45: image parts were stripped for a non-vision model — surface it (once per turn) on the bus.
    if (result.imageDropped) {
      await deps.emit({ type: "warning", chatId: prep.chatId, code: "image_dropped" });
    }
    // D48: tools were attached but the model's capability lacks `tools` — dropped, ran tool-less (D51's
    // domain-side gate; the code's ONE emit site).
    if (result.toolsUnsupported) {
      await deps.emit({ type: "warning", chatId: prep.chatId, code: "tools_unsupported" });
    }
    // PD-117: the reasoning channel's stream ended (the drain loop in `reduceStream` exited) — a display
    // affordance ONLY (client reducer: "the slot keeps buffering until terminal"), distinct from
    // `turnCompleted` (fires after persist below). Gated on `result.reasoning !== null` — a turn with no
    // reasoning channel never had a "thinking" affordance to close.
    if (result.reasoning !== null) {
      await deps.emit({ type: "reasoningStreamDone", chatId: prep.chatId });
    }
    // D50 pt-2 (PD-117): which WI entries fired this turn (assembly/context.ts's budget-survived pool) —
    // ST WORLD_INFO_ACTIVATED, the "which lore fired" automation hook. Empty pool ⇒ no emit (no lore fired
    // is not an activation event).
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
    // PD user-bus lane (cross-device + multi-human chat-list recency): fan `chatsChanged` to every present
    // human member's live channel — the assistant settle bumped `lastActivityAt` (character-library recency)
    // and chat-list ordering, which the per-chat bus can't carry to a member's LIST (or to another device).
    // PRINCIPAL-BLIND: only `chatId` crosses — membership is enumerated at the entry root. Fired ONCE here for
    // the whole turn (NOT also on the `messageCommitted` above — the pair fires inside one dup-alarm window, so
    // a second fan would triple-invalidate the list keys). List-only (no `detail`): the per-chat bus already
    // drives the OPEN chat's `getChat` on every subscribed device. One fan per terminal event, no debounce v1.
    void ctx.emitChatChanged(prep.chatId);

    // Memory trigger (§3a): fire-and-forget — must not block the reply. SKIPPED ENTIRELY when the host
    // disabled memory (D36 — `memoryConfig.mode === "off"`, the SAME opt-out recall honors): no roster load,
    // no synthetic-group mint, no summarizer/embed. The build reads the SAME resolved host config recall does
    // (`prep.memoryConfig`, threaded from the one source in `verbs/turn.ts`/`verbs/start-chat.ts`), so its
    // tuning (blockSize/verbatimWindow/…) is honored too — not the baked `resolveCfg(undefined)` defaults.
    const memoryConfig = prep.memoryConfig;
    if (memoryConfig?.mode !== "off") {
      // F3 + G1: render the summarizer transcript by character NAME (D28 live identity) AND resolve the
      // transcript BODY's `{{char}}`/`{{user}}`/`{{persona}}` macros — never the raw typeid or the literal
      // macro. Reuse the per-chat producer the SHAPE path already built above (one source, no re-derive): it
      // carries BOTH the character AND persona name maps, so the build's `resolveRowMacros` pass resolves each
      // row's persona per-stamp — the SAME producer the assemble/display atoms use (so build + assemble agree).
      const macroNames = historyMacroNames;
      void Promise.resolve().then(async () => {
        try {
          await deps.generateSegments(ctx, {
            chatId: prep.chatId,
            config: memoryConfig,
            macroNames,
          });
          const roster = await loadRoster(ctx.db, prep.chatId);
          const chars = roster.flatMap((r) =>
            r.kind === "character" && r.characterId !== null ? [r.characterId] : [],
          );

          // Run the digest/summarizer sweeps (sequentially — the memory logic itself bounds concurrency, but
          // we run the scopes sequentially here so an aborted test teardown doesn't hit DB race conditions).
          //
          // 1. Group-as-character scope (only for groups). The single synthetic bucket, keyed by the REAL
          //    minted synthetic-character row id (inv 8) — resolved the ONE way recall reads it
          //    (substrate/group-bucket), NEVER the fabricated `__group__` handle string (which FK-throws on
          //    every write — stickler F1).
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
          // Fire-and-forget per §3a: a memory-build failure must never surface to the CALLER — but it must NOT
          // be INVISIBLE (D55(7) — "chat is not a black box"; the silent `catch {}` is exactly why the dead
          // group memory went unnoticed). Log the trace for the operator + emit the machine-dispatchable
          // warning code (D41/D51 the warning-code channel) so "did memory break, and why" stays first-class.
          getLog().warn({ err: memErr, chatId: prep.chatId }, "memory: post-turn build failed");
          try {
            await deps.emit({ type: "warning", chatId: prep.chatId, code: "memory_build_failed" });
          } catch {
            // best-effort observability — a failed warning emit must never re-throw out of the fire-and-forget.
          }
        }
      });
    }

    return committedOutcome([view]);
  } catch (err) {
    // FLAG: the contract bus event is `turnAborted` (with `reason`), not `turnFailed` — the doc/contract
    // wins over the task prompt's loose "turnFailed" wording. Emit THEN rethrow (never swallow).
    await deps.emit({
      type: "turnAborted",
      chatId: prep.chatId,
      intent,
      reason: abortReasonFor(err),
    });
    throw err;
  }
}

/**
 * Build the per-turn engine (ONE instance, wired at the composition root). `runTurn` acquires the per-chat
 * lock (refusing `locked` if a turn is in flight), runs the lifecycle IN-LOCK, and ALWAYS releases the lock
 * (the `finally`) — even on a thrown turn error (which has already emitted `turnAborted`).
 *
 * LOCK-FREE GENERATE: a `prep.lockFree` turn (`generate`) SKIPS the lock entirely so it
 * runs CONCURRENT with a locked `send` (the active-turns registry is its only concurrency control). The SAME
 * lifecycle body runs either way — only the lock wrapper differs (ONE spine, parametrized).
 */
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
      throw new ChatOperationError(
        CHAT_OP_CODES.locked,
        "a turn is already in flight for this chat",
      );
    }
    try {
      return await executeTurn(ctx, deps, prep);
    } finally {
      await releaseLock(ctx.db, prep.chatId, deps.holder);
    }
  };
  return { runTurn };
}
