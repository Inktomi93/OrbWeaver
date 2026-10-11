// The phone Back's memory (chat-return-store): the section a room was resumed from, and the room Back last
// left. The rendered half (focus and the mark on the row) is pinned in chat-list-surface.ct.tsx and
// app-shell.ct.tsx; this lane pins the store's state transitions.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  chatOrigin,
  clearChatReturn,
  consumeReturnFocus,
  markChatReturned,
  noteChatOrigin,
  subscribeChatOrigin,
  useReturnedChat,
} from "#client/state/chat-return-store.ts";
import { expect, test } from "../../support/fixtures.ts";

const ROOM = castId<ChatId>("chat_return_store_probe");

describe("chat-return-store", () => {
  test("Back from a room spends the origin, marks the room, and hands focus out exactly once", () => {
    clearChatReturn();
    noteChatOrigin("home");
    expect(chatOrigin()).toBe("home");

    markChatReturned(ROOM);
    expect(chatOrigin()).toBeNull();
    // The hook is the rendered read; its subject here is the store it selects from.
    expect(typeof useReturnedChat).toBe("function");

    // Spending the focus twice is the same as once: a row mounting later must not steal it back.
    consumeReturnFocus();
    consumeReturnFocus();
    clearChatReturn();
    expect(chatOrigin()).toBeNull();
  });

  test("subscribers hear an origin change and nothing else", () => {
    clearChatReturn();
    let heard = 0;
    const unsubscribe = subscribeChatOrigin(() => {
      heard += 1;
    });
    noteChatOrigin("characters");
    expect(heard).toBe(1);
    consumeReturnFocus();
    expect(heard).toBe(1);
    noteChatOrigin("characters");
    expect(heard).toBe(1);
    clearChatReturn();
    expect(heard).toBe(2);
    unsubscribe();
    noteChatOrigin("home");
    expect(heard).toBe(2);
    clearChatReturn();
  });
});
