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
// ORDINAL, so the cursor moved INSIDE the frame). On the draft→committed promotion path the room attaches
// with the `sinceSeq: 0` seed (see below), so ANY room churn re-REPLAYS the whole durable log FROM ZERO, and
// a re-replayed `turnStarted` re-opens an already-terminal slot → stuck Stop. The one process `seqGuard`
// drops every durable-log event that does not advance its chat's high-water mark, making delivery
// exactly-once (full rationale + the chatOpened/historyTruncated EXEMPTION-BY-TYPE in
// `chat-event-seq-guard.ts`). A real gap-fill (a seq beyond the mark) is unaffected.
//
// NO `onSocketLive` GAP-HEAL, DELIBERATELY — this room's heal is SERVER-side and always was. Every (re)start
// of the room's pump re-runs the attach synthesis, so a reconnect delivers `chatOpened` again, and
// `chatOpened` IS the invalidate that refetches a chat's canon (`data/invalidation.ts`; staleTime is
// Infinity). On a reconnect the socket cell survives, so the pump ALSO replays the durable log from the
// room's stored cursor (what `lastEventId` did before the fold); on a re-attach onto a REAPED cell the cursor
// is gone and the room is live-only — the `chatOpened` refetch is what closes that window, exactly as it does
// for a chat that was closed and reopened. Adding a second heal here would double every reopen's refetch
// (BOOT-4X).

import type { ChatId } from "@orb/kit/ids";
import { useEffect, useState } from "react";
import { busSubscribe, busUnsubscribe, notify } from "#lib";
import type { ChatBusDeps } from "./apply-chat-bus-event";
import { applyChatBusEvent } from "./apply-chat-bus-event";
import { createChatEventSeqGuard } from "./chat-event-seq-guard";
import { useBusRoom } from "./use-bus-room";

// ONE process guard shared across every (possibly concurrent) chat room — a monotonic cursor, not slot
// state, so it lives here and not in the store.
const seqGuard = createChatEventSeqGuard();

// The first-turn race fix: a brand-new draft mounts this hook with chatId === null (no room). Its first
// send lazily creates the chat, so chatId flips null→committed within this same mount. A fresh attach with
// no resume cursor only sees live-from-attach, so the head deltas race past the just-joined room and are
// lost. Fix: request a replay (`sinceSeq: 0`) exactly for a chat created within this hook's lifetime, so the
// server replays this chat's durable events from baseline. Bounded to this one chat — an existing chat
// opened directly is never seeded.
//
// The seed is a STANDING request for as long as this mount lives, so the registry's reconnect re-announce
// re-sends `sinceSeq: 0` and the server honours it (a LOWER cursor is a replay request, §5.4) — i.e. a
// reconnect during the seeded mount re-replays from zero instead of from the room's cursor. That is the
// pre-fold behaviour for this exact case (any subscription churn re-replayed from the `lastEventId:"0"`
// seed) and the seq guard below is what makes it exactly-once; the alternative — the client tracking a live
// cursor — is the composite-cursor design §3.3 rejected.

/** Attach the room's live event stream and reduce it into client state. Mount once per open chat;
 *  `null` detaches. */
export function useChatBus(chatId: ChatId | null, deps: ChatBusDeps): void {
  // Freeze the replay-seed decision via the "adjust state during render" pattern — this value drives the
  // room's attach input, so it must be render state, not a ref. seededChatId is set only on a
  // null→committed transition, then frozen.
  const [prevChatId, setPrevChatId] = useState<ChatId | null>(chatId);
  const [seededChatId, setSeededChatId] = useState<ChatId | null>(null);
  if (chatId !== prevChatId) {
    setPrevChatId(chatId);
    if (chatId !== null && prevChatId === null) {
      setSeededChatId(chatId); // draft → committed within this mount: seed this chat's replay.
    }
  }
  const seededForThisChat = chatId !== null && seededChatId === chatId;
  // [bus] dev log — mirrors the room's own lifecycle (same deps as the join effect below).
  useEffect((): (() => void) | undefined => {
    if (chatId === null) {
      return;
    }
    busSubscribe(chatId, seededForThisChat);
    return (): void => busUnsubscribe(chatId);
  }, [chatId, seededForThisChat]);

  useBusRoom<"chat">(chatId === null ? null : { channel: "chat", chatId }, {
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
    sinceSeq: seededForThisChat ? 0 : null,
  });
}
