// domain/chat — composition root: wires verbs + injected deps (zero logic). Builds the engine + the
// chat-internal `loadParticipantViews` once, then calls the verb/engine factories and assembles the typed
// `ChatService` (so a missing/renamed verb fails tsc). Every verb body lives in its `verbs/*` factory.

import type { ParticipantView } from "@orb/contracts/chat";
import type { AssetId, ChatId, Handle } from "@orb/kit/ids";
import type { ChatContext, ChatServiceDeps } from "./context.ts";
import type { RequestTurnOp } from "./contract/results.ts";
import type { ChatService } from "./contract/service.ts";
import { createTurnEngine } from "./engine/engine.ts";
import { generateDigests } from "./memory/build/digests.ts";
import { generateSegments } from "./memory/build/segments.ts";
import { loadWitnessHorizons } from "./memory/persistence/queries.ts";
import { recallMemory } from "./memory/recall/recall.ts";
import { loadRoster } from "./persistence/roster.ts";
import { REMOVED_CHARACTER_LABEL, REMOVED_MEMBER_LABEL } from "./substrate/participant-name.ts";
import { hostUserIdOf } from "./substrate/roster-host.ts";
import { createChatLifecycle } from "./verbs/chat-lifecycle.ts";
import { createClaimChat } from "./verbs/claim-chat.ts";
import { createCompaction } from "./verbs/compaction.ts";
import { createEdit } from "./verbs/edit.ts";
import { createFork } from "./verbs/fork.ts";
import { createGenerateImage } from "./verbs/generate-image.ts";
import { createInvites } from "./verbs/invites.ts";
import { createQuietGenerate } from "./verbs/quiet-generate.ts";
import { createRead } from "./verbs/read.ts";
import { createRoster } from "./verbs/roster.ts";
import { createStartChat } from "./verbs/start-chat.ts";
import { createRequestTurn, createTurn } from "./verbs/turn.ts";

/** The room-facing display name for a seat — the ONE rule (R10 + owner ruling: no raw id ever renders). Today
 *  only `human`/`character` are live kinds: character → the live card name, else the removed-character label;
 *  human → publics displayName, else its handle, else the removed-member label. The `agent` arm (→ the
 *  AgentCardView soul name, else the sourceKind label for an unhatched buddy) and `observer` (unseatable, never
 *  read) graft back on per PD-17/AP3-2 when the agent-principal design set returns. */
function resolveSeatDisplayName(
  r: Awaited<ReturnType<typeof loadRoster>>[number],
  resolved: {
    readonly publics: { displayName: string | null; handle: Handle | null } | null;
    readonly card: { name: string } | null;
  },
): string {
  if (r.kind === "human") {
    return resolved.publics?.displayName ?? resolved.publics?.handle ?? REMOVED_MEMBER_LABEL;
  }
  return resolved.card !== null ? resolved.card.name : REMOVED_CHARACTER_LABEL;
}

/** Assemble the chat composition-root product: the routed {@link ChatService} PLUS the PRINCIPAL-FREE
 *  `requestTurn` seam (automation-design/05 §AC-B). `requestTurn` is deliberately OFF `ChatService` — it is an
 *  injected op the entry root hands automation's `trigger_turn` arm + the plugin membrane's `turn.trigger`,
 *  never a routed verb (no principal; the turn triple is resolved internally, not passed). The return shape is
 *  inline (not a named export) per `no-inline-types` — its one consumer destructures `{ service, requestTurn }`. */
export function createChatService(ctx: ChatContext, deps: ChatServiceDeps): { readonly service: ChatService; readonly requestTurn: RequestTurnOp } {
  // The quiet-generation seam: a non-canon generation through the chat's OWN resolved connection (the marker
  // build's model access — never the summarizer rail). Standalone factory, the ExtractQuiet precedent.
  const quietGenerate = createQuietGenerate({ runChatTurn: ctx.runChatTurn, resolveChatPresetParams: ctx.resolveChatPresetParams });
  // THE ONE husk→real transition (R0). Built here and injected into every verb bundle that can be the first
  // real activity in a room, so no verb owns the column, the stats timing or the list fan.
  const claimChat = createClaimChat(ctx);
  // Built BEFORE the engine so the managed-compaction post-turn hook rides the SAME lock-free core the manual
  // `compact` verb exposes (one core, two entry points — the engine never imports the verb).
  const { compact, runCompaction } = createCompaction(ctx, { emit: deps.emit, quietGenerate, resolveConnection: deps.resolveConnection });

  const engine = createTurnEngine(ctx, {
    emit: deps.emit,
    debitBudget: deps.debitBudget,
    resolveTurnPolicy: deps.resolveTurnPolicy,
    holder: deps.holder,
    lockTtlMs: deps.lockTtlMs,
    generateSegments,
    generateDigests,
    loadWitnessHorizons,
    recallMemory,
    runCompaction,
  });

  // Reads the present roster and resolves each seat's CHARACTER decoration (name/avatar + render policy +
  // theme/background overrides) from ONE ctx.resolveSeatDeco read (owner-scoped to the room host); a human's
  // displayName/handle/avatarAssetId resolve via ctx.resolveUserPublics.
  const loadParticipantViews = async (chatId: ChatId): Promise<readonly ParticipantView[]> => {
    const rows = await loadRoster(ctx.db, chatId);
    const hostUserId = hostUserIdOf(rows);
    return Promise.all(
      rows.map(async (r): Promise<ParticipantView> => {
        // ONE character read per seat: the card name/avatar + render policy + theme/background overrides.
        const deco = await ctx.resolveSeatDeco({ ownerId: hostUserId, characterId: r.characterId });
        const publics = r.kind === "human" && r.userId !== null ? await ctx.resolveUserPublics(r.userId, r.activePersonaId) : null;
        const displayName = resolveSeatDisplayName(r, { publics, card: deco.card });

        const avatarAssetId: AssetId | null = publics?.avatarAssetId ?? deco.card?.avatarAssetId ?? null;
        const avatarHash = await ctx.resolveAssetHash(avatarAssetId);

        return {
          id: r.id,
          chatId: r.chatId,
          kind: r.kind,
          userId: r.userId,
          characterId: r.characterId,
          role: r.role,
          activePersonaId: r.activePersonaId,
          talkativeness: r.talkativeness,
          disabled: r.disabled,
          joinedAt: r.joinedAt,
          joinSeq: r.joinSeq,
          leftSeq: r.leftSeq,
          joinHistoryVisibility: r.joinHistoryVisibility,
          displayName,
          handle: publics?.handle ?? null,
          avatarAssetId,
          avatarHash,
          renderPolicy: deco.renderPolicy,
          themeOverride: deco.themeOverride,
          backgroundOverride: deco.backgroundOverride,
        };
      }),
    );
  };

  // The turn collaborators, shared by the human verbs (createTurn) AND the non-human `requestTurn` seam
  // (createRequestTurn) — ONE engine + one active-turns Set, so an autonomous turn locks/aborts/budgets on the
  // same substrate a human send does.
  const turnDeps = {
    engine,
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
  });
  const fork = createFork(ctx, { emit: deps.emit, loadParticipantViews });
  const imageGen = createGenerateImage(ctx, { emit: deps.emit, claimChat });
  const invites = createInvites(ctx, { emit: deps.emit, loadParticipantViews, claimChat });
  const read = createRead(ctx, {
    loadParticipantViews,
    resolveConnection: deps.resolveConnection,
    checkSendAvailability: deps.checkSendAvailability,
    resolveForeignInputs: deps.resolveForeignInputs,
  });
  const startChat = createStartChat(ctx, {
    emit: deps.emit,
    loadParticipantViews,
    engine,
    resolveConnection: deps.resolveConnection,
    resolveForeignInputs: deps.resolveForeignInputs,
    resolveCreatorGroupDefaults: deps.resolveCreatorGroupDefaults,
    claimChat,
  });
  const chatLifecycle = createChatLifecycle(ctx, { emit: deps.emit, activeTurns: deps.activeTurns, claimChat });
  const roster = createRoster(ctx, { emit: deps.emit, claimChat });

  return {
    service: {
      ...turn,
      ...edit,
      ...fork,
      ...imageGen,
      ...invites,
      ...read,
      ...startChat,
      ...chatLifecycle,
      ...roster,
      compact,
    },
    requestTurn,
  };
}
