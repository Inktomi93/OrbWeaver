// The per-viewer "chat opened" side-channel tap (D81). The `chat` room source synthesizes a `chatOpened`
// event per viewer at stream-attach — it is NEVER published on the durable per-chat bus (presence is not
// canon; the frozen bus is never widened for automation — 01 §0). So the automation watcher's bus
// subscription can't see it. This module is the sanctioned tap: the stream generator calls `notifyChatOpened`
// as it yields the synthetic, and the composition root injects the sink (`setChatOpenTap`) that forwards to
// `automation.handleEvent({ type: "chatOpened", chatId })`. The sink is null until wired — a byte-identical
// no-op (the `tools`/`rpg`/`expressions` null-op precedent). EVERY attach fires (reconnects included); the
// dispatch budget gates bound the refire.

import type { ChatId, UserId } from "@orb/kit/ids";

/** The injected per-viewer chat-open handler (fire-and-forget; self-safe downstream). */
type ChatOpenTap = (chatId: ChatId, viewerUserId: UserId) => void;

let sink: ChatOpenTap | null = null;

/** Wire (or clear, on teardown) the automation tap at the composition root. */
export function setChatOpenTap(tap: ChatOpenTap | null): void {
  sink = tap;
}

/** Called by the stream generator as it yields the per-viewer `chatOpened` synthetic. A no-op until wired. */
export function notifyChatOpened(chatId: ChatId, viewerUserId: UserId): void {
  sink?.(chatId, viewerUserId);
}
