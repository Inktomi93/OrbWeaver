// domain/chat/engine/engine — the turn LIFECYCLE shell (chat.md Part I 8-slot engine/engine.ts; the turn
// lifecycle of §5). SINGLE-SPEAKER CORE: one resolved speaker per turn — NO multi-speaker arbitration /
// auto-mode (the engine TAKES the resolved speaker on `TurnPrep`; the "who/how-many speaks" chunk wraps this)
// and NO D48 tool-recurse (the pipeline does one model call + reduce). Those seams are left clean.
//
// THE LIFECYCLE (read top to bottom in `executeTurn`):
//   acquire lock (per-chat; stale-steal — persistence/lock) → IN-LOCK: the §9 security belts (max-pro-sub
//   by-proxy consent + the per-member COUNT budget DEBIT, attributed to `triggeredBy`) → emit `turnStarted`
//   → load canon + next-seq → `runTurnPipeline` (assemble→shape→run→reduce→fit) → persist the canon (the D26
//   slot+variant 3-step dance + the stats delta, ONE atomic `db.batch`) → emit `messageCommitted` +
//   `turnCompleted` → release lock. On any error AFTER `turnStarted`: emit `turnAborted` (reason `error` /
//   `user`) THEN RETHROW — never swallow (chat.md error-paths-flag-don't-swallow). The pre-start belt
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
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, MessageId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type {
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
import {
  loadCanonHistory,
  loadMaxMessageSeq,
  loadMessageView,
  loadSlotTarget,
} from "../persistence/queries";
import { debitTurnBudget } from "./budget";
import { runTurnPipeline } from "./pipeline";
import { committedOutcome } from "./result";
import { assistantTurnDelta } from "./stats-delta";
import { assertMaxProSubConsent } from "./turn-identity";

/** The per-member budget debit (the transport `MemberBudget.debit` shape — injected; not on ctx). */
type DebitBudgetOp = (triggeredBy: UserId, budget: number | null) => Promise<void>;

/** The per-turn host policy resolved under the frozen `runAsUserId` (the budget CAP + the max-pro-sub
 *  owner-consent flag) — read from host settings, for which there is no `ChatContext` op (FLAGGED). */
type ResolveTurnPolicyOp = (
  runAsUserId: UserId,
) => Promise<{ readonly budget: number | null; readonly allowNonOwnerMaxProSub: boolean }>;

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
  /** The per-chat lock TTL (ms) — sized for one turn (chat.md Part III §5/§6). */
  readonly lockTtlMs: number;
}

/** Map the engine's 8-kind turn axis → the public 5-member bus `TurnIntent` (one home; no inline re-spell).
 *  `opening`/`auto`/`force`/`simple-send` all surface as their nearest public lifecycle intent. */
const KIND_TO_INTENT: Record<TurnKind, TurnIntent> = {
  send: "send",
  "simple-send": "send",
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

/** The turn body (chat.md §5 lifecycle), parametrized by the persist MODE (D26) + lock-freedom: the §9 belts
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
  assertMaxProSubConsent({
    source: prep.connection.credential.source,
    identity: { triggeredBy: prep.triggeredBy, runAsUserId: prep.runAsUserId },
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
    const result = await runTurnPipeline({
      runChatTurn: ctx.runChatTurn,
      // The injected node:vm ReDoS watchdog (D53) — the RECEIVE AI_OUTPUT/REASONING regex passes run under it.
      applyRegexReplace: ctx.applyRegexReplace,
      // Resolve image refs under the host's CAS (runAsUserId — the funded owner, like getCard's host scope).
      resolveImageUrl: (ref) => ctx.resolveImageUrl({ ownerId: prep.runAsUserId, ref }),
      assembleContext: prep.assembleContext,
      // The canon scoped to the turn's context per persist mode (full / before-target / through-target).
      canon: scopeCanon(canonAll, persist, target),
      connection: prep.connection,
      intent: prep.intent,
      kind: prep.kind,
      chatId: prep.chatId,
      appendUserTurn: prep.appendUserTurn,
      groupNudge: prep.groupNudge,
      // The per-speaker two-axis SHAPE (chat.md Part III §7) — set by the group round driver; ABSENT ⇒ the
      // single-speaker core's pinned per-speaker/merged default (solo byte-identical, D16).
      shape: prep.shape,
      // FLAG[abort-into-engine] RESOLVED: thread the caller's abort signal → the role; the runner aborts its
      // in-flight request when signalled (a single engine turn is now interruptible mid-generation).
      signal: prep.signal,
      onDelta: (delta) => {
        void deps.emit({ type: "delta", chatId: prep.chatId, delta });
      },
    });
    // D45: image parts were stripped for a non-vision model — surface it (once per turn) on the bus.
    if (result.imageDropped) {
      await deps.emit({ type: "warning", chatId: prep.chatId, code: "image_dropped" });
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
 * LOCK-FREE GENERATE (chat.md active-turns): a `prep.lockFree` turn (`generate`) SKIPS the lock entirely so it
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
