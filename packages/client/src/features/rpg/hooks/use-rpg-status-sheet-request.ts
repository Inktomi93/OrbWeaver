// The Status tab's side of a sheet request made from another tab: take it once, open the viewer's own character (else the
// first), and clear it from the store.

import type { RpgActorView } from "@orb/contracts/rpg";
import type { ChatId, UserId } from "@orb/kit/ids";
import { useEffect, useState } from "react";
import { clearRpgStatusSheetRequest, useRequestedRpgStatusSheet } from "#state";
import { actorKey } from "../lib/actor-key.ts";

/** Calls `open` with the actor key to show when a request for `chatId` arrives; a request for another room is left alone. */
export function useRpgStatusSheetRequest(characters: readonly RpgActorView[], chatId: ChatId, viewerUserId: UserId, open: (key: string) => void): void {
  const requested = useRequestedRpgStatusSheet();
  const [taken, setTaken] = useState<typeof requested>(null);
  const ours = requested !== null && requested.chatId === chatId;
  if (ours && requested !== taken) {
    setTaken(requested);
    const own = characters.find((actor) => actor.actorRef.kind === "user" && actor.actorRef.userId === viewerUserId);
    const target = own ?? characters[0];
    if (target !== undefined) {
      open(actorKey(target));
    }
  }
  useEffect(() => {
    if (ours) {
      clearRpgStatusSheetRequest();
    }
  }, [ours]);
}
