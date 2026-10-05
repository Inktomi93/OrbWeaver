// The room's inherited world-book projection. Reuses the runtime pool and its owner belts, present roster,
// enabled-human persona consent, owned-card resolver and memberPersonaLore posture. Personal library headers
// are host-only; room-attached books remain the world-info verb's member-readable consent surface.

import type { Principal } from "@orb/contracts/identity";
import type { ChatBookView } from "@orb/contracts/world-info";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { requireParticipant } from "../guard.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadInheritedWorldBooks } from "../substrate/assembly-access.ts";
import { viewerReadsHidden } from "../substrate/member-visibility.ts";
import { humanSeatPersonasOf, memberPersonaIdsOf, presentAndEnabledHumanUserIdsOf } from "../substrate/participants-humans.ts";

export function createReadInheritedChatBooks(ctx: Pick<ChatContext, "db" | "can" | "getCard" | "resolveUserEnabled">) {
  return async (principal: Principal, chatId: ChatId): Promise<ChatBookView[]> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    if (!viewerReadsHidden(membership)) {
      return [];
    }
    const participants = await loadParticipants(ctx.db, chatId);
    const ownerId = principal.userId;
    const characterIds = participants.flatMap((row) => {
      const actor = classifyParticipant(row);
      return actor?.kind === "character" ? [actor.characterId] : [];
    });
    const cards = await Promise.all(characterIds.map((characterId) => ctx.getCard({ ownerId, characterId })));
    const consent = await presentAndEnabledHumanUserIdsOf(ctx, participants);
    const books = await loadInheritedWorldBooks(ctx.db, {
      chatId,
      ownerId,
      characterIds: characterIds.filter((_id, index) => cards[index] !== null),
      personaIds: memberPersonaIdsOf(humanSeatPersonasOf(participants, consent)),
      memberPersonaLore: membership.chat.metadata.memberPersonaLore !== false,
    });
    // A handoff/leave while the cross-feature card reads await must not return the outgoing host's headers.
    return viewerReadsHidden(await requireParticipant(ctx, principal, chatId)) ? books : [];
  };
}
