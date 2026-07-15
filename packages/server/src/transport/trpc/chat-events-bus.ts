// The per-chat live fan-out the chat.streamMessages subscription tails. The chat domain owns the durable
// half (the chat_events INSERT + the replayChatEvents/chatEventBounds member-gated reads); the per-chat
// live channel is transport state. Rides `defineBusChannel` WITH the firehose opt-in (the buddy-observer
// chat source) — the ONE bus needing it (client-architecture-lockdown.md §13/§16 G10).
//
// Durable-first / fan-out-second: entry wraps the domain bus emit so the chat_events row (which assigns
// the per-chat seq) always commits before the live publish, so a dead bus path never loses an event.
// Durability is composed OUTSIDE this module (entry/compose/services.ts's `emitChatEvent`) — this module
// only fans the already-durable entry.
//
// Authz lives outside this module: the channel is keyed by chatId only; the subscription generator gates
// every yield through the member-scoped chatEventBounds.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { defineBusChannel } from "./bus-channel";

const channelFor = (chatId: ChatId): string => `chat:${chatId}`;

/** One live-bus entry — the durable per-chat cursor + the room-public event. */
export interface ChatLiveEvent {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

const bus = defineBusChannel<ChatId, ChatLiveEvent>(channelFor, { firehose: true });

/** Publish a durably-logged chat event to the room's live channel (+ the all-chats firehose). */
export function publishChatEvent(entry: ChatLiveEvent): void {
  bus.publish(entry.event.chatId, entry);
}

/** Subscribe to the all-chats firehose (the buddy observer's chat source); returns the unsubscribe.
 *  Callback-style — the observer is a long-lived process supervisor, not a per-request SSE generator. */
export function subscribeAllChatEvents(listener: (entry: ChatLiveEvent) => void): () => void {
  return bus.subscribeAll(listener);
}

/** The room's live event stream, scoped to one `chatId` and torn down on `signal` abort. `on()` begins
 *  buffering the instant it is called, so a caller invoking this before the durable replay loses no event
 *  in the gap (the subscription dedupes the overlap by the monotonic seq). */
export function subscribeChatEvents(
  chatId: ChatId,
  signal: AbortSignal,
): AsyncIterable<ChatLiveEvent> {
  return bus.subscribe(chatId, signal);
}
