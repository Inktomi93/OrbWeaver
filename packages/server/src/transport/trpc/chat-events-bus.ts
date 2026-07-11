// transport/trpc/chat-events-bus — the per-chat LIVE fan-out the `chat.streamMessages` subscription tails
// (PD-46's stream half; core/Tier-4-Transport.md §5 "the SSE / streaming response shape"). The chat DOMAIN
// owns the durable half (the `chat_events` INSERT in bus.ts + the `replayChatEvents`/`chatEventBounds`
// member-gated reads); the per-chat live channel is TRANSPORT state (the notifications-bus twin — the
// domain has no in-memory subscribe channel by design). One process-local `EventEmitter`, one channel per
// `chatId`.
//
// DURABLE-FIRST / fan-out-second: the `entry/` root wraps the domain bus emit — `const seq = await
// bus.emit(event); publishChatEvent({ chatId, seq, event });` — the `chat_events` row (which assigns the
// per-chat `seq`) ALWAYS commits before the live publish, so a dead bus path never loses an event (the
// subscription replays it from the log by `seq`). The published entry carries the durable `seq` so the
// live yield is `tracked(String(seq), event)` — uniform with the durable replay envelopes.
//
// AUTHZ lives OUTSIDE this module: the channel is keyed by `chatId` only; the subscription generator
// gates every yield through the member-scoped `chat.chatEventBounds` (a kicked member's stream stops
// within the kick tx — the Tier-4 membership-chokepoint-covers-SSE rule). The payload is room-public by
// the bus allowlist.

import { EventEmitter, on } from "node:events";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";

// Process-local; unbounded listeners (one per connected member device — many concurrent SSE streams).
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const channelFor = (chatId: ChatId): string => `chat:${chatId}`;
// The FIREHOSE channel — EVERY chat event, regardless of chat. The buddy observer taps this (PD-45) to react
// to turn lifecycle across all rooms; a per-chat subscriber never sees it (they attach to `channelFor`).
const ALL_CHATS_CHANNEL = "chat:*";

/** One live-bus entry — the durable per-chat cursor + the room-public event (the same `{seq, event}`
 *  shape `chat.replayChatEvents` returns, so replay + live yields are uniform). */
export interface ChatLiveEvent {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** Publish a DURABLY-LOGGED chat event to the room's live channel. Called by the entry-composed emit
 *  wrapper AFTER the domain bus's `chat_events` INSERT returned the `seq` (durable-first). */
export function publishChatEvent(entry: ChatLiveEvent): void {
  emitter.emit(channelFor(entry.event.chatId), entry);
  emitter.emit(ALL_CHATS_CHANNEL, entry);
}

/** Subscribe to the ALL-CHATS firehose (the buddy observer's chat source, PD-45); returns the unsubscribe.
 *  Callback-style (not the async-iterator the per-chat subscription uses) — the observer is a long-lived
 *  process supervisor, not a per-request SSE generator. */
export function subscribeAllChatEvents(listener: (entry: ChatLiveEvent) => void): () => void {
  emitter.on(ALL_CHATS_CHANNEL, listener);
  return () => {
    emitter.off(ALL_CHATS_CHANNEL, listener);
  };
}

/**
 * The room's live event stream, scoped to one `chatId` and torn down on `signal` abort (SSE disconnect) —
 * `on()` removes the listener, so there is no leak across reconnects. `on()` begins BUFFERING the instant
 * it is called, so a caller that invokes this BEFORE the durable replay loses no event in the gap (the
 * subscription dedupes the overlap by the monotonic `seq`).
 */
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
