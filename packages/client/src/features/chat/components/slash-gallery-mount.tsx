// The `/gallery` runner mount, rendered invisibly by each slash-command host in its own fiber. It opens the
// gallery of the room character the viewer owns (`useRoomGalleryDoor`). `unavailableReason` already refuses a
// room-less run and a viewer who owns no character there, so the strip shows why before anything runs.

import { useEffect } from "react";
import type { SlashCommandMountProps } from "#lib";
import { notify } from "#lib";
import { useRoomGalleryDoor } from "../hooks/use-room-gallery-door.ts";

/** The refusal a `/gallery` earns in a room where the viewer owns no character. */
export const NO_GALLERY_HERE = "You own no character in this chat, so it has no gallery of yours to open.";

export function SlashGalleryMount({ context, onRunner }: SlashCommandMountProps): null {
  const door = useRoomGalleryDoor(context.chatId);
  useEffect(() => {
    onRunner((): void => {
      // Past the availability gate, only a roster that lacks the owned seat lands here.
      if (door === null) {
        notify.warn(NO_GALLERY_HERE);
        return;
      }
      door.open();
    });
  }, [door, onRunner]);
  return null;
}
