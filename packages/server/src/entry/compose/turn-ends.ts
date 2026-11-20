// Each turn that ends in any room, completed or aborted, for the card-frame store's release of that room's forming
// frames (D354). A reader of the all-chats firehose beside the automation watcher: it forwards the room id alone and
// never an event body, so no member's content or join history reaches a per-user surface (D162).

import type { LiveBuses } from "#transport/trpc";
import type { CardFrameDeps } from "../http/index.ts";

/** The room id of every turn that ends, from the firehose; returns the unsubscribe. */
export function chatTurnEnds(chat: Pick<LiveBuses["chat"], "subscribeAllChatEvents">): CardFrameDeps["onTurnEnded"] {
  return (listener) =>
    chat.subscribeAllChatEvents(({ event }) => {
      if (event.type === "turnCompleted" || event.type === "turnAborted") {
        listener(event.chatId);
      }
    });
}
