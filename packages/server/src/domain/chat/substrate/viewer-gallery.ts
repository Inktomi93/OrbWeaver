// substrate/viewer-gallery — the `ChatDetail.viewerGalleryCharacterId` resolver. The pick is `firstCharacterIdOf`,
// the one `generateImage` makes; the gate is the owner-scoped card read, the same answer imagery's auto-add
// gate reads. Both halves are shared, so the imagine dialog cannot offer an add the server will not make.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { firstCharacterIdOf } from "../persistence/participant.ts";

/** The room's gallery subject when `viewerUserId` owns it, else `null`. `participants` is the present roster
 *  in join order (`loadParticipants`, or the views built from it). */
export async function resolveViewerGalleryCharacterId(
  getCard: ChatContext["getCard"],
  participants: Parameters<typeof firstCharacterIdOf>[0],
  viewerUserId: UserId,
): Promise<CharacterId | null> {
  const characterId = firstCharacterIdOf(participants);
  if (characterId === null) {
    return null;
  }
  const card = await getCard({ ownerId: viewerUserId, characterId });
  return card === null ? null : characterId;
}
