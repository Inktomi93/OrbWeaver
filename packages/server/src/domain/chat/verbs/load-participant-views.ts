// Roster display resolves one page's owned decorations and distinct public identities, not one card per seat.

import type { AssetId, CharacterId, ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { ParticipantData } from "../contract/views.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipantsBatch } from "../persistence/participants-read.ts";
import { REMOVED_CHARACTER_LABEL, REMOVED_MEMBER_LABEL } from "../substrate/participant-name.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";

function resolveSeatDisplayName(
  r: Awaited<ReturnType<typeof loadParticipantsBatch>>[number],
  resolved: {
    readonly publics: { displayName: string | null; handle: Handle | null } | null;
    readonly card: { name: string } | null;
  },
): string {
  if (classifyParticipant(r)?.kind === "human") {
    return resolved.publics?.displayName ?? resolved.publics?.handle ?? REMOVED_MEMBER_LABEL;
  }
  return resolved.card !== null ? resolved.card.name : REMOVED_CHARACTER_LABEL;
}

export function createLoadParticipantViews(ctx: ChatContext): {
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantData[]>;
  readonly loadParticipantViewsBatch: (chatIds: readonly ChatId[]) => Promise<ReadonlyMap<ChatId, readonly ParticipantData[]>>;
} {
  const loadParticipantViewsBatch = async (chatIds: readonly ChatId[]): Promise<ReadonlyMap<ChatId, readonly ParticipantData[]>> => {
    const rows = await loadParticipantsBatch(ctx.db, chatIds);
    const rowsByChat = Map.groupBy(rows, (row) => row.chatId);
    const hosts = new Map([...rowsByChat].map(([chatId, seats]) => [chatId, hostUserIdOf(seats)]));
    const charactersByHost = new Map<UserId, Set<CharacterId>>();
    for (const row of rows) {
      const hostUserId = hosts.get(row.chatId);
      if (hostUserId !== null && hostUserId !== undefined && row.characterId !== null) {
        charactersByHost.getOrInsertComputed(hostUserId, () => new Set<CharacterId>()).add(row.characterId);
      }
    }
    const decorations = new Map(
      await Promise.all(
        [...charactersByHost].map(
          async ([hostUserId, ids]) => [hostUserId, await ctx.resolveSeatDecos({ ownerId: hostUserId, characterIds: [...ids] })] as const,
        ),
      ),
    );
    const floor = await ctx.resolveSeatDeco({ ownerId: null, characterId: null });
    const publicsByUser = new Map<UserId, Map<PersonaId | null, ReturnType<ChatContext["resolveUserPublics"]>>>();
    const hashes = new Map<AssetId | null, ReturnType<ChatContext["resolveAssetHash"]>>();
    const views = await Promise.all(
      rows.map(async (r): Promise<ParticipantData> => {
        const hostUserId = hosts.get(r.chatId);
        const deco =
          hostUserId === null || hostUserId === undefined || r.characterId === null ? floor : (decorations.get(hostUserId)?.get(r.characterId) ?? floor);
        const actor = classifyParticipant(r);
        let publics: Awaited<ReturnType<ChatContext["resolveUserPublics"]>> = null;
        if (actor?.kind === "human") {
          const personas = publicsByUser.getOrInsertComputed(actor.userId, () => new Map<PersonaId | null, ReturnType<ChatContext["resolveUserPublics"]>>());
          const userId = actor.userId;
          const pending = personas.getOrInsertComputed(r.activePersonaId, () => ctx.resolveUserPublics(userId, r.activePersonaId));
          publics = await pending;
        }
        const avatarAssetId = publics?.avatarAssetId ?? deco.card?.avatarAssetId ?? null;
        const hash = hashes.getOrInsertComputed(avatarAssetId, () => ctx.resolveAssetHash(avatarAssetId));
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
          displayName: resolveSeatDisplayName(r, { publics, card: deco.card }),
          handle: publics?.handle ?? null,
          avatarAssetId,
          avatarHash: await hash,
          renderPolicy: deco.renderPolicy,
          themeOverride: deco.themeOverride,
          backgroundOverride: deco.backgroundOverride,
        };
      }),
    );
    return Map.groupBy(views, (view) => view.chatId);
  };
  const loadParticipantViews = async (chatId: ChatId): Promise<readonly ParticipantData[]> => (await loadParticipantViewsBatch([chatId])).get(chatId) ?? [];

  return { loadParticipantViews, loadParticipantViewsBatch };
}
