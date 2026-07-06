// domain/chat/engine/engine — the turn LIFECYCLE shell. SINGLE-SPEAKER CORE: one resolved speaker per turn — NO multi-speaker arbitration /
// auto-mode (the engine TAKES the resolved speaker on `TurnPrep`; the "who/how-many speaks" chunk wraps this)
// and NO D48 tool-recurse (the pipeline does one model call + reduce). Those seams are left clean.
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
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatContext, DebitBudgetOp, ResolveTurnPolicyOp } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
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
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
  loadVariableDeltas,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { foldChain, runtimeVariablesUpdateStatement } from "../substrate/runtime-variables";
import { assistantTurnDelta } from "../substrate/stats-delta";
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
  /** Injected memory segment builder (domain-no-cross-subsystem rule). */
  readonly generateSegments: (
    ctx: ChatContext,
    args: { readonly chatId: ChatId },
  ) => Promise<unknown>;
  /** Injected memory digest builder (domain-no-cross-subsystem rule). */
  readonly generateDigests: (
    ctx: ChatContext,
    args: {
      readonly scope: any;
      readonly config?: any;
      readonly names?: any;
      readonly witnessing?: any;
      readonly signal?: AbortSignal;
    },
  ) => Promise<unknown>;
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
): Parameters<typeof appendVariantStatements>[1]["variant"] {
  const e = result.economics;
  return {
    content: result.content,
    reasoning: result.reasoning,
    ...economicsCommon(e),
    contextWindow: e?.contextWindow ?? null,
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
}): Promise<MessageView> {
  const { ctx, deps, prep, persist, target, result, nextSeq } = args;
  const variant = variantPayloadOf(prep, result);
  // D46: a group round REUSES one assembleContext across its speakers (round.ts `buildSpeakerPrep`), so the
  // by-reference op-log accumulates. `variant.variableDelta` snapshotted THIS turn's ops above; clear the shared
  // log now so the next speaker's delta starts empty (each variant records only the mutations ITS assembly ran).
  prep.assembleContext.opLog?.splice(0);

  let statements: BatchStmt[];
  let speakerCharacterId: CharacterId | null;
  let loadView: () => Promise<MessageView>;

  if (persist.mode === "new-slot") {
    // A fresh slot at the canon tail. `role:"assistant"` voices the speaker; `role:"user"` (impersonate) is
    // human-voiced (authorUserId/personaId, no character). The view reconstructs without a re-read (D26).
    const characterId = persist.role === "assistant" ? prep.speakerCharacterId : null;
    const insertParams = {
      messageId: ctx.newMessageId(),
      variantId: ctx.newMessageVariantId(),
      chatId: prep.chatId,
      seq: nextSeq,
      role: persist.role,
      characterId,
      authorUserId: persist.authorUserId ?? null,
      personaId: persist.personaId ?? null,
      now: ctx.now(),
      variant,
    };
    statements = insertCanonMessageStatements(ctx.db, insertParams);
    speakerCharacterId = characterId;
    const view = buildCommittedMessageView(insertParams);
    loadView = (): Promise<MessageView> => Promise.resolve(view);
  } else if (target === null) {
    // append-variant / continue need a target; the pre-start load guarantees it. A null here is a wiring bug.
    throw new ChatNotFoundError(prep.chatId);
  } else if (persist.mode === "append-variant") {
    // A swipe/regenerate: append a sibling variant at the next idx + select it (slot attribution unchanged).
    statements = appendVariantStatements(ctx.db, {
      messageId: target.messageId,
      variantId: ctx.newMessageVariantId(),
      idx: target.variantCount,
      now: ctx.now(),
      variant,
    });
    speakerCharacterId = target.characterId;
    loadView = (): Promise<MessageView> => readCommittedView(ctx, target.messageId);
  } else {
    // continue: extend the selected variant in place; snapshot the pre-continue state + record the appended
    // continuation so undo/revert round-trip (D26).
    statements = continueVariantStatements(ctx.db, {
      variantId: target.selectedVariantId,
      variant: {
        ...variant,
        content: target.content + result.content,
        reasoning: combineReasoning(target.reasoning, result.reasoning),
      },
      preContinueContent: target.content,
      preContinueReasoning: target.reasoning,
      lastContinuationContent: result.content,
      lastContinuationReasoning: result.reasoning,
    });
    speakerCharacterId = target.characterId;
    loadView = (): Promise<MessageView> => readCommittedView(ctx, target.messageId);
  }

  // The canon statements + the stats delta → ONE atomic batch (the rollups commit WITH the canon write).
  const delta = assistantTurnDelta({
    ownerId: prep.runAsUserId,
    characterId: speakerCharacterId,
    economics: {
      content: result.content,
      reasoning: result.reasoning,
      ...economicsCommon(result.economics),
    },
    now: ctx.now(),
  });
  ctx.applyStatsDelta(statements, ctx.db, delta);

  // D46 runtime plane: recompute `chats.runtime_variables` reflecting THIS commit's delta, in the SAME atomic
  // batch as the canon write. The fold source is the CURRENT selected-variant chain (loaded pre-batch) with this
  // turn's variant folded in: new-slot APPENDS at the tail seq; append-variant/continue OVERRIDE the target
  // slot's delta (its selected variant is now this turn's). Derive-don't-stamp — a later swipe re-folds (#3263).
  const turnDelta = variant.variableDelta ?? [];
  const currentDeltas = await loadVariableDeltas(ctx.db, prep.chatId);
  const postEntries =
    persist.mode === "new-slot" || target === null
      ? [...currentDeltas, { seq: nextSeq, delta: turnDelta }]
      : currentDeltas.map((e) =>
          e.messageId === target.messageId ? { seq: e.seq, delta: turnDelta } : e,
        );
  statements.push(runtimeVariablesUpdateStatement(ctx.db, prep.chatId, foldChain(postEntries)));

  await ctx.db.batch(batchMany(statements));

  const view = await loadView();
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
      : ((await loadSlotTarget(ctx.db, persist.targetMessageId)) ?? null);
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
    const view = await commitGeneration({
      ctx,
      deps,
      prep,
      persist,
      target,
      result,
      nextSeq: maxSeq + 1,
    });
    await deps.emit({ type: "turnCompleted", chatId: prep.chatId, intent, messageId: view.id });

    // Memory trigger (§3a): fire-and-forget — must not block the reply.
    void Promise.resolve().then(async () => {
      try {
        await deps.generateSegments(ctx, { chatId: prep.chatId });
        const roster = await loadRoster(ctx.db, prep.chatId);
        const chars = roster.flatMap((r) =>
          r.kind === "character" && r.characterId !== null ? [r.characterId] : [],
        );

        // Run the digest/summarizer sweeps (sequentially — the memory logic itself bounds concurrency, but we
        // run the scopes sequentially here so an aborted test teardown doesn't hit DB race conditions).
        //
        // 1. Group-as-character scope (only for groups). The single synthetic bucket.
        if (chars.length > 1) {
          await deps.generateDigests(ctx, {
            scope: {
              chatId: prep.chatId,
              scopedCharacterId: castId<CharacterId>(`__group__${prep.chatId}`),
              isGroup: chars.length > 1,
            },
          });
        }
        await Promise.all(
          chars.map((charId) =>
            deps.generateDigests(ctx, {
              scope: { chatId: prep.chatId, scopedCharacterId: charId, isGroup: chars.length > 1 },
            }),
          ),
        );
      } catch {
        // Swallowed: fire-and-forget per §3a above — a memory-build failure must never surface to the caller.
      }
    });

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
