// The one mount of the character gallery dialog, beside the app root's other dialogs. It shows whatever
// `openCharacterGallery` (`#state`) names, so the chat menu, the composer, `/gallery` and the character
// panel open one dialog without importing this feature.

import type { ReactElement } from "react";
import { closeCharacterGallery, useCharacterGalleryTarget } from "#state";
import { CharacterGalleryDialog } from "./character-gallery-dialog.tsx";

export function CharacterGalleryAnchor(): ReactElement | null {
  const target = useCharacterGalleryTarget();
  if (target === undefined) {
    return null;
  }
  return (
    // Keyed per gallery, so switching character or room starts from the first page with the default views.
    <CharacterGalleryDialog
      characterId={target.characterId}
      characterName={target.characterName}
      chatId={target.chatId}
      key={`${target.characterId}:${target.chatId ?? ""}`}
      onOpenChange={(next): void => {
        if (!next) {
          closeCharacterGallery();
        }
      }}
      open={true}
    />
  );
}
