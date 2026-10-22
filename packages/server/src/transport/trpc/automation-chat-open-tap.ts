// The per-viewer "chat opened" side-channel tap (D81). The `chat` room source synthesizes a `chatOpened`
// event per viewer at stream-attach — it is NEVER published on the durable per-chat bus (presence is not
// canon; the frozen bus is never widened for automation — 01 §0). So the automation watcher's bus
// subscription can't see it. This module is the sanctioned tap: the stream generator calls `notifyChatOpened`
// as it yields the synthetic, and the composition root injects the sink (`setChatOpenTap`) that forwards to
// `automation.handleEvent({ type: "chatOpened", chatId })`. The sink is null until wired — a byte-identical
// no-op (the `tools`/`rpg` null-op precedent). EVERY attach fires (reconnects included); the
// dispatch budget gates bound the refire.

import type { ChatOpenTap } from "./contract/live-buses.ts";

/** Bind the D81 chat-open sink to one application graph. */
export function createChatOpenTap(): ChatOpenTap {
  let closed = false;
  let sink: Parameters<ChatOpenTap["setChatOpenTap"]>[0] = null;
  return {
    setChatOpenTap(tap): void {
      if (closed) {
        throw new Error("chat-open tap is disposed");
      }
      sink = tap;
    },
    notifyChatOpened: (chatId, viewerUserId) => sink?.(chatId, viewerUserId),
    [Symbol.dispose](): void {
      closed = true;
      sink = null;
    },
  };
}
