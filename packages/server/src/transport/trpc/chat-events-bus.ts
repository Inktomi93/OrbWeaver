// The per-chat live fan-out the multiplexed socket's `chat` ROOM tails. The chat domain owns the durable
// half (the chat_events INSERT + the replayChatEvents/chatEventBounds member-gated reads); the per-chat
// live channel is transport state. Rides `defineBusChannel` WITH the firehose opt-in (the buddy-observer
// chat source) — the ONE bus needing it (client-architecture-lockdown.md §13/§16 G10).
//
// Durable-first / fan-out-second: entry wraps the domain bus emit so the chat_events row (which assigns
// the per-chat seq) always commits before the live publish, so a dead bus path never loses an event.
// Durability is composed OUTSIDE this module (entry/compose/services.ts's `emitChatEvent`) — this module
// only fans the already-durable entry.
//
// THE ONE EXCEPTION IS THE LIVE-ONLY LANE (`seq: null`, entity→room bridge design §3.4): a member of
// `LIVE_ONLY_CHAT_EVENT_TYPES` carries no canon and has nothing to replay, so it is fanned WITHOUT a
// `chat_events` append (`entry/compose/services.ts`'s `emitChatEventLive`). "Durable-first" still holds for
// everything that HAS a durable form — the lane is closed by type, not by discipline.
//
// Authz lives outside this module: the channel is keyed by chatId only; the subscription generator gates
// every yield through the member-scoped chatEventBounds.

import type { ChatBusEvent, LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { defineBusChannel } from "./bus-channel.ts";

const channelFor = (chatId: ChatId): string => `chat:${chatId}`;

/** One live-bus entry — the durable per-chat cursor + the room-public event.
 *
 *  TWO ARMS, and the pairing is PHYSICS rather than convention (the entity→room bridge's live-only
 *  lane):
 *    • `seq: number` — the durable arm. The entry was appended to `chat_events` first and this IS its replay
 *      cursor, so the pump dedups on it and the socket cell advances the room's resume cursor from it.
 *    • `seq: null`   — the LIVE-ONLY arm. No `chat_events` row exists, so there is no cursor to carry and
 *      nothing to replay. The pump skips the dedup and yields it at the CURRENT cursor (the attach-synthetic
 *      non-advancement rule), so an undelivered durable row can never be skipped past.
 *  The null-seq arm is narrowed to the live-only members, so "fan a durable event without logging it" is a
 *  compile error here. The converse — appending a live-only member — is closed UPSTREAM of every writer,
 *  at the two `DurableChatBusEvent`-narrowed emit surfaces (`domain/chat/bus::emit`,
 *  `entry/compose/services::emitChatEvent`), which is why the numbered arm keeps the wide type. */
export interface ChatLiveEvent {
  readonly seq: number | null;
  readonly event: ChatBusEvent;
}

/** The WRITE door's shape — the arm pairing as a discriminated union, so a publisher cannot fan a durable
 *  event without its cursor nor append-by-accident a live-only one. Deliberately NOT exported:
 *  `no-inline-types` homes an exported type alias in `contract/`, and transport has none — and a READER genuinely wants
 *  the wide `ChatLiveEvent` above (the pump switches on `seq === null` and re-resolves the event either way).
 *  The narrowing that matters is on the doors, and it is here. */
type ChatLivePublish = { readonly seq: number; readonly event: ChatBusEvent } | { readonly seq: null; readonly event: LiveOnlyChatBusEvent };

const bus = defineBusChannel<ChatId, ChatLiveEvent>(channelFor, { firehose: true });

/** Publish one entry to the room's live channel (+ the all-chats firehose) — either a durably-logged event
 *  (numbered `seq`) or a live-only one (`seq: null`; see {@link ChatLiveEvent}). */
export function publishChatEvent(entry: ChatLivePublish): void {
  bus.publish(entry.event.chatId, entry);
}

/** Subscribe to the all-chats firehose (the buddy observer's chat source); returns the unsubscribe.
 *  Callback-style — the observer is a long-lived process supervisor, not a per-request SSE generator. */
export function subscribeAllChatEvents(listener: (entry: ChatLiveEvent) => void): () => void {
  return bus.subscribeAll((entry) => {
    try {
      listener(entry);
    } catch (err) {
      // The event is already durable. A callback-style observer cannot roll back that truth or make its
      // producer report failure; isolate and report the observer fault at the subscription boundary.
      getLog().error({ err, chatId: entry.event.chatId, type: entry.event.type }, "chat live firehose listener failed after durable publish");
    }
  });
}

/** The room's live event stream, scoped to one `chatId` and torn down on `signal` abort. `on()` begins
 *  buffering the instant it is called, so a caller invoking this before the durable replay loses no event
 *  in the gap (the subscription dedupes the overlap by the monotonic seq). */
export function subscribeChatEvents(chatId: ChatId, signal: AbortSignal): AsyncIterable<ChatLiveEvent> {
  return bus.subscribe(chatId, signal);
}
