// Chat owns participant name/avatar resolution; RPG gates the game read before calling this principal-free op.
// Character cards resolve under the room host's ownership; human seats resolve public identity fields.
// Missing cards and headless seats are omitted because the tracker only projects addressable actors.

import type { RpgActorRef, RpgParticipantActor } from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { createChatContext } from "../context.ts";
import type { ChatContext, ResolveRpgParticipants } from "../contract/context.ts";
import type { ParticipantRow } from "../contract/participant-row.ts";
import type { ChatAssemblyContext } from "../contract/wiring.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";

/** Resolve ONE present seat to an rpg actor (or `null` = not an addressable actor — a gone card, a headless
 *  seat, a hostless room's character). `hostUserId` owns the character-card read (D18/D19). */
async function resolveSeat(ctx: ChatContext, row: ParticipantRow, hostUserId: UserId | null): Promise<RpgParticipantActor | null> {
  const withAvatar = (ref: RpgActorRef, name: string, avatar: string | null): RpgParticipantActor => ({
    actorRef: ref,
    name,
    ...(avatar !== null ? { avatar } : {}),
  });

  const actor = classifyParticipant(row);
  if (actor?.kind === "character" && hostUserId !== null) {
    const card = await ctx.getCard({ ownerId: hostUserId, characterId: actor.characterId });
    if (card === null) {
      return null; // a gone card — not an addressable actor
    }
    return withAvatar({ kind: "character", characterId: actor.characterId }, card.name, await ctx.resolveAssetHash(card.avatarAssetId));
  }
  if (actor?.kind === "human") {
    const publics = await ctx.resolveUserPublics(actor.userId, row.activePersonaId);
    return withAvatar(
      { kind: "user", userId: actor.userId },
      publics?.displayName ?? publics?.handle ?? "",
      await ctx.resolveAssetHash(publics?.avatarAssetId ?? null),
    );
  }
  return null;
}

export function createResolveRpgParticipants(input: ChatAssemblyContext): ResolveRpgParticipants {
  const ctx = createChatContext(input);
  return async (chatId) => {
    const participants = await loadParticipants(ctx.db, chatId);
    // Card reads need an owner — the room host (the character-card ownership authority, D18/D19). A hostless
    // room (a racing delete) resolves no character seats; humans still resolve.
    const hostUserId = hostUserIdOf(participants);
    const resolved = await Promise.all(participants.map((row) => resolveSeat(ctx, row, hostUserId)));
    return resolved.filter((a): a is RpgParticipantActor => a !== null);
  };
}
