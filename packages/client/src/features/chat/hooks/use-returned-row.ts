// A room's row after Back leaves that room: marked as the place the user came from, and focused once.

import type { ChatId } from "@orb/kit/ids";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { consumeReturnFocus, useReturnedChat } from "#state";

export function useReturnedRow(chatId: ChatId): { readonly marked: boolean; readonly bodyRef: RefObject<HTMLButtonElement | null> } {
  const returned = useReturnedChat(chatId);
  const ref = useRef<HTMLButtonElement>(null);
  const focusPending = returned?.focusPending === true;
  useEffect(() => {
    // A row inside an inert pane (a collapsed sheet) cannot take focus; leave the focus unspent for a row that can.
    if (focusPending && ref.current !== null && ref.current.closest("[inert]") === null) {
      // The list restores its own scroll position; the row is already where the user left it.
      ref.current.focus({ preventScroll: true });
      consumeReturnFocus();
    }
  }, [focusPending]);
  return { marked: returned !== null, bodyRef: ref };
}
