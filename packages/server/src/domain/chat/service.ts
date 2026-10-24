// domain/chat — composition root: wires verbs + injected deps (zero logic). Builds the engine + the
// chat-internal `loadParticipantViews` once, then calls the verb/engine factories and assembles the typed
// `ChatService` (so a missing/renamed verb fails tsc). Every verb body lives in its `verbs/*` factory.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { createChatContext } from "./context.ts";
import type { ChatServiceDeps, ClaimChatOp } from "./contract/context.ts";
import type { VisibleExtractQuiet, VisibleExtractQuietDeps } from "./contract/imagery-access.ts";
import type { RequestTurnOp } from "./contract/results.ts";
import type { ChatService } from "./contract/service.ts";
import type { SignupInviteOps } from "./contract/signup.ts";
import type { ChatAssemblyContext } from "./contract/wiring.ts";
import { createTurnEngine } from "./engine/engine.ts";
import { buildTurnMemory } from "./memory/generate/turn.ts";
import { loadWitnessHorizons } from "./memory/persistence/queries.ts";
import { recallMemory } from "./memory/recall/recall.ts";
import { createHandoffBarrier } from "./substrate/handoff-barrier.ts";
import { createAdmittedChatOperations } from "./verbs/admission.ts";
import { createChatLifecycle } from "./verbs/chat-lifecycle.ts";
import { createClaimChat } from "./verbs/claim-chat.ts";
import { createCompaction } from "./verbs/compaction.ts";
import { createEdit } from "./verbs/edit.ts";
import { createExtractQuiet } from "./verbs/extract-quiet.ts";
import { createFork } from "./verbs/fork.ts";
import { createGenerateImage } from "./verbs/generate-image.ts";
import { createInvitePreview } from "./verbs/invite-preview.ts";
import { createInvites } from "./verbs/invites.ts";
import { createLoadParticipantViews } from "./verbs/load-participant-views.ts";
import { createMessageWindow } from "./verbs/message-window.ts";
import { createParticipants } from "./verbs/participants.ts";
import { createQuietGenerate } from "./verbs/quiet-generate.ts";
import { createReactions } from "./verbs/reactions.ts";
import { createRead } from "./verbs/read.ts";
import { createSignupInvite } from "./verbs/signup-invite.ts";
import { createStartChat } from "./verbs/start-chat.ts";
import { createDeferredSettlement, createRequestTurn, createTurn } from "./verbs/turn.ts";
import { createQuietExtractionInputs, createVisibleExtractQuietGate } from "./verbs/visible-extract-quiet.ts";

export function createVisibleExtractQuiet(deps: DbAssemblyInput<VisibleExtractQuietDeps>): VisibleExtractQuiet {
  return createVisibleExtractQuietGate({
    resolveViewerVisibility: deps.resolveViewerVisibility,
    extractQuiet: createExtractQuiet({
      db: deps.db,
      now: deps.now,
      ...createQuietExtractionInputs(deps),
      resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
      resolveUserMacroDefs: deps.resolveUserMacroDefs,
    }),
  });
}

/** Assemble the chat composition-root product: the routed {@link ChatService} PLUS the PRINCIPAL-FREE
 *  `requestTurn` seam. `requestTurn` is deliberately OFF `ChatService` — it is an
 *  injected op the entry root hands automation's `trigger_turn` arm + the plugin membrane's `turn.trigger`,
 *  never a routed verb (no principal; the turn triple is resolved internally, not passed). `claimChat` is the one
 *  claim chokepoint, shared with the rpg-facing ops. The return shape is
 *  inline (not a named export) per `no-inline-types` — its one consumer destructures `{ service, requestTurn }`. */
export function createChatService(
  input: ChatAssemblyContext,
  deps: ChatServiceDeps,
): { readonly service: ChatService; readonly requestTurn: RequestTurnOp; readonly signupInvites: SignupInviteOps; readonly claimChat: ClaimChatOp } {
  const admission = createHandoffBarrier();
  const ctx = createChatContext({
    ...input,
    trackBackground: (work, chatId): void => {
      admission.track(chatId, work);
      input.trackBackground?.(work, chatId);
    },
  });
  // The quiet-generation seam: a non-canon generation through the chat's OWN resolved connection (the marker
  // build's model access — never the summarizer rail). Standalone factory, the ExtractQuiet precedent.
  const quietGenerate = createQuietGenerate({ runChatTurn: ctx.runChatTurn, resolveChatPresetParams: ctx.resolveChatPresetParams });
  // THE ONE husk→real transition (R0). Built here and injected into every verb bundle that can be the first
  // real activity in a room, so no verb owns the column, the stats timing or the list fan.
  const claimChat = createClaimChat(ctx);
  // Built BEFORE the engine so the managed-compaction post-turn hook rides the SAME lock-free core the manual
  // `compact` verb exposes (one core, two entry points — the engine never imports the verb).
  const { compact, runCompaction } = createCompaction(ctx, { emit: deps.emit, quietGenerate, resolveConnection: deps.resolveConnection });

  // Build the actual engine object, not a typed view of the request-authority context.
  const engine = createTurnEngine(
    {
      logger: ctx.logger,
      db: ctx.db,
      now: ctx.now,
      newMessageId: ctx.newMessageId,
      newMessageVariantId: ctx.newMessageVariantId,
      newMessageAssetId: ctx.newMessageAssetId,
      newStreamEventId: ctx.newStreamEventId,
      newStreamGenerationId: ctx.newStreamGenerationId,
      newChatTurnId: ctx.newChatTurnId,
      applyStatsDelta: ctx.applyStatsDelta,
      resolveRetainedChatAccountingScope: ctx.resolveRetainedChatAccountingScope,
      emitChatChanged: ctx.emitChatChanged,
      applyRegexReplace: ctx.applyRegexReplace,
      prng: ctx.prng,
      runChatTurn: ctx.runChatTurn,
      tools: ctx.tools,
      resolveImageUrl: ctx.resolveImageUrl,
      storeInlineReplyImage: ctx.storeInlineReplyImage,
      promptTransforms: ctx.promptTransforms,
      timers: ctx.timers,
      ...(ctx.backgroundSignal === undefined ? {} : { backgroundSignal: ctx.backgroundSignal }),
      ...(ctx.trackBackground === undefined ? {} : { trackBackground: ctx.trackBackground }),
      ...(ctx.recordTurnOutcome === undefined ? {} : { recordTurnOutcome: ctx.recordTurnOutcome }),
      rpg:
        ctx.rpg === null
          ? null
          : {
              markDicePreRollEligible: ctx.rpg.markDicePreRollEligible,
              onTurnCompleted: ctx.rpg.onTurnCompleted,
              onTurnAborted: ctx.rpg.onTurnAborted,
            },
    },
    {
      emit: deps.emit,
      holder: deps.holder,
      lockTtlMs: deps.lockTtlMs,
      generateMemory: (args) => buildTurnMemory(ctx, args),
      loadWitnessHorizons: (chatId, characterId) => loadWitnessHorizons(ctx.db, chatId, characterId),
      recallMemory: (args) => recallMemory(ctx, args),
      runCompaction,
    },
  );

  const { loadParticipantViews, loadParticipantViewsBatch } = createLoadParticipantViews(ctx);

  // The turn collaborators, shared by the human verbs (createTurn) AND the non-human `requestTurn` seam
  // (createRequestTurn) — ONE engine + one active-turns Set, so an autonomous turn locks/aborts/budgets on the
  // same substrate a human send does.
  const turnDeps = {
    engine,
    admission,
    activeTurns: deps.activeTurns,
    emit: deps.emit,
    prng: deps.prng,
    delay: deps.delay,
    resolveConnection: deps.resolveConnection,
    resolveForeignInputs: deps.resolveForeignInputs,
    claimChat,
  };
  const turn = createTurn(ctx, turnDeps);
  const requestTurn = createRequestTurn(ctx, turnDeps);
  const edit = createEdit(ctx, {
    emit: deps.emit,
    resolveForeignInputs: deps.resolveForeignInputs,
    claimChat,
    // The D129-F freeze-at-selection bake draws from the SAME service PRNG a turn's freeze does — a greeting
    // alternate baked at selection is the same kind of draw as one baked at the first user turn.
    prng: deps.prng,
  });
  const fork = createFork(ctx, { emit: deps.emit, loadParticipantViews });
  const imageGen = createGenerateImage(ctx, { emit: deps.emit, claimChat });
  // ONE preview assembly for the signed-in `previewInvite` and the signed-out pending join (D259).
  const assemblePreview = createInvitePreview(ctx, { loadParticipantViews });
  const invites = createInvites(ctx, { emit: deps.emit, loadParticipantViews, claimChat, assemblePreview });
  const signupInvites = createSignupInvite(ctx, { ...deps.signup, assemblePreview, emit: deps.emit });
  const read = createRead(ctx, {
    loadParticipantViews,
    loadParticipantViewsBatch,
    resolveConnection: deps.resolveConnection,
    checkSendAvailability: deps.checkSendAvailability,
    getNextTurnConnection: deps.getNextTurnConnection,
    resolveForeignInputs: deps.resolveForeignInputs,
  });
  const startChat = createStartChat(ctx, { emit: deps.emit, prepareCreationEvent: deps.prepareCreationEvent, loadParticipantViews });
  const chatLifecycle = createChatLifecycle(ctx, { emit: deps.emit, emitLive: deps.emitLive, activeTurns: deps.activeTurns, claimChat });
  const participants = createParticipants(ctx, { emit: deps.emitChecked, claimChat });
  const admitted = createAdmittedChatOperations(ctx, {
    barrier: admission,
    operations: { ...turn, ...imageGen, compact, acceptHostHandoff: participants.acceptHostHandoff },
    settleDeferredTurns: createDeferredSettlement(ctx, turnDeps),
  });
  // B6 — the reaction plane. NO `claimChat`: a reaction is a read-adjacent act on canon that already exists,
  // so it cannot be the first activity in a room (a husk has no committed variant to react to).
  const reactions = createReactions(ctx, { emit: deps.emit });

  return {
    service: {
      ...turn,
      ...edit,
      ...fork,
      ...imageGen,
      ...invites,
      ...read,
      getMessageWindow: createMessageWindow(ctx, { loadParticipantViews }),
      ...startChat,
      ...chatLifecycle,
      ...participants,
      ...reactions,
      ...admitted,
    },
    requestTurn,
    signupInvites,
    // Returned so the compose root hands the SAME instance to the ops built outside this bundle: the in-flight
    // map is what stops two concurrent first claims from replaying the creation stats twice.
    claimChat,
  };
}
