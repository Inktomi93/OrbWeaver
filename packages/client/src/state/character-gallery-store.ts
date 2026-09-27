// The character-gallery INTENT store: which character's gallery the app-root host shows, and the chat it was
// opened from. Any surface opens it through a `#state` action, so no feature imports the chat feature that
// owns the dialog. Ephemeral, never persisted: a reload never reopens it.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

/** The gallery the host shows. `chatId` is the room it was opened from, the room its "This chat" scope reads;
 *  `null` outside a chat, where that scope does not exist. */
interface CharacterGalleryTarget {
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly chatId: ChatId | null;
}

interface CharacterGalleryState {
  readonly target: CharacterGalleryTarget | undefined;
}

const useCharacterGalleryStore = createGatedStore<CharacterGalleryState>("character-gallery", (): CharacterGalleryState => ({ target: undefined }));

/** Open `characterId`'s gallery. Pass `chatId` from inside a room; omit it everywhere else. */
export function openCharacterGallery(characterId: CharacterId, opts: { readonly characterName: string; readonly chatId?: ChatId }): void {
  useCharacterGalleryStore.setState(
    { target: { characterId, characterName: opts.characterName, chatId: opts.chatId ?? null } },
    false,
    "character-gallery/openCharacterGallery",
  );
}

/** The host's close: drop the target so a re-open never inherits a stale one. */
export function closeCharacterGallery(): void {
  useCharacterGalleryStore.setState({ target: undefined }, false, "character-gallery/closeCharacterGallery");
}

/** Reactive: the gallery the host shows, or `undefined` when it is closed. */
export function useCharacterGalleryTarget(): CharacterGalleryTarget | undefined {
  return useCharacterGalleryStore((s) => s.target);
}
