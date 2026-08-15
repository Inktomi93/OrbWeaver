// The roster-resolution op (rpg-design/05 §4.3): resolve a chat's PRESENT participants into rpg actor refs +
// display name + avatar hash. STANDALONE + principal-free (rpg gated the game read; the `getMembership`/
// `setRpgPointer`/`postNarratorMessage` injected-op precedent). Homed in chat because the name/avatar joins are
// chat/character's — rpg stays table-blind. A CHARACTER seat resolves its card under the chat HOST's ownership
// (the `getCard` ownerId); a HUMAN seat resolves its publics. A seat that resolves to neither ref (a gone card,
// a headless seat) is dropped — the tracker view only projects addressable actors.

import type { RpgActorRef } from "@orb/contracts/rpg";
import type { chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { ResolveRpgRoster, RpgRosterActor } from "../contract/context.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadRoster } from "../persistence/roster.ts";
import { hostUserIdOf } from "../substrate/roster-host.ts";

type RosterRow = typeof chatParticipants.$inferSelect;

/** Resolve ONE present seat to an rpg actor (or `null` = not an addressable actor — a gone card, a headless
 *  seat, a hostless room's character). `hostUserId` owns the character-card read (D18/D19). */
async function resolveSeat(ctx: ChatContext, row: RosterRow, hostUserId: UserId | null): Promise<RpgRosterActor | null> {
  const withAvatar = (ref: RpgActorRef, name: string, avatar: string | null): RpgRosterActor => ({
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

export function createResolveRpgRoster(ctx: ChatContext): ResolveRpgRoster {
  return async (chatId) => {
    const roster = await loadRoster(ctx.db, chatId);
    // Card reads need an owner — the room host (the character-card ownership authority, D18/D19). A hostless
    // roster (a racing delete) resolves no character seats; humans still resolve.
    const hostUserId = hostUserIdOf(roster);
    const resolved = await Promise.all(roster.map((row) => resolveSeat(ctx, row, hostUserId)));
    return resolved.filter((a): a is RpgRosterActor => a !== null);
  };
}
