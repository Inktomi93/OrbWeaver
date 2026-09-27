// The room's gallery door for the viewer: it opens the gallery of the character a picture they generate here
// joins (`viewerGalleryCharacter`). A viewer who owns no character in the room gets no door, because that
// gallery would be someone else's. The composer's menu and `/gallery` share it.

import { viewerGalleryCharacter } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { openCharacterGallery } from "#state";

/** The gallery a viewer can open from `chatId`: its character's name and the opener, or `null` when the
 *  viewer owns no character there (or there is no room). The room read is cache-first. */
export function useRoomGalleryDoor(chatId: ChatId | null): { readonly characterName: string; readonly open: () => void } | null {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions(chatId === null ? skipToken : { chatId }));
  const seat = chat === undefined ? null : viewerGalleryCharacter(chat);
  const characterId = seat?.characterId ?? null;
  if (chatId === null || seat === null || characterId === null) {
    return null;
  }
  return { characterName: seat.displayName, open: (): void => openCharacterGallery(characterId, { characterName: seat.displayName, chatId }) };
}
