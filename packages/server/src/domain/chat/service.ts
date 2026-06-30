// domain/chat — COMPOSITION ROOT: wires verbs + injected deps (zero logic). Mirrors `domain/search/service.ts`:
// it builds the engine + the chat-internal `loadParticipantViews` ONCE, then calls the 10 verb/engine factories
// with their deps and assembles the `ChatService` (the return is typed `ChatService`, so a missing/renamed verb
// fails `tsc`). NO business logic lives here — every verb body is in its `verbs/*` factory.

import type { ParticipantView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext, ChatServiceDeps } from "./contract/context";
import type { ChatService } from "./contract/service";
import { createTurnEngine } from "./engine/engine";
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
  });

  // The chat-INTERNAL roster read-model (the returned `ChatDetail`/`listParticipants` shape). Reads the present
  // roster via `persistence/roster.loadRoster` and resolves CHARACTER name/avatar from `ctx.getCard`
  // (owner-scoped to the room host — characters in a room belong to the host; D16/D28). Built ONCE + shared
  // across fork/invites/read/start-chat (one instance, no per-factory re-spell).
  //
  // FLAG[participant-user-publics]: a human participant's `displayName`/`handle`/`avatarAssetId` are NOT
  // resolved here — the chat domain CANNOT read the `users` table (the `no-direct-users-read` chokepoint) and
  // there is no user-publics op on `ChatContext`/`ChatServiceDeps`. Per chat.md §"Public surface" ("the root
  // resolves `users` publics, OUTSIDE"), the eventual enrichment belongs to the entry composition root — it must
  // either decorate this reader or supply a user-publics resolver. Until then: `displayName` falls back to the
  // character name → the raw id, `handle`/`avatarAssetId` are null for humans.
  const loadParticipantViews = async (chatId: ChatId): Promise<readonly ParticipantView[]> => {
    const rows = await loadRoster(ctx.db, chatId);
    const hostUserId = rows.find((r) => r.role === "host")?.userId ?? null;
    return Promise.all(
      rows.map(async (r): Promise<ParticipantView> => {
        const card =
          r.characterId !== null && hostUserId !== null
            ? await ctx.getCard({ ownerId: hostUserId, characterId: r.characterId })
            : null;
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
          displayName: card?.name ?? r.userId ?? r.characterId ?? "",
          handle: null,
          avatarAssetId: card?.avatarAssetId ?? null,
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
