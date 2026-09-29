// substrate/viewer-gallery — the viewer's owned character seats (`ChatDetail.viewerOwnedCharacterIds`) and the
// room's gallery subject derived from them (`viewerGalleryCharacterId`), so the two can never disagree. The pick is
// `firstCharacterIdOf`, the one `generateImage` makes; ownership is the owner-scoped card read its auto-add reads.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { characterIdsOf, firstCharacterIdOf } from "../persistence/participant.ts";

type RosterSeats = Parameters<typeof characterIdsOf>[0];

/** The character seats `viewerUserId` owns, in roster order. `participants` is the present roster in join order
 *  (`loadParticipants`, or the views built from it), so a departed seat is never asked about. */
export async function resolveViewerOwnedCharacterIds(getCard: ChatContext["getCard"], participants: RosterSeats, viewerUserId: UserId): Promise<CharacterId[]> {
  const owned: CharacterId[] = [];
  for (const characterId of characterIdsOf(participants)) {
    if ((await getCard({ ownerId: viewerUserId, characterId })) !== null) {
      owned.push(characterId);
    }
  }
  return owned;
}

/** The room's gallery subject for the viewer: the first character seat, when it is one they own, else `null`. A
 *  later owned seat never counts, because a chat-generated picture joins the first seat's gallery. */
export function viewerGalleryCharacterIdOf(participants: RosterSeats, owned: readonly CharacterId[]): CharacterId | null {
  const first = firstCharacterIdOf(participants);
  return first !== null && owned.includes(first) ? first : null;
}
