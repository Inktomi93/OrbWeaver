// The per-chat live fan-out the chat.streamMessages subscription tails. The chat domain owns the durable
// half (the chat_events INSERT + the replayChatEvents/chatEventBounds member-gated reads); the per-chat
// live channel is transport state. One process-local EventEmitter, one channel per chatId.
//
// Durable-first / fan-out-second: entry wraps the domain bus emit so the chat_events row (which assigns
// the per-chat seq) always commits before the live publish, so a dead bus path never loses an event.
//
// Authz lives outside this module: the channel is keyed by chatId only; the subscription generator gates
// every yield through the member-scoped chatEventBounds.

import { EventEmitter, on } from "node:events";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";

// Process-local; unbounded listeners (one per connected member device — many concurrent SSE streams).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channelFor = (chatId: ChatId): string => `chat:${chatId}`;
// The firehose channel — every chat event, regardless of chat. The buddy observer taps this to react to
// turn lifecycle across all rooms; a per-chat subscriber never sees it.
const ALL_CHATS_CHANNEL = "chat:*";

/** One live-bus entry — the durable per-chat cursor + the room-public event. */
export interface ChatLiveEvent {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** Publish a durably-logged chat event to the room's live channel. */
export function publishChatEvent(entry: ChatLiveEvent): void {
  emitter.emit(channelFor(entry.event.chatId), entry);
  emitter.emit(ALL_CHATS_CHANNEL, entry);
}

/** Subscribe to the all-chats firehose (the buddy observer's chat source); returns the unsubscribe.
 *  Callback-style — the observer is a long-lived process supervisor, not a per-request SSE generator. */
export function subscribeAllChatEvents(listener: (entry: ChatLiveEvent) => void): () => void {
  emitter.on(ALL_CHATS_CHANNEL, listener);
  return () => {
    emitter.off(ALL_CHATS_CHANNEL, listener);
  };
}

/** The room's live event stream, scoped to one `chatId` and torn down on `signal` abort. `on()` begins
 *  buffering the instant it is called, so a caller invoking this before the durable replay loses no event
 *  in the gap (the subscription dedupes the overlap by the monotonic seq). */
export function subscribeChatEvents(
  chatId: ChatId,
  signal: AbortSignal,
): AsyncIterable<ChatLiveEvent> {
  return liveEntries(on(emitter, channelFor(chatId), { signal }));
}

// `on()` yields the raw emit-args array (`[entry]`); EventEmitter is untyped, so the element is unwrapped
// and annotated at this single boundary.
async function* liveEntries(source: AsyncIterable<unknown[]>): AsyncGenerator<ChatLiveEvent> {
  for await (const args of source) {
    yield args[0] as ChatLiveEvent;
  }
}
