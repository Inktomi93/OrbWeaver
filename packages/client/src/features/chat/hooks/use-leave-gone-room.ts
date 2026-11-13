// A room whose own read answers not found is gone: deleted or reaped, or never there (a stale id restored at load). Its id is the active
// chat and the active-chat store makes no server call, so the read's answer returns the reader to the chat list, where a retry could
// never succeed. The clear runs in an effect, never in render.

import type { ChatId } from "@orb/kit/ids";
import { useEffect } from "react";
import { trpcErrorCode } from "#lib";
import { chatDeletedFromList } from "#state";

/** Leave the room when `error` is a not-found answer for it, and say whether the room is gone so the caller can stop drawing it. */
export function useLeaveGoneRoom(chatId: ChatId, error: unknown): boolean {
  const gone = trpcErrorCode(error) === "NOT_FOUND";
  useEffect(() => {
    if (gone) {
      chatDeletedFromList(chatId);
    }
  }, [gone, chatId]);
  return gone;
}
