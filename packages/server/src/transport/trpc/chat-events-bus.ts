// The per-chat live fan-out the multiplexed socket's `chat` ROOM tails. The chat domain owns the durable
// half (the chat_events INSERT + the replayChatEvents/chatEventBounds member-gated reads); the per-chat
// live channel is transport state. Rides `defineBusChannel` WITH the firehose opt-in (the buddy-observer
// chat source) — the ONE bus needing it (client-architecture-state-and-gates.md §13/§16 G10).
//
// Durable-first / fan-out-second: chat's publication factory wraps the domain bus emit so the chat_events row (which assigns
// the per-chat seq) always commits before the live publish, so a dead bus path never loses an event.
// Durability is composed OUTSIDE this module (`domain/chat/substrate/publication.ts`) — this module
// only fans the already-durable entry.
//
// THE ONE EXCEPTION IS THE LIVE-ONLY LANE (`seq: null`, entity→room bridge design §3.4): a member of
// `LIVE_ONLY_CHAT_EVENT_TYPES` carries no canon and has nothing to replay, so it is fanned WITHOUT a
// `chat_events` append (`entry/compose/services.ts`'s `emitChatEventLive`). "Durable-first" still holds for
// everything that HAS a durable form — the lane is closed by type, not by discipline.
//
// Authz lives outside this module: the channel is keyed by chatId only; the subscription generator gates
// every yield through the member-scoped chatEventBounds.

import type { ChatLivePublish } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import { defineBusChannel } from "./bus-channel.ts";

import type { ChatEventsBus, ChatLiveEvent } from "./contract/live-buses.ts";

const channelFor = (chatId: ChatId): string => `chat:${chatId}`;

/** Create one graph-owned live channel; admission and durable writes remain at their existing callers. */
export function createChatEventsBus(logger: Logger): ChatEventsBus {
  // biome-ignore lint/nursery/useDisposables: the returned bus delegates disposal to this channel; local using would close it before graph subscribers start.
  const bus = defineBusChannel<ChatId, ChatLiveEvent>(channelFor, { firehose: true });

  /** Publish one entry to the room's live channel (+ the all-chats firehose) — either a durably-logged event
   *  (numbered `seq`) or a live-only one (`seq: null`; see {@link ChatLiveEvent}). */
  function publish(entry: ChatLivePublish): void {
    bus.publish(entry.event.chatId, entry);
  }

  /** Subscribe to the all-chats firehose (the buddy observer's chat source); returns the unsubscribe.
   *  Callback-style — the observer is a long-lived process supervisor, not a per-request SSE generator. */
  function subscribeAll(listener: (entry: ChatLiveEvent) => void): () => void {
    return bus.subscribeAll((entry) => {
      try {
        listener(entry);
      } catch (err) {
        // The event is already durable. A callback-style observer cannot roll back that truth or make its
        // producer report failure; isolate and report the observer fault at the subscription boundary.
        getLog(logger).error({ err, chatId: entry.event.chatId, type: entry.event.type }, "chat live firehose listener failed after durable publish");
      }
    });
  }

  /** The room's live event stream, scoped to one `chatId` and torn down on `signal` abort. `on()` begins
   *  buffering the instant it is called, so a caller invoking this before the durable replay loses no event
   *  in the gap (the subscription dedupes the overlap by the monotonic seq). */
  function subscribe(chatId: ChatId, signal: AbortSignal): AsyncIterable<ChatLiveEvent> {
    return bus.subscribe(chatId, signal);
  }
  return { publishChatEvent: publish, subscribeAllChatEvents: subscribeAll, subscribeChatEvents: subscribe, [Symbol.dispose]: () => bus[Symbol.dispose]() };
}
