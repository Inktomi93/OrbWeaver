// domain/chat — COMPOSITION ROOT: wires verbs + injected deps (zero logic). Mirrors `domain/search/service.ts`:
// it builds the engine + the chat-internal `loadParticipantViews` ONCE, then calls the 10 verb/engine factories
// with their deps and assembles the `ChatService` (the return is typed `ChatService`, so a missing/renamed verb
// fails `tsc`). NO business logic lives here — every verb body is in its `verbs/*` factory.

import type { ParticipantView } from "@orb/contracts/chat";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatContext, ChatServiceDeps } from "./contract/context";
import type { ChatService } from "./contract/service";
import { createTurnEngine } from "./engine/engine";
import { generateDigests } from "./memory/build/digests";
import { generateSegments } from "./memory/build/segments";
import { loadRoster } from "./persistence/roster";
import { createChatLifecycle } from "./verbs/chat-lifecycle";
import { createCompaction } from "./verbs/compaction";
import { createEdit } from "./verbs/edit";
import { createFork } from "./verbs/fork";
import { createInvites } from "./verbs/invites";
import { createRead } from "./verbs/read";
import { createRoster } from "./verbs/roster";
import { createStartChat } from "./verbs/start-chat";
import { createTurn } from "./verbs/turn";

/**
 * Assemble the full {@link ChatService} from the injected {@link ChatContext} (the DI bundle) + the
 * {@link ChatServiceDeps} the entry root supplies (the collaborators not on ctx). The engine and
 * `loadParticipantViews` are built HERE (chat-internal) and threaded into the factories that need them.
 */
export function createChatService(ctx: ChatContext, deps: ChatServiceDeps): ChatService {
  // The turn lifecycle shell — built ONCE; threaded into the round-driving (`turn`) + opening (`start-chat`) paths.
  const engine = createTurnEngine(ctx, {
    emit: deps.emit,
    debitBudget: deps.debitBudget,
    resolveTurnPolicy: deps.resolveTurnPolicy,
    holder: deps.holder,
    lockTtlMs: deps.lockTtlMs,
    generateSegments,
    generateDigests,
  });

  // The chat-INTERNAL roster read-model (the returned `ChatDetail`/`listParticipants` shape). Reads the present
  // roster via `persistence/roster.loadRoster` and resolves CHARACTER name/avatar from `ctx.getCard`
  // (owner-scoped to the room host — characters in a room belong to the host; D16/D28). Built ONCE + shared
  // across fork/invites/read/start-chat (one instance, no per-factory re-spell).
  //
  // A human participant's `displayName`/`handle`/`avatarAssetId` are
  // resolved via `ctx.resolveUserPublics` (wired in the entry composition root).
  const loadParticipantViews = async (chatId: ChatId): Promise<readonly ParticipantView[]> => {
    const rows = await loadRoster(ctx.db, chatId);
    const hostUserId = rows.find((r) => r.role === "host")?.userId ?? null;
    return Promise.all(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: straightforward mapping
      rows.map(async (r): Promise<ParticipantView> => {
        const card =
          r.characterId !== null && hostUserId !== null
            ? await ctx.getCard({ ownerId: hostUserId, characterId: r.characterId })
            : null;
        const publics =
          r.kind === "human" && r.userId !== null
            ? await ctx.resolveUserPublics(r.userId, r.activePersonaId)
            : null;

        let avatarAssetId: AssetId | null = null;
        if (publics?.avatarAssetId !== undefined && publics.avatarAssetId !== null) {
          avatarAssetId = castId<AssetId>(publics.avatarAssetId as string);
        } else if (card?.avatarAssetId !== undefined && card.avatarAssetId !== null) {
          avatarAssetId = castId<AssetId>(card.avatarAssetId as string);
        }

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
          // biome-ignore lint/suspicious/noExplicitAny: interface mismatch
          handle: (publics?.handle as any) ?? null,
          avatarAssetId,
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
  const edit = createEdit(ctx, { emit: deps.emit });
  const fork = createFork(ctx, { emit: deps.emit, loadParticipantViews });
  const invites = createInvites(ctx, {
    emit: deps.emit,
    hashToken: deps.hashToken,
    newInviteId: deps.newInviteId,
    loadParticipantViews,
  });
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
  // `runCompaction` is the lock-free core (a future engine-injected seam); only `compact` is on `ChatService`.
  const { compact } = createCompaction(ctx, { emit: deps.emit });

  return {
    ...turn,
    ...edit,
    ...fork,
    ...invites,
    ...read,
    ...startChat,
    ...chatLifecycle,
    ...roster,
    compact,
  };
}
