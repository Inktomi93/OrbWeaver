// The monotonic per-chat seq guard for the chat SSE stream — the exactly-once gate the bus adapter
// (`use-chat-bus.ts`) runs every tracked envelope through before the reducer sees it.
//
// WHY: every DURABLE-log frame on the `chat` room carries the durable per-chat `seq` (SSE-1 §3.3 — it rode
// the tracked envelope id before the multiplex fold). On the draft→committed promotion path the room attaches
// with the `sinceSeq: 0` seed, so ANY room churn (a React StrictMode dev remount, HMR, a re-attach)
// re-REPLAYS the whole durable log FROM ZERO. A re-replayed `turnStarted` re-OPENS a turn slot that already
// terminated (`beginTurn` is unconditional by design — a real regenerate must re-open a completed slot); if
// that replaying subscription is torn down before it re-yields the matching terminal, the slot is stranded
// live and the composer's Stop button (driven purely by the slot phase) sticks forever. Dropping any event
// whose `seq` does not advance the high-water mark makes durable-log delivery exactly-once and kills the
// stranding at the source (also the "getChat invalidated 3× in 6ms" double-delivery smell).
//
// EXEMPTION BY TYPE (not by id-shape): `chatOpened`/`historyTruncated` are attach-SYNTHESIZED signals, NOT
// durable-log entries — the transport yields them per attach (`transport/trpc/stream/sources/chat.ts`
// `attachSynthesesAndReplay`), stamped with the NON-advancing resume cursor as their frame `seq` (a numeric
// `cursor ?? 0`, so an id-shape test can never tell them apart). Re-firing them on every (re)attach is BY DESIGN — that per-attach
// re-fire IS the reopen catch-up: `chatOpened` is the sole invalidate that refetches a detached-then-reopened
// chat (query-client staleTime is Infinity — the SSE bus drives freshness), and `historyTruncated` fires
// exactly when a refetch is needed. Running them through the monotonic mark would DROP them on reopen (their
// cursor id is ≤ the chat's retained mark from an earlier session) → a stale transcript until some new live
// event lands. So they are ALWAYS admitted; only real durable-log events are deduped by seq.
//
// A factory (not a bare singleton) so tests get an isolated instance; the adapter holds ONE process
// singleton. Server `seq` is monotonic-per-chat forever, so a genuine live event on any later re-open still
// advances the mark and is admitted — only a from-zero re-replay of already-seen durable events is suppressed.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";

/** The attach-synthesized (non-durable-log) event types — re-fired per attach as the reopen catch-up, so
 *  they bypass the seq dedup entirely (see the EXEMPTION note above). Keyed by `ChatBusEvent["type"]` so a
 *  rename fails tsc here rather than silently un-exempting a synthetic. */
const SYNTHESIZED_EXEMPT: ReadonlySet<ChatBusEvent["type"]> = new Set<ChatBusEvent["type"]>(["chatOpened", "historyTruncated"]);

/** Cap the per-session mark map so a long-lived session that opens many chats cannot grow it unboundedly;
 *  eviction only ever drops a chat's OLD mark (a later re-open re-baselines from its live tail, still
 *  monotonic-forward), never a live event. */
const MAX_TRACKED_CHATS = 512;

export interface ChatEventSeqGuard {
  /** True iff the event should reach the reducer. Attach-synthesized types are always admitted; every other
   *  (durable-log) event is admitted only when its `seq` advances this chat's high-water mark (i.e. is NOT a
   *  stale re-delivery). A non-numeric id (never expected on a durable-log frame) is treated as
   *  always-advancing so a malformed frame is never silently swallowed. */
  readonly admit: (event: Pick<ChatBusEvent, "type" | "chatId">, rawSeqId: string) => boolean;
  /**
   * The last durable `seq` this client actually APPLIED for `chatId`, or `null` if it has applied none this
   * page. This is the client's own resume truth — strictly what it received, where the server's room cursor
   * is what it DELIVERED (a frame lost in flight on a dying socket counts for the server and not for the
   * client). The room's re-attach on reconnect carries this, so the durable replay refills exactly the gap
   * the client actually has. Read-only: it never advances the mark.
   */
  readonly highWater: (chatId: ChatId) => number | null;
}

export function createChatEventSeqGuard(): ChatEventSeqGuard {
  const highWaterSeqByChat = new Map<ChatId, number>();
  return {
    highWater: (chatId): number | null => highWaterSeqByChat.get(chatId) ?? null,
    admit: (event, rawSeqId): boolean => {
      // Synthesized attach signals bypass the mark — their per-attach re-fire is the reopen catch-up.
      if (SYNTHESIZED_EXEMPT.has(event.type)) {
        return true;
      }
      const seq = Number(rawSeqId);
      if (!Number.isFinite(seq)) {
        return true;
      }
      const chatId = event.chatId;
      const prev = highWaterSeqByChat.get(chatId);
      if (prev !== undefined && seq <= prev) {
        return false;
      }
      // Bound the map (LRU-ish): a Map preserves insertion order, so re-setting moves the key to the tail
      // and the oldest key is evicted first once over the cap.
      highWaterSeqByChat.delete(chatId);
      if (highWaterSeqByChat.size >= MAX_TRACKED_CHATS) {
        const oldest = highWaterSeqByChat.keys().next().value;
        if (oldest !== undefined) {
          highWaterSeqByChat.delete(oldest);
        }
      }
      highWaterSeqByChat.set(chatId, seq);
      return true;
    },
  };
}
