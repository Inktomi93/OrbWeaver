// The monotonic per-chat seq guard for the chat SSE stream — the exactly-once gate the bus adapter
// (`use-chat-bus.ts`) runs every chat frame through before the reducer sees it.
//
// WHY: every DURABLE-log frame on the `chat` room carries the durable per-chat `seq` (SSE-1 §3.3 — it rode
// the tracked envelope id before the multiplex fold). Any room churn (a React StrictMode dev remount, HMR, a
// re-attach) restarts the pump at this client's mark or earlier and RE-DELIVERS durable rows. A re-replayed
// `turnStarted` re-OPENS a turn slot that already terminated (`beginTurn` is unconditional by design — a real
// regenerate must re-open a completed slot); if that replaying subscription is torn down before it re-yields
// the matching terminal, the slot is stranded live and the composer's Stop button (driven purely by the slot
// phase) sticks forever. Dropping any durable frame whose `seq` does not advance the high-water mark makes
// durable-log delivery exactly-once and kills the stranding at the source.
//
// TWO KINDS OF FRAME BYPASS THE MARK:
//   • `seq: null` — a frame with no `chat_events` row: the live-only lane (`LIVE_ONLY_CHAT_EVENT_TYPES`) and a
//     dropped append that still fans (D342). It was never logged, so it can never be re-delivered, and a
//     terminal among them is exactly what closes a slot the dropped row would otherwise leave open.
//   • the attach SYNTHESES (`chatOpened`/`historyTruncated`) — the transport yields them per attach
//     (`transport/trpc/stream/sources/chat.ts` `attachSynthesesAndReplay`) stamped with a NON-advancing resume
//     cursor, a number the socket and `use-chat-bus.ts` adopt as a floor. Re-firing them on every (re)attach is
//     BY DESIGN — that per-attach re-fire IS the reopen catch-up: `chatOpened` is the sole invalidate that
//     refetches a detached-then-reopened chat (query-client staleTime is Infinity — the SSE bus drives
//     freshness). Running them through the mark would DROP them on reopen → a stale transcript until some new
//     live event lands.
//
// A factory (not a bare singleton) so tests get an isolated instance; the adapter holds ONE process
// singleton. Server `seq` is monotonic-per-chat forever, so a genuine live event on any later re-open still
// advances the mark and is admitted — only a re-replay of already-seen durable events is suppressed.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { StreamFrameFor } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";

/** The attach syntheses, keyed by `ChatBusEvent["type"]` so a rename fails tsc here rather than silently
 *  un-exempting a member. */
const ATTACH_SYNTHESES: ReadonlySet<ChatBusEvent["type"]> = new Set<ChatBusEvent["type"]>(["chatOpened", "historyTruncated"]);

/** Cap the per-session mark map so a long-lived session that opens many chats cannot grow it unboundedly;
 *  eviction only ever drops a chat's OLD mark (a later re-open re-baselines from its live tail, still
 *  monotonic-forward), never a live event. */
const MAX_TRACKED_CHATS = 512;

export interface ChatEventSeqGuard {
  /** True iff the frame should reach the reducer. A no-cursor frame and an attach synthesis are always
   *  admitted; every other (durable-log) frame only when its `seq` advances this chat's high-water mark. */
  readonly admit: (frame: Pick<StreamFrameFor<"chat">, "event" | "seq">) => boolean;
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
    admit: ({ event, seq }): boolean => {
      if (seq === null || ATTACH_SYNTHESES.has(event.type)) {
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
