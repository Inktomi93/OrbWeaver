// The chat bus transport adapter — joins the `chat` ROOM on the tab's ONE socket (SSE-1) and forwards every
// event into the pure reducer. The handler body contains nothing else: no cache writes, no store writes, no
// branching beyond the frame unwrap. A room-level server fault arrives as a `roomFailed` frame carrying the
// classified code + message, routed to the notify seam, never into the reducer.
//
// The SIGNATURE and the semantics are exactly what they were when this rode its own `chat.streamMessages`
// subscription; only the transport under it changed. What it GAINED from the fold: the room costs no browser
// connection (so opening a chat can never be the stream that starves an unrelated request), and one room's
// fault no longer tears down every other live surface in the tab.
//
// MONOTONIC-SEQ GUARD (the stuck-"Stop generating" P1): every durable-log frame carries the durable per-chat
// `seq` (it rode the tracked envelope id before the fold — §3.3: the socket's tracked id is a per-socket
// ORDINAL, so the cursor moved INSIDE the frame). A re-announce restarts the pump at this client's mark, so
// room churn can RE-DELIVER durable rows, and a re-replayed `turnStarted` re-opens an already-terminal slot
// → stuck Stop. (It used to be worse: the draft-promotion `sinceSeq: 0` seed replayed the whole log FROM
// ZERO on any churn; that seed is gone with draft mode, the guard is not.) The one process `seqGuard`
// drops every durable-log event that does not advance its chat's high-water mark, making delivery
// exactly-once (full rationale + the chatOpened/historyTruncated EXEMPTION-BY-TYPE in
// `chat-event-seq-guard.ts`). A real gap-fill (a seq beyond the mark) is unaffected.
//
// NO `onSocketLive` GAP-HEAL, DELIBERATELY — this room's heal rides its REPLAY, and every path that can lose
// a row restarts the pump. Every (re)start re-runs the attach synthesis, so it delivers `chatOpened` (the
// invalidate that refetches a chat's canon — `data/invalidation.ts`; staleTime is Infinity) AND replays the
// durable log from the room's cursor. The three loss paths and what restarts the pump:
//   • a SHED (`lag` overflow) — the socket restarts the room from its last-delivered cursor, server-side
//     (`stream/socket.ts::onShed`); no client cooperation, so it cannot be missed;
//   • a RECONNECT — the re-announce below carries this client's high-water mark, which is lower than the
//     server's delivered cursor exactly when frames died in flight, so the server restarts the pump there;
//   • a REAPED cell (>60s dark) — same re-announce, now creating the room at the mark instead of live-only.
// Adding a second, blanket heal here would double every reopen's refetch (BOOT-4X) and heal nothing the
// replay does not already carry.

import type { ChatId } from "@orb/kit/ids";
import { useEffect } from "react";
import { busSubscribe, busUnsubscribe, notify } from "#lib";
import type { ChatBusDeps } from "./apply-chat-bus-event.ts";
import { applyChatBusEvent } from "./apply-chat-bus-event.ts";
import { createChatEventSeqGuard } from "./chat-event-seq-guard.ts";
import { useBusRoom } from "./use-bus-room.ts";

// ONE process guard shared across every (possibly concurrent) chat room — a monotonic cursor, not slot
// state, so it lives here and not in the store.
const seqGuard = createChatEventSeqGuard();

// THE DRAFT-PROMOTION REPLAY SEED IS GONE (chat-creation-draft-mode-replacement.md §4.1, R1). It read:
// a brand-new DRAFT mounted this hook with `chatId === null` (no room), its first send lazily created the
// chat, and `chatId` flipped null→committed WITHIN one mount — so the fresh attach, having no resume cursor,
// missed the head deltas the just-created turn had already written. The fix was `sinceSeq: 0` for exactly
// that chat. That transition is now unrepresentable: a chat row exists from the creation click, this hook's
// one caller (`MessageListSurface`) takes a required `chatId`, and a different room REMOUNTS the surface
// (chat-content keys it by id). The parameter narrowed to `ChatId` so the dead branch is unspellable.
//
// What covers the equivalent gap now is the CANON READ, not a replay: `startChat` seeds the greeting rows
// server-side BEFORE the client can attach, and the room's own `listMessages` fetch at mount carries them.
// The resume floor below is the high-water mark alone — strictly what this client applied.

/** Attach the room's live event stream and reduce it into client state. Mount once per open chat. */
export function useChatBus(chatId: ChatId, deps: ChatBusDeps): void {
  // [bus] dev log — mirrors the room's own lifecycle (same deps as the join effect below).
  useEffect((): (() => void) => {
    busSubscribe(chatId, false);
    return (): void => busUnsubscribe(chatId);
  }, [chatId]);

  useBusRoom<"chat">(
    { channel: "chat", chatId },
    {
      onEvent: (frame) => {
        // Drop a stale re-delivery (a from-zero replay on re-attach) before it reaches the reducer — a
        // re-replayed terminal/turnStarted would otherwise re-open a completed slot (see the header note).
        // Attach-synthesized signals (chatOpened/historyTruncated) are exempt BY TYPE inside the guard.
        if (!seqGuard.admit(frame.event, String(frame.seq))) {
          return;
        }
        applyChatBusEvent(frame.event, deps);
      },
      onError: (message) => {
        notify.error(message);
      },
      // THE REPLAY REQUEST, RE-READ AT EVERY (RE)ANNOUNCE. Once this client has applied any durable row for
      // this chat, its own high-water mark IS the resume truth — strictly what it received, where the server's
      // room cursor is what it DELIVERED (a frame yielded into a dying socket counts for the server and not
      // for us). So a reconnect re-attaches at the mark, the server restarts the pump there, and the durable
      // replay refills exactly the gap — the recovery `Last-Event-ID` used to give us for free. Before the
      // first durable row: live-only (the canon read owns everything older).
      sinceSeq: (): number | null => seqGuard.highWater(chatId) ?? null,
    },
  );
}
