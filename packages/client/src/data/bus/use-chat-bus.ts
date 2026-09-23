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
// THE ATTACH CURSOR FLOOR (R3 — the fresh-context verifier's R1-2, a real message-loss window).
//
// The resume thunk below used to be the applied high-water mark ALONE, which is `null` until this client has
// applied its first durable frame — and a null cursor requests NO replay at all
// (`stream/sources/chat.ts`: `if (resumeSeq === null) return`). So: open a room → the SSE dies while HTTP
// lives (an eviction, a proxy idle-timeout, a backgrounded tab) → send → the server commits the whole turn →
// the socket reconnects with a null cursor → nothing replays, and the turn is INVISIBLE until a reload.
//
// THE FLOOR IS THE ROOM'S EVENT HIGH-WATER AT ATTACH, AND THE SERVER STATES IT: on a cursor-less attach the
// synthesis stamps its `chatOpened` frame with `bounds.maxSeq` (`transport/trpc/stream/sources/chat.ts`), and
// this hook adopts that seq. NOT the canon read's `messages.seq`, which is the obvious-looking source and is
// WRONG: `messages.seq` is the per-chat CANON ordinal while the resume cursor is the per-chat
// `chat_events.seq` — two independent sequences (packages/db/src/schema/chat.ts:244 vs :646), so using one as
// the other would ask for replay from an arbitrary point. And not a client-side `chatEventBounds` read
// either: that verb is the SSE attach's own member-gated probe, its `ChatEventAttach` payload carries
// transport internals (`viewerIsHost`, `reasoningHostOnly`), and it is deliberately absent from the tRPC
// router. The attach already performs that read — so the number rides the frame the attach already yields,
// at zero extra cost and zero new client surface.
//
// OVER-DELIVERY IS SAFE, UNDER-DELIVERY IS NOT, which is what makes this floor conservative-by-design: a
// re-delivered durable event is dropped by the monotonic guard below, or at worst costs one idempotent
// invalidate; a missed one is a turn the user cannot see.
//
// NO `onSocketLive` GAP-HEAL, DELIBERATELY — this room's heal rides its REPLAY, and every path that can lose
// a row restarts the pump. Every (re)start re-runs the attach synthesis, so it delivers `chatOpened` — whose
// invalidate refetches the chat's DETAIL (`chat.getChat`), NOT its canon; the canon comes back through the
// REPLAY, which is why the cursor has to be non-null. (This clause used to say `chatOpened` refetched "a
// chat's canon" — it does not, `data/invalidation.ts` targets getChat, and that false premise is exactly what
// made the null cursor look survivable.) The three loss paths and what restarts the pump:
//   • a SHED (`lag` overflow) — the socket restarts the room from its last-delivered cursor, server-side
//     (`stream/socket.ts::onShed`); no client cooperation, so it cannot be missed;
//   • a RECONNECT — the re-announce below carries this client's high-water mark, which is lower than the
//     server's delivered cursor exactly when frames died in flight, so the server restarts the pump there;
//   • a REAPED cell (>60s dark) — same re-announce, now creating the room at the mark instead of live-only.
// Adding a second, blanket heal here would double every reopen's refetch (BOOT-4X) and heal nothing the
// replay does not already carry.

import type { ChatId } from "@orb/kit/ids";
import { useEffect, useRef } from "react";
import { busSubscribe, busUnsubscribe, notify } from "#lib";
import type { ChatBusDeps } from "./apply-chat-bus-event.ts";
import { applyChatBusEvent } from "./apply-chat-bus-event.ts";
import { createChatEventSeqGuard } from "./chat-event-seq-guard.ts";
import { useBusRoom } from "./use-bus-room.ts";

// ONE process guard shared across every (possibly concurrent) chat room — a monotonic cursor, not slot
// state, so it lives here and not in the store.
const seqGuard = createChatEventSeqGuard();

// THE DRAFT-PROMOTION REPLAY SEED IS GONE (D166). It read:
// a brand-new DRAFT mounted this hook with `chatId === null` (no room), its first send lazily created the
// chat, and `chatId` flipped null→committed WITHIN one mount — so the fresh attach, having no resume cursor,
// missed the head deltas the just-created turn had already written. The fix was `sinceSeq: 0` for exactly
// that chat. That transition is now unrepresentable: a chat row exists from the creation click, this hook's
// one caller (`MessageListSurface`) takes a required `chatId`, and a different room REMOUNTS the surface
// (chat-content keys it by id). The parameter narrowed to `ChatId` so the dead branch is unspellable.
//
// What covers the equivalent gap now is the CANON READ, not a replay: `startChat` seeds the greeting rows
// server-side BEFORE the client can attach, and the room's own `listMessages` fetch at mount carries them.

/** Attach the room's live event stream and reduce it into client state. Mount once per open chat. */
export function useChatBus(chatId: ChatId, deps: ChatBusDeps): void {
  // THE ATTACH FLOOR (see the header) — the room's durable high-water as of THIS client's attach, learned
  // from the `chatOpened` synthetic's own frame seq. A REF, not state: it feeds the `sinceSeq` THUNK (re-read
  // at every re-announce) and never a render, so adopting it must not re-render the room.
  const attachFloor = useRef<number | null>(null);
  // [bus] dev log — mirrors the room's own lifecycle (same deps as the join effect below).
  useEffect((): (() => void) => {
    busSubscribe(chatId, false);
    return (): void => busUnsubscribe(chatId);
  }, [chatId]);

  useBusRoom<"chat">(
    { channel: "chat", chatId },
    {
      onEvent: (frame) => {
        // THE FLOOR, adopted from the attach synthetic. `chatOpened` is exempt from the monotonic guard by
        // TYPE (it must always invalidate on reopen), so it can never climb the mark — but its seq IS the
        // server's statement of "your room's durable log stands here as of your attach", which is exactly
        // the cursor a reconnect needs before this client has applied a durable frame. Monotonic client-side
        // too: a later attach never lowers it.
        if (frame.event.type === "chatOpened") {
          attachFloor.current = Math.max(attachFloor.current ?? 0, frame.seq);
        }
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
      // replay refills exactly the gap — the recovery `Last-Event-ID` used to give us for free. BEFORE the
      // first durable row it falls back to the OPEN-TIME FLOOR (see the header): a room that has been dark
      // since it opened still resumes from where it opened, instead of asking for nothing.
      sinceSeq: (): number | null => seqGuard.highWater(chatId) ?? attachFloor.current,
    },
  );
}
