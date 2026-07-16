// domain/chat — composition root: wires verbs + injected deps (zero logic). Builds the engine + the
// chat-internal `loadParticipantViews` once, then calls the verb/engine factories and assembles the typed
// `ChatService` (so a missing/renamed verb fails tsc). Every verb body lives in its `verbs/*` factory.

import type { ParticipantView } from "@orb/contracts/chat";
import type { AssetId, ChatId } from "@orb/kit/ids";
import type { ChatContext, ChatServiceDeps } from "./context";
import type { ChatService } from "./contract/service";
import { createTurnEngine } from "./engine/engine";
import { generateDigests } from "./memory/build/digests";
import { generateSegments } from "./memory/build/segments";
import { loadRoster } from "./persistence/roster";
import { createChatLifecycle } from "./verbs/chat-lifecycle";
import { createCompaction } from "./verbs/compaction";
import { createEdit } from "./verbs/edit";
import { createFork } from "./verbs/fork";
import { createGenerateImage } from "./verbs/generate-image";
import { createInvites } from "./verbs/invites";
import { createRead } from "./verbs/read";
import { createRoster } from "./verbs/roster";
import { createStartChat } from "./verbs/start-chat";
import { createTurn } from "./verbs/turn";

/** Assemble the full {@link ChatService} from the injected {@link ChatContext} + {@link ChatServiceDeps}. */
export function createChatService(ctx: ChatContext, deps: ChatServiceDeps): ChatService {
  const engine = createTurnEngine(ctx, {
    emit: deps.emit,
    debitBudget: deps.debitBudget,
    resolveTurnPolicy: deps.resolveTurnPolicy,
    holder: deps.holder,
    lockTtlMs: deps.lockTtlMs,
    generateSegments,
    generateDigests,
  });

  // Reads the present roster and resolves CHARACTER name/avatar from ctx.getCard (owner-scoped to the room
  // host); a human's displayName/handle/avatarAssetId resolve via ctx.resolveUserPublics.
  const loadParticipantViews = async (chatId: ChatId): Promise<readonly ParticipantView[]> => {
    const rows = await loadRoster(ctx.db, chatId);
    const hostUserId = rows.find((r) => r.role === "host")?.userId ?? null;
    return Promise.all(
      rows.map(async (r): Promise<ParticipantView> => {
        const card = r.characterId !== null && hostUserId !== null ? await ctx.getCard({ ownerId: hostUserId, characterId: r.characterId }) : null;
        const publics = r.kind === "human" && r.userId !== null ? await ctx.resolveUserPublics(r.userId, r.activePersonaId) : null;

        // The resolved per-participant render policy (override ?? global); keyed on the character override
        // for AI seats, the global floor for humans.
        const renderPolicy = await ctx.resolveRenderPolicy({
          ownerId: hostUserId,
          characterId: r.characterId,
        });
        // The raw per-character theme override (unmerged; null for a human seat or none set).
        const themeOverride = await ctx.resolveThemeOverride({
          ownerId: hostUserId,
          characterId: r.characterId,
        });

        const avatarAssetId: AssetId | null = publics?.avatarAssetId ?? card?.avatarAssetId ?? null;
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
          displayName: publics?.displayName ?? card?.name ?? r.userId ?? r.characterId ?? "",
          handle: publics?.handle ?? null,
          avatarAssetId,
          avatarHash,
          renderPolicy,
          themeOverride,
        };
      }),
    );
  };

  const turn = createTurn(ctx, {
    engine,
    activeTurns: deps.activeTurns,
    emit: deps.emit,
    prng: deps.prng,
    delay: deps.delay,
    resolveConnection: deps.resolveConnection,
    resolveForeignInputs: deps.resolveForeignInputs,
  });
  const edit = createEdit(ctx, {
    emit: deps.emit,
    resolveForeignInputs: deps.resolveForeignInputs,
  });
  const fork = createFork(ctx, { emit: deps.emit, loadParticipantViews });
  const imageGen = createGenerateImage(ctx, { emit: deps.emit });
  const invites = createInvites(ctx, { emit: deps.emit, loadParticipantViews });
  const read = createRead(ctx, {
    loadParticipantViews,
    resolveConnection: deps.resolveConnection,
    resolveForeignInputs: deps.resolveForeignInputs,
  });
  const startChat = createStartChat(ctx, {
    emit: deps.emit,
    loadParticipantViews,
    engine,
    resolveConnection: deps.resolveConnection,
    resolveForeignInputs: deps.resolveForeignInputs,
  });
  const chatLifecycle = createChatLifecycle(ctx, { emit: deps.emit });
  const roster = createRoster(ctx, { emit: deps.emit });
  const { compact } = createCompaction(ctx, { emit: deps.emit });

  return {
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
  };
}
