// The BORN-STATE corpus read op (the host `populateFromCharacter` round): one roster
// character's CARD prose + the room's OPENING line. STANDALONE + principal-free (the `resolveRpgRoster`/
// `resolveCanonWindow` injected-op precedent — the rpg verb gated its HOST caller before invoking; this op only
// reads). Homed in chat because the card read + the canon read are chat's — rpg stays table-blind (§2
// one-directional flow: rpg receives PROSE AS DATA and reads no chat/character table).
//
// The card resolves under the room HOST's ownership (the `resolveRpgRoster` seat rule, D18/D19) — a gone card
// or a hostless room yields `null` and the verb refuses the round.
//
// WHY THE OPENING AND NOT THE STORY: a populate round establishes what the character walked IN with. The
// opening line is the last thing that is still "the premise" rather than "what happened"; everything after it
// is play, and re-deriving state from play is `resyncFromStory` — a different verb with a different window.

import type { CharacterCard } from "@orb/contracts/character";
import type { chatParticipants } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { ResolveRpgCardCorpus } from "../contract/context.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadCanonHistory } from "../persistence/queries.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";

type ChatParticipantRow = typeof chatParticipants.$inferSelect;

/** The card sections the round reads, in the order a human reads a card. A section with no prose is OMITTED
 *  (a thin card yields a short corpus, never a scaffold of empty headings that teaches the model to invent). */
const CARD_SECTIONS: readonly { readonly label: string; readonly of: (card: CharacterCard) => string | null }[] = [
  { label: "DESCRIPTION", of: (card) => card.description },
  { label: "PERSONALITY", of: (card) => card.personality },
  { label: "SCENARIO", of: (card) => card.scenario },
];

/** Does `characterId` hold a PRESENT character seat in this roster? `loadParticipants` already filters departed
 *  seats (`leftSeq IS NULL`), so a character that left the room is not seated. */
function isSeatedCharacter(participants: readonly ChatParticipantRow[], characterId: CharacterId): boolean {
  return participants.some((row) => {
    const actor = classifyParticipant(row);
    return actor?.kind === "character" && actor.characterId === characterId;
  });
}

/** Render the card's authored prose as labeled blocks. */
function renderCard(card: CharacterCard): string {
  const blocks: string[] = [];
  for (const section of CARD_SECTIONS) {
    const text = section.of(card)?.trim() ?? "";
    if (text.length > 0) {
      blocks.push(`${section.label}:\n${text}`);
    }
  }
  return blocks.join("\n\n");
}

export function createResolveRpgCardCorpus(ctx: ChatContext): ResolveRpgCardCorpus {
  return async (chatId, characterId) => {
    // Card reads need an owner — the room host (the character-card ownership authority, D18/D19).
    const participants = await loadParticipants(ctx.db, chatId);
    const hostUserId = hostUserIdOf(participants);
    if (hostUserId === null) {
      return null;
    }
    // THE SEAT IS THE SCOPE (#1448). `characterId` reaches here from `params.actorRef.characterId` — a wire
    // parameter on `rpg.populateFromCharacter`, validated only for `kind === "character"`. Owner-scoping the
    // CARD read alone let a host name any card in their library and pull its prose into THIS room's corpus
    // (and mint an `rpg_sheets` row against a character with no seat). D18: membership is the scope of a
    // room-scoped read, so the room's own present roster decides, exactly as this file's header always said.
    if (!isSeatedCharacter(participants, characterId)) {
      return null;
    }
    const card = await ctx.getCard({ ownerId: hostUserId, characterId });
    if (card === null) {
      return null;
    }
    // The OPENING line — the first canon slot's selected body (the greeting as actually posted, host edits
    // included). An empty room yields "" and the round runs on the card alone.
    const canon = await loadCanonHistory(ctx.db, chatId);
    return { name: card.name, card: renderCard(card), opening: canon.at(0)?.content ?? "" };
  };
}
