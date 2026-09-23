// domain/chat/verbs/resolve-rpg-participants — the participants-resolution op (docs/plans/rpg/design.md): resolve a
// chat's PRESENT participants into rpg actor refs + display name + avatar hash.
//
// THE TWINS NOW AGREE (#1774 closed the asymmetry #1010 opened): this side ships
// `RpgParticipantActor`/`ResolveRpgParticipants` and the rpg domain's own structural twin is
// `RpgParticipantActor`/`RpgResolveParticipants`. #1010 renamed the SERVER CHAT DOMAIN only and left the pair
// spelled apart rather than half-renaming the rpg family here; vocabulary-map row 155 then RULED the rpg word
// and #1774 landed it by codemod. STANDALONE + principal-free (rpg gated the game read; the `getMembership`/
// `setRpgPointer`/`postNarratorMessage` injected-op precedent). Homed in chat because the name/avatar joins are
// chat/character's — rpg stays table-blind. A CHARACTER seat resolves its card under the chat HOST's ownership
// (the `getCard` ownerId); a HUMAN seat resolves its publics. A seat that resolves to neither ref (a gone card,
// a headless seat) is dropped — the tracker view only projects addressable actors.

import type { RpgActorRef } from "@orb/contracts/rpg";
import type { chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { ResolveRpgParticipants, RpgParticipantActor } from "../contract/context.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";

type ParticipantRow = typeof chatParticipants.$inferSelect;

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

export function createResolveRpgParticipants(ctx: ChatContext): ResolveRpgParticipants {
  return async (chatId) => {
    const participants = await loadParticipants(ctx.db, chatId);
    // Card reads need an owner — the room host (the character-card ownership authority, D18/D19). A hostless
    // room (a racing delete) resolves no character seats; humans still resolve.
    const hostUserId = hostUserIdOf(participants);
    const resolved = await Promise.all(participants.map((row) => resolveSeat(ctx, row, hostUserId)));
    return resolved.filter((a): a is RpgParticipantActor => a !== null);
  };
}
