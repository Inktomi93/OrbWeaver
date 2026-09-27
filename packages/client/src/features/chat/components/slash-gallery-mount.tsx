// The `/gallery` runner mount, rendered invisibly by each slash-command host in its own fiber. It opens the
// gallery of the room character the viewer owns (`useRoomGalleryDoor`); a viewer who owns none is told why,
// never handed someone else's gallery. `unavailableReason` already refuses a room-less run.

import { useEffect } from "react";
import type { SlashCommandMountProps } from "#lib";
import { notify } from "#lib";
import { useRoomGalleryDoor } from "../hooks/use-room-gallery-door.ts";

/** The refusal a `/gallery` earns in a room where the viewer owns no character. */
const NO_GALLERY_HERE = "You own no character in this chat, so it has no gallery of yours to open.";

export function SlashGalleryMount({ context, onRunner }: SlashCommandMountProps): null {
  const door = useRoomGalleryDoor(context.chatId);
  useEffect(() => {
    onRunner((): void => {
      if (door === null) {
        notify.warn(NO_GALLERY_HERE);
        return;
      }
      door.open();
    });
  }, [door, onRunner]);
  return null;
}
